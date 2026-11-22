// Empresa | IA (etapa 9b — decisões #74 e #77): de quem é a ficha e quem pode editar.
// Individual: o próprio usuário treina. Empresa: só o Admin treina; os usuários com permissão só veem.
// Super Admin: tem a própria ficha.
import "server-only";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";

export const LIMITES_MATERIAL = {
  imagemMB: 5,
  pdfMB: 20,
  textoMax: 50_000,
  tiposImagem: ["image/jpeg", "image/png"],
} as const;

export const mesAtual = () => new Date().toISOString().slice(0, 7);

/** Quem está na tela, a ficha dele e se pode editar. Lança "Acesso negado." se não puder ver. */
export async function atorEmpresaIA() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  const individual = u.cargo === Cargo.USUARIO && u.empresa?.modulo === Modulo.INDIVIDUAL;
  let podeEditar = false;
  if (u.cargo === Cargo.SUPERADMIN) podeEditar = true;
  else if (u.cargo === Cargo.ADMIN_EMPRESA || individual) podeEditar = true;
  else if (!(u.cargo === Cargo.USUARIO && u.permissoes.includes("empresa-ia"))) throw new Error("Acesso negado.");

  const onde = u.cargo === Cargo.SUPERADMIN ? { superAdminId: u.id } : { empresaId: u.empresaId! };
  if (u.cargo !== Cargo.SUPERADMIN && !u.empresaId) throw new Error("Acesso negado.");
  const ficha = await prisma.fichaEmpresa.upsert({ where: onde, create: { ...onde, nome: u.empresa?.nome ?? "" }, update: {} });
  // Liga/desliga e limites da conta (decisão #77). O Super Admin não tem limites.
  const conta = u.cargo === Cargo.SUPERADMIN ? null : u.empresa;
  return {
    u,
    ficha,
    podeEditar,
    treinarIA: conta ? conta.treinarIA : true,
    limiteMateriais: conta?.limiteMateriais ?? null,
    limitePaginasMes: conta?.limitePaginasMes ?? null,
  };
}

/** Ficha pronta para mandar à IA (campanhas, conversas): o resumo ou, sem resumo, os campos preenchidos. */
export async function fichaParaIA(u: { cargo: Cargo; id: string; empresaId: string | null; empresa: { nome: string } | null }) {
  const onde = u.cargo === Cargo.SUPERADMIN ? { superAdminId: u.id } : u.empresaId ? { empresaId: u.empresaId } : null;
  const f = onde ? await prisma.fichaEmpresa.findUnique({ where: onde }) : null;
  if (f?.resumo.trim()) return f.resumo;
  const campos = f
    ? [["Empresa", f.nome], ["Endereço", f.endereco], ["Telefone", f.telefone], ["WhatsApp", f.whatsapp], ["Atividade", f.atividade]]
        .filter(([, v]) => v!.trim())
        .map(([k, v]) => `${k}: ${v}`)
    : [];
  if (campos.length) return campos.join("\n");
  return u.empresa ? `Empresa: ${u.empresa.nome}` : "";
}
