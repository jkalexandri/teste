// Empresa | IA no serviço 24/7 (etapa 9b — decisões #74, #75 e #77): lê sites, PDFs e imagens,
// resume cada material com a IA e monta a ficha compacta da empresa. Roda na VPS porque é pesado.
import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import type { Logger } from "pino";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma, StatusMaterial, TipoMaterial } from "@filapro/db";
import { montarFicha, resumirMaterial } from "@filapro/ia/src/index.ts";

export const MAX_PAGINAS_SITE = 20;
export const MAX_PAGINAS_PDF = 100;
const MAX_BYTES_PAGINA = 2 * 1024 * 1024;
const MAX_TEXTO = 200_000;

// ---------------- Segurança: só endereços públicos (evita acessar a rede interna da VPS) ----------------
function ipPrivado(ip: string): boolean {
  // IPv4 escrito como IPv6 (::ffff:10.0.0.1): confere a parte IPv4
  const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapeado) return ipPrivado(mapeado[1]!);
  if (ip.includes(":")) return ip === "::1" || ip === "::" || /^f[cd]/i.test(ip) || /^fe[89ab]/i.test(ip) || /^::ffff:/i.test(ip);
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
export async function urlPermitida(bruto: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(bruto); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((x) => x.address);
  if (!ips.length || ips.some(ipPrivado)) return null;
  return u;
}

// ---------------- Leitura de páginas ----------------
const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
export function textoDoHtml(html: string) {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const corpo = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTIDADES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1)) || 32) : m))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return (titulo ? `# ${titulo}\n` : "") + corpo;
}
export function linksDoHtml(html: string, base: URL) {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1]!, base);
      if (u.hostname === base.hostname && /^https?:$/.test(u.protocol) && !/\.(pdf|jpe?g|png|gif|zip|mp4|mp3|webp|svg|css|js)$/i.test(u.pathname)) {
        u.hash = "";
        out.push(u.toString());
      }
    } catch { /* link inválido */ }
  }
  return out;
}

async function baixarHtml(u: URL) {
  // Segue redirecionamentos manualmente, conferindo cada destino
  let atual = u;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(atual, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "FilaProLeads/1.0 (+https://filaproleads.com.br)", accept: "text/html" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      const prox = await urlPermitida(new URL(r.headers.get("location")!, atual).toString());
      if (!prox) return null;
      atual = prox;
      continue;
    }
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("text/html")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return { html: buf.subarray(0, MAX_BYTES_PAGINA).toString("utf8"), url: atual };
  }
  return null;
}

/** A página do link e as páginas do mesmo site ligadas a ela, até 20 (decisão #74). */
export async function lerSite(endereco: string, baixar = baixarHtml) {
  const inicio = await urlPermitida(endereco);
  if (!inicio) throw new Error("Endereço inválido ou não permitido.");
  const fila = [inicio.toString()], vistos = new Set<string>(), partes: string[] = [];
  while (fila.length && vistos.size < MAX_PAGINAS_SITE) {
    const atual = fila.shift()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    const u = await urlPermitida(atual);
    if (!u) continue;
    const r = await baixar(u).catch(() => null);
    if (!r) continue;
    partes.push(`[${r.url}]\n${textoDoHtml(r.html)}`);
    for (const l of linksDoHtml(r.html, r.url)) if (!vistos.has(l) && !fila.includes(l)) fila.push(l);
  }
  if (!partes.length) throw new Error("Não foi possível ler este endereço.");
  return { texto: partes.join("\n\n").slice(0, MAX_TEXTO), paginas: partes.length };
}

/** Texto do PDF (até 100 páginas — decisão #74). */
export async function lerPdf(dados: Uint8Array) {
  const pdf = await getDocumentProxy(dados);
  if (pdf.numPages > MAX_PAGINAS_PDF) throw new Error(`O PDF tem ${pdf.numPages} páginas (máximo ${MAX_PAGINAS_PDF}).`);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  if (!text.trim()) throw new Error("Este PDF não tem texto (parece ser imagem escaneada). Envie as páginas como imagem ou cole o texto.");
  return { texto: text.slice(0, MAX_TEXTO), paginas: totalPages };
}

const mesAtual = () => new Date().toISOString().slice(0, 7);

// ---------------- Processamento ----------------
export class Aprendizado {
  private montagens = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private log: Logger, private pastaArquivos: string, private leitorSite: typeof lerSite = lerSite) {}

  private async quem(fichaId: string) {
    const f = await prisma.fichaEmpresa.findUniqueOrThrow({ where: { id: fichaId } });
    return { ficha: f, quem: { empresaId: f.empresaId, usuarioId: f.superAdminId } };
  }

  /** Lê e resume um material; depois agenda a montagem da ficha. */
  async processar(materialId: string) {
    const m = await prisma.materialIA.findUnique({ where: { id: materialId }, include: { ficha: { include: { empresa: true } } } });
    if (!m) return;
    const { quem } = await this.quem(m.fichaId);
    try {
      let texto = m.conteudo, paginas = Math.max(1, Math.ceil(m.conteudo.length / 3000)), resumo = "";
      if (m.tipo === TipoMaterial.LINK) ({ texto, paginas } = await this.leitorSite(m.origem));
      if (m.tipo === TipoMaterial.PDF) ({ texto, paginas } = await lerPdf(new Uint8Array(await readFile(join(this.pastaArquivos, `mat-${m.id}`)))));
      if (m.tipo === TipoMaterial.IMAGEM) {
        paginas = 1;
        const buf = await readFile(join(this.pastaArquivos, `mat-${m.id}`));
        texto = "";
        resumo = await resumirMaterial({ imagem: { tipo: /\.png$/i.test(m.origem) ? "image/png" : "image/jpeg", base64: buf.toString("base64") } }, quem);
      }
      // Limite de páginas do mês (decisão #77): confere com o número real de páginas lidas
      const limite = m.ficha.empresa?.limitePaginasMes ?? null;
      const usadas = m.ficha.mesRef === mesAtual() ? m.ficha.paginasMes : 0;
      if (limite != null && usadas + paginas > limite) throw new Error(`Limite de ${limite} páginas por mês atingido (${usadas} usadas; este material tem ${paginas}).`);
      if (!resumo) resumo = await resumirMaterial({ texto }, quem);
      await prisma.$transaction([
        prisma.materialIA.update({ where: { id: m.id }, data: { status: StatusMaterial.PRONTO, conteudo: texto, resumo, paginas, erro: null, lidoEm: new Date() } }),
        prisma.fichaEmpresa.update({ where: { id: m.fichaId }, data: { mesRef: mesAtual(), paginasMes: usadas + paginas } }),
      ]);
      this.agendarFicha(m.fichaId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao ler o material.";
      this.log.warn({ materialId, msg }, "material não lido");
      await prisma.materialIA.update({ where: { id: m.id }, data: { status: StatusMaterial.ERRO, erro: msg.slice(0, 300) } });
    }
  }

  /** Junta pedidos seguidos numa montagem só (economia — decisão #75). */
  agendarFicha(fichaId: string, esperaMs = 3_000) {
    clearTimeout(this.montagens.get(fichaId));
    this.montagens.set(fichaId, setTimeout(() => void this.montar(fichaId).catch((e) => this.log.error({ e, fichaId }, "falha ao montar ficha")), esperaMs));
  }

  async montar(fichaId: string) {
    this.montagens.delete(fichaId);
    const { ficha, quem } = await this.quem(fichaId);
    const materiais = await prisma.materialIA.findMany({ where: { fichaId, status: StatusMaterial.PRONTO }, orderBy: { criadoEm: "asc" } });
    await prisma.fichaEmpresa.update({ where: { id: fichaId }, data: { montando: true } });
    try {
      const temAlgo = materiais.length || [ficha.nome, ficha.endereco, ficha.telefone, ficha.whatsapp, ficha.atividade].some((x) => x.trim());
      const resumo = temAlgo ? await montarFicha(ficha, materiais.map((x) => x.resumo), quem) : "";
      await prisma.fichaEmpresa.update({ where: { id: fichaId }, data: { resumo, resumoEm: new Date(), montando: false } });
    } catch (e) {
      await prisma.fichaEmpresa.update({ where: { id: fichaId }, data: { montando: false } });
      throw e;
    }
  }
}
