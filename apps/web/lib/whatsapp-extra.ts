// WhatsApp extra do plano Individual (etapa 10c — decisões #79, #80 e #95).
// O número principal tem o id do usuário; cada extra contratado vira uma sessão "<usuário>-n<k>".
// Números que saem (renovação com menos extras, Super Admin diminuiu) ficam bloqueados: QR bloqueado, conversas guardadas.
import "server-only";
import { prisma, Cargo, Modulo, StatusWhatsapp, type Empresa, type Usuario } from "@filapro/db";
import { chamarWorker } from "@/lib/worker";

const DIA = 86_400_000;

/** Super Admin: até 10 números próprios, sem pagamento (decisão #113). */
export const MAX_NUMEROS_SUPERADMIN = 10;

/** Só o usuário do plano Individual pode ter números extras (decisão #79). */
export function podeTerExtras(u: Pick<Usuario, "cargo"> & { empresa: Pick<Empresa, "modulo"> | null }) {
  return u.cargo === Cargo.USUARIO && u.empresa?.modulo === Modulo.INDIVIDUAL;
}

/** Valor proporcional aos dias que faltam (decisão #95, item 1): preço × dias restantes ÷ dias do plano, em centavos. */
export function valorProporcional(precoCentavos: number, expiraEm: Date, prazoDias: number, agora = new Date()) {
  const restantes = Math.min(prazoDias, Math.max(0, Math.ceil((expiraEm.getTime() - agora.getTime()) / DIA)));
  return Math.round((precoCentavos * restantes) / Math.max(1, prazoDias));
}

/** Números do usuário: o principal primeiro, depois os extras (ativos e bloqueados). */
export async function numerosDoUsuario(usuarioId: string) {
  const ss = await prisma.whatsappSessao.findMany({ where: { usuarioId }, orderBy: [{ ordem: "asc" }] });
  const principal = ss.find((s) => s.id === usuarioId) ?? null;
  return { principal, extras: ss.filter((s) => s.id !== usuarioId) };
}

/**
 * Deixa a quantidade de extras ativos igual à contratada: desbloqueia os bloqueados (mais antigos primeiro)
 * ou cria novos; se sobrar, bloqueia os mais recentes — ou, se `manter` vier (renovação), os que não estão nela.
 */
export async function sincronizarExtras(usuarioId: string, contratados: number, manter?: string[]) {
  const { extras } = await numerosDoUsuario(usuarioId);
  let ativos = extras.filter((s) => !s.bloqueada);
  const sair: string[] = [];
  if (ativos.length > contratados) {
    const ficam = manter?.length ? ativos.filter((s) => manter.includes(s.id)).slice(0, contratados) : [];
    // Sem escolha (ou escolha incompleta): saem os mais recentes; o principal nunca sai (decisão #95, item 3)
    for (const s of ativos) if (ficam.length < contratados && !ficam.includes(s)) ficam.push(s);
    for (const s of ativos) if (!ficam.includes(s)) sair.push(s.id);
    ativos = ficam;
  }
  for (const id of sair) {
    await prisma.whatsappSessao.update({ where: { id }, data: { bloqueada: true } });
    await chamarWorker(`/sessoes/${encodeURIComponent(id)}/desconectar`);
    await prisma.whatsappSessao.update({ where: { id }, data: { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null } });
  }
  let faltam = contratados - ativos.length;
  for (const s of extras.filter((x) => x.bloqueada && !sair.includes(x.id))) {
    if (faltam <= 0) break;
    await prisma.whatsappSessao.update({ where: { id: s.id }, data: { bloqueada: false } });
    faltam--;
  }
  let maior = extras.reduce((m, s) => Math.max(m, s.ordem), 0);
  while (faltam-- > 0) {
    maior++;
    await prisma.whatsappSessao.create({ data: { id: `${usuarioId}-n${maior}`, usuarioId, ordem: maior } });
  }
}

/** Sincroniza os números do usuário Individual dono da conta. */
export async function sincronizarExtrasDaConta(empresaId: string, manter?: string[]) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, include: { usuarios: { where: { cargo: Cargo.USUARIO } } } });
  if (!e || e.modulo !== Modulo.INDIVIDUAL) return;
  for (const u of e.usuarios) await sincronizarExtras(u.id, e.whatsappsExtras, manter);
}

/** Nome do número na tela: apelido, número conectado ou posição. */
export function rotuloNumero(s: { id: string; apelido: string; numero: string | null; usuarioId: string | null }, posicao: number) {
  const base = s.id === s.usuarioId ? "WhatsApp principal" : `WhatsApp ${posicao}`;
  return s.apelido ? `${base} — ${s.apelido}` : base;
}
