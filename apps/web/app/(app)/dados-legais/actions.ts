"use server";

// Super Admin → Dados legais (decisão #88): dados do responsável usados na Política de Privacidade e nos Termos.
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function salvarDadosLegais(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const t = (k: string, max = 200) => String(form.get(k) ?? "").trim().slice(0, max);
  const d = {
    responsavel: t("responsavel"), documento: t("documento", 30), endereco: t("endereco", 300), emailPrivacidade: t("emailPrivacidade"),
    encarregadoNome: t("encarregadoNome"), encarregadoEmail: t("encarregadoEmail"), foro: t("foro", 120),
  };
  for (const k of ["emailPrivacidade", "encarregadoEmail"] as const) if (d[k] && !EMAIL.test(d[k])) return { ok: false, mensagem: "Confira os e-mails informados." };
  await prisma.configLegal.upsert({ where: { id: "config" }, update: d, create: { id: "config", ...d } });
  revalidatePath("/dados-legais"); revalidatePath("/privacidade"); revalidatePath("/termos");
  return { ok: true, mensagem: "Dados legais salvos. A Política e os Termos já mostram os dados novos." };
}
