// Conector "padrão compatível" (decisão #72): provedores que aceitam o formato comum de
// /chat/completions (ex.: OpenAI, Google Gemini, Groq, IA própria no servidor).
import { ErroIA, type ConfigConector, type Conector, type PedidoIA, type RespostaIA } from "../tipos";

export const conectorCompativel: Conector = {
  async chamar(cfg: ConfigConector, p: PedidoIA): Promise<RespostaIA> {
    if (!cfg.urlBase) throw new ErroIA("Informe o endereço do provedor (menu Inteligência Artificial).");
    const url = cfg.urlBase.replace(/\/+$/, "") + "/chat/completions";
    let r: Response;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.chave ? { authorization: `Bearer ${cfg.chave}` } : {}) },
        body: JSON.stringify({
          model: cfg.modelo,
          max_tokens: p.maxTokens,
          messages: [
            { role: "system", content: p.contexto ? `${p.sistema}\n\n${p.contexto}` : p.sistema },
            ...p.mensagens.map((m) => ({
              role: m.papel === "usuario" ? "user" : "assistant",
              content: m.imagens?.length
                ? [...m.imagens.map((i) => ({ type: "image_url", image_url: { url: `data:${i.tipo};base64,${i.base64}` } })), { type: "text", text: m.texto }]
                : m.texto,
            })),
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ErroIA("Não foi possível falar com o provedor de IA.");
    }
    const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string; error?: { message?: string } } | null;
    if (!r.ok) throw new ErroIA(`Erro do provedor (${r.status}): ${j?.error?.message ?? "sem detalhes"}`);
    return {
      texto: (j?.choices?.[0]?.message?.content ?? "").trim(),
      modelo: j?.model ?? cfg.modelo,
      uso: { entrada: j?.usage?.prompt_tokens ?? 0, saida: j?.usage?.completion_tokens ?? 0, cacheLeitura: 0, cacheEscrita: 0 },
    };
  },
};
