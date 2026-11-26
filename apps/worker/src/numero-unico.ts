// Um número de WhatsApp só pode estar conectado em UM espaço (decisão #152 — M3 da auditoria do Módulo 4).
// O WhatsApp aceita vários aparelhos no mesmo número; sem esta regra, o mesmo chip poderia estar no principal e num extra,
// em dois usuários ou em outra conta: envios em duplicado, conversas misturadas, limites contados em separado e uso do
// número de outra pessoa. Vale para quem ACABOU de ler o QR; reconexão de login salvo nunca é recusada.
import { prisma, StatusWhatsapp } from "@filapro/db";
import { variantesTelefone } from "./numero.js";

export type Conflito = { id: string; usuarioId: string | null; apelido: string };

/** Chave do número: 55 + DDD + últimos 8 dígitos (o 9º dígito do celular não conta: com e sem ele é o mesmo número). */
export function chaveDoNumero(numero: string): string {
  const d = numero.replace(/\D/g, "");
  return /^55\d{2}9?\d{8}$/.test(d) ? d.slice(0, 4) + d.slice(-8) : d;
}

/**
 * Reserva o número para esta sessão, sem corrida: com uma trava por número no banco, confere se OUTRO espaço já o usa
 * (conectado ou reconectando, com login salvo). Livre → grava número e "conectado" já na reserva e devolve null.
 * Em uso → devolve o espaço que o tem e não grava nada. Duas conexões ao mesmo tempo: só uma passa.
 */
export async function reservarNumero(id: string, numero: string): Promise<Conflito | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${chaveDoNumero(numero)}))`;
    const outro = await tx.whatsappSessao.findFirst({
      where: { id: { not: id }, numero: { in: variantesTelefone(numero) }, creds: { not: null }, status: { in: [StatusWhatsapp.CONECTADO, StatusWhatsapp.RECONECTANDO] } },
      orderBy: { conectadoEm: "asc" },
      select: { id: true, usuarioId: true, apelido: true },
    });
    if (outro) return outro;
    await tx.whatsappSessao.updateMany({ where: { id }, data: { numero, status: StatusWhatsapp.CONECTADO } });
    return null;
  });
}

/**
 * Números que JÁ estão repetidos (de antes desta regra): só registra nos Logs do Super Admin, sem desconectar ninguém
 * (poderia derrubar um cliente legítimo). Um registro por grupo a cada 24 h, para não repetir a cada reinício.
 */
export async function registrarNumerosRepetidos(agora = new Date()): Promise<number> {
  const ss = await prisma.whatsappSessao.findMany({
    where: { numero: { not: null }, creds: { not: null }, status: { in: [StatusWhatsapp.CONECTADO, StatusWhatsapp.RECONECTANDO] } },
    select: { id: true, numero: true, apelido: true, usuario: { select: { nome: true, email: true } } },
  });
  const grupos = new Map<string, typeof ss>();
  for (const s of ss) { const k = chaveDoNumero(s.numero!); grupos.set(k, [...(grupos.get(k) ?? []), s]); }
  let n = 0;
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const onde = g.map((s) => (s.id === "plataforma" ? "Número da plataforma" : `${s.usuario ? `${s.usuario.nome} (${s.usuario.email})` : s.id}${s.apelido ? ` — ${s.apelido}` : ""}`)).join("; ");
    const texto = `Número repetido: +${g[0]!.numero} está conectado em ${g.length} espaços: ${onde}. Nenhum foi desconectado; decida qual manter.`.slice(0, 500);
    const jaFoi = await prisma.log.count({ where: { tipo: "WHATSAPP", empresaId: null, usuarioId: null, texto, criadoEm: { gte: new Date(agora.getTime() - 24 * 3600_000) } } });
    if (!jaFoi) await prisma.log.create({ data: { empresaId: null, usuarioId: null, quem: "Sistema", tipo: "WHATSAPP", texto } });
    n++;
  }
  return n;
}
