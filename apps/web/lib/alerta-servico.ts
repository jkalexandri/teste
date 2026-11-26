// Aviso por e-mail quando o serviço 24/7 fica fora do ar (decisão #151 — M2 da auditoria do Módulo 4).
// O serviço parado não consegue avisar a si mesmo; por isso a VPS chama o site a cada 5 minutos (deploy/vigia-servico.sh).
// Um e-mail quando fica mais de 3 min sem sinal e outro quando volta — um por queda, sem repetir.
// Não usa WhatsApp nem notificação no celular: os dois dependem do serviço que parou.
import "server-only";
import { prisma, Cargo } from "@filapro/db";
import { enviarEmail } from "@/lib/email";
import { LIMITE_ALERTA_MS, REGISTRO_SERVICO, sinalDoServico } from "@/lib/servico-24h";

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dataHora = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export type ResultadoVigia = { acao: "avisou-fora" | "avisou-voltou" | "nada" | "manutencao"; foraDesde?: string };

async function enviarAosSuperAdmins(assunto: string, texto: string) {
  const sas = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { email: true } });
  const html = `<p>${texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;
  for (const s of sas) await enviarEmail({ para: s.email, assunto, html, texto }).catch(() => false);
}

/**
 * Confere o sinal do serviço e avisa os Super Admins por e-mail (uma vez por queda).
 * Durante a manutenção (atualização do sistema) não avisa: o serviço reinicia de propósito.
 */
export async function conferirServico(agora = new Date()): Promise<ResultadoVigia> {
  const manutencao = await prisma.manutencao.findUnique({ where: { id: "geral" } }).catch(() => null);
  if (manutencao?.ligada) return { acao: "manutencao" };
  const sinal = await sinalDoServico(LIMITE_ALERTA_MS, agora);
  const estado = await prisma.alertaServico.findUnique({ where: { id: REGISTRO_SERVICO } });

  if (!sinal.noAr) {
    if (estado?.avisouEm) return { acao: "nada", foraDesde: estado.foraDesde?.toISOString() };
    // Desde quando: o último sinal (queda) ou agora (serviço desligado normalmente, sem registro)
    const desde = sinal.ultimoSinalEm ?? agora;
    await prisma.alertaServico.upsert({ where: { id: REGISTRO_SERVICO }, create: { id: REGISTRO_SERVICO, foraDesde: desde, avisouEm: agora }, update: { foraDesde: desde, avisouEm: agora } });
    await enviarAosSuperAdmins(
      "FilaPro Leads — serviço do WhatsApp fora do ar",
      `O serviço 24/7 do FilaPro Leads (WhatsApp, campanhas e respostas da IA) está sem sinal desde ${hora(desde)} (horário de Brasília).\n\n` +
      `Enquanto ele estiver parado, as campanhas e as respostas da IA ficam paradas e continuam sozinhas quando ele voltar. ` +
      `Os usuários veem "Serviço fora do ar" na tela WhatsApp.\n\n` +
      `Na VPS, confira com "pm2 status" e "pm2 logs filapro-worker --lines 40 --nostream". Você receberá outro e-mail quando ele voltar.`,
    );
    return { acao: "avisou-fora", foraDesde: desde.toISOString() };
  }

  // No ar: se tinha avisado da queda, avisa que voltou
  if (estado?.avisouEm) {
    const desde = estado.foraDesde ?? estado.avisouEm;
    const min = Math.max(1, Math.round((agora.getTime() - desde.getTime()) / 60_000));
    await prisma.alertaServico.update({ where: { id: REGISTRO_SERVICO }, data: { foraDesde: null, avisouEm: null } });
    await enviarAosSuperAdmins(
      "FilaPro Leads — serviço do WhatsApp voltou",
      `O serviço 24/7 do FilaPro Leads voltou às ${hora(agora)} (ficou fora cerca de ${min} min, desde ${dataHora(desde)}). Os números de WhatsApp reconectam sozinhos.`,
    );
    return { acao: "avisou-voltou" };
  }
  return { acao: "nada" };
}
