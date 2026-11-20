"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";

// O padrão do PIX (BR Code) limita o nome a 25 e a cidade a 15 caracteres.
export async function salvarPagamento(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const t = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const chavePix = t("chavePix", 77);
  const nomeRecebedor = t("nomeRecebedor", 25);
  const cidadeRecebedor = t("cidadeRecebedor", 15);
  const contatoPersonalizado = t("contatoPersonalizado", 200);

  if (chavePix && (!nomeRecebedor || !cidadeRecebedor)) {
    return { ok: false, mensagem: "Para o PIX, informe também o nome do recebedor e a cidade." };
  }
  await prisma.configVenda.upsert({
    where: { id: "config" },
    update: { chavePix, nomeRecebedor, cidadeRecebedor, contatoPersonalizado },
    create: { id: "config", chavePix, nomeRecebedor, cidadeRecebedor, contatoPersonalizado },
  });
  revalidatePath("/pagamento");
  return { ok: true, mensagem: "Configurações de pagamento salvas." };
}
