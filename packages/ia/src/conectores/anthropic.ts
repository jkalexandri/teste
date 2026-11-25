// Conector Claude (Anthropic), pela biblioteca oficial.
// Economia (decisão #75): instruções + ficha da empresa em cache, esforço "low" e resposta curta.
import Anthropic from "@anthropic-ai/sdk";
import { ErroIA, type ConfigConector, type Conector, type PedidoIA, type RespostaIA } from "../tipos";

/** Modelos que aceitam o "plano B" automático do servidor quando recusam um pedido. */
const COM_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5-2"]);

export const conectorAnthropic: Conector = {
  async chamar(cfg: ConfigConector, p: PedidoIA): Promise<RespostaIA> {
    if (!cfg.chave) throw new ErroIA("Chave da Anthropic não configurada (menu Inteligência Artificial).");
    // Tempo de espera de 20 s e 1 nova tentativa aqui; as outras ficam com quem chamou (decisão #127: antes 60 s × 3 = até 3 min)
    const client = new Anthropic({ apiKey: cfg.chave, ...(cfg.urlBase ? { baseURL: cfg.urlBase } : {}), maxRetries: 1, timeout: 20_000 });
    // Bloco fixo (instruções + ficha) com cache: nas próximas chamadas custa ~10%
    const system: Anthropic.TextBlockParam[] = [{ type: "text", text: p.sistema }];
    if (p.contexto) system.push({ type: "text", text: p.contexto });
    system[system.length - 1]!.cache_control = { type: "ephemeral" };
    const messages: Anthropic.MessageParam[] = p.mensagens.map((m) => ({
      role: m.papel === "usuario" ? "user" : "assistant",
      content: m.imagens?.length
        ? [
            ...m.imagens.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.tipo as "image/png" | "image/jpeg", data: i.base64 } })),
            { type: "text" as const, text: m.texto },
          ]
        : m.texto,
    }));
    // Saída estruturada (decisão #127): com esquema, a API garante JSON válido
    const output_config = p.esquemaJson
      ? { effort: "low" as const, format: { type: "json_schema" as const, schema: p.esquemaJson } }
      : { effort: "low" as const };
    const base = { model: cfg.modelo, max_tokens: p.maxTokens, system, messages, output_config };
    try {
      const r = COM_FALLBACK.has(cfg.modelo)
        ? await client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(base);
      if (r.stop_reason === "refusal") throw new ErroIA("A IA recusou este pedido. Revise o texto e tente de novo.");
      const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      // Resposta cortada no limite de tamanho (decisão #127): antes virava "formato inesperado" sem explicação
      if (r.stop_reason === "max_tokens") throw new ErroIA("A resposta da IA foi cortada no limite de tamanho.", true, texto.slice(0, 300));
      const u = r.usage;
      return {
        texto,
        modelo: r.model,
        uso: { entrada: u.input_tokens, saida: u.output_tokens, cacheLeitura: u.cache_read_input_tokens ?? 0, cacheEscrita: u.cache_creation_input_tokens ?? 0 },
      };
    } catch (e) {
      if (e instanceof ErroIA) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new ErroIA("Chave da Anthropic inválida.");
      if (e instanceof Anthropic.PermissionDeniedError) throw new ErroIA("A chave não tem permissão (confira os créditos da conta Anthropic).");
      if (e instanceof Anthropic.NotFoundError) throw new ErroIA(`Modelo "${cfg.modelo}" não encontrado.`);
      if (e instanceof Anthropic.RateLimitError) throw new ErroIA("Limite de uso da Anthropic atingido. Tente de novo em instantes.", true);
      if (e instanceof Anthropic.BadRequestError) throw new ErroIA(`Pedido recusado pela Anthropic: ${e.message}`);
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErroIA("A Anthropic demorou para responder (tempo esgotado).", true);
      if (e instanceof Anthropic.APIError) throw new ErroIA(`Erro da Anthropic (${e.status ?? "sem código"}). Tente de novo.`, (e.status ?? 500) >= 500 || e.status === 408 || e.status === 409);
      throw new ErroIA("Não foi possível falar com a Anthropic.", true);
    }
  },
};
