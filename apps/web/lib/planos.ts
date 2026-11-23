// Tipos e formatação dos planos (usado no navegador e no servidor).
export type PlanoPublico = {
  id: string;
  slug: string;
  nome: string;
  modulo: "INDIVIDUAL" | "EMPRESARIAL";
  usuarios: number | null;
  gratis: boolean;
  personalizado: boolean;
  precoAntigo: number | null; // centavos
  precoAtual: number | null; // centavos
  periodo: string;
  prazoDias: number;
  testeDias: number | null;
  testeDisparos: number | null;
  /** Limite de leads (decisão #58). Vazio = ilimitado. */
  limiteLeads: number | null;
  /** Limites de treinamento da IA (decisão #77). Vazio = ilimitado. */
  limiteMateriais?: number | null;
  limitePaginasMes?: number | null;
  /** Leads de anúncios incluídos (decisão #90) */
  leadsAnuncios?: boolean;
  /** WhatsApp extra (Individual — decisões #79 e #80): máximo de números e preço de cada extra (centavos) */
  maxWhatsapps?: number;
  precoWhatsappExtra?: number | null;
  /** Preço por quantidade (decisão #113): desconto (%) do 2º, 3º, 4º e 5º item */
  descontos?: number[];
  /** Empresarial: quantos pacotes de usuários a empresa pode escolher */
  maxPacotes?: number;
  /** Plano por quantidade de envio (decisão #102) */
  disparosPorPeriodo?: number | null;
  pacoteDisparos?: number | null;
  precoPacoteDisparos?: number | null;
  selo: string;
  frase: string;
  condicoes: string;
  ofertaTexto: string;
  recursos: string[];
  textoBotao: string;
  visivel: boolean;
  destaque: boolean;
  ordem: number;
};

// ===== Abas do popup Planos (decisões #111 e #113) =====
// 1º nível: Individual | Empresarial. 2º nível: Mensal (sem limite de disparos) | Por disparo (por quantidade).
export type AbaPlanos = "ilimitado" | "quantidade";
export type ModuloPlano = "INDIVIDUAL" | "EMPRESARIAL";
export const MODULOS_PLANOS: { id: ModuloPlano; titulo: string; frase: string; icone: string }[] = [
  { id: "INDIVIDUAL", titulo: "Individual", frase: "Para quem vende sozinho", icone: "👤" },
  { id: "EMPRESARIAL", titulo: "Empresarial", frase: "Para equipes de vendas", icone: "🏢" },
];
export const ABAS_PLANOS: { id: AbaPlanos; titulo: string; frase: string; icone: string }[] = [
  { id: "ilimitado", titulo: "Mensal", frase: "Sem limite de disparos no período", icone: "🚀" },
  { id: "quantidade", titulo: "Por disparo", frase: "Pague pelo volume que usar", icone: "📦" },
];
/** Aba do plano: com "disparos por período" → Por disparo; sem → Mensal.
 *  Free (decisão #113, item C): teste por dias (sem limite de disparos) → Mensal; teste por disparos → Por disparo. */
export function abasDoPlano(p: Pick<PlanoPublico, "gratis" | "personalizado" | "disparosPorPeriodo"> & { testeDisparos?: number | null }): AbaPlanos[] {
  if (p.gratis) return p.testeDisparos ? ["quantidade"] : ["ilimitado"];
  if (p.personalizado) return ["ilimitado"];
  return p.disparosPorPeriodo ? ["quantidade"] : ["ilimitado"];
}
/** Plano pago precisa de preço maior que zero para aparecer e ser vendido (decisão #111). */
export const semPrecoDeVenda = (p: { gratis: boolean; personalizado: boolean; precoAtual: number | null }) => !p.gratis && !p.personalizado && (p.precoAtual == null || p.precoAtual <= 0);

// ===== Preço por quantidade (decisão #113) =====
// Individual: números de WhatsApp (até 4). Empresarial: pacotes de usuários (Padrão 10→50 etc.).
export const MAX_NUMEROS_INDIVIDUAL = 4;
export const DESCONTOS_PADRAO = [10, 15, 20, 25];

/** Quantas unidades o cliente pode escolher no cartão (1 = sem seletor). */
export function maxQuantidade(p: Pick<PlanoPublico, "gratis" | "modulo" | "maxWhatsapps" | "maxPacotes">) {
  if (p.gratis) return 1;
  return p.modulo === "INDIVIDUAL" ? Math.min(MAX_NUMEROS_INDIVIDUAL, Math.max(1, p.maxWhatsapps ?? 1)) : Math.max(1, Math.min(10, p.maxPacotes ?? 1));
}

/** Desconto (%) da posição (2 = segundo item). Depois do último informado, vale o último. */
export function descontoDaPosicao(descontos: number[] | undefined, posicao: number) {
  const d = descontos && descontos.length ? descontos : DESCONTOS_PADRAO;
  return posicao < 2 ? 0 : d[Math.min(posicao - 2, d.length - 1)] ?? 0;
}

/** Preço do item na posição (1 = o próprio plano), em centavos. */
export const precoDaPosicao = (preco: number, descontos: number[] | undefined, posicao: number) =>
  Math.round((preco * (100 - descontoDaPosicao(descontos, posicao))) / 100);

/** Preço total para "quantidade" itens: plano + cada item a mais com o desconto da posição (ex.: 100 + 90 + 85). */
export function precoComQuantidade(preco: number, descontos: number[] | undefined, quantidade: number) {
  let total = 0;
  for (let i = 1; i <= Math.max(1, quantidade); i++) total += precoDaPosicao(preco, descontos, i);
  return total;
}

/** Texto da quantidade escolhida: "2 números de WhatsApp" / "30 usuários". */
export function rotuloQuantidade(p: Pick<PlanoPublico, "modulo" | "usuarios">, quantidade: number) {
  if (p.modulo === "INDIVIDUAL") return `${quantidade} ${quantidade === 1 ? "número" : "números"} de WhatsApp`;
  const u = (p.usuarios ?? 1) * quantidade;
  return `${u} ${u === 1 ? "usuário" : "usuários"}`;
}

/** 2999 -> "R$ 29,99" */
export function formatarReais(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "29,99" | "29.99" | "R$ 1.299,90" -> 2999 (ou null se vazio/ inválido) */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const v = Number(normal);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

/** Link de contato: se for telefone, vira link do WhatsApp; se for URL, usa direto. */
export function linkContato(contato: string): string | null {
  const c = contato.trim();
  if (!c) return null;
  if (/^https?:\/\//i.test(c)) return c;
  const digitos = c.replace(/\D/g, "");
  if (digitos.length >= 10) return `https://wa.me/${digitos.length <= 11 ? "55" + digitos : digitos}`;
  return null;
}
