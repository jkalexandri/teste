// Alertas de segurança no WhatsApp de avisos e no celular do Super Admin (decisão #105, item 9):
// - conta do Super Admin bloqueada por senha errada;
// - 3 ou mais bloqueios por senha errada na plataforma em 1 hora;
// - entrada do Super Admin por um endereço de internet novo.
import "server-only";
import { headers } from "next/headers";
import { prisma, Cargo } from "@filapro/db";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker } from "@/lib/worker";

export const BLOQUEIOS_ALERTA = 3;
let ultimoAlertaBloqueios = 0;

/** Avisa os Super Admins no WhatsApp de avisos e no celular. "url" = tela aberta ao tocar na notificação.
 *  Também usado pelos avisos do Asaas (decisão #117). */
export async function avisarSuperAdmins(texto: string, url = "/logs") {
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (cfg?.numeroAvisos) await enviarPelaPlataforma(cfg.numeroAvisos, texto, { prioridade: "alta" }).catch(() => undefined);
  const sas = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { id: true } });
  for (const s of sas) await chamarWorker(`/push/${s.id}/enviar`, { texto, url }).catch(() => undefined);
  console.warn(`[alerta de segurança] ${texto}`);
}

async function ipAtual() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Uma conta foi bloqueada por senha errada (chamar logo depois de gravar o log do bloqueio). */
export async function alertarBloqueio(u: { nome: string; email: string; cargo?: Cargo | null }) {
  const ip = (await ipAtual()) ?? "desconhecido";
  if (u.cargo === Cargo.SUPERADMIN) {
    await avisarSuperAdmins(`🔐 Alerta de segurança: a conta do Super Admin ${u.email} foi bloqueada por 5 senhas erradas (endereço ${ip}). Se não foi você, troque a senha e ative a verificação em duas etapas.`);
    return;
  }
  const n = await prisma.log.count({ where: { tipo: "SENHA", texto: { contains: "bloqueado por" }, criadoEm: { gte: new Date(Date.now() - 3600_000) } } });
  if (n >= BLOQUEIOS_ALERTA && Date.now() - ultimoAlertaBloqueios > 3600_000) {
    ultimoAlertaBloqueios = Date.now();
    await avisarSuperAdmins(`🔐 Alerta de segurança: ${n} contas bloqueadas por senha errada na última hora (a última: ${u.email}, endereço ${ip}). Veja em Logs.`);
  }
}

/** Entrada do Super Admin: avisa se o endereço de internet nunca foi usado por ele (chamar depois de gravar o log da entrada). */
export async function alertarEntradaSuperAdmin(usuarioId: string, cargo: Cargo) {
  if (cargo !== Cargo.SUPERADMIN) return;
  const ip = await ipAtual();
  if (!ip) return;
  const antes = await prisma.log.count({ where: { usuarioId, tipo: "ENTRADA" } });
  if (antes <= 1) return; // primeira entrada: ainda não há endereço conhecido
  const mesmoIp = await prisma.log.count({ where: { usuarioId, tipo: "ENTRADA", ip } });
  if (mesmoIp > 1) return;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
  await avisarSuperAdmins(`🔐 Alerta de segurança: entrada do Super Admin ${u?.email ?? ""} por um endereço de internet novo (${ip}). Se não foi você, troque a senha agora.`);
}
