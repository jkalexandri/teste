"use server";

// Ações da tela Leads (etapa 7 — decisões #53 a #59). Todas conferem a sessão e
// o que o perfil pode fazer (decisão #56) no servidor.
import { revalidatePath } from "next/cache";
import { logDaSessao } from "@/lib/logs";
import { readSheet } from "read-excel-file/node";
import { prisma, Cargo, StatusLead } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { adicionarLeads, permissoesLeads, podeVerLead, textoResumo, type Ator, type ResumoImportacao } from "@/lib/leads";
import { lerCsv, lerTabela, lerTextoColado, type LinhaLead } from "@/lib/planilha";
import { normalizarTelefone } from "@/lib/telefone";
import { LISTA_STATUS } from "@/lib/leads-status";

type R = { ok: boolean; mensagem: string; resumo?: ResumoImportacao };
const MAX_LINHAS = 50_000;
const MAX_ARQUIVO = 10 * 1024 * 1024; // 10 MB

/** Sessão válida com acesso à tela Leads (Usuário precisa da permissão "leads" — decisão #47). */
async function ator(): Promise<Ator> {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  if (u.cargo === Cargo.USUARIO && !u.permissoes.includes("leads")) throw new Error("Acesso negado.");
  return { id: u.id, cargo: u.cargo, empresaId: u.empresaId, empresa: u.empresa ? { modulo: u.empresa.modulo } : null };
}

async function salvar(a: Ator, donoId: string, linhas: LinhaLead[], invalidos = 0): Promise<R> {
  const r = await adicionarLeads(a, donoId || a.id, linhas.slice(0, MAX_LINHAS));
  if ("erro" in r) return { ok: false, mensagem: r.erro };
  revalidatePath("/leads");
  const extra = invalidos ? ` • ${invalidos} com número inválido` : "";
  if (r.salvos > 0) await logDaSessao("LEADS", `Leads cadastrados: ${textoResumo(r)}${extra}`);
  return { ok: r.salvos > 0, mensagem: textoResumo(r) + extra, resumo: r };
}

/** Adicionar um lead (nome pode ficar em branco). */
export async function adicionarUm(form: FormData): Promise<R> {
  const a = await ator();
  const telefone = normalizarTelefone(form.get("telefone"));
  if (!telefone) return { ok: false, mensagem: "Telefone inválido. Use DDD + número, ou + e o código do país para números de fora do Brasil." };
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  return salvar(a, String(form.get("donoId") ?? ""), [{ nome, telefone }]);
}

/** Colar vários: um por linha, "Nome; telefone". */
export async function salvarColados(texto: string, donoId: string): Promise<R> {
  const a = await ator();
  const r = lerTextoColado(String(texto).slice(0, 2_000_000));
  if (!r.linhas.length) return { ok: false, mensagem: r.invalidos.length ? `Nenhum telefone válido (${r.invalidos.length} linhas com número inválido).` : "Cole pelo menos um lead." };
  return salvar(a, donoId, r.linhas, r.invalidos.length);
}

export type Analise = {
  ok: boolean;
  mensagem: string;
  linhas: LinhaLead[];
  invalidos: { linha: number; nome: string; telefone: string }[];
  totalInvalidos: number;
  temCabecalho: boolean;
  colunas: string;
};

/** 1º passo da importação: lê o arquivo e devolve o resumo para o usuário conferir antes de salvar. */
export async function analisarArquivo(form: FormData): Promise<Analise> {
  await ator();
  const vazio: Analise = { ok: false, mensagem: "", linhas: [], invalidos: [], totalInvalidos: 0, temCabecalho: false, colunas: "" };
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ...vazio, mensagem: "Escolha um arquivo .xlsx ou .csv." };
  if (arquivo.size > MAX_ARQUIVO) return { ...vazio, mensagem: "Arquivo muito grande (máximo 10 MB)." };
  const nome = arquivo.name.toLowerCase();
  let tabela: unknown[][];
  try {
    const buf = Buffer.from(await arquivo.arrayBuffer());
    if (nome.endsWith(".xlsx")) tabela = (await readSheet(buf)) as unknown[][];
    else if (nome.endsWith(".csv") || nome.endsWith(".txt")) tabela = lerCsv(new TextDecoder("utf-8").decode(buf));
    else return { ...vazio, mensagem: "Formato não aceito. Use planilha Excel (.xlsx) ou CSV." };
  } catch {
    return { ...vazio, mensagem: "Não foi possível ler o arquivo. Confira se é uma planilha .xlsx ou .csv válida." };
  }
  const r = lerTabela(tabela.slice(0, MAX_LINHAS + 1));
  if (r.colunaTelefone == null) return { ...vazio, mensagem: "Não encontramos uma coluna de telefone no arquivo." };
  const letra = (i: number) => String.fromCharCode(65 + i);
  const colunas = `Telefone na coluna ${letra(r.colunaTelefone)}` + (r.colunaNome == null ? " • sem coluna de nome (nome em branco)" : ` • Nome na coluna ${letra(r.colunaNome)}`);
  return {
    ok: r.linhas.length > 0,
    mensagem: r.linhas.length ? "" : "Nenhum telefone válido no arquivo.",
    linhas: r.linhas,
    invalidos: r.invalidos.slice(0, 50),
    totalInvalidos: r.invalidos.length,
    temCabecalho: r.temCabecalho,
    colunas,
  };
}

/** 2º passo: salva as linhas conferidas (normaliza de novo no servidor). */
export async function salvarImportacao(linhas: LinhaLead[], donoId: string, invalidos: number): Promise<R> {
  const a = await ator();
  const limpas = (Array.isArray(linhas) ? linhas : [])
    .slice(0, MAX_LINHAS)
    // O telefone já vem normalizado (só dígitos com o código do país): confere de novo com o "+".
    .map((l) => ({ nome: String(l?.nome ?? "").trim().slice(0, 80), telefone: normalizarTelefone("+" + String(l?.telefone ?? "").replace(/\D/g, "")) }))
    .filter((l) => l.telefone);
  if (!limpas.length) return { ok: false, mensagem: "Nada para salvar." };
  return salvar(a, donoId, limpas, invalidos);
}

async function leadPermitido(id: string) {
  const a = await ator();
  const lead = await prisma.lead.findUnique({ where: { id } });
  return lead && podeVerLead(a, lead) ? { a, lead, pode: permissoesLeads(a) } : null;
}

/** Editar: nome (todos); telefone só Admin da Empresa, usuário Individual e Super Admin (decisão #56). */
export async function editarLead(id: string, form: FormData): Promise<R> {
  const x = await leadPermitido(id);
  if (!x) return { ok: false, mensagem: "Lead não encontrado." };
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  const dados: { nome: string; telefone?: string } = { nome };
  const telEnviado = form.get("telefone");
  if (telEnviado != null && x.pode.editarTelefone) {
    const telefone = normalizarTelefone(telEnviado);
    if (!telefone) return { ok: false, mensagem: "Telefone inválido." };
    if (telefone !== x.lead.telefone) {
      const conflito = await prisma.lead.findFirst({
        where: x.lead.empresaId ? { empresaId: x.lead.empresaId, telefone } : { usuarioId: x.lead.usuarioId, telefone },
      });
      if (conflito) return { ok: false, mensagem: conflito.usuarioId === x.lead.usuarioId ? "Este número já está na lista." : "Este número já foi cadastrado por outro usuário da empresa." };
      dados.telefone = telefone;
    }
  }
  await prisma.lead.update({ where: { id }, data: dados });
  revalidatePath("/leads");
  await logDaSessao("LEADS", `Lead ${x.lead.codigo} alterado`, x.lead.empresaId);
  return { ok: true, mensagem: `Lead ${x.lead.codigo} atualizado.` };
}

/** Inativar / reativar: lead inativo não recebe campanhas (decisão #56). */
export async function alternarAtivoLead(id: string): Promise<R> {
  const x = await leadPermitido(id);
  if (!x) return { ok: false, mensagem: "Lead não encontrado." };
  await prisma.lead.update({ where: { id }, data: { ativo: !x.lead.ativo } });
  revalidatePath("/leads");
  await logDaSessao("LEADS", `Lead ${x.lead.codigo} ${x.lead.ativo ? "inativado" : "reativado"}`, x.lead.empresaId);
  return { ok: true, mensagem: `Lead ${x.lead.codigo} ${x.lead.ativo ? "inativado" : "reativado"}.` };
}

/** Status manual (decisão #59). "Pediu para sair" registra a data do bloqueio de 45 dias (decisão #57). */
export async function mudarStatusLead(id: string, status: string): Promise<R> {
  const x = await leadPermitido(id);
  if (!x) return { ok: false, mensagem: "Lead não encontrado." };
  if (!LISTA_STATUS.includes(status as never)) return { ok: false, mensagem: "Status inválido." };
  const novo = status as StatusLead;
  await prisma.lead.update({
    where: { id },
    data: {
      status: novo,
      pediuSairEm: novo === StatusLead.PEDIU_SAIR ? (x.lead.status === StatusLead.PEDIU_SAIR ? x.lead.pediuSairEm : new Date()) : null,
    },
  });
  revalidatePath("/leads");
  await logDaSessao("LEADS", `Status do lead ${x.lead.codigo} alterado para ${status}`, x.lead.empresaId);
  return { ok: true, mensagem: `Status do lead ${x.lead.codigo} alterado.` };
}

/** Excluir: só o Super Admin (decisão #56). */
export async function excluirLead(id: string): Promise<R> {
  const x = await leadPermitido(id);
  if (!x) return { ok: false, mensagem: "Lead não encontrado." };
  if (!x.pode.excluir) return { ok: false, mensagem: "Só o Super Admin exclui leads." };
  await prisma.lead.delete({ where: { id } });
  revalidatePath("/leads");
  await logDaSessao("LEADS", `Lead ${x.lead.codigo} excluído`, x.lead.empresaId);
  return { ok: true, mensagem: `Lead ${x.lead.codigo} excluído.` };
}
