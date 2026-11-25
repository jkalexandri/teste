// /api/upgrade — upgrade de conta dentro do sistema (decisão #125), pelo dono da conta logado.
// GET: planos iguais ou maiores e os dados da conta. POST { planoId, quantidade, manter, forma… }: pedido de upgrade.
// Mesmo fluxo do link de renovação (decisões #42–#44), com a conta identificada pela sessão.
import { NextResponse } from "next/server";
import { prisma, StatusPedido } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { criarPedidoPix, lerPagamento } from "@/lib/pedidos";
import { responsavelDaConta } from "@/lib/renovacao";
import { conferirUpgrade, dadosUpgrade, ehDonoDaConta } from "@/lib/upgrade";

export const dynamic = "force-dynamic";

/** Conta do dono logado, ou a resposta de erro. */
async function contaDoDono() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) return { erro: NextResponse.json({ erro: "Entre de novo para continuar." }, { status: 401 }) };
  if (!ehDonoDaConta(s.usuario) || !s.usuario.empresa) return { erro: NextResponse.json({ erro: "Só o dono da conta pode fazer upgrade. Fale com o administrador." }, { status: 403 }) };
  return { empresa: s.usuario.empresa };
}

export async function GET() {
  const r = await contaDoDono();
  if ("erro" in r) return r.erro;
  return NextResponse.json(await dadosUpgrade(r.empresa));
}

export async function POST(req: Request) {
  const r = await contaDoDono();
  if ("erro" in r) return r.erro;
  const empresa = r.empresa;
  const c = await req.json().catch(() => ({}));
  const plano = await prisma.plano.findUnique({ where: { id: String(c.planoId || "") } });
  // Quantidade (decisão #113): números de WhatsApp (Individual) ou pacotes de usuários (Empresarial)
  const quantidade = Math.max(1, Math.min(10, Math.floor(Number(c.quantidade) || 1)));
  if (!plano) return NextResponse.json({ erro: "Plano indisponível para esta conta." }, { status: 400 });
  const erro = await conferirUpgrade(empresa, plano, quantidade);
  if (erro) return NextResponse.json({ erro }, { status: 400 });
  const resp = await responsavelDaConta(empresa);
  if (!resp) return NextResponse.json({ erro: "Conta sem responsável cadastrado." }, { status: 400 });

  const abertos = await prisma.pedido.count({
    where: { empresaId: empresa.id, renovacao: true, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } },
  });
  if (abertos >= 3) return NextResponse.json({ erro: "Já existem pedidos aguardando pagamento. Pague ou aguarde eles vencerem." }, { status: 429 });

  const extras = plano.modulo === "INDIVIDUAL" ? quantidade - 1 : 0;
  const manter = Array.isArray(c.manter) ? c.manter.map(String).filter((x: string) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, extras) : [];
  const p = await criarPedidoPix({
    plano,
    comprador: { nome: resp.nome, email: resp.email, whatsapp: resp.whatsapp || "", empresaNome: empresa.nome },
    renovarEmpresaId: empresa.id,
    quantidade,
    manterSessoes: manter,
    pagamento: lerPagamento(c),
    upgrade: true,
  });
  if ("erro" in p) return NextResponse.json({ erro: p.erro }, { status: p.erro.includes("CPF") ? 400 : 503 });
  return NextResponse.json(p);
}
