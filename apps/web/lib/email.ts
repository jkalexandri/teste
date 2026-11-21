// Envio de e-mail pelo Resend (decisão #9).
// Sem RESEND_API_KEY (desenvolvimento), o e-mail é apenas mostrado no console do servidor.
import "server-only";
import { IS_PRODUCTION } from "@/lib/env";

type Email = { para: string; assunto: string; html: string; texto: string };

export async function enviarEmail({ para, assunto, html, texto }: Email): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  const de = process.env.EMAIL_FROM || "FilaPro Leads <nao-responda@filaproleads.com.br>";

  if (!chave) {
    if (IS_PRODUCTION) {
      console.error("[email] RESEND_API_KEY não configurada — e-mail NÃO enviado para", para);
      return false;
    }
    console.log(`\n[email de desenvolvimento]\nPara: ${para}\nAssunto: ${assunto}\n${texto}\n`);
    return true;
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto }),
  });
  if (!resp.ok) {
    console.error("[email] falha no Resend:", resp.status, await resp.text().catch(() => ""));
    return false;
  }
  return true;
}

export function emailSenhaTemporaria(nome: string, senha: string, horas: number) {
  const texto =
    `Olá, ${nome}.\n\nSua senha temporária do FilaPro Leads é: ${senha}\n\n` +
    `Ela vale por ${horas} horas. Ao entrar, você vai criar uma nova senha com no mínimo 12 caracteres.\n\n` +
    `Se você não pediu esta senha, ignore este e-mail. Sua senha atual continua valendo.`;
  const html =
    `<p>Olá, ${nome}.</p><p>Sua senha temporária do <b>FilaPro Leads</b> é:</p>` +
    `<p style="font-size:18px;font-family:monospace"><b>${senha}</b></p>` +
    `<p>Ela vale por ${horas} horas. Ao entrar, você vai criar uma nova senha com no mínimo 12 caracteres.</p>` +
    `<p style="color:#5b6b62">Se você não pediu esta senha, ignore este e-mail. Sua senha atual continua valendo.</p>`;
  return { texto, html };
}
