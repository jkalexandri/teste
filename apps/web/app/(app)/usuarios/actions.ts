"use server";

// Admin da Empresa → Usuários (decisões #23, #24, #46–#50).
// Tudo limitado à empresa do próprio Admin.
import { revalidatePath } from "next/cache";
import { chamarWorker } from "@/lib/worker";
import { logDaSessao } from "@/lib/logs";
import { prisma, gerarHash, Cargo, Modulo, StatusUsuario } from "@filapro/db";
import { encerrarAcessoDeUsuarios } from "@/lib/auth/encerrar-acesso";
import { exigirAdminEmpresa } from "@/lib/auth/exigir";
import { criarUsuarioNaEmpresa, enviarEmailBoasVindas, validarComprador } from "@/lib/contas";
import { redefinirAcesso } from "@/lib/auth/link-senha";
import { PERMISSOES } from "@/lib/menu";
import { lerLimite } from "@/lib/limite";

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
  const limiteLeads = lerLimite(form);
  if (limiteLeads === "erro") return { ok: false, mensagem: "Informe o máximo de leads do usuário ou marque “Ilimitado”." };
  const { usuario, linkSenha } = await criarUsuarioNaEmpresa(empresaId, { ...dados, permissoes: lerPermissoes(form), limiteLeads });
  const enviado = await enviarEmailBoasVindas(usuario.nome, usuario.email, linkSenha, v.empresa.pacote, Modulo.EMPRESARIAL);
  await logDaSessao("USUARIOS", `Usuário criado: ${usuario.nome} (${usuario.email})`, empresaId);
  revalidatePath("/usuarios");
  return {
    ok: true,
    mensagem: enviado ? `Usuário ${usuario.nome} criado. Link para criar a senha enviado para ${usuario.email}.` : `Usuário criado, mas o e-mail não foi enviado. Use “Resetar senha”.`,
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
  const limiteLeads = lerLimite(form);
  if (limiteLeads === "erro") return { ok: false, mensagem: "Informe o máximo de leads do usuário ou marque “Ilimitado”." };
  await prisma.usuario.update({ where: { id }, data: { ...dados, permissoes: lerPermissoes(form), limiteLeads } });
  revalidatePath("/usuarios");
  await logDaSessao("USUARIOS", `Usuário alterado: ${dados.nome}`);
  return { ok: true, mensagem: `Usuário ${dados.nome} atualizado.` };
}

export async function resetarSenha(id: string): Promise<R> {
  const s = await exigirAdminEmpresa();
  const u = await usuarioDaEmpresa(id, s.usuario.empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  // Decisão #165: redefinir de verdade — a senha atual deixa de valer, as sessões caem e a pessoa recebe um link de 7 dias
  const link = await redefinirAcesso(id);
  const enviado = await enviarEmailBoasVindas(u.nome, u.email, link, s.usuario.empresa?.pacote ?? "", Modulo.EMPRESARIAL, "redefinicao");
  await logDaSessao("USUARIOS", `Acesso redefinido para ${u.nome} (${u.email}): senha anterior invalidada e link enviado`);
  revalidatePath("/usuarios");
  return enviado ? { ok: true, mensagem: `Acesso redefinido: a senha anterior deixou de valer e um link para criar a nova foi enviado para ${u.email}.` } : { ok: false, mensagem: "Não foi possível enviar o e-mail." };
}

/** Desativar libera a vaga; reativar só com vaga disponível (decisão #50). */
export async function alternarAtivo(id: string): Promise<R> {
  const s = await exigirAdminEmpresa();
  const u = await usuarioDaEmpresa(id, s.usuario.empresaId);
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  if (u.status === StatusUsuario.ATIVO) {
    await prisma.usuario.update({ where: { id }, data: { status: StatusUsuario.BLOQUEADO } });
    await encerrarAcessoDeUsuarios([id]);
    revalidatePath("/usuarios");
    await logDaSessao("USUARIOS", `Usuário desativado: ${u.nome}`);
    return { ok: true, mensagem: `${u.nome} desativado. A vaga foi liberada.` };
  }
  const v = await vagas(s.usuario.empresaId);
  if (v.livres <= 0) {
    return { ok: false, mensagem: `Sem vaga no pacote (${v.ativos} / ${v.limite}). Para reativar ${u.nome}, desative outro usuário ou aumente o pacote.` };
  }
  await prisma.usuario.update({ where: { id }, data: { status: StatusUsuario.ATIVO } });
  revalidatePath("/usuarios");
  await logDaSessao("USUARIOS", `Usuário reativado: ${u.nome}`);
  return { ok: true, mensagem: `${u.nome} reativado.` };
}

/**
 * Exclui o usuário depois de transferir os dados dele para outro usuário da
 * empresa (decisão #49). Leads transferidos desde a etapa 7; campanhas e
 * conversas entram aqui nas etapas 8 e 10.
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

  // Números de WhatsApp do usuário (principal e extras): serão desconectados depois da exclusão (decisão #138)
  const numeros = await prisma.whatsappSessao.findMany({ where: { usuarioId: id }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    // Leads: passam para o usuário escolhido (o código do dono acompanha — decisão #63).
    if (destino) await tx.lead.updateMany({ where: { usuarioId: id }, data: { usuarioId: destino.id, codigoUsuario: destino.codigo ?? "" } });
    // TODO etapas 8/10: transferir campanhas e conversas de `u.id` para `destino.id`.
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await tx.usuario.delete({ where: { id } });
  });
  await logDaSessao("USUARIOS", destino ? `Usuário excluído: ${u.nome}; dados transferidos para ${destino.nome}` : `Usuário excluído: ${u.nome}`, u.empresaId);
  // Desconecta o WhatsApp do usuário excluído: o FilaPro some de "Dispositivos conectados" no celular dele (decisão #138).
  // Serviço fora do ar: a exclusão segue; o serviço desconecta sozinho quando voltar (número sem dono).
  for (const n of numeros) {
    const r = await chamarWorker(`/sessoes/${encodeURIComponent(n.id)}/desconectar`);
    await logDaSessao("WHATSAPP", r.ok
      ? `WhatsApp de ${u.nome} desconectado (usuário excluído)`
      : `WhatsApp de ${u.nome}: serviço fora do ar; será desconectado quando ele voltar (usuário excluído)`, u.empresaId);
  }
  revalidatePath("/usuarios");
  return {
    ok: true,
    mensagem: destino ? `${u.nome} excluído. Os dados foram transferidos para ${destino.nome}.` : `${u.nome} excluído.`,
  };
}
