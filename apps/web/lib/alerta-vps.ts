// Avisos da VPS por e-mail (decisão #171 — Módulo 12: P0-6, O2, O3, O5).
// A VPS (deploy/vigia-vps.sh, a cada 15 min) manda um relatório só de leitura; aqui decidimos quando avisar os Super Admins:
// um e-mail quando o problema aparece, lembretes enquanto durar e um e-mail "resolvido" quando volta. Sem avisos na manutenção.
// O relatório NÃO escolhe o texto do e-mail: só o código da verificação, o nível e um valor curto (limpo aqui).
import "server-only";
import { prisma } from "@filapro/db";
import { enviarAosSuperAdmins } from "@/lib/alerta-servico";
import { REGRAS, decidir, limparValor, type EstadoItem, type ItemRelatorio } from "@/lib/alerta-vps-regras";
export type { ItemRelatorio, Nivel } from "@/lib/alerta-vps-regras";
const H = 3600_000;

const dataHora = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function textoAviso(id: string, item: ItemRelatorio, acao: "avisar" | "lembrar", desde: Date | null): { assunto: string; texto: string } {
  const r = REGRAS[id]!;
  const critico = item.nivel === "critico";
  const v = limparValor(item.valor);
  const assunto = `FilaPro Leads — VPS: ${r.titulo}${acao === "lembrar" ? " (lembrete)" : ""}`;
  const texto =
    `${critico ? "ATENÇÃO — CRÍTICO. " : ""}Problema na VPS: ${r.titulo}.\n` +
    (v ? `Situação: ${v}.\n` : "") +
    (desde ? `Detectado desde ${dataHora(desde)} (horário de Brasília).\n` : "") +
    `\n${r.oQueFazer}\n\n` +
    `Você receberá outro e-mail quando o problema for resolvido` + (acao === "avisar" ? "" : " e novos lembretes enquanto ele durar") + ".";
  return { assunto, texto };
}

export type ResultadoVps = { acao: "manutencao" | "processado"; avisos: number; lembretes: number; resolvidos: number; ignorados: number };

/** Processa o relatório da VPS. Devolve só contagens (a resposta vai para o log do cron da VPS). */
export async function processarRelatorio(itens: ItemRelatorio[], agora = new Date()): Promise<ResultadoVps> {
  const r: ResultadoVps = { acao: "processado", avisos: 0, lembretes: 0, resolvidos: 0, ignorados: 0 };
  // Marca que a VPS reportou (o monitor externo desconfia se isso parar por mais de 1 hora)
  await prisma.alertaServico.upsert({ where: { id: "vps:relatorio" }, create: { id: "vps:relatorio" }, update: { contagem: { increment: 1 } } });
  const manutencao = await prisma.manutencao.findUnique({ where: { id: "geral" } }).catch(() => null);
  if (manutencao?.ligada) return { ...r, acao: "manutencao" };

  const vistos = new Set<string>();
  for (const item of itens) {
    const regra = REGRAS[item.id];
    if (!regra || vistos.has(item.id) || !["ok", "aviso", "critico"].includes(item.nivel)) { r.ignorados++; continue; }
    vistos.add(item.id);
    const chave = `vps:${item.id}`;
    const e = await prisma.alertaServico.findUnique({ where: { id: chave } });
    const estado: EstadoItem = { avisouEm: e?.avisouEm ?? null, foraDesde: e?.foraDesde ?? null, ultimoAvisoEm: e?.ultimoAvisoEm ?? null, contagem: e?.contagem ?? 0, nivel: e?.nivel ?? null };
    const d = decidir(item, regra, estado, agora);
    if (e || d.novo.contagem > 0 || d.acao !== "nada") {
      await prisma.alertaServico.upsert({ where: { id: chave }, create: { id: chave, ...d.novo }, update: d.novo });
    }
    if (d.acao === "avisar" || d.acao === "lembrar") {
      const m = textoAviso(item.id, item, d.acao, d.novo.foraDesde);
      await enviarAosSuperAdmins(m.assunto, m.texto);
      d.acao === "avisar" ? r.avisos++ : r.lembretes++;
    } else if (d.acao === "resolver") {
      const min = estado.foraDesde ? Math.max(1, Math.round((agora.getTime() - estado.foraDesde.getTime()) / 60_000)) : null;
      await enviarAosSuperAdmins(
        `FilaPro Leads — VPS: ${regra.titulo} (resolvido)`,
        `Resolvido: ${regra.titulo}. Voltou ao normal às ${dataHora(agora)} (horário de Brasília)` + (min ? `, depois de cerca de ${min >= 120 ? Math.round(min / 60) + " h" : min + " min"}` : "") + ".",
      );
      r.resolvidos++;
    }
  }
  return r;
}

/** Para o monitor externo: há problema crítico aberto? A VPS reportou na última hora? */
export async function estadoParaMonitor(agora = new Date()): Promise<{ ok: boolean; motivo: "ok" | "critico" | "sem-relatorio" }> {
  const rel = await prisma.alertaServico.findUnique({ where: { id: "vps:relatorio" } });
  if (!rel || agora.getTime() - rel.atualizadoEm.getTime() > H) return { ok: false, motivo: "sem-relatorio" };
  const criticos = await prisma.alertaServico.count({ where: { id: { startsWith: "vps:" }, avisouEm: { not: null }, nivel: "critico" } });
  return criticos > 0 ? { ok: false, motivo: "critico" } : { ok: true, motivo: "ok" };
}
