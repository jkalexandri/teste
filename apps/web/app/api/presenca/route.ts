// POST /api/presenca — sinal do navegador/app a cada 45 s (decisão #102):
// marca a pessoa como online (tela e aparelho) e devolve a mensagem do Super Admin pendente e o estado do suporte.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await obterSessao();
  if (!s || s.precisaTrocar) return NextResponse.json({ ok: false }, { status: 401 });
  const c = (await req.json().catch(() => ({}))) as { tela?: string; app?: boolean };
  const u = s.usuario;
  const agora = new Date();
  const ua = req.headers.get("user-agent") ?? "";
  const aparelho = c.app ? "App no celular" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "Navegador do celular" : "Computador";
  await prisma.usuario.update({ where: { id: u.id }, data: { vistoEm: agora, telaAtual: String(c.tela ?? "").slice(0, 120), aparelho } });

  // Mensagem do Super Admin ainda não confirmada (a mais antiga primeiro)
  const d = await prisma.comunicadoDestino.findFirst({
    where: { usuarioId: u.id, lidoEm: null, comunicado: { OR: [{ validoAte: null }, { validoAte: { gt: agora } }] } },
    orderBy: { comunicado: { criadoEm: "asc" } },
    include: { comunicado: true },
  });
  const comunicado = d ? { id: d.comunicado.id, titulo: d.comunicado.titulo, texto: d.comunicado.texto, link: d.comunicado.link } : null;

  // Suporte: não lidas do cliente e se o Super Admin chamou; para o Super Admin, conversas com mensagens novas
  let suporte = { naoLidas: 0, chamado: false };
  if (u.cargo === Cargo.SUPERADMIN) {
    suporte.naoLidas = await prisma.suporteConversa.count({ where: { naoLidasSuporte: { gt: 0 } } });
  } else {
    const conv = await prisma.suporteConversa.findUnique({ where: { usuarioId: u.id } });
    if (conv) suporte = { naoLidas: conv.naoLidasCliente, chamado: !!conv.chamadoEm };
  }
  return NextResponse.json({ ok: true, comunicado, suporte });
}
