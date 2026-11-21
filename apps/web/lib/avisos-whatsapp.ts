// Avisos do sistema enviados pelo número da plataforma (decisões #38, #42 e #51).
// Se o WhatsApp da plataforma não estiver conectado ou o serviço estiver fora do ar,
// o aviso só não sai: a compra/renovação continua normalmente (o pedido segue no
// contador do menu Pedidos e o link de renovação continua indo por e-mail).
import "server-only";
import { prisma } from "@filapro/db";
import { chamarWorker, workerConfigurado, type RespostaWorker } from "@/lib/worker";
import { formatarReais } from "@/lib/planos";
import { SESSAO_PLATAFORMA } from "@/lib/whatsapp";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";

/** Envia um texto pelo número da plataforma. Nunca lança erro. */
export async function enviarPelaPlataforma(para: string, texto: string): Promise<RespostaWorker> {
  if (!para) return { ok: false, mensagem: "Número não informado." };
  if (!workerConfigurado()) {
    // Desenvolvimento sem o serviço: mostra no console, como os e-mails.
    if (process.env.NEXT_PUBLIC_APP_ENV !== "production") console.log(`[whatsapp de desenvolvimento] para ${para}:\n${texto}`);
    return { ok: false, mensagem: "Serviço do WhatsApp não configurado." };
  }
  const r = await chamarWorker(`/sessoes/${SESSAO_PLATAFORMA}/enviar`, { para, texto });
  if (!r.ok) console.warn(`[whatsapp] aviso não enviado para ${para}: ${r.mensagem}`);
  return r;
}

/** Decisão #38: avisa o Super Admin de um novo pedido. */
export async function avisarNovoPedido(p: { codigo: string; planoNome: string; valor: number; nome: string; email: string; whatsapp: string; empresaNome?: string | null; renovacao: boolean }) {
  const c = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (!c?.numeroAvisos) return;
  const texto =
    `🛒 *Novo pedido ${p.codigo}*${p.renovacao ? " (renovação)" : ""}\n` +
    `Plano: ${p.planoNome} — ${formatarReais(p.valor)}\n` +
    `Cliente: ${p.nome}${p.empresaNome ? ` (${p.empresaNome})` : ""}\n` +
    `E-mail: ${p.email}\nWhatsApp: ${p.whatsapp}\n\n` +
    `Confira o PIX e confirme em: ${SITE}/pedidos`;
  await enviarPelaPlataforma(c.numeroAvisos, texto);
}
