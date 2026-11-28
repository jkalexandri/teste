// POST /api/pedidos — compra pelo popup "Planos" (decisões #32, #33, #37, #44).
// E-mail já cadastrado do responsável pela conta (Admin da Empresa ou usuário
// Individual) = renovação da conta existente.
import { after, NextResponse } from "next/server";
import { limitarPorIp } from "@/lib/limite-acesso";
import { prisma, Cargo, Modulo, StatusPedido } from "@filapro/db";
import { validarComprador } from "@/lib/contas";
import { criarPedidoPix, lerPagamento } from "@/lib/pedidos";
import { avisarNovoPedido } from "@/lib/avisos-whatsapp";

const MAX_PEDIDOS_ABERTOS_POR_EMAIL = 3;
const NOME_MODULO = { INDIVIDUAL: "Individual", EMPRESARIAL: "Business" } as const;

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 10 pedidos por hora
  const limite = await limitarPorIp("pedidos", 10, 3600_000);
  if (limite) return limite;
  const c = await req.json().catch(() => ({}));
  const dados = {
    planoId: String(c.planoId || ""),
    nome: String(c.nome || "").trim().slice(0, 80),
    email: String(c.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(c.whatsapp || "").trim().slice(0, 30),
    empresaNome: String(c.empresaNome || "").trim().slice(0, 80),
    // Quantidade (decisão #113): números de WhatsApp (Individual) ou pacotes de usuários (Empresarial).
    // "extras" (versão anterior) continua aceito: extras + 1 números.
    quantidade: Math.max(1, Math.min(10, Math.floor(Number(c.quantidade) || (Number(c.extras) || 0) + 1))),
  };

  const plano = await prisma.plano.findUnique({ where: { id: dados.planoId } });
  // Plano pago com preço zero não é vendido (decisão #111)
  if (!plano || !plano.visivel || plano.gratis || plano.personalizado || plano.precoAtual == null || plano.precoAtual <= 0) {
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
      // Respostas "e-mail já existe": limite próprio e mais apertado, contra quem lista e-mails cadastrados (decisão #159)
      const apertado = await limitarPorIp("pedidos-existente", 5, 3600_000);
      if (apertado) return apertado;
      return NextResponse.json(
        { erro: "Este e-mail já tem acesso ao FilaPro Leads. A renovação é feita pelo administrador da sua empresa." },
        { status: 409 },
      );
    }
    if (existente.empresa.modulo !== plano.modulo) {
      const m = NOME_MODULO[existente.empresa.modulo];
      const apertado = await limitarPorIp("pedidos-existente", 5, 3600_000);
      if (apertado) return apertado;
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
    quantidade: dados.quantidade,
    pagamento: lerPagamento(c),
  });
  if ("erro" in r) return NextResponse.json({ erro: r.erro }, { status: r.erro.includes("CPF") ? 400 : 503 });
  // Decisão #38: aviso pelo WhatsApp ao Super Admin, depois de responder ao cliente.
  after(() =>
    avisarNovoPedido({ codigo: r.codigo, planoNome: r.plano, valor: r.valor, renovacao: r.renovacao, nome: dados.nome, email: dados.email, whatsapp: dados.whatsapp, empresaNome: dados.empresaNome || existente?.empresa?.nome })
      .catch((e) => console.error("[whatsapp] falha no aviso de novo pedido", e)),
  );
  return NextResponse.json(r);
}
