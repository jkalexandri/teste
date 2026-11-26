// Chamadas do site para o serviço 24/7 do WhatsApp (VPS — api.filaproleads.com.br).
// O token fica só no servidor (nunca vai para o navegador).
import "server-only";

export type RespostaWorker = { ok: boolean; mensagem: string };

const FORA_DO_AR = "O serviço do WhatsApp está fora do ar no momento. Tente de novo em alguns minutos.";

/** true quando o endereço e o token do serviço estão configurados. */
export function workerConfigurado() {
  return !!process.env.WORKER_URL && !!process.env.WORKER_TOKEN;
}

export async function chamarWorker(caminho: string, corpo?: unknown): Promise<RespostaWorker> {
  if (!workerConfigurado()) return { ok: false, mensagem: FORA_DO_AR };
  try {
    const r = await fetch(new URL(caminho, process.env.WORKER_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => null)) as Partial<RespostaWorker> | null;
    return { ok: r.ok && !!j?.ok, mensagem: j?.mensagem || (r.ok ? "OK" : FORA_DO_AR) };
  } catch {
    return { ok: false, mensagem: FORA_DO_AR };
  }
}

/** Chamada ao serviço que devolve o JSON inteiro da resposta (teste da IA do suporte — decisão #148). */
export async function chamarWorkerJson<T extends { ok: boolean }>(caminho: string, corpo: unknown, tempoMs = 30_000): Promise<T | { ok: false; mensagem: string }> {
  if (!workerConfigurado()) return { ok: false, mensagem: FORA_DO_AR };
  try {
    const r = await fetch(new URL(caminho, process.env.WORKER_URL), {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(tempoMs),
    });
    const j = (await r.json().catch(() => null)) as T | null;
    return j && typeof j.ok === "boolean" ? j : { ok: false, mensagem: FORA_DO_AR };
  } catch {
    return { ok: false, mensagem: FORA_DO_AR };
  }
}

/** Serviço respondendo? (rota /saude, sem token) */
export async function workerNoAr(): Promise<boolean> {
  if (!workerConfigurado()) return false;
  try {
    const r = await fetch(new URL("/saude", process.env.WORKER_URL), { cache: "no-store", signal: AbortSignal.timeout(4_000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ===== Anexos (decisão #67): os arquivos ficam na VPS =====

/** Envia os bytes do arquivo para a VPS. */
export async function guardarArquivoNoWorker(id: string, dados: ArrayBuffer): Promise<RespostaWorker> {
  if (!workerConfigurado()) return { ok: false, mensagem: FORA_DO_AR };
  try {
    const r = await fetch(new URL(`/arquivos/${encodeURIComponent(id)}`, process.env.WORKER_URL), {
      method: "PUT",
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}`, "content-type": "application/octet-stream" },
      body: dados,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    return { ok: r.ok, mensagem: r.ok ? "Arquivo guardado." : "Não foi possível guardar o arquivo." };
  } catch {
    return { ok: false, mensagem: FORA_DO_AR };
  }
}

/** Busca o arquivo na VPS (para a prévia). */
export async function lerArquivoDoWorker(id: string): Promise<Response | null> {
  if (!workerConfigurado()) return null;
  try {
    const r = await fetch(new URL(`/arquivos/${encodeURIComponent(id)}`, process.env.WORKER_URL), {
      headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

export async function apagarArquivoDoWorker(id: string) {
  if (!workerConfigurado()) return;
  await fetch(new URL(`/arquivos/${encodeURIComponent(id)}`, process.env.WORKER_URL), {
    method: "DELETE",
    headers: { authorization: `Bearer ${process.env.WORKER_TOKEN}` },
    cache: "no-store",
  }).catch(() => undefined);
}
