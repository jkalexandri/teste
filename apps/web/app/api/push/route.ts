// Notificações no celular (app — decisão #99).
// GET: chave pública para o aparelho se inscrever. POST: guarda a inscrição. DELETE: remove a inscrição deste aparelho.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";

export const dynamic = "force-dynamic";

export async function GET() {
  const chave = process.env.VAPID_PUBLIC_KEY || "";
  return NextResponse.json({ chave, ativo: !!chave });
}

export async function POST(req: Request) {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) return NextResponse.json({ ok: false, mensagem: "Acesso negado." }, { status: 403 }); // conta barrada não cadastra aparelho (decisão #158)
  const c = (await req.json().catch(() => ({}))) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = String(c.endpoint ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !c.keys?.p256dh || !c.keys?.auth) {
    return NextResponse.json({ ok: false, mensagem: "Inscrição inválida." }, { status: 400 });
  }
  const aparelho = (req.headers.get("user-agent") ?? "").slice(0, 200);
  await prisma.pushInscricao.upsert({
    where: { endpoint },
    create: { usuarioId: s.usuario.id, endpoint, p256dh: String(c.keys.p256dh).slice(0, 200), auth: String(c.keys.auth).slice(0, 100), aparelho },
    update: { usuarioId: s.usuario.id, p256dh: String(c.keys.p256dh).slice(0, 200), auth: String(c.keys.auth).slice(0, 100), aparelho },
  });
  return NextResponse.json({ ok: true, mensagem: "Notificações ativadas neste aparelho." });
}

export async function DELETE(req: Request) {
  const s = await obterSessao();
  if (!s) return NextResponse.json({ ok: false }, { status: 403 });
  const c = (await req.json().catch(() => ({}))) as { endpoint?: string };
  await prisma.pushInscricao.deleteMany({ where: { endpoint: String(c.endpoint ?? ""), usuarioId: s.usuario.id } });
  return NextResponse.json({ ok: true, mensagem: "Notificações desativadas neste aparelho." });
}
