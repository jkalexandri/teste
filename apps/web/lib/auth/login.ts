// Regras de entrada no sistema (docs/decisoes.md #11 a #14).
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, conferirSenha, gerarHash, Cargo, Modulo, StatusUsuario } from "@filapro/db";

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;

export type ResultadoLogin =
  | { ok: true; usuarioId: string; precisaTrocar: boolean; cargo: Cargo }
  | { ok: false; erro: string };

/**
 * Contra a descoberta de e-mails cadastrados (decisão #159 — S4 do Módulo 1):
 * - O tempo do login não pode depender de a conta existir: SEMPRE se calculam dois hashes (o da senha definitiva e o da temporária),
 *   usando um hash falso quando a conta ou a senha temporária não existem.
 * - O bloqueio por tentativas vale igual para e-mail que não existe (contado em memória, com a mesma mensagem).
 */
let hashFalso: Promise<string> | null = null;
const obterHashFalso = () => (hashFalso ??= gerarHash(randomBytes(16).toString("hex")));

type Desconhecido = { falhas: number; bloqueadoAte: number };
const desconhecidos = new Map<string, Desconhecido>();
const MAX_DESCONHECIDOS = 10_000;
const msgBloqueio = (min: number) => `Muitas tentativas erradas. Tente novamente em ${min} ${min === 1 ? "minuto" : "minutos"}.`;

/** Tentativa com e-mail sem conta: mesmo tempo, mesma contagem e mesmas mensagens de quem tem conta. */
async function falhaDeDesconhecido(email: string, senha: string): Promise<ResultadoLogin> {
  const agora = Date.now();
  const d = desconhecidos.get(email) ?? { falhas: 0, bloqueadoAte: 0 };
  if (d.bloqueadoAte > agora) return { ok: false, erro: msgBloqueio(Math.ceil((d.bloqueadoAte - agora) / 60000)) };
  const falso = await obterHashFalso();
  await conferirSenha(senha, falso); // mesmo custo de uma conta real (senha definitiva + temporária)
  await conferirSenha(senha, falso);
  d.falhas += 1;
  let resposta: ResultadoLogin = { ok: false, erro: "E-mail ou senha incorretos." };
  if (d.falhas >= MAX_TENTATIVAS) {
    d.falhas = 0;
    d.bloqueadoAte = agora + BLOQUEIO_MINUTOS * 60000;
    resposta = { ok: false, erro: `Muitas tentativas erradas. Acesso bloqueado por ${BLOQUEIO_MINUTOS} minutos.` };
  }
  desconhecidos.delete(email); // reinsere no fim (ordem de chegada)
  desconhecidos.set(email, d);
  if (desconhecidos.size > MAX_DESCONHECIDOS) {
    for (const [k, v] of desconhecidos) if (v.bloqueadoAte < agora && desconhecidos.size > MAX_DESCONHECIDOS * 0.8) desconhecidos.delete(k);
    while (desconhecidos.size > MAX_DESCONHECIDOS) desconhecidos.delete(desconhecidos.keys().next().value as string);
  }
  return resposta;
}

/** Só para os testes: zera a memória dos e-mails sem conta. */
export function _limparDesconhecidos() { desconhecidos.clear(); }

const NOME_MODULO: Record<Modulo, string> = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" };

export async function tentarLogin(emailBruto: string, senha: string, modulo: Modulo): Promise<ResultadoLogin> {
  const email = emailBruto.trim().toLowerCase();
  const erroGenerico = { ok: false as const, erro: "E-mail ou senha incorretos." };

  const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
  if (!usuario) return falhaDeDesconhecido(email, senha);

  // Bloqueio por excesso de tentativas (#14)
  const agora = new Date();
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > agora) {
    const min = Math.ceil((usuario.bloqueadoAte.getTime() - agora.getTime()) / 60000);
    return { ok: false, erro: msgBloqueio(min) };
  }

  // Confere a senha definitiva; se não bater, confere a temporária (ainda válida).
  // Sempre dois hashes, tenha a conta senha temporária ou não (o tempo não pode revelar nada — decisão #159)
  const falso = await obterHashFalso();
  const senhaDefinitivaOk = await conferirSenha(senha, usuario.senhaHash);
  const tempValida = !!usuario.senhaTempHash && (!usuario.senhaTempExpiraEm || usuario.senhaTempExpiraEm > agora);
  const tempConfere = await conferirSenha(senha, tempValida ? usuario.senhaTempHash : falso);
  const senhaTempOk = !senhaDefinitivaOk && tempValida && tempConfere;

  if (!senhaDefinitivaOk && !senhaTempOk) {
    const tentativas = usuario.tentativasFalhas + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { tentativasFalhas: 0, bloqueadoAte: new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60000) },
      });
      return { ok: false, erro: `Muitas tentativas erradas. Acesso bloqueado por ${BLOQUEIO_MINUTOS} minutos.` };
    }
    await prisma.usuario.update({ where: { id: usuario.id }, data: { tentativasFalhas: tentativas } });
    return erroGenerico;
  }

  // Senha certa: zera o contador de tentativas.
  await prisma.usuario.update({ where: { id: usuario.id }, data: { tentativasFalhas: 0, bloqueadoAte: null } });

  if (usuario.status === StatusUsuario.BLOQUEADO) {
    return { ok: false, erro: "Acesso bloqueado. Fale com o administrador." };
  }

  // Super Admin entra por qualquer aba e não tem pacote (#11).
  if (usuario.cargo !== Cargo.SUPERADMIN) {
    const empresa = usuario.empresa;
    if (!empresa) return { ok: false, erro: "Acesso sem empresa vinculada. Fale com o administrador." };
    if (empresa.modulo !== modulo) {
      return { ok: false, erro: `Este acesso pertence ao módulo ${NOME_MODULO[empresa.modulo]}. Escolha o módulo correto.` };
    }
    // Pacote expirado: todos da empresa expiram juntos (#13).
    if (empresa.expiraEm < agora) return { ok: false, erro: "Acesso expirado. Fale com o administrador." };
    if (!empresa.ativa) return { ok: false, erro: "Empresa inativa. Fale com o administrador." };
  }

  // Entrou com a senha definitiva: descarta senha temporária pendente.
  if (senhaDefinitivaOk && usuario.senhaTempHash) {
    await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaTempHash: null, senhaTempExpiraEm: null } });
  }
  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: agora } });

  return { ok: true, usuarioId: usuario.id, precisaTrocar: senhaTempOk, cargo: usuario.cargo };
}

/** Página inicial de cada perfil após o login. */
export function destinoPorCargo(_cargo: Cargo) {
  // Por enquanto todos vão para /dashboard; o conteúdo por perfil vem na etapa 3.
  return "/dashboard";
}
