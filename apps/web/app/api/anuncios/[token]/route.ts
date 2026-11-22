// Endereço secreto de leads de anúncios (etapa 10b — decisões #82, #84, #90 e #94). Público, protegido pelo token na URL.
// O lead é gravado e o serviço 24/7 cria/encontra o lead e a IA começa o atendimento.
import { NextResponse } from "next/server";
import { prisma, Cargo, StatusAnuncio, type Prisma } from "@filapro/db";
import { lerFormulario } from "@/lib/anuncios";
import { chamarWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";
const MAX_CORPO = 100 * 1024;

async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  const bruto = await req.text();
  if (!bruto || bruto.length > MAX_CORPO) return null;
  const tipo = req.headers.get("content-type") ?? "";
  try {
    if (tipo.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(bruto));
    const j = JSON.parse(bruto) as unknown;
    return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return NextResponse.json({ ok: false, mensagem: "Endereço inválido." }, { status: 404 });
  const u = await prisma.usuario.findUnique({ where: { tokenAnuncios: token }, include: { empresa: true } });
  if (!u || u.status !== "ATIVO") return NextResponse.json({ ok: false, mensagem: "Endereço inválido." }, { status: 404 });
  const corpo = await lerCorpo(req);
  if (!corpo) return NextResponse.json({ ok: false, mensagem: "Envie os dados do lead em JSON." }, { status: 400 });

  const f = lerFormulario(corpo);
  // Recurso pago: só nos planos/contas com "Leads de anúncios" (o Super Admin não depende de plano — #94)
  const temRecurso = u.cargo === Cargo.SUPERADMIN || (u.cargo === Cargo.USUARIO && !!u.empresa?.leadsAnuncios && u.empresa.ativa && u.empresa.expiraEm > new Date());
  const status = !temRecurso ? StatusAnuncio.SEM_RECURSO : !f.telefone ? StatusAnuncio.SEM_TELEFONE : StatusAnuncio.RECEBIDO;
  const a = await prisma.leadAnuncio.create({
    data: {
      usuarioId: u.id, origem: f.origem, nome: f.nome, telefone: f.telefone || f.telefoneBruto.slice(0, 40), email: f.email, assunto: f.assunto, status,
      dados: corpo as Prisma.InputJsonValue,
      erro: status === StatusAnuncio.SEM_RECURSO ? "Leads de anúncios não está incluído no plano." : status === StatusAnuncio.SEM_TELEFONE ? "Formulário sem telefone válido." : null,
    },
  });
  if (status === StatusAnuncio.SEM_RECURSO) return NextResponse.json({ ok: false, mensagem: "Leads de anúncios não está incluído no plano desta conta." }, { status: 402 });
  if (status === StatusAnuncio.SEM_TELEFONE) return NextResponse.json({ ok: true, mensagem: "Recebido, mas sem telefone válido: o lead não foi cadastrado." });
  // A IA começa o atendimento no serviço 24/7 (se ele não responder agora, a varredura dele pega depois)
  await chamarWorker(`/anuncios/${a.id}/atender`);
  return NextResponse.json({ ok: true, mensagem: "Lead recebido." });
}
