// Tela Logs (decisões #99 e #153): conexões e quedas do WhatsApp, na conta do dono do número.
import { prisma } from "@filapro/db";

/** Registra uma linha de WhatsApp nos Logs da conta do dono do número (o da plataforma aparece só para o Super Admin). Nunca lança erro. */
export async function registrarLogSessao(sessaoId: string, texto: string) {
  try {
    const s = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId }, include: { usuario: { select: { id: true, nome: true, email: true, empresaId: true } } } });
    const u = s?.usuario;
    await prisma.log.create({
      data: { empresaId: u?.empresaId ?? null, usuarioId: u?.id ?? null, quem: u ? `${u.nome} (${u.email})` : "Número da plataforma", tipo: "WHATSAPP", texto: (sessaoId === "plataforma" ? `Número da plataforma: ${texto}` : texto).slice(0, 500) },
    });
  } catch { /* o log nunca interrompe a conexão */ }
}

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Duração curta: "8 s", "3 min", "2 h 5 min". */
export function duracaoCurta(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * Linha dos Logs quando o número VOLTA de uma queda (decisão #153 — M4): quando voltou, quando e por que caiu,
 * quanto ficou fora, as tentativas (quando foram 2 ou mais) e as falhas ao reabrir (decisão #144), se houve.
 */
export function textoVolta(d: { voltouEm: Date; caiuEm: Date; motivo: string; tentativas: number; falhasAoAbrir: number }) {
  const partes = [`caiu às ${hora(d.caiuEm)}: ${d.motivo}`, `ficou ${duracaoCurta(d.voltouEm.getTime() - d.caiuEm.getTime())} fora`];
  if (d.tentativas >= 2) partes.push(`${d.tentativas} tentativas`);
  if (d.falhasAoAbrir > 0) partes.push(`${d.falhasAoAbrir} ${d.falhasAoAbrir === 1 ? "falha" : "falhas"} ao reabrir`);
  return `WhatsApp voltou às ${hora(d.voltouEm)} (${partes.join("; ")})`;
}

export const textoQuedaLonga = (caiuEm: Date) => `WhatsApp caiu às ${hora(caiuEm)} e ainda não voltou (3 min sem conexão)`;
export const textoProblema = (caiuEm: Date) => `WhatsApp está com problema: fora desde ${hora(caiuEm)} (2 h sem conexão)`;
