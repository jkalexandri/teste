"use server";

// Ações do dono da conta sobre a própria assinatura (decisão #124, item h).
import { revalidatePath } from "next/cache";
import { Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { desligarAssinatura } from "@/lib/assinatura";

type R = { ok: boolean; mensagem: string };

/** O dono da conta (usuário Individual ou Admin da Empresa) desliga a cobrança automática no cartão. */
export async function desligarMinhaCobrancaAutomatica(): Promise<R> {
  const s = await obterSessao();
  const u = s?.usuario;
  if (!u?.empresa) return { ok: false, mensagem: "Acesso negado." };
  const dono = (u.empresa.modulo === Modulo.INDIVIDUAL && u.cargo === Cargo.USUARIO) || (u.empresa.modulo === Modulo.EMPRESARIAL && u.cargo === Cargo.ADMIN_EMPRESA);
  if (!dono) return { ok: false, mensagem: "Só o dono da conta pode desligar a cobrança automática." };
  const r = await desligarAssinatura(u.empresa.id, u);
  revalidatePath("/", "layout");
  return r;
}
