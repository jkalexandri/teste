// POST /api/teste-gratis — plano Free: conta criada na hora (decisão #34).
// 1 teste por e-mail; vale X dias ou Y disparos (configurados no plano Free).
import { NextResponse } from "next/server";
import { limitarPorIp } from "@/lib/limite-acesso";
import { ligarInteressadoAoCliente } from "@/lib/interessados";
import { prisma, Modulo } from "@filapro/db";
import { criarConta, enviarEmailBoasVindas, validarComprador } from "@/lib/contas";

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 3 por hora
  const limite = await limitarPorIp("teste-gratis", 3, 3600_000);
  if (limite) return limite;
  const c = await req.json().catch(() => ({}));
  const dados = {
    planoId: String(c.planoId || ""),
    nome: String(c.nome || "").trim().slice(0, 80),
    email: String(c.email || "").trim().toLowerCase().slice(0, 120),
    whatsapp: String(c.whatsapp || "").trim().slice(0, 30),
  };
  const plano = await prisma.plano.findUnique({ where: { id: dados.planoId } });
  if (!plano || !plano.visivel || !plano.gratis) return NextResponse.json({ erro: "Plano indisponível." }, { status: 400 });

  const erro = validarComprador(dados, false);
  if (erro) return NextResponse.json({ erro }, { status: 400 });

  const jaUsou = await prisma.testeGratisUsado.findUnique({ where: { email: dados.email } });
  const jaTem = await prisma.usuario.findUnique({ where: { email: dados.email } });
  if (jaUsou || jaTem) {
    return NextResponse.json({ erro: "Este e-mail já usou o teste grátis ou já tem acesso ao FilaPro Leads." }, { status: 409 });
  }

  const conta = await prisma.$transaction(async (tx) => {
    await tx.testeGratisUsado.create({ data: { email: dados.email } });
    return criarConta(
      {
        modulo: Modulo.INDIVIDUAL,
        nomeConta: `${dados.nome} (teste grátis)`,
        pacote: plano.nome,
        planoId: plano.id,
        limiteUsuarios: 1,
        prazoDias: plano.testeDias ?? 7,
        // Free por dias (aba Mensal) não tem limite de disparos; Free por disparos tem (decisão #113)
        limiteDisparos: plano.testeDisparos ?? null,
        limiteLeads: plano.limiteLeads,
        usuario: { nome: dados.nome, email: dados.email, whatsapp: dados.whatsapp },
      },
      tx,
    );
  });
  // Era um interessado do chat (decisão #104): a conversa vira o suporte do novo cliente
  await ligarInteressadoAoCliente(conta.usuario).catch(() => undefined);
  await enviarEmailBoasVindas(dados.nome, dados.email, conta.senhaTemporaria, plano.nome, Modulo.INDIVIDUAL);
  return NextResponse.json({ ok: true });
}
