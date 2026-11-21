"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";

/** Só dígitos; aceita número brasileiro com ou sem 55. */
function limparNumero(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

export async function salvarNumeroAvisos(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const bruto = String(form.get("numeroAvisos") ?? "").trim();
  const numeroAvisos = bruto ? limparNumero(bruto) : "";
  if (numeroAvisos && (numeroAvisos.length < 12 || numeroAvisos.length > 15)) {
    return { ok: false, mensagem: "Informe o WhatsApp com DDD, ex.: (11) 99999-9999." };
  }
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { numeroAvisos }, create: { id: "config", numeroAvisos } });
  revalidatePath("/numero-plataforma");
  return { ok: true, mensagem: numeroAvisos ? "Número dos avisos salvo." : "Avisos pelo WhatsApp desligados." };
}

export async function enviarTeste(): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const c = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (!c?.numeroAvisos) return { ok: false, mensagem: "Salve primeiro o número que recebe os avisos." };
  const r = await enviarPelaPlataforma(c.numeroAvisos, "✅ Teste do FilaPro Leads: os avisos do sistema vão chegar neste número.");
  return r.ok ? { ok: true, mensagem: "Mensagem de teste enviada." } : r;
}
