// Regras dos leads (etapa 7 — decisões #53 a #59 e #63).
import "server-only";
import { prisma, reservarCodigos, Cargo, Modulo, type Lead, type Prisma } from "@filapro/db";
import type { LinhaLead } from "@/lib/planilha";

/** Quem está agindo (vem da sessão). */
export type Ator = {
  id: string;
  cargo: Cargo;
  empresaId: string | null;
  empresa: { modulo: Modulo } | null;
};

/** Leads que o ator pode ver (decisão #56). */
export function escopoLeads(a: Ator): Prisma.LeadWhereInput {
  if (a.cargo === Cargo.SUPERADMIN) return {};
  if (a.cargo === Cargo.ADMIN_EMPRESA) return { empresaId: a.empresaId ?? "-" };
  return { usuarioId: a.id };
}

/** O que o ator pode fazer com os leads que vê (decisão #56). */
export function permissoesLeads(a: Ator) {
  const sa = a.cargo === Cargo.SUPERADMIN;
  const admin = a.cargo === Cargo.ADMIN_EMPRESA;
  const individual = a.cargo === Cargo.USUARIO && a.empresa?.modulo === Modulo.INDIVIDUAL;
  return {
    editarNome: true,
    editarTelefone: sa || admin || individual,
    inativar: true,
    mudarStatus: true,
    excluir: sa,
    escolherDono: sa || admin,
  };
}

export function podeVerLead(a: Ator, l: Pick<Lead, "usuarioId" | "empresaId">) {
  if (a.cargo === Cargo.SUPERADMIN) return true;
  if (a.cargo === Cargo.ADMIN_EMPRESA) return !!a.empresaId && l.empresaId === a.empresaId;
  return l.usuarioId === a.id;
}

/** Usuários que podem receber leads novos cadastrados por este ator. */
export async function donosPermitidos(a: Ator) {
  const sel = { id: true, nome: true, codigo: true, cargo: true, empresaId: true, empresa: { select: { nome: true, codigo: true, modulo: true } } } as const;
  if (a.cargo === Cargo.SUPERADMIN) {
    return prisma.usuario.findMany({ where: { OR: [{ cargo: Cargo.USUARIO }, { id: a.id }] }, select: sel, orderBy: [{ cargo: "asc" }, { nome: "asc" }] });
  }
  if (a.cargo === Cargo.ADMIN_EMPRESA) {
    return prisma.usuario.findMany({ where: { empresaId: a.empresaId ?? "-", cargo: Cargo.USUARIO }, select: sel, orderBy: { nome: "asc" } });
  }
  return prisma.usuario.findMany({ where: { id: a.id }, select: sel });
}

export type ResumoImportacao = {
  salvos: number;
  repetidosNaLista: number; // o mesmo número apareceu mais de uma vez no que foi enviado
  jaEram: number; // o dono já tinha esse número
  deOutroUsuario: number; // já pertence a outro usuário da empresa (decisão #54)
  acimaDoLimite: number; // não couberam no limite (decisão #58)
  limite: string | null; // texto do limite que barrou
};

/** Quantos leads ainda cabem para o dono (menor folga entre o limite do usuário e o da conta). */
async function vagasDeLeads(dono: { id: string; limiteLeads: number | null; empresaId: string | null; cargo: Cargo }) {
  let vagas = Infinity;
  let motivo: string | null = null;
  if (dono.cargo === Cargo.SUPERADMIN || !dono.empresaId) return { vagas, motivo };
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: dono.empresaId } });
  if (empresa.limiteLeads != null) {
    const total = await prisma.lead.count({ where: { empresaId: empresa.id } });
    vagas = empresa.limiteLeads - total;
    motivo = empresa.modulo === Modulo.EMPRESARIAL ? `limite da empresa: ${empresa.limiteLeads.toLocaleString("pt-BR")} leads` : `limite do plano: ${empresa.limiteLeads.toLocaleString("pt-BR")} leads`;
  }
  if (empresa.modulo === Modulo.EMPRESARIAL && dono.limiteLeads != null) {
    const meus = await prisma.lead.count({ where: { usuarioId: dono.id } });
    if (dono.limiteLeads - meus < vagas) {
      vagas = dono.limiteLeads - meus;
      motivo = `limite do usuário: ${dono.limiteLeads.toLocaleString("pt-BR")} leads`;
    }
  }
  return { vagas: Math.max(0, vagas), motivo };
}

/**
 * Cadastra leads para um dono, aplicando: repetidos (#54), limites (#58) e códigos (#63).
 * Retorna o resumo do que foi salvo e do que ficou de fora.
 */
export async function adicionarLeads(a: Ator, donoId: string, entrada: LinhaLead[]): Promise<ResumoImportacao | { erro: string }> {
  const dono = await prisma.usuario.findUnique({ where: { id: donoId }, include: { empresa: true } });
  if (!dono) return { erro: "Usuário não encontrado." };
  const permitido =
    a.cargo === Cargo.SUPERADMIN ? dono.cargo === Cargo.USUARIO || dono.id === a.id
    : a.cargo === Cargo.ADMIN_EMPRESA ? dono.cargo === Cargo.USUARIO && dono.empresaId === a.empresaId
    : dono.id === a.id;
  if (!permitido) return { erro: "Você não pode cadastrar leads para este usuário." };

  // 1) Repetidos dentro do próprio envio
  const unicos = new Map<string, LinhaLead>();
  for (const l of entrada) if (!unicos.has(l.telefone)) unicos.set(l.telefone, l);
  const resumo: ResumoImportacao = { salvos: 0, repetidosNaLista: entrada.length - unicos.size, jaEram: 0, deOutroUsuario: 0, acimaDoLimite: 0, limite: null };

  // 2) Já cadastrados na conta (empresa/conta individual) ou, no Super Admin, nos leads dele
  const telefones = [...unicos.keys()];
  const existentes: { telefone: string; usuarioId: string }[] = [];
  for (let i = 0; i < telefones.length; i += 5000) {
    const parte = telefones.slice(i, i + 5000);
    existentes.push(
      ...(await prisma.lead.findMany({
        where: dono.empresaId ? { empresaId: dono.empresaId, telefone: { in: parte } } : { usuarioId: dono.id, telefone: { in: parte } },
        select: { telefone: true, usuarioId: true },
      })),
    );
  }
  for (const e of existentes) {
    unicos.delete(e.telefone);
    if (e.usuarioId === dono.id) resumo.jaEram++;
    else resumo.deOutroUsuario++;
  }

  // 3) Limite de leads
  let novos = [...unicos.values()];
  const { vagas, motivo } = await vagasDeLeads(dono);
  if (novos.length > vagas) {
    resumo.acimaDoLimite = novos.length - vagas;
    resumo.limite = motivo;
    novos = novos.slice(0, vagas);
  }
  if (!novos.length) return resumo;

  // 4) Grava com códigos: "EL…" em empresa, "L…" em conta individual e nos leads do Super Admin
  const empresarial = dono.empresa?.modulo === Modulo.EMPRESARIAL;
  for (let i = 0; i < novos.length; i += 1000) {
    const parte = novos.slice(i, i + 1000);
    resumo.salvos += await prisma.$transaction(async (tx) => {
      const codigos = await reservarCodigos(tx, empresarial ? "lead_empresa" : "lead_individual", parte.length);
      const r = await tx.lead.createMany({
        data: parte.map((l, j) => ({
          codigo: codigos[j]!,
          nome: l.nome,
          telefone: l.telefone,
          usuarioId: dono.id,
          empresaId: dono.empresaId,
          codigoUsuario: dono.codigo ?? "",
          codigoEmpresa: dono.empresa?.codigo ?? null,
        })),
        skipDuplicates: true, // outro cadastro simultâneo do mesmo número
      });
      return r.count;
    });
  }
  return resumo;
}

/** Texto curto do resumo, para a tela. */
export function textoResumo(r: ResumoImportacao) {
  const partes = [`${r.salvos} ${r.salvos === 1 ? "lead salvo" : "leads salvos"}`];
  if (r.jaEram) partes.push(`${r.jaEram} já estavam na sua lista`);
  if (r.repetidosNaLista) partes.push(`${r.repetidosNaLista} repetidos ignorados`);
  if (r.deOutroUsuario) partes.push(`${r.deOutroUsuario} já cadastrados por outro usuário da empresa`);
  if (r.acimaDoLimite) partes.push(`${r.acimaDoLimite} não couberam no ${r.limite ?? "limite"}`);
  return partes.join(" • ");
}
