// Super Admin → Disparos por usuários (etapa 8c): todos os usuários agrupados por empresa,
// com o nome da empresa acima de cada grupo. Aqui o Admin da Empresa aparece também.
import { prisma, Cargo, Modulo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { ChipSaude, Pessoa } from "@/components/painel/Painel";
import { metricasPorUsuario, saudeDoNumero, VAZIO, type Saude } from "@/lib/metricas";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

function diasAte(d: Date) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d); fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86_400_000);
}

export default async function DisparosPorUsuariosPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const [empresas, individuais] = await Promise.all([
    prisma.empresa.findMany({ where: { modulo: Modulo.EMPRESARIAL }, include: { usuarios: { orderBy: [{ cargo: "asc" }, { nome: "asc" }] } }, orderBy: { nome: "asc" } }),
    prisma.usuario.findMany({ where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } }, orderBy: { nome: "asc" } }),
  ]);
  const ids = [...empresas.flatMap((e) => e.usuarios.map((x) => x.id)), ...individuais.map((x) => x.id)];
  const m = await metricasPorUsuario(ids);
  // Saúde só de quem envia (o Admin da Empresa não envia)
  const enviam = [...empresas.flatMap((e) => e.usuarios.filter((x) => x.cargo === Cargo.USUARIO)), ...individuais].map((x) => x.id);
  const saudes = new Map<string, Saude>(await Promise.all(enviam.map(async (id) => [id, await saudeDoNumero(id)] as const)));
  const Colunas = ({ id }: { id: string }) => { const v = m.get(id) ?? VAZIO; return <><td className="font-bold">{v.enviados}</td><td>{v.fila}</td><td>{v.bloqueados24h}</td><td>{v.qualificados}</td><td>{v.leads}</td><td><ChipSaude s={saudes.get(id) ?? null} /></td></>; };
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Super Admin • Disparos por usuários" titulo="Disparos por usuários" descricao="Todos os usuários agrupados por empresa, com o nome da empresa acima de cada grupo. Aqui o Admin da Empresa aparece também, para o Super Admin ver tudo. No login do Admin da Empresa, ele continua fora da lista e só aparece a própria empresa." />
      {empresas.map((e) => (
        <div key={e.id} className="mt-4" data-empresa={e.nome}>
          <h2 className="font-display font-bold text-[14px]">{e.codigo} • {e.nome} <span className="text-[11px] font-normal" style={{ color: "var(--muted)" }}>• {e.usuarios.length} usuários • Dias restantes: {diasAte(e.expiraEm)}</span></h2>
          {e.usuarios.length === 0 ? <div className="card p-3 mt-2"><p className="text-[12px]">Nenhum usuário nesta empresa ainda.</p></div> : (
            <div className="card p-3 mt-2"><div className="table-wrap"><table style={{ minWidth: 820, fontSize: 12 }}>
              <thead><tr><th>Usuário</th><th>Cargo</th><th>Enviados</th><th>Fila</th><th>Bloqueados</th><th>Qualificados</th><th>Leads</th><th>Saúde</th></tr></thead>
              <tbody>{e.usuarios.map((x) => (
                <tr key={x.id} data-usuario={x.nome}>
                  <td style={{ whiteSpace: "nowrap" }}><Pessoa nome={x.nome} detalhe={x.codigo} /></td>
                  <td>{x.cargo === Cargo.ADMIN_EMPRESA ? "Admin da Empresa" : "Usuário"}</td>
                  <Colunas id={x.id} />
                </tr>
              ))}</tbody>
            </table></div></div>
          )}
        </div>
      ))}
      <h2 className="font-display font-bold text-[14px] mt-4">Usuários Individuais</h2>
      {individuais.length === 0 ? <div className="card p-3 mt-2"><p className="text-[12px]">Nenhum usuário individual ainda.</p></div> : (
        <div className="card p-3 mt-2"><div className="table-wrap"><table style={{ minWidth: 760, fontSize: 12 }}>
          <thead><tr><th>Usuário</th><th>Enviados</th><th>Fila</th><th>Bloqueados</th><th>Qualificados</th><th>Leads</th><th>Saúde</th></tr></thead>
          <tbody>{individuais.map((x) => <tr key={x.id} data-usuario={x.nome}><td style={{ whiteSpace: "nowrap" }}><Pessoa nome={x.nome} detalhe={x.codigo} /></td><Colunas id={x.id} /></tr>)}</tbody>
        </table></div></div>
      )}
      <p className="help mt-3">Saúde do número (últimos 7 dias): Boa, Atenção ou Ruim conforme falhas, pedidos para sair, números sem WhatsApp e taxa de resposta. Passe o mouse para ver os números.</p>
    </section>
  );
}
