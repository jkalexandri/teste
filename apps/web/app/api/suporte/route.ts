// Suporte do cliente (decisão #102). GET: mensagens (abrir o chat zera as não lidas). POST: enviar (texto e/ou arquivo).
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { acionarIASuporte, avisarSuporteOffline, gravarMensagem, mensagensDaConversa } from "@/lib/suporte";

export const dynamic = "force-dynamic";

async function cliente() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s) || s.usuario.cargo === Cargo.SUPERADMIN) return null; // conta barrada (decisão #158)
  return s.usuario;
}

export async function GET(req: Request) {
  const u = await cliente();
  if (!u) return NextResponse.json({ ok: false }, { status: 403 });
  const url = new URL(req.url);
  const r = await mensagensDaConversa(u.id, url.searchParams.get("desde"));
  if (r.conversa && url.searchParams.get("aberto") === "1" && (r.conversa.naoLidasCliente > 0 || r.conversa.chamadoEm)) {
    await prisma.suporteConversa.update({ where: { id: r.conversa.id }, data: { naoLidasCliente: 0, chamadoEm: null } });
  }
  return NextResponse.json({ ok: true, mensagens: r.mensagens });
}

export async function POST(req: Request) {
  const u = await cliente();
  if (!u) return NextResponse.json({ ok: false, mensagem: "Acesso negado." }, { status: 403 });
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const texto = String(form.get("texto") ?? "");
  const r = await gravarMensagem(u.id, "CLIENTE", u.id, texto, arquivo instanceof File && arquivo.size > 0 ? arquivo : null);
  if (r.ok) {
    // IA do suporte (decisão #146): responde se estiver ligada e a conversa não estiver pausada
    const iaAtendendo = await acionarIASuporte(u.id);
    await avisarSuporteOffline(u, texto, iaAtendendo);
  }
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
