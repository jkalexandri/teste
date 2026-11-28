// Tipos e formatação dos planos (usado no navegador e no servidor).
export type PlanoPublico = {
  id: string;
  slug: string;
  nome: string;
  modulo: "INDIVIDUAL" | "EMPRESARIAL";
  /** Aba do popup Planos (decisão #183) */
  categoria: CategoriaPlano;
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
  /** Redes Sociais (decisão #185): recebe e qualifica os leads das redes; falso em permiteDisparos = plano não dispara campanhas */
  redesSociais?: boolean;
  permiteDisparos?: boolean;
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

// ===== Categorias do popup Planos (decisão #183) =====
// 4 abas: Individual (Free + Individual, mensais e por disparo juntos), Business (antigo Empresarial, tudo junto),
// Redes Sociais e Redes Sociais + Disparos (só mensais, para Individual e Business).
export type CategoriaPlano = "INDIVIDUAL" | "BUSINESS" | "REDES" | "REDES_DISPAROS";
export const CATEGORIAS_PLANOS: { id: CategoriaPlano; titulo: string; frase: string; icone: string }[] = [
  { id: "INDIVIDUAL", titulo: "Individual", frase: "Para quem vende sozinho", icone: "👤" },
  { id: "BUSINESS", titulo: "Business", frase: "Para equipes de vendas", icone: "🏢" },
  { id: "REDES", titulo: "Redes Sociais", frase: "Receba e qualifique os leads das redes", icone: "📲" },
  { id: "REDES_DISPAROS", titulo: "Redes Sociais + Disparos", frase: "Leads das redes e disparos juntos", icone: "🚀" },
];
export const nomeCategoria = (c: CategoriaPlano) => CATEGORIAS_PLANOS.find((x) => x.id === c)?.titulo ?? c;
/** Nome do módulo para o cliente: "Empresarial" passou a se chamar "Business" (decisão #183); o valor interno EMPRESARIAL não muda. */
export const nomeModulo = (m: "INDIVIDUAL" | "EMPRESARIAL") => (m === "EMPRESARIAL" ? "Business" : "Individual");
/** Categorias permitidas para cada módulo: conta Individual → Individual, Redes, Redes + Disparos; conta Business → Business, Redes, Redes + Disparos. */
export const categoriasDoModulo = (m: "INDIVIDUAL" | "EMPRESARIAL"): CategoriaPlano[] => [m === "EMPRESARIAL" ? "BUSINESS" : "INDIVIDUAL", "REDES", "REDES_DISPAROS"];

// ===== Tipos de cobrança (decisões #111 e #113) — hoje usados só na gestão de usuários; no popup os dois tipos aparecem juntos =====
export type AbaPlanos = "ilimitado" | "quantidade";
export type ModuloPlano = "INDIVIDUAL" | "EMPRESARIAL";
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

// ===== Formas de pagamento pelo Asaas (decisão #115) =====
export type FormaPagamento = "PIX_MANUAL" | "PIX" | "BOLETO" | "CARTAO";
export const NOME_FORMA: Record<FormaPagamento, string> = { PIX_MANUAL: "PIX", PIX: "PIX", BOLETO: "Boleto", CARTAO: "Cartão de crédito" };
/** Boleto tem acréscimo de 2% no valor (item f). */
export const ACRESCIMO_BOLETO = 2;
/** Parcelamento no cartão: até 6x, só em planos trimestrais e anuais (item d). */
export const MAX_PARCELAS = 6;
export const valorBoleto = (valor: number) => Math.round((valor * (100 + ACRESCIMO_BOLETO)) / 100);
/** Plano de 3 meses ou mais (trimestral, anual) pode parcelar. */
export const podeParcelar = (p: { prazoDias: number }) => p.prazoDias >= 89;

// ===== Cobrança automática no cartão (decisão #124) =====
export type CicloAsaas = "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
/** Período fixo que o Asaas repete (item c): mensal, trimestral, semestral ou anual, pela faixa de dias do plano. Outro prazo: null. */
export function cicloAutomatico(prazoDias: number): CicloAsaas | null {
  if (prazoDias >= 28 && prazoDias <= 31) return "MONTHLY";
  if (prazoDias >= 89 && prazoDias <= 93) return "QUARTERLY";
  if (prazoDias >= 180 && prazoDias <= 186) return "SEMIANNUALLY";
  if (prazoDias >= 360 && prazoDias <= 366) return "YEARLY";
  return null;
}
export const NOME_CICLO: Record<CicloAsaas, string> = { MONTHLY: "mês", QUARTERLY: "trimestre", SEMIANNUALLY: "semestre", YEARLY: "ano" };

/**
 * Parcelas com juros para o cliente (itens d e j): tabela Price com a taxa ao mês do Super Admin.
 * Devolve o valor de cada parcela e o total, em centavos. Taxa 0 = parcelas sem juros.
 */
export function parcelamento(valor: number, parcelas: number, jurosMes: number) {
  const n = Math.max(1, Math.floor(parcelas));
  const i = Math.max(0, jurosMes) / 100;
  if (n === 1) return { parcela: valor, total: valor };
  const parcela = i === 0 ? Math.ceil(valor / n) : Math.ceil((valor * i) / (1 - Math.pow(1 + i, -n)));
  return { parcela, total: parcela * n };
}

/** Valor final do pedido conforme a forma de pagamento escolhida. */
export function valorDaForma(valor: number, forma: FormaPagamento, parcelas = 1, jurosMes: number | null = null) {
  if (forma === "BOLETO") return valorBoleto(valor);
  if (forma === "CARTAO" && parcelas > 1 && jurosMes != null) return parcelamento(valor, parcelas, jurosMes).total;
  return valor;
}
