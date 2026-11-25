// Leads (etapa 7). Uma tela para os três perfis (decisão #56):
// Usuário → só os próprios leads; Admin da Empresa → leads de todos os usuários da empresa;
// Super Admin → todos, com filtro por empresa / usuário individual / os próprios.
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo, StatusLead, type Prisma } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import { donosPermitidos, escopoLeads, permissoesLeads, type Ator } from "@/lib/leads";
import { LISTA_STATUS } from "@/lib/leads-status";
import { formatarTelefone } from "@/lib/telefone";
import ListaLeads, { type LinhaTabela } from "./ListaLeads";
import AdicionarLeads from "./AdicionarLeads";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";
const POR_PAGINA = 50;

type Busca = { q?: string; usuario?: string; conta?: string; status?: string; situacao?: string; pagina?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  const u = s.usuario;
  const a: Ator = { id: u.id, cargo: u.cargo, empresaId: u.empresaId, empresa: u.empresa ? { modulo: u.empresa.modulo } : null };
  const f = await searchParams;
  const pagina = Math.max(1, parseInt(f.pagina || "1", 10) || 1);

  // Filtros
  const where: Prisma.LeadWhereInput = { AND: [escopoLeads(a)] };
  const e = where.AND as Prisma.LeadWhereInput[];
  const q = (f.q || "").trim();
  if (q) {
    const dig = q.replace(/\D/g, "");
    e.push({
      OR: [
        { nome: { contains: q, mode: "insensitive" } },
        { codigo: { equals: q.toUpperCase() } },
        ...(dig.length >= 4 ? [{ telefone: { contains: dig } }] : []),
      ],
    });
  }
  if (f.usuario && u.cargo !== Cargo.USUARIO) e.push({ usuarioId: f.usuario });
  if (f.conta && u.cargo === Cargo.SUPERADMIN) e.push(f.conta === "meus" ? { usuarioId: u.id } : { empresaId: f.conta });
  if (f.status && LISTA_STATUS.includes(f.status as never)) e.push({ status: f.status as StatusLead });
  if (f.situacao === "inativos") e.push({ ativo: false });
  else if (f.situacao !== "todos") e.push({ ativo: true });

  const [total, leads, totalGeral, donos, contas] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { usuario: { select: { nome: true } }, empresa: { select: { nome: true } } },
    }),
    prisma.lead.count({ where: escopoLeads(a) }),
    donosPermitidos(a),
    u.cargo === Cargo.SUPERADMIN
      ? prisma.empresa.findMany({ select: { id: true, nome: true, codigo: true, modulo: true }, orderBy: [{ modulo: "desc" }, { nome: "asc" }] })
      : Promise.resolve([]),
  ]);

  const linhas: LinhaTabela[] = leads.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    nome: l.nome,
    telefone: l.telefone,
    telefoneFmt: formatarTelefone(l.telefone),
    status: l.status,
    ativo: l.ativo,
    pediuSairEm: l.pediuSairEm?.toISOString() ?? null,
    qualificacao: l.qualificacao,
    qualificacaoMotivo: l.qualificacaoMotivo,
    qualificacaoEm: l.qualificacaoEm?.toISOString() ?? null,
    usuario: `${l.codigoUsuario} • ${l.usuario.nome}`,
    conta: l.empresa ? `${l.codigoEmpresa} • ${l.empresa.nome}` : "Super Admin",
  }));

  const titulo =
    u.cargo === Cargo.SUPERADMIN
      ? { rotulo: "Super Admin • Leads", titulo: "Leads", descricao: "Todos os leads, por empresa e por usuário individual. Você também pode cadastrar leads para você ou para qualquer usuário." }
      : u.cargo === Cargo.ADMIN_EMPRESA
        ? { rotulo: "Admin • Leads", titulo: "Leads da empresa", descricao: "Leads de todos os usuários da empresa. Cadastre ou importe escolhendo o usuário dono do lead." }
        : { rotulo: "Leads", titulo: "Seus leads", descricao: "Adicione um a um ou cole vários de uma vez." };

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo={titulo.rotulo} titulo={titulo.titulo} descricao={titulo.descricao} />
      <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-3 mt-3 flex-1 items-start">
        <ListaLeads
          linhas={linhas}
          total={total}
          totalGeral={totalGeral}
          pagina={pagina}
          porPagina={POR_PAGINA}
          filtros={{ q, usuario: f.usuario ?? "", conta: f.conta ?? "", status: f.status ?? "", situacao: f.situacao ?? "" }}
          perfil={u.cargo}
          pode={permissoesLeads(a)}
          usuarios={u.cargo === Cargo.USUARIO ? [] : donos.filter((d) => d.cargo === Cargo.USUARIO).map((d) => ({ id: d.id, rotulo: `${d.codigo} • ${d.nome}${u.cargo === Cargo.SUPERADMIN && d.empresa ? ` (${d.empresa.nome})` : ""}` }))}
          contas={contas.map((c) => ({ id: c.id, rotulo: `${c.codigo} • ${c.nome}`, grupo: c.modulo === Modulo.EMPRESARIAL ? "Empresas" : "Usuários individuais" }))}
        />
        <AdicionarLeads
          donos={donos.map((d) => ({
            id: d.id,
            rotulo: d.id === u.id ? `${d.codigo} • Você (${d.nome})` : `${d.codigo} • ${d.nome}${u.cargo === Cargo.SUPERADMIN && d.empresa ? ` (${d.empresa.nome})` : ""}`,
          }))}
          escolherDono={permissoesLeads(a).escolherDono}
          meuId={u.id}
        />
      </div>
    </section>
  );
}
