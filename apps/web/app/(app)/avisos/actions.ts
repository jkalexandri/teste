"use server";

// Avisos do usuário (etapa 10b — decisões #81 e #94): número que recebe e liga/desliga de cada tipo.
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker } from "@/lib/worker";

type R = { ok: boolean; mensagem: string };

async function ator() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  return s.usuario;
}

/** Só dígitos, com 55 quando for número do Brasil sem o código do país; "" se inválido. */
function numeroValido(bruto: string) {
  const d = bruto.replace(/\D/g, "");
  const n = d.length === 10 || d.length === 11 ? "55" + d : d;
  return /^\d{12,15}$/.test(n) ? n : "";
}

export async function salvarAvisos(form: FormData): Promise<R> {
  const u = await ator();
  const bruto = String(form.get("numeroAvisos") ?? "").trim();
  const numero = bruto ? numeroValido(bruto) : "";
  if (bruto && !numero) return { ok: false, mensagem: "Número inválido. Use DDD + número, ex.: (11) 98765-4321." };
  await prisma.usuario.update({
    where: { id: u.id },
    data: {
      numeroAvisos: numero || null,
      avisoQuente: form.get("avisoQuente") === "on",
      avisoAnuncio: form.get("avisoAnuncio") === "on",
      avisoRespondeu: form.get("avisoRespondeu") === "on",
      avisoCelular: form.get("avisoCelular") === "on",
    },
  });
  revalidatePath("/avisos");
  return { ok: true, mensagem: "Avisos salvos." };
}

/** Manda um aviso de teste pelo número da plataforma. */
export async function testarAviso(): Promise<R> {
  const u = await ator();
  // Notificação no celular (se houver aparelho ativado — decisão #99)
  const push = u.avisoCelular ? await chamarWorker(`/push/${u.id}/teste`) : { ok: false, mensagem: "" };
  const numero = numeroValido(u.numeroAvisos || u.whatsapp || "");
  if (!numero) return push.ok ? { ok: true, mensagem: push.mensagem } : { ok: false, mensagem: "Cadastre o número que recebe os avisos e salve antes de testar." };
  const r = await enviarPelaPlataforma(numero, "✅ FilaPro Leads: este é um aviso de teste. Os avisos dos seus leads chegam neste número.", { aguardar: true });
  const extra = push.ok ? ` ${push.mensagem}` : "";
  return r.ok ? { ok: true, mensagem: `Aviso de teste enviado. Confira o seu WhatsApp.${extra}` } : { ok: push.ok, mensagem: `Não foi possível enviar pelo WhatsApp: ${r.mensagem}.${extra}` };
}
