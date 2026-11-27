// Conhecimento comercial do Fale conosco (decisão #178): o material comercial (arquivo docs/comercial/fale-conosco.md, escrito
// com olhar de marketing e venda consultiva, só com fatos do sistema) e o texto dos planos com preço, promoção e condições
// EXATAMENTE como o Super Admin cadastrou (a IA não pode inventar valor nem desconto).
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PASTA_COMERCIAL = process.env.PASTA_COMERCIAL || fileURLToPath(new URL("../../../docs/comercial/", import.meta.url));
export const MAX_MATERIAL_COMERCIAL = 20_000;
let cache: { mtime: number; texto: string } | null = null;

/** Lê o material comercial (relê só se o arquivo mudou). Sem o arquivo, devolve vazio: a IA segue só com a ficha e o script. */
export async function lerMaterialComercial(): Promise<string> {
  const arq = `${PASTA_COMERCIAL.replace(/\/$/, "")}/fale-conosco.md`;
  try {
    const m = (await stat(arq)).mtimeMs;
    if (cache && cache.mtime === m) return cache.texto;
    const texto = (await readFile(arq, "utf8")).slice(0, MAX_MATERIAL_COMERCIAL);
    cache = { mtime: m, texto };
    return texto;
  } catch {
    return "";
  }
}

/** Parte do plano que o texto precisa (os campos de `Plano` que importam para vender). */
export type PlanoParaTexto = {
  nome: string; modulo: string; usuarios: number | null; gratis: boolean; personalizado: boolean;
  precoAntigo: number | null; precoAtual: number | null; periodo: string; prazoDias: number;
  testeDias: number | null; testeDisparos: number | null; limiteLeads: number | null; leadsAnuncios: boolean;
  maxWhatsapps: number; precoWhatsappExtra: number | null; descontos: number[]; maxPacotes: number;
  disparosPorPeriodo: number | null; pacoteDisparos: number | null; precoPacoteDisparos: number | null;
  selo: string; frase: string; condicoes: string; ofertaTexto: string; recursos: string[];
};

export const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${String(n).replace(".", ",")}%`;
const nome2a5 = ["2º", "3º", "4º", "5º"];

/** Uma linha por plano, com tudo o que o visitante pode perguntar. Só entra o que está cadastrado. */
export function textoDoPlano(p: PlanoParaTexto): string {
  const partes: string[] = [];
  // Preço e promoção (de/por) exatamente como cadastrados
  if (p.gratis) partes.push("gratuito");
  else if (p.personalizado || p.precoAtual == null) partes.push("preço sob consulta");
  else {
    const promo = p.precoAntigo != null && p.precoAntigo > p.precoAtual;
    partes.push(`${promo ? `PROMOÇÃO: de ${reais(p.precoAntigo!)} por ${reais(p.precoAtual)}` : reais(p.precoAtual)} por ${p.prazoDias} dias`);
  }
  if (p.gratis && (p.testeDias || p.testeDisparos)) {
    partes.push(`teste grátis de ${[p.testeDias ? `${p.testeDias} dias` : "", p.testeDisparos ? `${p.testeDisparos} disparos` : ""].filter(Boolean).join(" ou ")}, o que acontecer primeiro; 1 teste por e-mail`);
  }
  if (p.selo.trim()) partes.push(`selo: ${p.selo.trim()}`);
  if (p.ofertaTexto.trim()) partes.push(`oferta: ${p.ofertaTexto.trim()}`);
  if (p.condicoes.trim()) partes.push(`condições: ${p.condicoes.trim()}`);
  if (p.frase.trim()) partes.push(p.frase.trim());
  // Quantidade de envios
  if (p.disparosPorPeriodo != null) {
    partes.push(`${p.disparosPorPeriodo} disparos por período${p.pacoteDisparos && p.precoPacoteDisparos != null ? `; pacote extra de ${p.pacoteDisparos} disparos por ${reais(p.precoPacoteDisparos)}` : ""}`);
  } else if (!p.gratis) partes.push("sem limite de disparos");
  // Usuários (Empresarial) e números de WhatsApp (Individual), com desconto progressivo
  const desc = (p.descontos ?? []).slice(0, 4).map((d, i) => `${nome2a5[i]} ${pct(d)}`).join(", ");
  if (p.modulo === "EMPRESARIAL") {
    if (p.usuarios != null) partes.push(`pacote de ${p.usuarios} usuários${p.maxPacotes > 1 ? `; a empresa pode escolher até ${p.maxPacotes} pacotes, com desconto progressivo (${desc}) sobre cada pacote a mais` : ""}`);
  } else if (p.maxWhatsapps > 1 && p.precoWhatsappExtra != null) {
    partes.push(`até ${p.maxWhatsapps} números de WhatsApp (o principal + extras); cada extra custa ${reais(p.precoWhatsappExtra)} por período, com desconto progressivo: ${desc}`);
  } else if (p.maxWhatsapps <= 1) partes.push("1 número de WhatsApp");
  if (p.limiteLeads != null) partes.push(`até ${p.limiteLeads} leads`);
  if (p.leadsAnuncios) partes.push("inclui leads de anúncios");
  if (p.recursos?.length) partes.push(p.recursos.join("; "));
  return `- ${p.nome}: ${partes.join(" — ")}`;
}

/** Texto dos planos visíveis, separado por módulo. */
export function textoDosPlanos(planos: PlanoParaTexto[]): string {
  const por = (m: string) => planos.filter((p) => p.modulo === m).map(textoDoPlano);
  const ind = por("INDIVIDUAL"), emp = por("EMPRESARIAL");
  return [
    ind.length ? `Módulo Individual (para quem usa sozinho):\n${ind.join("\n")}` : "",
    emp.length ? `Módulo Empresarial (empresa com equipe; o administrador cria os usuários):\n${emp.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
