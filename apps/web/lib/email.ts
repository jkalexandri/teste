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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Link de uso único para criar uma nova senha (decisão #164 — S9 do Módulo 1): nunca leva senha. */
export function emailLinkRecuperacao(nome: string, link: string, minutos: number) {
  const texto =
    `Olá, ${nome}.\n\nPara criar uma nova senha no FilaPro Leads, abra o link abaixo (vale por ${minutos} minutos e só pode ser usado uma vez):\n\n${link}\n\n` +
    `Se você não pediu, ignore este e-mail: sua senha atual continua valendo.`;
  const html =
    `<p>Olá, ${esc(nome)}.</p><p>Para criar uma nova senha no <b>FilaPro Leads</b>, use o botão abaixo. O link vale por <b>${minutos} minutos</b> e só pode ser usado <b>uma vez</b>.</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:bold;padding:12px 20px;border-radius:10px;text-decoration:none">Criar nova senha</a></p>` +
    `<p style="font-size:12px;color:#5b6b62">Se o botão não abrir, copie este endereço no navegador:<br>${link}</p>` +
    `<p style="color:#5b6b62">Se você não pediu, ignore este e-mail: sua senha atual continua valendo.</p>`;
  return { texto, html };
}

export function emailSenhaAlterada(nome: string, quando: string, ip: string) {
  const texto =
    `Olá, ${nome}.\n\nA senha da sua conta no FilaPro Leads foi definida em ${quando} (endereço de internet: ${ip}).\n\n` +
    `Foi você? Então não precisa fazer nada. Os outros aparelhos conectados foram desconectados por segurança.\n\n` +
    `Não reconhece? Use "Esqueci minha senha" na tela de login agora mesmo e avise o suporte.`;
  const html =
    `<p>Olá, ${esc(nome)}.</p><p>A senha da sua conta no <b>FilaPro Leads</b> foi definida em <b>${esc(quando)}</b> (endereço de internet: ${esc(ip)}).</p>` +
    `<p>Foi você? Então não precisa fazer nada. Os outros aparelhos conectados foram desconectados por segurança.</p>` +
    `<p style="color:#b42318"><b>Não reconhece?</b> Use “Esqueci minha senha” na tela de login agora mesmo e avise o suporte.</p>`;
  return { texto, html };
}

/** Aviso ao dono quando a conta entra em proteção por muitas tentativas de vários endereços (decisão #160). */
export function emailContaProtegida(nome: string) {
  const texto =
    `Olá, ${nome}.\n\nDetectamos muitas tentativas erradas de entrar na sua conta do FilaPro Leads, vindas de vários endereços de internet. ` +
    `Por segurança, a entrada pela senha ficou bloqueada por 15 minutos.\n\n` +
    `Foi você? Espere 15 minutos, ou use "Esqueci minha senha" na tela de login: a senha temporária enviada para este e-mail entra na hora.\n\n` +
    `Não foi você? Pode ignorar: sua senha continua segura. Se quiser, troque-a depois de entrar.`;
  const html =
    `<p>Olá, ${esc(nome)}.</p><p>Detectamos <b>muitas tentativas erradas</b> de entrar na sua conta do <b>FilaPro Leads</b>, vindas de vários endereços de internet. Por segurança, a entrada pela senha ficou bloqueada por 15 minutos.</p>` +
    `<p><b>Foi você?</b> Espere 15 minutos, ou use “Esqueci minha senha” na tela de login: a senha temporária enviada para este e-mail entra na hora.</p>` +
    `<p style="color:#5b6b62"><b>Não foi você?</b> Pode ignorar: sua senha continua segura. Se quiser, troque-a depois de entrar.</p>`;
  return { texto, html };
}
