"use server";

// Ações do Super Admin sobre o catálogo de planos (decisão #27).
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { lerLimite } from "@/lib/limite";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { lerReais } from "@/lib/planos";

export type RespostaAcao = { ok: boolean; mensagem: string };

const texto = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);
const inteiro = (v: FormDataEntryValue | null) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function salvarPlano(id: string, form: FormData): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const atual = await prisma.plano.findUnique({ where: { id } });
  if (!atual) return { ok: false, mensagem: "Plano não encontrado." };

  const nome = texto(form.get("nome"), 60);
  if (!nome) return { ok: false, mensagem: "Informe o nome do plano." };

  const precoAtual = lerReais(texto(form.get("precoAtual")));
  const precoAntigo = lerReais(texto(form.get("precoAntigo")));
  const usuarios = inteiro(form.get("usuarios"));
  if (!atual.personalizado && (!usuarios || usuarios < 1)) return { ok: false, mensagem: "Informe a quantidade de usuários (mínimo 1)." };

  if (atual.visivel && !atual.gratis && !atual.personalizado && precoAtual == null) {
    return { ok: false, mensagem: "Este plano aparece no popup: informe o preço atual ou oculte o plano antes." };
  }

  const prazoDias = inteiro(form.get("prazoDias")) || 31;
  const limiteLeads = lerLimite(form);
  if (limiteLeads === "erro") return { ok: false, mensagem: "Informe o máximo de leads ou marque “Ilimitado”." };
  // Limites de treinamento da IA (decisão #77)
  const limiteMateriais = lerLimite(form, "limiteMateriais");
  if (limiteMateriais === "erro") return { ok: false, mensagem: "Informe o máximo de materiais da IA ou marque “Ilimitado”." };
  const limitePaginasMes = lerLimite(form, "limitePaginasMes");
  if (limitePaginasMes === "erro") return { ok: false, mensagem: "Informe o máximo de páginas por mês da IA ou marque “Ilimitado”." };
  // WhatsApp extra (só Individual pago — decisões #79 e #80)
  const comExtra = atual.modulo === "INDIVIDUAL" && !atual.gratis;
  const maxWhatsapps = comExtra ? Math.min(10, Math.max(1, inteiro(form.get("maxWhatsapps")) || 1)) : 1;
  const precoWhatsappExtra = comExtra ? lerReais(texto(form.get("precoWhatsappExtra"))) : null;
  if (maxWhatsapps > 1 && precoWhatsappExtra == null) return { ok: false, mensagem: "Informe o preço do WhatsApp extra (ou deixe 1 WhatsApp por usuário)." };
  // Plano por quantidade de envio (decisão #102)
  const disparosPorPeriodo = atual.gratis ? null : inteiro(form.get("disparosPorPeriodo")) || null;
  const pacoteDisparos = atual.gratis ? null : inteiro(form.get("pacoteDisparos")) || null;
  const precoPacoteDisparos = atual.gratis ? null : lerReais(texto(form.get("precoPacoteDisparos")));
  if (pacoteDisparos && precoPacoteDisparos == null) return { ok: false, mensagem: "Informe o preço do pacote extra de disparos (ou deixe a quantidade vazia)." };
  const recursos = texto(form.get("recursos"), 5000).split("\n").map((r) => r.trim()).filter(Boolean);

  await prisma.plano.update({
    where: { id },
    data: {
      nome,
      usuarios,
      precoAtual: atual.gratis ? null : precoAtual,
      precoAntigo: atual.gratis ? null : precoAntigo,
      periodo: texto(form.get("periodo"), 20) || "mês",
      prazoDias,
      limiteLeads,
      limiteMateriais,
      limitePaginasMes,
      // Leads de anúncios incluídos no plano (decisão #90)
      leadsAnuncios: form.get("leadsAnuncios") === "on",
      maxWhatsapps,
      precoWhatsappExtra,
      disparosPorPeriodo,
      pacoteDisparos,
      precoPacoteDisparos: pacoteDisparos ? precoPacoteDisparos : null,
      testeDias: atual.gratis ? inteiro(form.get("testeDias")) : null,
      testeDisparos: atual.gratis ? inteiro(form.get("testeDisparos")) : null,
      selo: texto(form.get("selo"), 60),
      frase: texto(form.get("frase"), 300),
      condicoes: texto(form.get("condicoes"), 1000),
      ofertaTexto: texto(form.get("ofertaTexto"), 300),
      recursos,
      textoBotao: texto(form.get("textoBotao"), 40) || "Escolher plano",
    },
  });
  revalidatePath("/planos");
  return { ok: true, mensagem: `Plano ${nome} salvo.` };
}

export async function alternarVisivel(id: string, visivel: boolean): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const p = await prisma.plano.findUnique({ where: { id } });
  if (!p) return { ok: false, mensagem: "Plano não encontrado." };
  // Plano pago só aparece no popup com preço definido.
  if (visivel && !p.gratis && !p.personalizado && p.precoAtual == null) {
    return { ok: false, mensagem: `Defina o preço atual do plano ${p.nome} antes de exibi-lo.` };
  }
  await prisma.plano.update({ where: { id }, data: { visivel } });
  revalidatePath("/planos");
  return { ok: true, mensagem: `${p.nome} ${visivel ? "aparece" : "não aparece mais"} no popup.` };
}

export async function definirDestaque(id: string): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  await prisma.$transaction([
    prisma.plano.updateMany({ data: { destaque: false } }),
    prisma.plano.update({ where: { id }, data: { destaque: true } }),
  ]);
  revalidatePath("/planos");
  return { ok: true, mensagem: "Plano em destaque atualizado." };
}

export async function moverPlano(id: string, direcao: -1 | 1): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const todos = await prisma.plano.findMany({ orderBy: { ordem: "asc" } });
  const i = todos.findIndex((p) => p.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= todos.length) return { ok: true, mensagem: "" };
  [todos[i], todos[j]] = [todos[j], todos[i]];
  await prisma.$transaction(todos.map((p, ordem) => prisma.plano.update({ where: { id: p.id }, data: { ordem } })));
  revalidatePath("/planos");
  return { ok: true, mensagem: "Ordem atualizada." };
}
