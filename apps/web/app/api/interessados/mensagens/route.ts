// POST: mensagem do visitante (só texto — decisão #104), com limite contra robôs.
import { NextResponse } from "next/server";
import { dentroDoLimite, gravarDoVisitante, interessadoAtual, ipDoPedido, MAX_TEXTO_VISITANTE } from "@/lib/interessados";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const it = await interessadoAtual();
  if (!it) return NextResponse.json({ ok: false, mensagem: "Preencha os seus dados para conversar." }, { status: 403 });
  const ip = await ipDoPedido();
  if (!dentroDoLimite(`m:${it.id}`, 6, 60_000) || !dentroDoLimite(`mi:${ip}`, 20, 60_000)) {
    return NextResponse.json({ ok: false, mensagem: "Muitas mensagens seguidas. Aguarde um minuto." }, { status: 429 });
  }
  const form = await req.formData().catch(() => null);
  if (form?.get("arquivo") instanceof File && (form.get("arquivo") as File).size > 0) return NextResponse.json({ ok: false, mensagem: "Envie só texto." }, { status: 400 });
  const texto = String(form?.get("texto") ?? "").trim();
  if (!texto) return NextResponse.json({ ok: false, mensagem: "Escreva a mensagem." }, { status: 400 });
  if (texto.length > MAX_TEXTO_VISITANTE) return NextResponse.json({ ok: false, mensagem: `Mensagem muito longa (máximo ${MAX_TEXTO_VISITANTE} caracteres).` }, { status: 400 });
  await gravarDoVisitante(it, texto);
  return NextResponse.json({ ok: true, mensagem: "Enviada." });
}
