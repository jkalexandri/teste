// POST /api/renovacao — renovação pelo link enviado por e-mail (decisões #42 e #43).
// { token, planoId } → pedido PIX de renovação da conta (pode trocar de plano).
import { NextResponse } from "next/server";
import { prisma, StatusPedido } from "@filapro/db";
import { criarPedidoPix } from "@/lib/pedidos";
import { responsavelDaConta } from "@/lib/renovacao";

export async function POST(req: Request) {
  const c = await req.json().catch(() => ({}));
  const token = String(c.token || "");
  const empresa = token ? await prisma.empresa.findUnique({ where: { tokenRenovacao: token } }) : null;
  if (!empresa) return NextResponse.json({ erro: "Link de renovação inválido ou já utilizado." }, { status: 404 });

  const plano = await prisma.plano.findUnique({ where: { id: String(c.planoId || "") } });
  if (!plano || !plano.visivel || plano.gratis || plano.personalizado || plano.precoAtual == null || plano.modulo !== empresa.modulo) {
    return NextResponse.json({ erro: "Plano indisponível para esta conta." }, { status: 400 });
  }
  const resp = await responsavelDaConta(empresa);
  if (!resp) return NextResponse.json({ erro: "Conta sem responsável cadastrado." }, { status: 400 });

  const abertos = await prisma.pedido.count({
    where: { empresaId: empresa.id, renovacao: true, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } },
  });
  if (abertos >= 3) return NextResponse.json({ erro: "Já existem pedidos de renovação aguardando pagamento." }, { status: 429 });

  // WhatsApps extras (Individual — decisões #80 e #95): na renovação só pode manter ou diminuir
  const extras = Math.max(0, Math.floor(Number(c.extras) || 0));
  if (extras > empresa.whatsappsExtras) return NextResponse.json({ erro: "Na renovação você pode manter ou diminuir os WhatsApps extras." }, { status: 400 });
  const manter = Array.isArray(c.manter) ? c.manter.map(String).filter((x: string) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, extras) : [];
  const r = await criarPedidoPix({
    plano,
    comprador: { nome: resp.nome, email: resp.email, whatsapp: resp.whatsapp || "", empresaNome: empresa.nome },
    renovarEmpresaId: empresa.id,
    extras,
    manterSessoes: manter,
  });
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: 503 });
  return NextResponse.json(r);
}
