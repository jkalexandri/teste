// POST /api/pedidos — compra pelo popup "Planos" (decisões #32, #33, #37, #44).
// E-mail já cadastrado do responsável pela conta (Admin da Empresa ou usuário
// Individual) = renovação da conta existente.
import { NextResponse } from "next/server";
import { prisma, Cargo, Modulo, StatusPedido } from "@filapro/db";
import { validarComprador } from "@/lib/contas";
import { criarPedidoPix } from "@/lib/pedidos";

const MAX_PEDIDOS_ABERTOS_POR_EMAIL = 3;
const NOME_MODULO = { INDIVIDUAL: "Individual", EMPRESARIAL: "Empresarial" } as const;

export async function POST(req: Request) {
  const c = await req.json().catch(() => ({}));
  const dados = {
    planoId: String(c.planoId || ""),
    nome: String(c.nome || "").trim().slice(0, 80),
    email: String(c.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(c.whatsapp || "").trim().slice(0, 30),
    empresaNome: String(c.empresaNome || "").trim().slice(0, 80),
  };

  const plano = await prisma.plano.findUnique({ where: { id: dados.planoId } });
  if (!plano || !plano.visivel || plano.gratis || plano.personalizado || plano.precoAtual == null) {
    return NextResponse.json({ erro: "Plano indisponível." }, { status: 400 });
  }

  // Quem já tem conta?
  const existente = await prisma.usuario.findUnique({ where: { email: dados.email }, include: { empresa: true } });
  let renovarEmpresaId: string | null = null;
  if (existente) {
    const responsavel =
      existente.empresa &&
      ((existente.cargo === Cargo.ADMIN_EMPRESA && existente.empresa.modulo === Modulo.EMPRESARIAL) ||
        (existente.cargo === Cargo.USUARIO && existente.empresa.modulo === Modulo.INDIVIDUAL));
    if (!responsavel || !existente.empresa) {
      return NextResponse.json(
        { erro: "Este e-mail já tem acesso ao FilaPro. A renovação é feita pelo administrador da sua empresa." },
        { status: 409 },
      );
    }
    if (existente.empresa.modulo !== plano.modulo) {
      const m = NOME_MODULO[existente.empresa.modulo];
      return NextResponse.json({ erro: `Sua conta é do módulo ${m}. Para renovar, escolha um plano ${m}.` }, { status: 409 });
    }
    renovarEmpresaId = existente.empresa.id;
  }

  const erro = validarComprador(dados, plano.modulo === Modulo.EMPRESARIAL && !renovarEmpresaId);
  if (erro) return NextResponse.json({ erro }, { status: 400 });

  const abertos = await prisma.pedido.count({
    where: { email: dados.email, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } },
  });
  if (abertos >= MAX_PEDIDOS_ABERTOS_POR_EMAIL) {
    return NextResponse.json({ erro: "Você já tem pedidos aguardando pagamento. Aguarde a confirmação." }, { status: 429 });
  }

  const r = await criarPedidoPix({
    plano,
    comprador: {
      nome: dados.nome,
      email: dados.email,
      whatsapp: dados.whatsapp,
      empresaNome: plano.modulo === Modulo.EMPRESARIAL ? dados.empresaNome || existente?.empresa?.nome : null,
    },
    renovarEmpresaId,
  });
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: 503 });
  return NextResponse.json(r);
}
