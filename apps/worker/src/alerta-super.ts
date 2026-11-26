// Alerta ao Super Admin quando o número da plataforma cai (decisão #143 — A7).
// Não usa o WhatsApp (é justamente o que caiu): vai por notificação no celular (app) e por e-mail (Resend).
// O e-mail precisa de RESEND_API_KEY (e EMAIL_FROM) no .env do serviço; sem a chave, só a notificação sai.
import type { Logger } from "pino";
import { prisma } from "@filapro/db";
import { enviarPush } from "./push.js";

export function criarAlertaSuperAdmin(log: Logger) {
  return async (texto: string) => {
    const admins = await prisma.usuario.findMany({ where: { cargo: "SUPERADMIN", status: "ATIVO" }, select: { id: true, email: true } });
    const chave = process.env.RESEND_API_KEY;
    const de = process.env.EMAIL_FROM || "FilaPro Leads <nao-responda@filaproleads.com.br>";
    if (!chave) log.warn("alerta da plataforma: RESEND_API_KEY não definida no serviço — e-mail não enviado (só a notificação no celular)");
    for (const a of admins) {
      await enviarPush(a.id, texto, "/numero-plataforma").catch(() => undefined);
      if (!chave) continue;
      const html = `<p>${texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: de, to: [a.email], subject: "FilaPro Leads — número da plataforma", html, text: texto }),
        signal: AbortSignal.timeout(15_000),
      }).then((r) => { if (!r.ok) log.warn({ status: r.status }, "alerta da plataforma: Resend recusou o e-mail"); })
        .catch((e) => log.warn({ e }, "alerta da plataforma: e-mail não enviado"));
    }
  };
}
