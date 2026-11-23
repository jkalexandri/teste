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

// ===== Abas do popup Planos (decisão #111) =====
export type AbaPlanos = "ilimitado" | "quantidade";
export const ABAS_PLANOS: { id: AbaPlanos; titulo: string; frase: string; icone: string }[] = [
  { id: "ilimitado", titulo: "Sem limite de disparos", frase: "Envie quanto quiser no período", icone: "🚀" },
  { id: "quantidade", titulo: "Por quantidade de disparos", frase: "Pague pelo volume que usar", icone: "📦" },
];
/** Free e Personalizado aparecem nas duas abas; com "disparos por período" → Por quantidade; sem → Sem limite. */
export function abasDoPlano(p: Pick<PlanoPublico, "gratis" | "personalizado" | "disparosPorPeriodo">): AbaPlanos[] {
  if (p.gratis || p.personalizado) return ["ilimitado", "quantidade"];
  return p.disparosPorPeriodo ? ["quantidade"] : ["ilimitado"];
}
/** Plano pago precisa de preço maior que zero para aparecer e ser vendido (decisão #111). */
export const semPrecoDeVenda = (p: { gratis: boolean; personalizado: boolean; precoAtual: number | null }) => !p.gratis && !p.personalizado && (p.precoAtual == null || p.precoAtual <= 0);

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
