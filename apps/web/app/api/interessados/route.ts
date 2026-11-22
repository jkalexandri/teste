// Chat para interessados (decisão #104) — rotas públicas do visitante.
// GET: a conversa deste aparelho (abrir o chat zera as não lidas). POST: começar (nome, WhatsApp, e-mail opcional e aceite).
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { criarInteressado, dentroDoLimite, interessadoAtual, ipDoPedido, mensagensDoInteressado, normalizarWhatsapp } from "@/lib/interessados";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const it = await interessadoAtual();
  if (!it) return NextResponse.json({ ok: true, novo: true, mensagens: [] });
  const url = new URL(req.url);
  if (!dentroDoLimite(`g:${it.id}`, 60, 60_000)) return NextResponse.json({ ok: false, mensagem: "Muitas consultas." }, { status: 429 });
  await prisma.interessado.update({ where: { id: it.id }, data: { vistoEm: new Date(), ...(url.searchParams.get("aberto") === "1" ? { naoLidasVisitante: 0 } : {}) } });
  return NextResponse.json({ ok: true, novo: false, nome: it.nome, mensagens: await mensagensDoInteressado(it.id, url.searchParams.get("desde")) });
}

export async function POST(req: Request) {
  const ip = await ipDoPedido();
  if (!dentroDoLimite(`novo:${ip}`, 5, 3600_000)) return NextResponse.json({ ok: false, mensagem: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  const atual = await interessadoAtual();
  if (atual) return NextResponse.json({ ok: true, mensagem: "Conversa já iniciada." });
  const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nome = String(c.nome ?? "").trim().slice(0, 80);
  const whatsapp = normalizarWhatsapp(String(c.whatsapp ?? ""));
  const email = String(c.email ?? "").trim().toLowerCase().slice(0, 120);
  if (nome.length < 2) return NextResponse.json({ ok: false, mensagem: "Informe o seu nome." }, { status: 400 });
  if (!whatsapp) return NextResponse.json({ ok: false, mensagem: "Informe um WhatsApp válido com DDD." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, mensagem: "E-mail inválido." }, { status: 400 });
  if (c.aceite !== true) return NextResponse.json({ ok: false, mensagem: "É preciso aceitar a Política de Privacidade." }, { status: 400 });
  await criarInteressado({ nome, whatsapp, email: email || null, ip });
  return NextResponse.json({ ok: true, mensagem: "Pode escrever a sua dúvida." });
}
