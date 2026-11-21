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
