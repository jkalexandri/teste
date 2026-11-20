// Regras de entrada no sistema (docs/decisoes.md #11 a #14).
import "server-only";
import { prisma, conferirSenha, Cargo, Modulo, StatusUsuario } from "@filapro/db";

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;

export type ResultadoLogin =
  | { ok: true; usuarioId: string; precisaTrocar: boolean; cargo: Cargo }
  | { ok: false; erro: string };

const NOME_MODULO: Record<Modulo, string> = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" };

export async function tentarLogin(emailBruto: string, senha: string, modulo: Modulo): Promise<ResultadoLogin> {
  const email = emailBruto.trim().toLowerCase();
  const erroGenerico = { ok: false as const, erro: "E-mail ou senha incorretos." };

  const usuario = await prisma.usuario.findUnique({ where: { email }, include: { empresa: true } });
  if (!usuario) return erroGenerico;

  // Bloqueio por excesso de tentativas (#14)
  const agora = new Date();
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > agora) {
    const min = Math.ceil((usuario.bloqueadoAte.getTime() - agora.getTime()) / 60000);
    return { ok: false, erro: `Muitas tentativas erradas. Tente novamente em ${min} ${min === 1 ? "minuto" : "minutos"}.` };
  }

  // Confere a senha definitiva; se não bater, confere a temporária (ainda válida).
  const senhaDefinitivaOk = await conferirSenha(senha, usuario.senhaHash);
  const tempValida = !!usuario.senhaTempHash && (!usuario.senhaTempExpiraEm || usuario.senhaTempExpiraEm > agora);
  const senhaTempOk = !senhaDefinitivaOk && tempValida && (await conferirSenha(senha, usuario.senhaTempHash));

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
