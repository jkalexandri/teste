"use server";

// Super Admin → Regras de envio (decisão #65): faixa global de horário, feriados e a janela do próprio Super Admin.
import { revalidatePath } from "next/cache";
import { prisma, horaParaMin } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { lerJanela } from "@/lib/janela";

const FERIADO = /^(\d{2}-\d{2}|\d{4}-\d{2}-\d{2}|SEXTA-SANTA)$/;

export async function salvarRegrasGlobais(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const horaMinima = horaParaMin(String(form.get("horaMinima") ?? ""));
  const horaMaxima = horaParaMin(String(form.get("horaMaxima") ?? ""));
  if (Number.isNaN(horaMinima) || Number.isNaN(horaMaxima) || horaMaxima <= horaMinima) return { ok: false, mensagem: "Faixa global inválida." };
  // Feriados: um por linha — "DD/MM" (todo ano), "DD/MM/AAAA" (data única) ou "Sexta-feira Santa"
  const feriados: string[] = [];
  for (const bruto of String(form.get("feriados") ?? "").split(/\r?\n/)) {
    const l = bruto.trim();
    if (!l) continue;
    if (/sexta.*santa/i.test(l)) { feriados.push("SEXTA-SANTA"); continue; }
    const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/.exec(l);
    if (!m) return { ok: false, mensagem: `Feriado inválido: “${l}”. Use DD/MM ou DD/MM/AAAA.` };
    const dd = m[1]!.padStart(2, "0"), mm = m[2]!.padStart(2, "0");
    const v = m[3] ? `${m[3]}-${mm}-${dd}` : `${mm}-${dd}`;
    if (!FERIADO.test(v)) return { ok: false, mensagem: `Feriado inválido: “${l}”.` };
    feriados.push(v);
  }
  const janela = lerJanela(form, { horaMinima, horaMaxima });
  if ("erro" in janela) return { ok: false, mensagem: `Sua janela: ${janela.erro}` };
  await prisma.$transaction([
    prisma.configEnvio.upsert({
      where: { id: "config" },
      update: { horaMinima, horaMaxima, feriados: [...new Set(feriados)], janelaInicioSuperAdmin: janela.inicio, janelaFimSuperAdmin: janela.fim },
      create: { id: "config", horaMinima, horaMaxima, feriados: [...new Set(feriados)], janelaInicioSuperAdmin: janela.inicio, janelaFimSuperAdmin: janela.fim },
    }),
    // Janelas das contas que ficaram fora da nova faixa são ajustadas para dentro dela
    prisma.empresa.updateMany({ where: { janelaInicio: { lt: horaMinima } }, data: { janelaInicio: horaMinima } }),
    prisma.empresa.updateMany({ where: { janelaFim: { gt: horaMaxima } }, data: { janelaFim: horaMaxima } }),
  ]);
  revalidatePath("/regras-envio");
  return { ok: true, mensagem: "Regras de envio salvas." };
}
