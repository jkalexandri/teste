// POST /api/pedidos — cria um pedido de plano pago e devolve o PIX (decisões #32, #33, #37).
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma, Modulo, StatusPedido } from "@filapro/db";
import { gerarPixCopiaECola } from "@/lib/pix";
import { validarComprador } from "@/lib/contas";

const VALIDADE_PEDIDO_HORAS = 24;
const MAX_PEDIDOS_ABERTOS_POR_EMAIL = 3;

function novoCodigo() {
  // Sem letras/números que se confundem (0/O, 1/I).
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  return "FP" + Array.from(b, (x) => abc[x % abc.length]).join("");
}

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
  const empresarial = plano.modulo === Modulo.EMPRESARIAL;
  const erro = validarComprador(dados, empresarial);
  if (erro) return NextResponse.json({ erro }, { status: 400 });

  if (await prisma.usuario.findUnique({ where: { email: dados.email } })) {
    return NextResponse.json(
      { erro: "Este e-mail já tem acesso ao FilaPro. Entre com sua senha ou use “Esqueci minha senha”." },
      { status: 409 },
    );
  }
  const abertos = await prisma.pedido.count({
    where: { email: dados.email, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } },
  });
  if (abertos >= MAX_PEDIDOS_ABERTOS_POR_EMAIL) {
    return NextResponse.json({ erro: "Você já tem pedidos aguardando pagamento. Aguarde a confirmação." }, { status: 429 });
  }

  const config = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (!config?.chavePix || !config.nomeRecebedor || !config.cidadeRecebedor) {
    return NextResponse.json({ erro: "Pagamento indisponível no momento. Tente mais tarde." }, { status: 503 });
  }

  const codigo = novoCodigo();
  const pix = gerarPixCopiaECola({
    chave: config.chavePix,
    nome: config.nomeRecebedor,
    cidade: config.cidadeRecebedor,
    valorCentavos: plano.precoAtual,
    identificador: codigo,
  });
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      planoId: plano.id,
      planoNome: plano.nome,
      modulo: plano.modulo,
      usuarios: plano.usuarios,
      prazoDias: plano.prazoDias,
      valor: plano.precoAtual,
      nome: dados.nome,
      email: dados.email,
      whatsapp: dados.whatsapp,
      empresaNome: empresarial ? dados.empresaNome : null,
      pixCopiaECola: pix,
      expiraEm: new Date(Date.now() + VALIDADE_PEDIDO_HORAS * 3600 * 1000),
    },
  });
  // TODO etapa 6: avisar o Super Admin pelo WhatsApp (decisão #38).

  const qr = await QRCode.toDataURL(pix, { margin: 1, width: 240 });
  return NextResponse.json({
    codigo: pedido.codigo,
    plano: plano.nome,
    valor: pedido.valor,
    copiaECola: pix,
    qrCode: qr,
    expiraEm: pedido.expiraEm.toISOString(),
  });
}
