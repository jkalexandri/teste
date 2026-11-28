"use server";

// Ações do Super Admin sobre o catálogo de planos (decisão #27).
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { lerLimite } from "@/lib/limite";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { lerReais, semPrecoDeVenda, categoriasDoModulo, DESCONTOS_PADRAO, MAX_NUMEROS_INDIVIDUAL } from "@/lib/planos";
import { Modulo, CategoriaPlano } from "@filapro/db";

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
  // Categoria (decisão #183): só as permitidas para o módulo do plano; o Free fica sempre em Individual
  const categoria = atual.gratis ? CategoriaPlano.INDIVIDUAL : (texto(form.get("categoria"), 20) || atual.categoria) as CategoriaPlano;
  if (!atual.gratis && !categoriasDoModulo(atual.modulo).includes(categoria)) return { ok: false, mensagem: "Categoria não permitida para este tipo de conta." };

  const precoAtual = lerReais(texto(form.get("precoAtual")));
  const precoAntigo = lerReais(texto(form.get("precoAntigo")));
  const usuarios = inteiro(form.get("usuarios"));
  if (!atual.personalizado && (!usuarios || usuarios < 1)) return { ok: false, mensagem: "Informe a quantidade de usuários (mínimo 1)." };


  const prazoDias = inteiro(form.get("prazoDias")) || 31;
  const limiteLeads = lerLimite(form);
  if (limiteLeads === "erro") return { ok: false, mensagem: "Informe o máximo de leads ou marque “Ilimitado”." };
  // Limites de treinamento da IA (decisão #77)
  const limiteMateriais = lerLimite(form, "limiteMateriais");
  if (limiteMateriais === "erro") return { ok: false, mensagem: "Informe o máximo de materiais da IA ou marque “Ilimitado”." };
  const limitePaginasMes = lerLimite(form, "limitePaginasMes");
  if (limitePaginasMes === "erro") return { ok: false, mensagem: "Informe o máximo de páginas por mês da IA ou marque “Ilimitado”." };
  // Preço por quantidade (decisão #113): Individual até 4 números; Empresarial em pacotes de usuários; descontos por posição
  const comExtra = atual.modulo === "INDIVIDUAL" && !atual.gratis;
  const maxWhatsapps = comExtra ? Math.min(MAX_NUMEROS_INDIVIDUAL, Math.max(1, inteiro(form.get("maxWhatsapps")) || 1)) : 1;
  const maxPacotes = atual.modulo === "EMPRESARIAL" && !atual.gratis ? Math.min(10, Math.max(1, inteiro(form.get("maxPacotes")) || 1)) : 1;
  const descontos: number[] = [];
  for (const k of ["desconto2", "desconto3", "desconto4", "desconto5"]) {
    const v = texto(form.get(k)).replace(",", ".");
    if (v === "") break;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 90) return { ok: false, mensagem: "Os descontos devem ficar entre 0% e 90%." };
    descontos.push(n);
  }
  // Plano por quantidade de envio (decisão #102)
  // Redes Sociais (decisão #185): só mensal (sem plano por disparo nem pacote extra) e sem disparos de campanha
  const soRedes = categoria === CategoriaPlano.REDES;
  const disparosPorPeriodo = atual.gratis || categoria === CategoriaPlano.REDES || categoria === CategoriaPlano.REDES_DISPAROS ? null : inteiro(form.get("disparosPorPeriodo")) || null;
  const pacoteDisparos = atual.gratis || categoria === CategoriaPlano.REDES || categoria === CategoriaPlano.REDES_DISPAROS ? null : inteiro(form.get("pacoteDisparos")) || null;
  const precoPacoteDisparos = atual.gratis || !pacoteDisparos ? null : lerReais(texto(form.get("precoPacoteDisparos")));
  if (pacoteDisparos && precoPacoteDisparos == null) return { ok: false, mensagem: "Informe o preço do pacote extra de disparos (ou deixe a quantidade vazia)." };
  const recursos = texto(form.get("recursos"), 5000).split("\n").map((r) => r.trim()).filter(Boolean);

  await prisma.plano.update({
    where: { id },
    data: {
      nome,
      categoria,
      usuarios,
      precoAtual: atual.gratis ? null : precoAtual,
      precoAntigo: atual.gratis ? null : precoAntigo,
      periodo: texto(form.get("periodo"), 20) || "mês",
      prazoDias,
      limiteLeads,
      limiteMateriais,
      limitePaginasMes,
      // Leads de anúncios incluídos no plano (decisão #90)
      // As categorias de Redes Sociais sempre incluem os leads vindos das redes (decisão #185)
      leadsAnuncios: form.get("leadsAnuncios") === "on" || categoria === CategoriaPlano.REDES || categoria === CategoriaPlano.REDES_DISPAROS,
      redesSociais: categoria === CategoriaPlano.REDES || categoria === CategoriaPlano.REDES_DISPAROS,
      permiteDisparos: !soRedes,
      maxWhatsapps,
      precoWhatsappExtra: null,
      maxPacotes,
      descontos: descontos.length ? descontos : DESCONTOS_PADRAO,
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
  // Plano pago sem preço pode aparecer: fica "Em breve" (sem compra) até ter preço (decisão #111)
  await prisma.plano.update({ where: { id }, data: { visivel } });
  revalidatePath("/planos");
  return { ok: true, mensagem: `${p.nome} ${visivel ? (semPrecoDeVenda(p) ? "aparece como “Em breve” (defina o preço para vender)" : "aparece") : "não aparece mais"} no popup.` };
}

/** Um destaque por categoria do popup (decisão #183): tira o destaque só dos planos da mesma categoria. */
export async function definirDestaque(id: string): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const p = await prisma.plano.findUnique({ where: { id } });
  if (!p) return { ok: false, mensagem: "Plano não encontrado." };
  await prisma.$transaction([
    prisma.plano.updateMany({ where: { categoria: p.categoria }, data: { destaque: false } }),
    prisma.plano.update({ where: { id }, data: { destaque: true } }),
  ]);
  revalidatePath("/planos");
  return { ok: true, mensagem: "Plano em destaque atualizado (na aba dele)." };
}

const slugDe = (nome: string) => `${nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "plano"}-${Math.random().toString(36).slice(2, 6)}`;

/** Novo plano (decisão #111): começa oculto e sem preço; o Super Admin completa em Editar. */
export async function novoPlano(form: FormData): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const nome = texto(form.get("nome"), 60);
  if (!nome) return { ok: false, mensagem: "Informe o nome do plano." };
  const modulo = form.get("modulo") === "INDIVIDUAL" ? Modulo.INDIVIDUAL : Modulo.EMPRESARIAL;
  // Categoria (decisão #183): Individual só em conta Individual; Business só em conta Business; Redes Sociais valem para as duas
  const categoria = (texto(form.get("categoria"), 20) || (modulo === Modulo.INDIVIDUAL ? "INDIVIDUAL" : "BUSINESS")) as CategoriaPlano;
  if (!categoriasDoModulo(modulo).includes(categoria)) return { ok: false, mensagem: "Essa categoria não vale para esse tipo de conta (Individual: Individual, Redes Sociais; Business: Business, Redes Sociais)." };
  const ultimo = await prisma.plano.findFirst({ orderBy: { ordem: "desc" }, select: { ordem: true } });
  await prisma.plano.create({ data: { slug: slugDe(nome), nome, modulo, categoria, redesSociais: categoria === "REDES" || categoria === "REDES_DISPAROS", permiteDisparos: categoria !== "REDES", leadsAnuncios: categoria === "REDES" || categoria === "REDES_DISPAROS", usuarios: modulo === Modulo.INDIVIDUAL ? 1 : 3, ordem: (ultimo?.ordem ?? 0) + 1, visivel: false } });
  revalidatePath("/planos");
  return { ok: true, mensagem: `Plano ${nome} criado (oculto). Clique em Editar para completar e definir o preço.` };
}

/** Duplicar: cópia oculta, com "(cópia)" no nome, logo depois do original. */
export async function duplicarPlano(id: string): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const p = await prisma.plano.findUnique({ where: { id } });
  if (!p) return { ok: false, mensagem: "Plano não encontrado." };
  if (p.gratis) return { ok: false, mensagem: "O plano de teste grátis não pode ser duplicado." };
  const { id: _id, slug: _slug, criadoEm: _c, atualizadoEm: _a, ...dados } = p;
  const nome = `${p.nome} (cópia)`.slice(0, 60);
  await prisma.$transaction([
    prisma.plano.updateMany({ where: { ordem: { gt: p.ordem } }, data: { ordem: { increment: 1 } } }),
    prisma.plano.create({ data: { ...dados, nome, slug: slugDe(nome), ordem: p.ordem + 1, visivel: false, destaque: false } }),
  ]);
  revalidatePath("/planos");
  return { ok: true, mensagem: `Cópia criada (oculta): ${nome}.` };
}

/** Excluir: só plano sem pedidos e sem contas usando; senão, ocultar. O Free não sai (teste grátis). */
export async function excluirPlano(id: string): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const p = await prisma.plano.findUnique({ where: { id } });
  if (!p) return { ok: false, mensagem: "Plano não encontrado." };
  if (p.gratis) return { ok: false, mensagem: "O plano de teste grátis não pode ser excluído (oculte-o se não quiser oferecer)." };
  const [pedidos, contas] = await Promise.all([prisma.pedido.count({ where: { planoId: id } }), prisma.empresa.count({ where: { planoId: id } })]);
  if (pedidos || contas) return { ok: false, mensagem: `Não dá para excluir: ${p.nome} tem ${pedidos} pedido(s) e ${contas} conta(s). Use Oculto para tirar do popup.` };
  await prisma.plano.delete({ where: { id } });
  revalidatePath("/planos");
  return { ok: true, mensagem: `Plano ${p.nome} excluído.` };
}

/** Sobe/desce o plano DENTRO da própria categoria (decisão #184): troca a ordem com o vizinho da mesma categoria. */
export async function moverPlano(id: string, direcao: -1 | 1): Promise<RespostaAcao> {
  await exigirSuperAdmin();
  const p = await prisma.plano.findUnique({ where: { id } });
  if (!p) return { ok: false, mensagem: "Plano não encontrado." };
  const grupo = await prisma.plano.findMany({ where: { categoria: p.categoria }, orderBy: { ordem: "asc" } });
  const i = grupo.findIndex((x) => x.id === id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= grupo.length) return { ok: true, mensagem: "" };
  const a = grupo[i]!, b = grupo[j]!;
  // Se as duas ordens forem iguais, separa antes de trocar
  const oa = a.ordem, ob = b.ordem === a.ordem ? b.ordem + (direcao > 0 ? 1 : -1) : b.ordem;
  await prisma.$transaction([prisma.plano.update({ where: { id: a.id }, data: { ordem: ob } }), prisma.plano.update({ where: { id: b.id }, data: { ordem: oa } })]);
  revalidatePath("/planos");
  return { ok: true, mensagem: "Ordem atualizada." };
}
