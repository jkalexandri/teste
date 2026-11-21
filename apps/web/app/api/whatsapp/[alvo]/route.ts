// GET  /api/whatsapp/proprio|plataforma — estado atual (QR, conectado...). A tela consulta a cada 3 s.
// POST /api/whatsapp/proprio|plataforma — { acao: "conectar" | "desconectar" }
import { NextResponse } from "next/server";
import { chamarWorker } from "@/lib/worker";
import { lerEstado, sessaoDoAlvo, type AlvoWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function alvoValido(a: string): a is AlvoWhatsapp {
  return a === "proprio" || a === "plataforma";
}

export async function GET(_req: Request, { params }: { params: Promise<{ alvo: string }> }) {
  const { alvo } = await params;
  const s = alvoValido(alvo) ? await sessaoDoAlvo(alvo) : null;
  if (!s) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  return NextResponse.json(await lerEstado(s.sessaoId));
}

export async function POST(req: Request, { params }: { params: Promise<{ alvo: string }> }) {
  const { alvo } = await params;
  const s = alvoValido(alvo) ? await sessaoDoAlvo(alvo) : null;
  if (!s) return NextResponse.json({ ok: false, mensagem: "Acesso negado." }, { status: 403 });
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: string };
  if (acao !== "conectar" && acao !== "desconectar") return NextResponse.json({ ok: false, mensagem: "Ação inválida." }, { status: 400 });
  const r = await chamarWorker(`/sessoes/${encodeURIComponent(s.sessaoId)}/${acao}`, acao === "conectar" ? { usuarioId: s.usuarioId } : undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : 503 });
}
