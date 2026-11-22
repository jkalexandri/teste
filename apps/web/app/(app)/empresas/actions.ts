"use server";

// Super Admin → Empresas (decisões #22–#24, #30, #40).
import { revalidatePath } from "next/cache";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { lerLimite } from "@/lib/limite";
import { criarConta, enviarEmailBoasVindas, novoVencimento, validarComprador } from "@/lib/contas";

type R = { ok: boolean; mensagem: string };
const t = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);
const n = (f: FormData, k: string) => {
  const v = parseInt(String(f.get(k) ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** Limite do pacote: do plano; no Personalizado, o informado pelo Super Admin. */
async function limiteDoPlano(planoId: string, limiteInformado: number | null) {
  const plano = await prisma.plano.findUnique({ where: { id: planoId } });
  if (!plano || plano.modulo !== Modulo.EMPRESARIAL) return { erro: "Escolha um pacote empresarial." } as const;
  const limite = plano.personalizado ? limiteInformado : plano.usuarios;
  if (!limite || limite < 1) return { erro: "Informe a quantidade de usuários do pacote Personalizado." } as const;
  return { plano, limite } as const;
}

export async function criarEmpresa(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const nomeEmpresa = t(form, "nomeEmpresa", 80);
  if (nomeEmpresa.length < 2) return { ok: false, mensagem: "Informe o nome da empresa." };
  const r = await limiteDoPlano(t(form, "planoId"), n(form, "limite"));
  if ("erro" in r) return { ok: false, mensagem: r.erro! };

  const admin = { nome: t(form, "adminNome", 80), email: t(form, "adminEmail").toLowerCase(), whatsapp: t(form, "adminWhatsapp", 30) };
  const erro = validarComprador({ ...admin, whatsapp: admin.whatsapp || "0000000000" }, false);
  if (erro) return { ok: false, mensagem: erro };
  if (await prisma.usuario.findUnique({ where: { email: admin.email } })) {
    return { ok: false, mensagem: `O e-mail ${admin.email} já tem acesso ao FilaPro Leads.` };
  }

  const prazoDias = n(form, "prazoDias") ?? r.plano.prazoDias;
  const conta = await criarConta({
    modulo: Modulo.EMPRESARIAL,
    nomeConta: nomeEmpresa,
    pacote: r.plano.nome,
    planoId: r.plano.id,
    limiteUsuarios: r.limite,
    prazoDias,
    limiteLeads: r.plano.limiteLeads,
    usuario: admin,
  });
  const enviado = await enviarEmailBoasVindas(admin.nome, admin.email, conta.senhaTemporaria, r.plano.nome, Modulo.EMPRESARIAL);
  revalidatePath("/empresas");
  return {
    ok: true,
    mensagem: enviado
      ? `Empresa ${nomeEmpresa} criada. Acesso do Admin enviado para ${admin.email}.`
      : `Empresa criada, mas o e-mail não foi enviado. Use “Esqueci minha senha” para ${admin.email}.`,
  };
}

/** Troca o pacote. Ao diminuir, os usuários existentes continuam (decisão #24). */
export async function alterarPacote(empresaId: string, form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const r = await limiteDoPlano(t(form, "planoId"), n(form, "limite"));
  if ("erro" in r) return { ok: false, mensagem: r.erro! };
  const e = await prisma.empresa.update({
    where: { id: empresaId },
    data: { pacote: r.plano.nome, planoId: r.plano.id, limiteUsuarios: r.limite },
  });
  const usuarios = await prisma.usuario.count({ where: { empresaId, cargo: Cargo.USUARIO } });
  revalidatePath("/empresas");
  return {
    ok: true,
    mensagem:
      usuarios > r.limite
        ? `${e.nome}: pacote ${r.plano.nome} (${r.limite} usuários). Os ${usuarios} usuários atuais continuam; novos ficam bloqueados até ficar dentro do limite.`
        : `${e.nome}: pacote alterado para ${r.plano.nome} (${r.limite} usuários).`,
  };
}

export async function prorrogarEmpresa(empresaId: string): Promise<R> {
  await exigirSuperAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return { ok: false, mensagem: "Empresa não encontrada." };
  const plano = e.planoId ? await prisma.plano.findUnique({ where: { id: e.planoId } }) : null;
  const dias = plano?.prazoDias ?? e.prazoDias;
  const nova = novoVencimento(e.expiraEm, dias);
  await prisma.empresa.update({
    where: { id: empresaId },
    data: { expiraEm: nova, tokenRenovacao: null, avisoRenovacao10Em: null, avisoRenovacao3Em: null },
  });
  revalidatePath("/empresas");
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `${e.nome}: prorrogado por ${dias} dias, até ${nova.toLocaleDateString("pt-BR")}.` };
}

export async function alternarEmpresaAtiva(empresaId: string): Promise<R> {
  await exigirSuperAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return { ok: false, mensagem: "Empresa não encontrada." };
  await prisma.empresa.update({ where: { id: empresaId }, data: { ativa: !e.ativa } });
  revalidatePath("/empresas");
  return { ok: true, mensagem: `${e.nome} ${e.ativa ? "inativada: os usuários não entram mais" : "ativada"}.` };
}

/** Limite de leads da conta (decisão #58): vazio = ilimitado. Vale para empresas e contas individuais. */
export async function definirLimiteLeads(empresaId: string, form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return { ok: false, mensagem: "Conta não encontrada." };
  const limite = lerLimite(form);
  if (limite === "erro") return { ok: false, mensagem: "Informe o máximo de leads ou marque “Ilimitado”." };
  await prisma.empresa.update({ where: { id: empresaId }, data: { limiteLeads: limite } });
  revalidatePath("/empresas");
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `${e.nome}: limite de leads ${limite == null ? "ilimitado" : `de ${limite.toLocaleString("pt-BR")}`}.` };
}

/** Treinamento da IA da conta (decisão #77): liga/desliga, limites e liberação das páginas do mês. Empresas e individuais. */
export async function definirTreinoIA(empresaId: string, form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return { ok: false, mensagem: "Conta não encontrada." };
  const limiteMateriais = lerLimite(form, "limiteMateriais");
  if (limiteMateriais === "erro") return { ok: false, mensagem: "Informe o máximo de materiais ou marque “Ilimitado”." };
  const limitePaginasMes = lerLimite(form, "limitePaginasMes");
  if (limitePaginasMes === "erro") return { ok: false, mensagem: "Informe o máximo de páginas por mês ou marque “Ilimitado”." };
  const treinarIA = form.get("treinarIA") === "on";
  await prisma.empresa.update({ where: { id: empresaId }, data: { treinarIA, limiteMateriais, limitePaginasMes } });
  // "Liberar": zera as páginas do mês e os materiais do período (decisões #77 e #91 — liberação pelo Super Admin)
  if (form.get("zerarMes") === "on") await prisma.fichaEmpresa.updateMany({ where: { empresaId }, data: { paginasMes: 0, materiaisPeriodo: 0 } });
  revalidatePath("/empresas");
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `${e.nome}: treinamento da IA ${treinarIA ? "ligado" : "desligado"}.` };
}

/** Leads de anúncios da conta (decisão #94): o Super Admin liga/desliga. Empresas e individuais. */
export async function alternarLeadsAnuncios(empresaId: string): Promise<R> {
  await exigirSuperAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return { ok: false, mensagem: "Conta não encontrada." };
  await prisma.empresa.update({ where: { id: empresaId }, data: { leadsAnuncios: !e.leadsAnuncios } });
  revalidatePath("/empresas");
  revalidatePath("/usuarios-individuais");
  return { ok: true, mensagem: `${e.nome}: leads de anúncios ${e.leadsAnuncios ? "desligado" : "ligado"}.` };
}
