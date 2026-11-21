// API HTTP do serviço 24/7. Só o site (Vercel) chama, com o WORKER_TOKEN.
// O estado das sessões (QR, conectado...) fica no banco; as telas leem de lá.
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyBaseLogger } from "fastify";
import type { Logger } from "pino";

/** O que a API precisa do gerenciador (permite testar com um falso). */
export type Sessoes = {
  conectar(id: string, usuarioId?: string): Promise<void>;
  desconectar(id: string): Promise<void>;
  enviarTexto(id: string, para: string, texto: string): Promise<{ ok: boolean; mensagem: string }>;
};

/** Id aceito: id do usuário (cuid) ou "plataforma". */
const ID_VALIDO = /^[a-zA-Z0-9_-]{1,64}$/;

function tokenConfere(recebido: string | undefined, esperado: string) {
  const a = Buffer.from(recebido ?? "");
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function criarApi(sessoes: Sessoes, token: string, logger: Logger) {
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger, bodyLimit: 64 * 1024 });

  // Verificação de saúde (sem token) — usada para saber se o serviço está no ar.
  app.get("/saude", async () => ({ ok: true }));

  // Todas as outras rotas exigem o token
  app.addHook("onRequest", async (req, res) => {
    if (req.url === "/saude") return;
    if (!tokenConfere(req.headers.authorization, token)) return res.code(401).send({ ok: false, mensagem: "Não autorizado." });
  });

  app.addHook("preHandler", async (req, res) => {
    const id = (req.params as { id?: string } | undefined)?.id;
    if (id !== undefined && !ID_VALIDO.test(id)) return res.code(400).send({ ok: false, mensagem: "Sessão inválida." });
  });

  app.post<{ Params: { id: string }; Body: { usuarioId?: string } | null }>("/sessoes/:id/conectar", async (req) => {
    await sessoes.conectar(req.params.id, req.body?.usuarioId);
    return { ok: true, mensagem: "Conectando…" };
  });

  app.post<{ Params: { id: string } }>("/sessoes/:id/desconectar", async (req) => {
    await sessoes.desconectar(req.params.id);
    return { ok: true, mensagem: "WhatsApp desconectado." };
  });

  app.post<{ Params: { id: string }; Body: { para?: string; texto?: string } | null }>("/sessoes/:id/enviar", async (req, res) => {
    const para = String(req.body?.para ?? "");
    const texto = String(req.body?.texto ?? "").trim();
    if (!para || !texto) return res.code(400).send({ ok: false, mensagem: "Informe o número e o texto." });
    if (texto.length > 4000) return res.code(400).send({ ok: false, mensagem: "Texto muito longo." });
    const r = await sessoes.enviarTexto(req.params.id, para, texto);
    return res.code(r.ok ? 200 : 409).send(r);
  });

  return app;
}
