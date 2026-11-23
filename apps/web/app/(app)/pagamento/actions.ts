"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { criptografar, descriptografar } from "@filapro/ia";
import { ambienteDaChave, ErroAsaas, testarConexao, type AmbienteAsaas } from "@/lib/asaas";

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

// ===== Asaas (decisão #115, etapa A): chave de API criptografada, ambiente e teste de conexão =====

const NOME_AMBIENTE = { sandbox: "Testes (sandbox)", producao: "Produção" } as const;

/** Salva o ambiente e a chave do Asaas. A chave só é guardada depois que o teste de conexão der certo. */
export async function salvarAsaas(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  const ambiente: AmbienteAsaas = form.get("asaasAmbiente") === "producao" ? "producao" : "sandbox";
  const nova = String(form.get("asaasChave") ?? "").trim();
  const atual = await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  // Sem chave nova: usa a salva, mas só se for do mesmo ambiente (cada ambiente do Asaas tem a própria chave)
  if (!nova && (!atual.asaasChave || atual.asaasAmbiente !== ambiente)) {
    return { ok: false, mensagem: `Cole a chave de API do ambiente ${NOME_AMBIENTE[ambiente]}.` };
  }
  const chave = nova || descriptografar(atual.asaasChave!);
  const daChave = ambienteDaChave(chave);
  if (daChave && daChave !== ambiente) {
    return { ok: false, mensagem: `Esta chave é do ambiente ${NOME_AMBIENTE[daChave]}. Escolha esse ambiente ou cole a chave de ${NOME_AMBIENTE[ambiente]}.` };
  }
  let conta: string;
  try {
    conta = await testarConexao(chave, ambiente);
  } catch (e) {
    return { ok: false, mensagem: e instanceof ErroAsaas ? e.message : "Não foi possível testar a conexão com o Asaas." };
  }
  await prisma.configVenda.update({
    where: { id: "config" },
    data: { asaasAmbiente: ambiente, asaasChave: criptografar(chave), asaasConta: conta.slice(0, 120), asaasTestadoEm: new Date() },
  });
  revalidatePath("/pagamento");
  return { ok: true, mensagem: `Asaas conectado: ${conta} (${NOME_AMBIENTE[ambiente]}).` };
}

/** Remove a chave do Asaas (desliga a integração). */
export async function removerAsaas(): Promise<{ ok: boolean; mensagem: string }> {
  await exigirSuperAdmin();
  await prisma.configVenda.update({ where: { id: "config" }, data: { asaasChave: null, asaasConta: null, asaasTestadoEm: null } });
  revalidatePath("/pagamento");
  return { ok: true, mensagem: "Chave do Asaas removida." };
}
