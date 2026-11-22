// Avisos ao usuário pelo número da plataforma (etapa 10b — decisões #81 e #94).
// Tipos com liga/desliga: lead Quente, lead novo de anúncio e lead respondeu.
// O usuário e o Admin da Empresa (avisos de todos da empresa) recebem no número que cadastraram.
// Resumo: o primeiro aviso sai na hora; os que chegarem nos 10 minutos seguintes vão juntos num resumo.
import type { Logger } from "pino";
import { prisma, Cargo } from "@filapro/db";
import { enviarPush, urlDoAviso } from "./push.js";

export const INTERVALO_RESUMO_MS = 10 * 60_000;
export type TipoAviso = "QUENTE" | "ANUNCIO" | "RESPONDEU";
const CAMPO: Record<TipoAviso, "avisoQuente" | "avisoAnuncio" | "avisoRespondeu"> = { QUENTE: "avisoQuente", ANUNCIO: "avisoAnuncio", RESPONDEU: "avisoRespondeu" };

type Destino = { id: string; cargo: Cargo; whatsapp: string | null; numeroAvisos: string | null };

/** Número que recebe os avisos: o cadastrado em Avisos; senão o WhatsApp do usuário (Super Admin: o número de avisos da plataforma). */
export async function numeroDeAvisos(u: Destino) {
  let para = u.numeroAvisos || u.whatsapp || "";
  if (!u.numeroAvisos && u.cargo === Cargo.SUPERADMIN) para = (await prisma.configVenda.findUnique({ where: { id: "config" } }))?.numeroAvisos || para;
  const dig = para.replace(/\D/g, "");
  const numero = dig.length === 10 || dig.length === 11 ? "55" + dig : dig;
  return /^\d{12,15}$/.test(numero) ? numero : null;
}

export class Avisador {
  private laco: ReturnType<typeof setInterval> | null = null;

  constructor(
    private log: Logger,
    private opcoes: { notificar?: (para: string, texto: string) => Promise<unknown>; agora?: () => Date },
  ) {}

  private agora() { return this.opcoes.agora?.() ?? new Date(); }

  iniciar() { this.laco = setInterval(() => void this.enviarResumos().catch((e) => this.log.error({ e }, "falha nos resumos de avisos")), 60_000); }
  parar() { if (this.laco) clearInterval(this.laco); }

  /** Aviso de um evento do lead de `donoId`: vai para o dono e para o Admin da Empresa dele (quem tiver o tipo ligado). */
  async avisar(tipo: TipoAviso, donoId: string, texto: string) {
    const dono = await prisma.usuario.findUnique({ where: { id: donoId } });
    if (!dono) return;
    const destinos: { u: typeof dono; texto: string }[] = [];
    if (dono.cargo !== Cargo.ADMIN_EMPRESA && dono[CAMPO[tipo]]) destinos.push({ u: dono, texto });
    if (dono.empresaId && dono.cargo === Cargo.USUARIO) {
      const admins = await prisma.usuario.findMany({ where: { empresaId: dono.empresaId, cargo: Cargo.ADMIN_EMPRESA, status: "ATIVO", [CAMPO[tipo]]: true } });
      for (const a of admins) destinos.push({ u: a, texto: `[${dono.nome}] ${texto}` });
    }
    for (const d of destinos) await this.entregar(d.u, d.texto);
  }

  private async entregar(u: Destino & { ultimoAvisoEm: Date | null }, texto: string) {
    const agora = this.agora();
    const pendentes = await prisma.avisoPendente.count({ where: { usuarioId: u.id } });
    const livre = !u.ultimoAvisoEm || agora.getTime() - u.ultimoAvisoEm.getTime() >= INTERVALO_RESUMO_MS;
    if (livre && !pendentes) {
      await this.enviar(u, texto);
      return;
    }
    await prisma.avisoPendente.create({ data: { usuarioId: u.id, texto } });
  }

  private async enviar(u: Destino, texto: string) {
    await prisma.usuario.update({ where: { id: u.id }, data: { ultimoAvisoEm: this.agora() } });
    // Também no celular (app), se a pessoa ativou (decisão #99)
    await enviarPush(u.id, texto, urlDoAviso(texto)).catch(() => undefined);
    const numero = await numeroDeAvisos(u);
    if (!numero || !this.opcoes.notificar) return;
    await this.opcoes.notificar(numero, texto).catch((e) => this.log.warn({ e }, "aviso pelo WhatsApp não enviado"));
  }

  /** Junta os avisos guardados num resumo, para quem já passou dos 10 minutos desde o último. */
  async enviarResumos() {
    const grupos = await prisma.avisoPendente.groupBy({ by: ["usuarioId"] });
    const agora = this.agora().getTime();
    for (const g of grupos) {
      const u = await prisma.usuario.findUnique({ where: { id: g.usuarioId } });
      if (!u) { await prisma.avisoPendente.deleteMany({ where: { usuarioId: g.usuarioId } }); continue; }
      if (u.ultimoAvisoEm && agora - u.ultimoAvisoEm.getTime() < INTERVALO_RESUMO_MS) continue;
      const itens = await prisma.avisoPendente.findMany({ where: { usuarioId: u.id }, orderBy: { criadoEm: "asc" } });
      if (!itens.length) continue;
      await prisma.avisoPendente.deleteMany({ where: { id: { in: itens.map((i) => i.id) } } });
      const texto = itens.length === 1 ? itens[0]!.texto : `📋 FilaPro Leads — resumo (${itens.length} avisos):\n${itens.slice(0, 30).map((i) => `• ${i.texto}`).join("\n")}${itens.length > 30 ? `\n… e mais ${itens.length - 30}.` : ""}`;
      await this.enviar(u, texto.slice(0, 4000));
    }
  }
}
