"use server";

// Super Admin → Usuários Individuais (decisões #31 e #40).
import { revalidatePath } from "next/cache";
import { prisma, gerarHash, gerarSenhaTemporaria, Modulo, StatusUsuario } from "@filapro/db";
import { encerrarAcessoDeUsuarios } from "@/lib/auth/encerrar-acesso";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { criarConta, enviarEmailBoasVindas, validarComprador, VALIDADE_TEMP_CONTA_NOVA_DIAS } from "@/lib/contas";

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
  const enviado = await enviarEmailBoasVindas(dados.nome, dados.email, conta.senhaTemporaria, plano.nome, Modulo.INDIVIDUAL);
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
  const temp = gerarSenhaTemporaria();
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senhaTempHash: await gerarHash(temp), senhaTempExpiraEm: new Date(Date.now() + VALIDADE_TEMP_CONTA_NOVA_DIAS * 86400000) },
  });
  const enviado = await enviarEmailBoasVindas(u.nome, u.email, temp, u.empresa?.pacote ?? "", u.empresa?.modulo ?? Modulo.INDIVIDUAL);
  return enviado ? { ok: true, mensagem: `Nova senha temporária enviada para ${u.email}.` } : { ok: false, mensagem: "Não foi possível enviar o e-mail." };
}
