// Leitura de leads a partir de texto colado e de arquivos .xlsx / .csv (decisões #53 e #61).
// Funções puras (sem banco) para poderem ser testadas.
import { normalizarTelefone } from "./telefone";

export type LinhaLead = { nome: string; telefone: string };
export type ResultadoLeitura = {
  linhas: LinhaLead[]; // telefone já normalizado (válidos)
  invalidos: { linha: number; nome: string; telefone: string }[];
  temCabecalho: boolean;
  colunaNome: number | null; // índice (0 = primeira coluna); null = sem coluna de nome
  colunaTelefone: number | null;
};

const CABECALHO_NOME = /^(nome|nome completo|cliente|contato|lead|name)$/i;
const CABECALHO_TELEFONE = /^(telefone|telefones|tel|fone|celular|cel|whatsapp|whats|zap|numero|número|phone|mobile)$/i;

const limpar = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const temLetras = (s: string) => /[a-zA-ZÀ-ÿ]{2,}/.test(s);

/**
 * Descobre as colunas de nome e telefone.
 * Com cabeçalho: pelo título, em qualquer posição.
 * Sem cabeçalho: telefone = coluna com mais números válidos; nome = coluna com mais textos.
 */
export function detectarColunas(tabela: unknown[][]) {
  const linhas = tabela.map((l) => l.map(limpar));
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  const primeira = linhas[0] ?? [];

  // 1) Cabeçalho reconhecido pelo título
  const tituloTel = primeira.findIndex((c) => CABECALHO_TELEFONE.test(semAcento(c)));
  if (tituloTel >= 0) {
    const tituloNome = primeira.findIndex((c, i) => i !== tituloTel && CABECALHO_NOME.test(semAcento(c)));
    return { temCabecalho: true, colunaTelefone: tituloTel, colunaNome: tituloNome >= 0 ? tituloNome : null };
  }

  // 2) Sem cabeçalho reconhecível: analisa o conteúdo das primeiras 200 linhas
  const amostra = linhas.slice(0, 200);
  const telefones = Array.from({ length: largura }, (_, c) => amostra.filter((l) => normalizarTelefone(l[c])).length);
  const melhorTel = telefones.indexOf(Math.max(0, ...telefones));
  if (largura === 0 || telefones[melhorTel] === 0) return { temCabecalho: false, colunaTelefone: null, colunaNome: null };

  const textos = Array.from({ length: largura }, (_, c) => (c === melhorTel ? -1 : amostra.filter((l) => temLetras(l[c] ?? "") && !normalizarTelefone(l[c])).length));
  const melhorNome = textos.indexOf(Math.max(...textos));
  const colunaNome = melhorNome >= 0 && textos[melhorNome]! > 0 ? melhorNome : null;

  // A 1ª linha é cabeçalho (com títulos desconhecidos) quando não tem telefone válido na coluna do telefone
  const temCabecalho = !normalizarTelefone(primeira[melhorTel]) && primeira.some((c) => temLetras(c));
  return { temCabecalho, colunaTelefone: melhorTel, colunaNome };
}

/** Converte a tabela (linhas x colunas) em leads válidos + lista de inválidos. */
export function lerTabela(tabela: unknown[][]): ResultadoLeitura {
  const { temCabecalho, colunaNome, colunaTelefone } = detectarColunas(tabela);
  const res: ResultadoLeitura = { linhas: [], invalidos: [], temCabecalho, colunaNome, colunaTelefone };
  if (colunaTelefone == null) {
    tabela.forEach((l, i) => {
      const cel = l.map(limpar).filter(Boolean);
      if (cel.length) res.invalidos.push({ linha: i + 1, nome: cel[0] ?? "", telefone: cel.slice(1).join(" ") });
    });
    return res;
  }
  tabela.forEach((l, i) => {
    if (temCabecalho && i === 0) return;
    const cel = l.map(limpar);
    if (!cel.some(Boolean)) return; // linha vazia
    const nome = colunaNome == null ? "" : (cel[colunaNome] ?? "").slice(0, 80);
    const original = cel[colunaTelefone] ?? "";
    const telefone = normalizarTelefone(original);
    if (telefone) res.linhas.push({ nome, telefone });
    else res.invalidos.push({ linha: i + 1, nome, telefone: original });
  });
  return res;
}

/**
 * Texto colado: um por linha, "Nome; telefone" (também aceita tab ou vírgula).
 * Cada linha é lida sozinha: só o telefone = nome em branco; "telefone; nome" também é entendido.
 */
export function lerTextoColado(texto: string): ResultadoLeitura {
  const res: ResultadoLeitura = { linhas: [], invalidos: [], temCabecalho: false, colunaNome: 0, colunaTelefone: 1 };
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const l = bruta.trim();
    if (!l) return;
    const cel = (l.includes(";") ? l.split(";") : l.includes("\t") ? l.split("\t") : separarVirgula(l)).map((c) => c.trim());
    let nome = "", original = "";
    if (cel.length === 1) original = cel[0]!;
    else if (!normalizarTelefone(cel[1]) && normalizarTelefone(cel[0])) [original, nome] = [cel[0]!, cel[1]!];
    else [nome, original] = [cel[0]!, cel.slice(1).join(" ")];
    const telefone = normalizarTelefone(original);
    if (telefone) res.linhas.push({ nome: nome.slice(0, 80), telefone });
    else res.invalidos.push({ linha: i + 1, nome, telefone: original });
  });
  return res;
}

/** "Maria, 11 98765-4321" → ["Maria", "11 98765-4321"]; telefone com vírgula fica junto. */
function separarVirgula(l: string) {
  const i = l.indexOf(",");
  return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : [l];
}

/** CSV: detecta o separador (; , ou tab) e respeita aspas. */
export function lerCsv(conteudo: string): unknown[][] {
  const texto = conteudo.replace(/^﻿/, ""); // remove BOM do Excel
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, primeira.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
