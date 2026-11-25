// Tipos da camada de IA (decisões #72 e #75).

export const TAREFAS = {
  gerar_mensagens: "Gerar mensagens (principal + variações)",
  aprender: "Aprender sobre a empresa (ler materiais e montar a ficha)",
  qualificar: "Qualificar leads",
  conversar: "Conversar e tratar objeções",
} as const;
export type Tarefa = keyof typeof TAREFAS;

export type Provedor = "anthropic" | "compativel" | "simulado";

/** O que a aplicação pede à IA. `sistema` e `contexto` se repetem entre chamadas e vão para o cache. */
export type PedidoIA = {
  sistema: string;
  /** Conhecimento fixo (ficha da empresa): vai em cache para custar ~10% nas próximas chamadas. */
  contexto?: string;
  mensagens: { papel: "usuario" | "assistente"; texto: string; imagens?: { tipo: string; base64: string }[] }[];
  /** Limite de tamanho da resposta (custo — decisão #75). */
  maxTokens: number;
  /** Saída estruturada (decisão #127): a resposta vem sempre como JSON válido neste esquema (Anthropic; os outros ignoram). */
  esquemaJson?: Record<string, unknown>;
};

export type UsoTokens = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number };
export type RespostaIA = { texto: string; uso: UsoTokens; modelo: string };

export type ConfigConector = { provedor: Provedor; modelo: string; urlBase: string; chave: string | null };

export interface Conector {
  chamar(cfg: ConfigConector, pedido: PedidoIA): Promise<RespostaIA>;
}

/** Erro da IA. "tentarDeNovo" = vale tentar de novo (tempo esgotado, limite de uso, servidor, resposta cortada ou inválida);
 *  "bruto" = começo do texto que a IA devolveu, para o log (decisão #127). */
export class ErroIA extends Error {
  constructor(mensagem: string, public tentarDeNovo = false, public bruto?: string) { super(mensagem); }
}
