"use server";

// Ações da gestão financeira (decisão #106) — só o Super Admin.
import { revalidatePath } from "next/cache";
import { prisma, SituacaoLancamento, TipoLancamento } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { guardarArquivoNoWorker } from "@/lib/worker";
import { CAT, dataDoCampo, lerValor, RECEITA } from "@/lib/financeiro";

type R = { ok: boolean; mensagem: string };
const TIPOS_COMPROVANTE = ["application/pdf", "image/jpeg", "image/png"];
const MAX_COMPROVANTE = 10 * 1024 * 1024;
const atualizar = () => revalidatePath("/financeiro", "layout");
const data = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? dataDoCampo(String(v)) : null);

async function guardarComprovante(id: string, f: FormDataEntryValue | null): Promise<R | null> {
  if (!(f instanceof File) || f.size === 0) return null;
  if (!TIPOS_COMPROVANTE.includes(f.type)) return { ok: false, mensagem: "Comprovante: envie PDF, JPG ou PNG." };
  if (f.size > MAX_COMPROVANTE) return { ok: false, mensagem: "Comprovante muito grande (máximo 10 MB)." };
  const g = await guardarArquivoNoWorker(`fin-${id}`, await f.arrayBuffer());
  if (!g.ok) return { ok: false, mensagem: g.mensagem };
  await prisma.lancamento.update({ where: { id }, data: { comprovanteNome: f.name.slice(0, 120), comprovanteTipo: f.type } });
  return null;
}

/** Novo lançamento manual (receita ou despesa), pago ou pendente, com comprovante opcional. */
export async function criarLancamento(form: FormData): Promise<R> {
  const s = await exigirSuperAdmin();
  const tipo = form.get("tipo") === "RECEITA" ? TipoLancamento.RECEITA : TipoLancamento.DESPESA;
  const descricao = String(form.get("descricao") ?? "").trim().slice(0, 200);
  const valor = lerValor(String(form.get("valor") ?? ""));
  const vencimento = data(form.get("vencimento"));
  const pago = form.get("pago") === "on";
  const pagoEm = pago ? data(form.get("pagoEm")) ?? vencimento : null;
  if (!descricao) return { ok: false, mensagem: "Informe a descrição." };
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, mensagem: "Informe um valor maior que zero." };
  if (!vencimento) return { ok: false, mensagem: "Informe a data (vencimento)." };
  const l = await prisma.lancamento.create({
    data: {
      tipo, descricao, valor, vencimento, pagoEm, situacao: pago ? SituacaoLancamento.PAGO : SituacaoLancamento.PENDENTE,
      categoriaId: String(form.get("categoriaId") || "") || null, contaId: String(form.get("contaId") || "") || null,
      observacao: String(form.get("observacao") ?? "").trim().slice(0, 500) || null, criadoPor: s.usuario.email,
    },
  });
  const erro = await guardarComprovante(l.id, form.get("comprovante"));
  if (erro) { await prisma.lancamento.delete({ where: { id: l.id } }); return erro; }
  atualizar();
  return { ok: true, mensagem: `${tipo === RECEITA ? "Receita" : "Despesa"} lançada.` };
}

/** Marcar como pago (data e conta opcionais) — e anexar o comprovante. */
export async function marcarPago(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const id = String(form.get("id") ?? "");
  const l = await prisma.lancamento.findUnique({ where: { id } });
  if (!l || l.situacao !== SituacaoLancamento.PENDENTE) return { ok: false, mensagem: "Lançamento não está pendente." };
  const erro = await guardarComprovante(id, form.get("comprovante"));
  if (erro) return erro;
  await prisma.lancamento.update({
    where: { id },
    data: { situacao: SituacaoLancamento.PAGO, pagoEm: data(form.get("pagoEm")) ?? new Date(), ...(form.get("contaId") ? { contaId: String(form.get("contaId")) } : {}) },
  });
  atualizar();
  return { ok: true, mensagem: l.tipo === RECEITA ? "Recebimento registrado." : "Pagamento registrado." };
}

/** Anexar ou trocar o comprovante de qualquer lançamento. */
export async function anexarComprovante(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const id = String(form.get("id") ?? "");
  if (!(await prisma.lancamento.findUnique({ where: { id } }))) return { ok: false, mensagem: "Lançamento não encontrado." };
  const f = form.get("comprovante");
  if (!(f instanceof File) || f.size === 0) return { ok: false, mensagem: "Escolha o arquivo." };
  const erro = await guardarComprovante(id, f);
  if (erro) return erro;
  atualizar();
  return { ok: true, mensagem: "Comprovante anexado." };
}

/** Cancelar um lançamento pendente (ex.: despesa fixa que não houve neste mês) ou excluir um manual. */
export async function cancelarLancamento(id: string): Promise<R> {
  await exigirSuperAdmin();
  const l = await prisma.lancamento.findUnique({ where: { id } });
  if (!l) return { ok: false, mensagem: "Lançamento não encontrado." };
  if (l.origem === "PEDIDO" || l.origem === "ESTORNO") return { ok: false, mensagem: "Receita de pedido não se cancela: use Estornar." };
  await prisma.lancamento.update({ where: { id }, data: { situacao: SituacaoLancamento.CANCELADO } });
  atualizar();
  return { ok: true, mensagem: "Lançamento cancelado." };
}

/** Estorno/devolução (item 9): receita negativa ligada à receita original, abatendo do faturamento. */
export async function estornar(form: FormData): Promise<R> {
  const s = await exigirSuperAdmin();
  const id = String(form.get("id") ?? "");
  const l = await prisma.lancamento.findUnique({ where: { id } });
  if (!l || l.tipo !== RECEITA || l.situacao !== SituacaoLancamento.PAGO || l.valor <= 0) return { ok: false, mensagem: "Só receitas recebidas podem ser estornadas." };
  const jaEstornado = (await prisma.lancamento.aggregate({ _sum: { valor: true }, where: { estornoDeId: id, situacao: { not: SituacaoLancamento.CANCELADO } } }))._sum.valor ?? 0;
  const valorTxt = String(form.get("valor") ?? "").trim();
  const valor = valorTxt ? lerValor(valorTxt) : l.valor + jaEstornado;
  if (!Number.isFinite(valor) || valor <= 0 || valor > l.valor + jaEstornado) return { ok: false, mensagem: "Valor do estorno inválido (máximo: o que ainda não foi devolvido)." };
  const motivo = String(form.get("motivo") ?? "").trim().slice(0, 200);
  const cat = await prisma.categoriaFinanceira.findUnique({ where: { tipo_nome: { tipo: RECEITA, nome: CAT.estorno } } });
  await prisma.lancamento.create({
    data: {
      tipo: RECEITA, categoriaId: cat?.id ?? null, valor: -valor, origem: "ESTORNO", estornoDeId: id, pedidoId: l.pedidoId, contaId: l.contaId,
      descricao: `Estorno — ${l.descricao}${motivo ? ` (${motivo})` : ""}`, vencimento: new Date(), pagoEm: new Date(), situacao: SituacaoLancamento.PAGO, criadoPor: s.usuario.email,
    },
  });
  atualizar();
  return { ok: true, mensagem: "Estorno registrado: o valor foi abatido do faturamento." };
}

// ===================== Despesas fixas =====================

export async function salvarFixa(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const id = String(form.get("id") ?? "");
  const descricao = String(form.get("descricao") ?? "").trim().slice(0, 200);
  const valor = lerValor(String(form.get("valor") ?? ""));
  const dia = Math.floor(Number(form.get("dia")));
  if (!descricao) return { ok: false, mensagem: "Informe a descrição." };
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, mensagem: "Informe um valor maior que zero." };
  if (!(dia >= 1 && dia <= 31)) return { ok: false, mensagem: "Dia do vencimento: de 1 a 31." };
  const dados = { descricao, valor, diaVencimento: dia, categoriaId: String(form.get("categoriaId") || "") || null, contaId: String(form.get("contaId") || "") || null };
  if (id) await prisma.despesaFixa.update({ where: { id }, data: dados });
  else await prisma.despesaFixa.create({ data: dados });
  atualizar();
  return { ok: true, mensagem: id ? "Despesa fixa atualizada (vale a partir do próximo lançamento)." : "Despesa fixa criada: a deste mês já foi lançada como pendente." };
}

export async function alternarFixa(id: string): Promise<R> {
  await exigirSuperAdmin();
  const f = await prisma.despesaFixa.findUnique({ where: { id } });
  if (!f) return { ok: false, mensagem: "Não encontrada." };
  await prisma.despesaFixa.update({ where: { id }, data: { ativa: !f.ativa } });
  atualizar();
  return { ok: true, mensagem: f.ativa ? "Despesa fixa pausada (não lança nos próximos meses)." : "Despesa fixa reativada." };
}

// ===================== Configurações =====================

export async function salvarCategoria(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const nome = String(form.get("nome") ?? "").trim().slice(0, 60);
  const tipo = form.get("tipo") === "RECEITA" ? TipoLancamento.RECEITA : TipoLancamento.DESPESA;
  if (!nome) return { ok: false, mensagem: "Informe o nome da categoria." };
  const existe = await prisma.categoriaFinanceira.findUnique({ where: { tipo_nome: { tipo, nome } } });
  if (existe) return { ok: false, mensagem: "Essa categoria já existe." };
  await prisma.categoriaFinanceira.create({ data: { tipo, nome } });
  atualizar();
  return { ok: true, mensagem: "Categoria criada." };
}

export async function alternarCategoria(id: string): Promise<R> {
  await exigirSuperAdmin();
  const c = await prisma.categoriaFinanceira.findUnique({ where: { id } });
  if (!c) return { ok: false, mensagem: "Não encontrada." };
  await prisma.categoriaFinanceira.update({ where: { id }, data: { ativa: !c.ativa } });
  atualizar();
  return { ok: true, mensagem: c.ativa ? "Categoria escondida (os lançamentos antigos continuam com ela)." : "Categoria reativada." };
}

export async function salvarConta(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const nome = String(form.get("nome") ?? "").trim().slice(0, 60);
  if (!nome) return { ok: false, mensagem: "Informe o nome da conta." };
  if (await prisma.contaBancaria.findUnique({ where: { nome } })) return { ok: false, mensagem: "Essa conta já existe." };
  await prisma.contaBancaria.create({ data: { nome } });
  atualizar();
  return { ok: true, mensagem: "Conta criada." };
}

export async function alternarConta(id: string): Promise<R> {
  await exigirSuperAdmin();
  const c = await prisma.contaBancaria.findUnique({ where: { id } });
  if (!c) return { ok: false, mensagem: "Não encontrada." };
  await prisma.contaBancaria.update({ where: { id }, data: { ativa: !c.ativa } });
  atualizar();
  return { ok: true, mensagem: c.ativa ? "Conta escondida." : "Conta reativada." };
}

export async function salvarAliquota(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const t = String(form.get("aliquota") ?? "").trim().replace(",", ".");
  const a = t === "" ? null : Number(t);
  if (a !== null && !(a >= 0 && a <= 50)) return { ok: false, mensagem: "Alíquota de 0 a 50%." };
  await prisma.configVenda.upsert({ where: { id: "config" }, create: { id: "config", aliquotaImposto: a }, update: { aliquotaImposto: a } });
  atualizar();
  return { ok: true, mensagem: a === null ? "Imposto previsto desligado." : `Alíquota salva: ${a.toLocaleString("pt-BR")}%.` };
}
