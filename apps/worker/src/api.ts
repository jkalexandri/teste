// API HTTP do serviço 24/7. Só o site (Vercel) chama, com o WORKER_TOKEN.
// O estado das sessões (QR, conectado...) fica no banco; as telas leem de lá.
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

/** Maior anexo aceito (vídeo/áudio até 16 MB — decisão #68). */
export const MAX_ARQUIVO = 16 * 1024 * 1024;

/** Empresa | IA (etapa 9b): o que a API precisa do processamento de materiais. */
export type Aprender = { processar(materialId: string): Promise<void>; agendarFicha(fichaId: string, esperaMs?: number): void };

/** Conversas IA (etapa 10): mensagem escrita pelo usuário na tela. */
export type Atender = {
  enviarManual(leadId: string, usuarioId: string, texto: string, arquivoId?: string | null): Promise<{ ok: boolean; mensagem: string }>;
  atenderAnuncio(id: string): Promise<void>;
};

export function criarApi(sessoes: Sessoes, token: string, logger: Logger, pastaArquivos = "./arquivos", aprender?: Aprender, atender?: Atender) {
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger, bodyLimit: 64 * 1024 });
  // Anexos chegam como bytes puros (application/octet-stream)
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_ARQUIVO }, (_req, corpo, feito) => feito(null, corpo));

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

  // ===== Anexos das campanhas (decisão #67): guardados na VPS, um arquivo por id =====
  app.put<{ Params: { id: string }; Body: Buffer }>("/arquivos/:id", async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.code(400).send({ ok: false, mensagem: "Arquivo vazio." });
    await mkdir(pastaArquivos, { recursive: true });
    await writeFile(join(pastaArquivos, req.params.id), req.body);
    return { ok: true, mensagem: "Arquivo guardado." };
  });

  app.get<{ Params: { id: string } }>("/arquivos/:id", async (req, res) => {
    const caminho = join(pastaArquivos, req.params.id);
    const info = await stat(caminho).catch(() => null);
    if (!info) return res.code(404).send({ ok: false, mensagem: "Arquivo não encontrado." });
    res.header("content-length", info.size).type("application/octet-stream");
    return res.send(createReadStream(caminho));
  });

  app.delete<{ Params: { id: string } }>("/arquivos/:id", async (req) => {
    await rm(join(pastaArquivos, req.params.id), { force: true });
    return { ok: true, mensagem: "Arquivo apagado." };
  });

  // ===== Empresa | IA (etapa 9b): leitura de materiais e montagem da ficha, em segundo plano =====
  app.post<{ Params: { id: string } }>("/ia/materiais/:id/processar", async (req, res) => {
    if (!aprender) return res.code(503).send({ ok: false, mensagem: "Aprendizado indisponível." });
    void aprender.processar(req.params.id).catch((e) => logger.error({ e }, "falha ao processar material"));
    return { ok: true, mensagem: "Lendo o material…" };
  });
  app.post<{ Params: { id: string } }>("/ia/fichas/:id/montar", async (req, res) => {
    if (!aprender) return res.code(503).send({ ok: false, mensagem: "Aprendizado indisponível." });
    aprender.agendarFicha(req.params.id, 1_000);
    return { ok: true, mensagem: "Atualizando a ficha…" };
  });

  // ===== Conversas IA (etapa 10): o usuário escreve para o lead =====
  app.post<{ Params: { id: string }; Body: { usuarioId?: string; texto?: string; arquivoId?: string | null } | null }>("/conversas/:id/enviar", async (req, res) => {
    if (!atender) return res.code(503).send({ ok: false, mensagem: "Conversas indisponíveis." });
    const usuarioId = String(req.body?.usuarioId ?? "");
    const texto = String(req.body?.texto ?? "").trim();
    const arquivoId = req.body?.arquivoId ? String(req.body.arquivoId) : null;
    if (!ID_VALIDO.test(usuarioId) || (arquivoId && !ID_VALIDO.test(arquivoId))) return res.code(400).send({ ok: false, mensagem: "Pedido inválido." });
    if (texto.length > 4000) return res.code(400).send({ ok: false, mensagem: "Texto muito longo." });
    const r = await atender.enviarManual(req.params.id, usuarioId, texto, arquivoId);
    return res.code(r.ok ? 200 : 409).send(r);
  });

  // ===== Leads de anúncios (etapa 10b): a IA começa o atendimento =====
  app.post<{ Params: { id: string } }>("/anuncios/:id/atender", async (req, res) => {
    if (!atender) return res.code(503).send({ ok: false, mensagem: "Conversas indisponíveis." });
    void atender.atenderAnuncio(req.params.id).catch((e) => logger.error({ e }, "falha ao atender lead de anúncio"));
    return { ok: true, mensagem: "Atendendo o lead." };
  });

  // ===== Notificações no celular (decisão #99): teste a partir da tela Avisos =====
  // Notificação no celular avulsa (suporte — decisão #102)
  app.post<{ Params: { id: string }; Body: { texto?: string; url?: string } | null }>("/push/:id/enviar", async (req) => {
    const { enviarPush } = await import("./push.js");
    const url = String(req.body?.url ?? "/dashboard");
    const n = await enviarPush(req.params.id, String(req.body?.texto ?? "").slice(0, 300), url.startsWith("/") ? url : "/dashboard");
    return { ok: true, mensagem: `${n} aparelho(s)` };
  });
  app.post<{ Params: { id: string } }>("/push/:id/teste", async (req) => {
    const { enviarPush } = await import("./push.js");
    const n = await enviarPush(req.params.id, "✅ Notificação de teste: os avisos do FilaPro Leads chegam neste aparelho.", "/avisos");
    return { ok: n > 0, mensagem: n > 0 ? `Notificação enviada para ${n} aparelho${n > 1 ? "s" : ""}.` : "Nenhum aparelho com notificações ativas." };
  });

  return app;
}
