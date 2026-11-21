"use server";

// Admin da Empresa → Usuários (decisões #23, #24, #46–#50).
// Tudo limitado à empresa do próprio Admin.
import { revalidatePath } from "next/cache";
import { prisma, gerarHash, gerarSenhaTemporaria, Cargo, Modulo, StatusUsuario } from "@filapro/db";
import { exigirAdminEmpresa } from "@/lib/auth/exigir";
import { criarUsuarioNaEmpresa, enviarEmailBoasVindas, validarComprador, VALIDADE_TEMP_CONTA_NOVA_DIAS } from "@/lib/contas";
import { PERMISSOES } from "@/lib/menu";

type R = { ok: boolean; mensagem: string };
const t = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);
const VALIDAS = PERMISSOES.map((p) => p.id) as string[];
const lerPermissoes = (f: FormData) => f.getAll("permissoes").map(String).filter((p) => VALIDAS.includes(p));

/** Vagas: só usuários ATIVOS ocupam vaga; o Admin não conta (decisões #23 e #50). */
async function vagas(empresaId: string) {
  const [empresa, ativos] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } }),
    prisma.usuario.count({ where: { empresaId, cargo: Cargo.USUARIO, status: StatusUsuario.ATIVO } }),
  ]);
  return { limite: empresa.limiteUsuarios, ativos, livres: empresa.limiteUsuarios - ativos, empresa };
}

/** Carrega um usuário garantindo que é USUARIO da empresa do Admin. */
async function usuarioDaEmpresa(id: string, empresaId: string) {
  const u = await prisma.usuario.findUnique({ where: { id } });
  return u && u.empresaId === empresaId && u.cargo === Cargo.USUARIO ? u : null;
}

export async function criarUsuario(form: FormData): Promise<R> {
  const s = await exigirAdminEmpresa();
  const empresaId = s.usuario.empresaId;
  const dados = { nome: t(form, "nome", 80), email: t(form, "email").toLowerCase(), whatsapp: t(form, "whatsapp", 30) };
  const erro = validarComprador(dados, false);
  if (erro) return { ok: false, mensagem: erro };
  const v = await vagas(empresaId);
  if (v.livres <= 0) {
    return { ok: false, mensagem: `Limite do pacote atingido (${v.ativos} / ${v.limite}). Desative um usuário ou aumente o pacote.` };
  }
  if (await prisma.usuario.findUnique({ where: { email: dados.email } })) {
    return { ok: false, mensagem: `O e-mail ${dados.email} já tem acesso ao FilaPro Leads.` };
  }
  const { usuario, senhaTemporaria } = await criarUsuarioNaEmpresa(empresaId, { ...dados, permissoes: lerPermissoes(form) });
  const enviado = await enviarEmailBoasVindas(usuario.nome, usuario.email, senhaTemporaria, v.empresa.pacote, Modulo.EMPRESARIAL);
  revalidatePath("/usuarios");
  return {
    ok: true,
    mensagem: enviado ? `Usuário ${usuario.nome} criado. Senha temporária enviada para ${usuario.email}.` : `Usuário criado, mas o e-mail não foi enviado. Use “Resetar senha”.`,
  };
}

export async function editarUsuario(id: string, form: FormData): Promise<R> {
  const s = await exigirAdminEmpresa();
  const u = await usuarioDaEmpresa(id, s.usuario.empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  const dados = { nome: t(form, "nome", 80), email: t(form, "email").toLowerCase(), whatsapp: t(form, "whatsapp", 30) };
  const erro = validarComprador(dados, false);
  if (erro) return { ok: false, mensagem: erro };
  if (dados.email !== u.email && (await prisma.usuario.findUnique({ where: { email: dados.email } }))) {
    return { ok: false, mensagem: `O e-mail ${dados.email} já está em uso.` };
  }
  await prisma.usuario.update({ where: { id }, data: { ...dados, permissoes: lerPermissoes(form) } });
  revalidatePath("/usuarios");
  return { ok: true, mensagem: `Usuário ${dados.nome} atualizado.` };
}

export async function resetarSenha(id: string): Promise<R> {
  const s = await exigirAdminEmpresa();
  const u = await usuarioDaEmpresa(id, s.usuario.empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  const temp = gerarSenhaTemporaria();
  await prisma.usuario.update({
    where: { id },
    data: { senhaTempHash: await gerarHash(temp), senhaTempExpiraEm: new Date(Date.now() + VALIDADE_TEMP_CONTA_NOVA_DIAS * 86400000) },
  });
  const enviado = await enviarEmailBoasVindas(u.nome, u.email, temp, s.usuario.empresa?.pacote ?? "", Modulo.EMPRESARIAL);
  revalidatePath("/usuarios");
  return enviado ? { ok: true, mensagem: `Nova senha temporária enviada para ${u.email}.` } : { ok: false, mensagem: "Não foi possível enviar o e-mail." };
}

/** Desativar libera a vaga; reativar só com vaga disponível (decisão #50). */
export async function alternarAtivo(id: string): Promise<R> {
  const s = await exigirAdminEmpresa();
  const u = await usuarioDaEmpresa(id, s.usuario.empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  if (u.status === StatusUsuario.ATIVO) {
    await prisma.usuario.update({ where: { id }, data: { status: StatusUsuario.BLOQUEADO } });
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
    revalidatePath("/usuarios");
    return { ok: true, mensagem: `${u.nome} desativado. A vaga foi liberada.` };
  }
  const v = await vagas(s.usuario.empresaId);
  if (v.livres <= 0) {
    return { ok: false, mensagem: `Sem vaga no pacote (${v.ativos} / ${v.limite}). Para reativar ${u.nome}, desative outro usuário ou aumente o pacote.` };
  }
  await prisma.usuario.update({ where: { id }, data: { status: StatusUsuario.ATIVO } });
  revalidatePath("/usuarios");
  return { ok: true, mensagem: `${u.nome} reativado.` };
}

/**
 * Exclui o usuário depois de transferir os dados dele para outro usuário da
 * empresa (decisão #49). Leads, campanhas e conversas ainda não existem
 * (etapas 7, 8 e 10): quando existirem, a transferência entra aqui.
 */
export async function excluirUsuario(id: string, destinoId: string | null): Promise<R> {
  const s = await exigirAdminEmpresa();
  const empresaId = s.usuario.empresaId;
  const u = await usuarioDaEmpresa(id, empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };

  const outros = await prisma.usuario.count({ where: { empresaId, cargo: Cargo.USUARIO, id: { not: id } } });
  let destino = null;
  if (outros > 0) {
    if (!destinoId) return { ok: false, mensagem: "Escolha para quem transferir os dados antes de excluir." };
    destino = await usuarioDaEmpresa(destinoId, empresaId);
    if (!destino || destino.id === id) return { ok: false, mensagem: "Usuário de destino inválido." };
  }

  await prisma.$transaction(async (tx) => {
    // TODO etapas 7/8/10: transferir leads, campanhas e conversas de `u.id` para `destino.id`.
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await tx.usuario.delete({ where: { id } });
  });
  revalidatePath("/usuarios");
  return {
    ok: true,
    mensagem: destino ? `${u.nome} excluído. Os dados foram transferidos para ${destino.nome}.` : `${u.nome} excluído.`,
  };
}
