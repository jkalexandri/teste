// Regras de entrada no sistema (docs/decisoes.md #11 a #14).
import "server-only";
import { randomBytes } from "node:crypto";
import { BLOQUEIO_MINUTOS as BLOQUEIO_MIN_TENTATIVAS, MAX_ERROS_CONTA, MAX_ERROS_PAR, chaveConta, chavePar, lerLinhas, limpar, minutosRestantes, registrarErro } from "./tentativas";
import { prisma, conferirSenha, gerarHash, Cargo, Modulo, StatusUsuario } from "@filapro/db";

export const MAX_TENTATIVAS = MAX_ERROS_PAR;
export const BLOQUEIO_MINUTOS = BLOQUEIO_MIN_TENTATIVAS;

export type ResultadoLogin =
  | { ok: true; usuarioId: string; precisaTrocar: boolean; cargo: Cargo }
  /** avisarDono: a conta entrou em proteção agora (30 erros de vários endereços) — o dono recebe um e-mail (decisão #160) */
  | { ok: false; erro: string; avisarDono?: { nome: string; email: string } };

/**
 * Contra a descoberta de e-mails cadastrados (decisão #159 — S4 do Módulo 1): o tempo do login não pode depender de a conta existir.
 * SEMPRE se calculam dois hashes (o da senha definitiva e o da temporária), usando um hash falso quando a conta ou a senha
 * temporária não existem. O e-mail sem conta passa pelas mesmas regras de bloqueio (tabela TentativaLogin).
 */
let hashFalso: Promise<string> | null = null;
const obterHashFalso = () => (hashFalso ??= gerarHash(randomBytes(16).toString("hex")));
const msgBloqueio = (min: number) => `Muitas tentativas erradas. Tente novamente em ${min} ${min === 1 ? "minuto" : "minutos"}.`;

const NOME_MODULO: Record<Modulo, string> = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" };

export async function tentarLogin(emailBruto: string, senha: string, modulo: Modulo, ip = "local"): Promise<ResultadoLogin> {
  const email = emailBruto.trim().toLowerCase();
  const erroGenerico = { ok: false as const, erro: "E-mail ou senha incorretos." };

  const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
  const agora = new Date();

  // Bloqueios (decisão #160): do endereço (e-mail + endereço) e da conta (erros somados de todos os endereços).
  // Vale igual para e-mail sem conta. O campo bloqueadoAte do usuário continua valendo (bloqueio manual/antigo).
  const kPar = chavePar(email, ip), kConta = chaveConta(email);
  const linhas = await lerLinhas([kPar, kConta]);
  const restantes = Math.max(
    minutosRestantes(linhas.get(kPar), agora),
    minutosRestantes(linhas.get(kConta), agora),
    usuario?.bloqueadoAte && usuario.bloqueadoAte > agora ? Math.ceil((usuario.bloqueadoAte.getTime() - agora.getTime()) / 60000) : 0,
  );

  // Sempre dois hashes, tenha a conta senha temporária ou não (o tempo não pode revelar nada — decisão #159)
  const falso = await obterHashFalso();
  // Conta nova (ainda sem senha) também calcula o hash: o tempo não pode revelar que a conta é recém-criada (decisão #165)
  const confereDefinitiva = await conferirSenha(senha, usuario?.senhaHash || falso);
  const tempValida = !!usuario?.senhaTempHash && (!usuario.senhaTempExpiraEm || usuario.senhaTempExpiraEm > agora);
  const confereTemp = await conferirSenha(senha, tempValida ? usuario!.senhaTempHash : falso);
  const senhaDefinitivaOk = !!usuario && confereDefinitiva;
  const senhaTempOk = !senhaDefinitivaOk && tempValida && confereTemp;

  // Bloqueado: só a senha temporária enviada ao e-mail passa (quem a recebe é o dono da caixa de e-mail — decisão #160)
  if (restantes > 0 && !senhaTempOk) return { ok: false, erro: msgBloqueio(restantes) };

  if (!senhaDefinitivaOk && !senhaTempOk) {
    const bloqueouPar = await registrarErro(kPar, MAX_ERROS_PAR, agora);
    const bloqueouConta = await registrarErro(kConta, MAX_ERROS_CONTA, agora);
    if (bloqueouPar || bloqueouConta) {
      return {
        ok: false,
        erro: `Muitas tentativas erradas. Acesso bloqueado por ${BLOQUEIO_MINUTOS} minutos.`,
        ...(bloqueouConta && usuario && usuario.status === StatusUsuario.ATIVO ? { avisarDono: { nome: usuario.nome, email: usuario.email } } : {}),
      };
    }
    return erroGenerico;
  }
  // Entrou (inclusive pela senha temporária durante um bloqueio): desfaz os bloqueios
  await limpar([kPar, kConta]);
  if (usuario && (usuario.tentativasFalhas || usuario.bloqueadoAte)) await prisma.usuario.update({ where: { id: usuario.id }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
  if (!usuario) return erroGenerico; // (não acontece: sem conta nenhuma senha confere)

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
