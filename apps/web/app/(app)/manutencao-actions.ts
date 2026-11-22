"use server";

// Desligar o modo manutenção pela tela (decisão #103) — só o Super Admin.
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { registrarLog } from "@/lib/logs";

export async function desligarManutencao(): Promise<{ ok: boolean; mensagem: string }> {
  const s = await exigirSuperAdmin();
  await prisma.manutencao.upsert({ where: { id: "geral" }, create: { id: "geral", ligada: false }, update: { ligada: false, desde: null } });
  await registrarLog(s.usuario, "USUARIOS", "Modo manutenção desligado pela tela").catch(() => undefined);
  return { ok: true, mensagem: "Sistema liberado." };
}
