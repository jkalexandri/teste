// Logs (decisão #99): histórico de ações dos últimos 90 dias.
// Admin da Empresa: só a empresa dele. Super Admin: tudo, com filtro por conta.
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo, type Prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import { DIAS_LOG, TIPOS_LOG } from "@/lib/logs";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";
const POR_PAGINA = 100;

type Busca = { conta?: string; usuario?: string; tipo?: string; de?: string; ate?: string; pagina?: string };

export default async function LogsPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  const u = s.usuario;
  const sa = u.cargo === Cargo.SUPERADMIN;
  if (!sa && u.cargo !== Cargo.ADMIN_EMPRESA) redirect("/dashboard");
  const p = await searchParams;

  const where: Prisma.LogWhereInput = {};
  if (!sa) where.empresaId = u.empresaId ?? "-";
  else if (p.conta === "plataforma") where.empresaId = null;
  else if (p.conta) where.empresaId = p.conta;
  if (p.usuario) where.usuarioId = p.usuario;
  if (p.tipo && p.tipo in TIPOS_LOG) where.tipo = p.tipo;
  const de = p.de ? new Date(`${p.de}T00:00:00-03:00`) : null, ate = p.ate ? new Date(`${p.ate}T23:59:59.999-03:00`) : null;
  if ((de && !isNaN(+de)) || (ate && !isNaN(+ate))) where.criadoEm = { ...(de && !isNaN(+de) ? { gte: de } : {}), ...(ate && !isNaN(+ate) ? { lte: ate } : {}) };
  const pagina = Math.max(1, Number(p.pagina) || 1);

  const [total, logs, contas, usuarios] = await Promise.all([
    prisma.log.count({ where }),
    prisma.log.findMany({ where, orderBy: { criadoEm: "desc" }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    sa ? prisma.empresa.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, codigo: true, modulo: true } }) : Promise.resolve([]),
    !sa ? prisma.usuario.findMany({ where: { empresaId: u.empresaId ?? "-" }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }) : Promise.resolve([]),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v && k !== "pagina")), pagina: String(n) } as Record<string, string>).toString()}`;

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Sistema • Logs" titulo="Logs" descricao={`Histórico de ações dos últimos ${DIAS_LOG} dias${sa ? " de todas as contas" : " da sua empresa"}.`} />
      <form method="get" className="card p-3 mt-3 flex flex-wrap items-end gap-2">
        {sa ? (
          <div>
            <label className="label" htmlFor="log-conta">Conta</label>
            <select id="log-conta" name="conta" className="input !py-1.5 !w-auto" defaultValue={p.conta ?? ""}>
              <option value="">Todas</option>
              <option value="plataforma">Super Admin / plataforma</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.modulo === Modulo.EMPRESARIAL ? "Empresa" : "Individual"}: {c.codigo ? `${c.codigo} • ` : ""}{c.nome}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="log-usuario">Usuário</label>
            <select id="log-usuario" name="usuario" className="input !py-1.5 !w-auto" defaultValue={p.usuario ?? ""}>
              <option value="">Todos</option>
              {usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="log-tipo">Tipo</label>
          <select id="log-tipo" name="tipo" className="input !py-1.5 !w-auto" defaultValue={p.tipo ?? ""}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_LOG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="log-de">De</label><input id="log-de" name="de" type="date" className="input !py-1.5 !w-auto" defaultValue={p.de ?? ""} /></div>
        <div><label className="label" htmlFor="log-ate">Até</label><input id="log-ate" name="ate" type="date" className="input !py-1.5 !w-auto" defaultValue={p.ate ?? ""} /></div>
        <button className="btn-primary">Filtrar</button>
      </form>
      <div className="card p-3 mt-3">
        <p className="text-[12px] mb-2" data-testid="total-logs"><b>{total.toLocaleString("pt-BR")}</b> registro{total === 1 ? "" : "s"}{paginas > 1 ? ` • página ${pagina} de ${paginas}` : ""}</p>
        {logs.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nenhum registro com estes filtros.</p>
        ) : (
          <div className="table-wrap">
            <table style={{ fontSize: 12, minWidth: 720 }} data-testid="tabela-logs">
              <thead><tr><th>Data e hora</th><th>Tipo</th><th>Quem</th><th>O que aconteceu</th>{sa && <th>IP</th>}</tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{l.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{TIPOS_LOG[l.tipo as keyof typeof TIPOS_LOG] ?? l.tipo}</td>
                    <td className="[overflow-wrap:anywhere]">{l.quem || "—"}</td>
                    <td className="[overflow-wrap:anywhere]">{l.texto}</td>
                    {sa && <td style={{ whiteSpace: "nowrap" }}>{l.ip ?? "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <div className="flex gap-2 justify-end mt-2">
            {pagina > 1 && <a className="btn-ghost !py-1" href={link(pagina - 1)}>← Anterior</a>}
            {pagina < paginas && <a className="btn-ghost !py-1" href={link(pagina + 1)}>Próxima →</a>}
          </div>
        )}
      </div>
    </section>
  );
}
