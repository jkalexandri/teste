"use server";

// Super Admin → Usuários Individuais (decisões #31 e #40).
import { revalidatePath } from "next/cache";
import { prisma, Modulo, StatusUsuario } from "@filapro/db";
import { encerrarAcessoDeUsuarios } from "@/lib/auth/encerrar-acesso";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { criarConta, enviarEmailBoasVindas, validarComprador } from "@/lib/contas";
import { redefinirAcesso } from "@/lib/auth/link-senha";
import { redefinirDoisFatores } from "@/lib/auth/dois-fatores";
import { enviarEmail, emailVerificacaoRedefinida } from "@/lib/email";
import { registrarLog } from "@/lib/logs";

type R = { ok: boolean; mensagem: string };
const t = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

export async function criarIndividual(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const dados = { nome: t(form, "nome", 80), email: t(form, "email").toLowerCase(), whatsapp: t(form, "whatsapp", 30) };
  const erro = validarComprador(dados, false);
  if (erro) return { ok: false, mensagem: erro };
  if (await prisma.usuario.findUnique({ where: { email: dados.email } })) {
    return { ok: false, mensagem: `O e-mail ${dados.email} já tem acesso ao FilaPro Leads.` };
  }
  const plano = await prisma.plano.findUnique({ where: { id: t(form, "planoId") } });
  if (!plano || plano.modulo !== Modulo.INDIVIDUAL) return { ok: false, mensagem: "Escolha um plano individual." };
  const prazo = parseInt(t(form, "prazoDias"), 10);
  const prazoDias = Number.isFinite(prazo) && prazo > 0 ? prazo : plano.gratis ? plano.testeDias ?? 7 : 31;

  const conta = await criarConta({
    modulo: Modulo.INDIVIDUAL,
    nomeConta: dados.nome,
    pacote: plano.nome,
    planoId: plano.id,
    limiteUsuarios: 1,
    prazoDias,
    // Free por dias: sem limite; Free por disparo: os disparos do teste; pago: os disparos do plano (decisão #113)
    limiteDisparos: plano.gratis ? plano.testeDisparos ?? null : plano.disparosPorPeriodo ?? null,
    limiteLeads: plano.limiteLeads,
    usuario: dados,
  });
  const enviado = await enviarEmailBoasVindas(dados.nome, dados.email, conta.linkSenha, plano.nome, Modulo.INDIVIDUAL);
  revalidatePath("/usuarios-individuais");
  return {
    ok: true,
    mensagem: enviado ? `Usuário ${dados.nome} criado. Acesso enviado para ${dados.email}.` : `Usuário criado, mas o e-mail não foi enviado.`,
  };
}

export async function alternarBloqueio(usuarioId: string): Promise<R> {
  await exigirSuperAdmin();
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  const novo = u.status === StatusUsuario.ATIVO ? StatusUsuario.BLOQUEADO : StatusUsuario.ATIVO;
  await prisma.usuario.update({ where: { id: usuarioId }, data: { status: novo } });
  if (novo === StatusUsuario.BLOQUEADO) await encerrarAcessoDeUsuarios([usuarioId]);
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `${u.nome} ${novo === StatusUsuario.BLOQUEADO ? "bloqueado" : "desbloqueado"}.` };
}

export async function reenviarAcesso(usuarioId: string): Promise<R> {
  await exigirSuperAdmin();
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { empresa: true } });
  if (!u) return { ok: false, mensagem: "Usuário não encontrado." };
  // Decisão #165: a senha atual deixa de valer, as sessões caem e a pessoa recebe um link de 7 dias
  const link = await redefinirAcesso(usuarioId);
  const enviado = await enviarEmailBoasVindas(u.nome, u.email, link, u.empresa?.pacote ?? "", u.empresa?.modulo ?? Modulo.INDIVIDUAL, "redefinicao");
  return enviado ? { ok: true, mensagem: `Acesso redefinido: a senha anterior deixou de valer e um link para criar a nova foi enviado para ${u.email}.` } : { ok: false, mensagem: "Não foi possível enviar o e-mail." };
}

/** Decisão #166: o Super Admin redefine a verificação em duas etapas de um usuário individual que perdeu o celular e os códigos. */
export async function redefinirVerificacaoIndividual(usuarioId: string): Promise<R> {
  const s = await exigirSuperAdmin();
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { empresa: true } });
  if (!u || u.empresa?.modulo !== Modulo.INDIVIDUAL) return { ok: false, mensagem: "Usuário não encontrado." };
  if (!u.doisFatoresAtivo) return { ok: false, mensagem: `${u.nome} não usa a verificação em duas etapas.` };
  await redefinirDoisFatores(u.id);
  await registrarLog(s.usuario, "USUARIOS", `Verificação em duas etapas redefinida para ${u.nome} (${u.email})`, u.empresaId);
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const { texto, html } = emailVerificacaoRedefinida(u.nome, "o suporte do FilaPro Leads", quando);
  await enviarEmail({ para: u.email, assunto: "Sua verificação em duas etapas foi redefinida — FilaPro Leads", texto, html }).catch(() => undefined);
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `Verificação de ${u.nome} redefinida: entra só com a senha e pode ativá-la de novo em Segurança.` };
}
