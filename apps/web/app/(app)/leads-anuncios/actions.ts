"use server";

// Leads de anúncios (etapa 10b — decisões #82, #90 e #94): endereço secreto de recebimento.
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";

type R = { ok: boolean; mensagem: string };

/** Gera (ou troca) o endereço secreto. O endereço antigo para de funcionar na hora. */
export async function gerarEndereco(): Promise<R> {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  if (u.cargo === Cargo.ADMIN_EMPRESA) return { ok: false, mensagem: "O Admin da Empresa não recebe leads." };
  if (u.cargo === Cargo.USUARIO && !u.empresa?.leadsAnuncios) return { ok: false, mensagem: "Leads de anúncios não está incluído no seu plano." };
  await prisma.usuario.update({ where: { id: u.id }, data: { tokenAnuncios: randomBytes(24).toString("base64url") } });
  revalidatePath("/leads-anuncios");
  return { ok: true, mensagem: u.tokenAnuncios ? "Endereço novo gerado. Atualize-o no Google Ads e no Make/Zapier." : "Endereço gerado." };
}
