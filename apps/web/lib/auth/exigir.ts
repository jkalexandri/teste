// Garante que quem chama é um Super Admin com sessão válida (para ações do servidor).
import "server-only";
import { Cargo } from "@filapro/db";
import { obterSessao } from "./session";
import { motivoSemAcesso } from "./acesso";

export async function exigirSuperAdmin() {
  const sessao = await obterSessao();
  if (!sessao || sessao.precisaTrocar || motivoSemAcesso(sessao) || sessao.usuario.cargo !== Cargo.SUPERADMIN) {
    throw new Error("Acesso negado.");
  }
  return sessao;
}

/** Garante Admin da Empresa com sessão e empresa válidas; devolve a sessão. */
export async function exigirAdminEmpresa() {
  const sessao = await obterSessao();
  if (!sessao || sessao.precisaTrocar || motivoSemAcesso(sessao) || sessao.usuario.cargo !== Cargo.ADMIN_EMPRESA || !sessao.usuario.empresaId) {
    throw new Error("Acesso negado.");
  }
  return sessao as typeof sessao & { usuario: { empresaId: string } };
}

/** Qualquer perfil com sessão e conta válidas (decisão #166: a verificação em duas etapas vale para todos). */
export async function exigirUsuario() {
  const sessao = await obterSessao();
  if (!sessao || sessao.precisaTrocar || motivoSemAcesso(sessao)) throw new Error("Acesso negado.");
  return sessao;
}
