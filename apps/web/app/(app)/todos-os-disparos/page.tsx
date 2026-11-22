// Todos os disparos (etapa 8c — prompt seção 11).
// Admin da Empresa: só os usuários da sua empresa (sem outras empresas, sem conversas).
// Super Admin: total de todas as empresas + usuários individuais, em grupos separados.
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo, StatusCampanha } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import Cabecalho from "@/components/app/Cabecalho";
import { CartoesTotal, ChipSaude, Pessoa } from "@/components/painel/Painel";
import { metricasPorUsuario, saudeDoNumero, somar, VAZIO } from "@/lib/metricas";

export const dynamic = "force-dynamic";
const ATIVAS: StatusCampanha[] = [StatusCampanha.EM_ANDAMENTO, StatusCampanha.AGENDADA, StatusCampanha.PAUSADA];
const ROTULO: Record<string, string> = { EM_ANDAMENTO: "Em andamento", AGENDADA: "Agendada", PAUSADA: "Pausada" };

export default async function TodosDisparosPage({ searchParams }: { searchParams: Promise<{ usuario?: string }> }) {
  const s = await obterSessao();
  if (!s) redirect("/login");
  const u = s.usuario;
  const f = await searchParams;

  // ===== Admin da Empresa =====
  if (u.cargo === Cargo.ADMIN_EMPRESA) {
    const usuarios = await prisma.usuario.findMany({ where: { empresaId: u.empresaId, cargo: Cargo.USUARIO }, orderBy: { nome: "asc" } });
    const filtrados = f.usuario ? usuarios.filter((x) => x.id === f.usuario) : usuarios;
    const m = await metricasPorUsuario(filtrados.map((x) => x.id));
    const saudes = new Map(await Promise.all(filtrados.map(async (x) => [x.id, await saudeDoNumero(x.id)] as const)));
    const total = somar(filtrados.map((x) => m.get(x.id) ?? VAZIO));
    const campanhas = await prisma.campanha.findMany({
      where: { usuarioId: { in: filtrados.map((x) => x.id) }, status: { in: ATIVAS } },
      include: { usuario: { select: { nome: true } }, _count: { select: { envios: true } } },
      orderBy: { atualizadoEm: "desc" },
      take: 50,
    });
    const enviadosCamp = await prisma.envio.groupBy({ by: ["campanhaId"], where: { campanhaId: { in: campanhas.map((c) => c.id) }, status: "ENVIADO" }, _count: { _all: true } });
    return (
      <section className="flex-1 flex flex-col">
        <Cabecalho rotulo="Admin da Empresa • Todos os disparos" titulo="Visão geral dos disparos" descricao={`Só os usuários da sua empresa: ${u.empresa?.nome}. Nenhuma outra empresa aparece aqui e nenhuma conversa detalhada é exibida nesta visão.`} />
        <form className="flex flex-wrap gap-2 mt-2 items-center" action="/todos-os-disparos">
          <span className="chip" style={{ background: "#0b2f1f", color: "#fff" }}>Total</span>
          <label className="label !mb-0" htmlFor="filtro-usuario-disparos">Filtrar por usuário</label>
          <select id="filtro-usuario-disparos" name="usuario" defaultValue={f.usuario ?? ""} className="input !w-auto !py-1.5">
            <option value="">Todos os usuários</option>
            {usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <button className="btn-ghost !py-1.5">Filtrar</button>
          {f.usuario && <a href="/todos-os-disparos" className="text-[12px] underline">Limpar filtro</a>}
        </form>
        <CartoesTotal itens={[{ l: "Enviados", v: total.enviados }, { l: "Em fila", v: total.fila }, { l: "Bloqueados 24h", v: total.bloqueados24h }, { l: "Qualificados pela IA", v: total.qualificados }]} />
        <div className="card p-3 mt-3">
          <h2 className="font-display font-bold text-[14px]">Disparos por usuários</h2>
          {filtrados.length === 0 ? <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum usuário cadastrado na sua empresa ainda.</p> : (
            <div className="table-wrap mt-2">
              <table style={{ minWidth: 700, fontSize: 12 }}>
                <thead><tr><th>Usuário</th><th>Enviados</th><th>Enviados hoje</th><th>Em fila</th><th>Bloqueados 24h</th><th>Qualificados pela IA</th><th>Saúde do número</th></tr></thead>
                <tbody>
                  {filtrados.map((x) => { const v = m.get(x.id) ?? VAZIO; return (
                    <tr key={x.id} data-usuario={x.nome}>
                      <td style={{ whiteSpace: "nowrap" }}><Pessoa nome={x.nome} detalhe={x.email} /></td>
                      <td className="font-bold">{v.enviados}</td><td>{v.enviadosHoje}</td><td>{v.fila}</td><td>{v.bloqueados24h}</td><td>{v.qualificados}</td>
                      <td><ChipSaude s={saudes.get(x.id) ?? null} /></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-3 mt-3">
          <h2 className="font-display font-bold text-[14px]">Campanhas ativas</h2>
          {campanhas.length === 0 ? <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhuma campanha em andamento, agendada ou pausada.</p> : (
            <div className="table-wrap mt-2">
              <table style={{ minWidth: 640, fontSize: 12 }}>
                <thead><tr><th>Campanha</th><th>Usuário</th><th>Situação</th><th>Enviados / Total</th></tr></thead>
                <tbody>
                  {campanhas.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.assunto || "(sem assunto)"}</b>{c.motivo && <span className="block text-[11px]" style={{ color: "#8a5a00" }}>{c.motivo}</span>}</td>
                      <td>{c.usuario.nome}</td>
                      <td>{ROTULO[c.status]}</td>
                      <td>{enviadosCamp.find((e) => e.campanhaId === c.id)?._count._all ?? 0} / {c.totalLeads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ===== Super Admin =====
  const [empresas, individuais] = await Promise.all([
    prisma.empresa.findMany({ where: { modulo: Modulo.EMPRESARIAL }, include: { usuarios: { select: { id: true } } }, orderBy: { nome: "asc" } }),
    prisma.usuario.findMany({ where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } }, orderBy: { nome: "asc" } }),
  ]);
  const todos = [...empresas.flatMap((e) => e.usuarios.map((x) => x.id)), ...individuais.map((x) => x.id), u.id];
  const m = await metricasPorUsuario(todos);
  const total = somar(todos.map((id) => m.get(id) ?? VAZIO));
  const meu = m.get(u.id) ?? VAZIO;
  const Linhas = ({ v }: { v: typeof VAZIO }) => (<><td className="font-bold">{v.enviados}</td><td>{v.fila}</td><td>{v.bloqueados24h}</td><td>{v.qualificados}</td><td>{v.campanhas}</td></>);
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Super Admin • Todos os disparos" titulo="Todos os disparos" descricao="Total de todas as empresas + todos os usuários individuais, agrupados abaixo." />
      <CartoesTotal itens={[{ l: "Enviados", v: total.enviados }, { l: "Em fila", v: total.fila }, { l: "Bloqueados 24h", v: total.bloqueados24h }, { l: "Qualificados pela IA", v: total.qualificados }]} />
      <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Empresas”</h2>
      {empresas.length === 0 ? <div className="card p-3 mt-2"><p className="text-[12px]">Nenhuma empresa cadastrada ainda.</p></div> : (
        <div className="card p-3 mt-2"><div className="table-wrap"><table style={{ fontSize: 12 }}>
          <thead><tr><th>Empresa</th><th>Enviados</th><th>Fila</th><th>Bloqueados</th><th>Qualificados</th><th>Campanhas</th></tr></thead>
          <tbody>{empresas.map((e) => <tr key={e.id} data-empresa={e.nome}><td className="font-bold">{e.codigo} • {e.nome}</td><Linhas v={somar(e.usuarios.map((x) => m.get(x.id) ?? VAZIO))} /></tr>)}</tbody>
        </table></div></div>
      )}
      <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Usuários Individuais”</h2>
      {individuais.length === 0 ? <div className="card p-3 mt-2"><p className="text-[12px]">Nenhum usuário individual com disparos ainda.</p></div> : (
        <div className="card p-3 mt-2"><div className="table-wrap"><table style={{ fontSize: 12 }}>
          <thead><tr><th>Usuário individual</th><th>Enviados</th><th>Fila</th><th>Bloqueados</th><th>Qualificados</th><th>Campanhas</th></tr></thead>
          <tbody>{individuais.map((x) => <tr key={x.id} data-usuario={x.nome}><td className="font-bold">{x.codigo} • {x.nome}</td><Linhas v={m.get(x.id) ?? VAZIO} /></tr>)}</tbody>
        </table></div></div>
      )}
      {(meu.campanhas > 0 || meu.enviados > 0) && (
        <>
          <h2 className="font-display font-bold text-[14px] mt-4">Seus disparos (Super Admin)</h2>
          <div className="card p-3 mt-2"><div className="table-wrap"><table style={{ fontSize: 12 }}>
            <thead><tr><th>Super Admin</th><th>Enviados</th><th>Fila</th><th>Bloqueados</th><th>Qualificados</th><th>Campanhas</th></tr></thead>
            <tbody><tr><td className="font-bold">{u.codigo} • {u.nome}</td><Linhas v={meu} /></tr></tbody>
          </table></div></div>
        </>
      )}
    </section>
  );
}
