// Notificações no celular (app — decisão #99): envia os avisos também como notificação do app (Web Push).
// Usa as chaves VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY do .env. Sem elas, não envia (e não atrapalha os avisos).
import webpush from "web-push";
import { prisma } from "@filapro/db";

let configurado: boolean | null = null;
function configurar() {
  if (configurado !== null) return configurado;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  configurado = !!(pub && priv);
  if (configurado) webpush.setVapidDetails(process.env.VAPID_CONTATO || "https://filaproleads.com.br", pub!, priv!);
  return configurado;
}

/** Envia para todos os aparelhos do usuário que tem "Receber também no celular" ligado. Apaga inscrições vencidas. */
export async function enviarPush(usuarioId: string, corpo: string, url = "/dashboard") {
  if (!configurar()) return 0;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { avisoCelular: true } });
  if (!u?.avisoCelular) return 0;
  const inscricoes = await prisma.pushInscricao.findMany({ where: { usuarioId } });
  let enviados = 0;
  for (const i of inscricoes) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify({ titulo: "FilaPro Leads", corpo: corpo.slice(0, 300), url }), { TTL: 3600 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await prisma.pushInscricao.delete({ where: { id: i.id } }).catch(() => undefined);
    }
  }
  return enviados;
}

/** Tela certa para abrir ao tocar na notificação. */
export function urlDoAviso(texto: string) {
  if (/campanha/i.test(texto)) return "/campanhas";
  if (/anúncio/i.test(texto)) return "/leads-anuncios";
  return "/conversas";
}
