// Dashboard por perfil (estrutura da prévia, prompt seção 11).
// Só números reais do banco. Leads, campanhas e disparos ainda não existem
// (etapas 7 e 8), por isso aparecem zerados.
// Regras: sem linha TOTAL no fim do resumo por usuário; sem "— só a sua empresa";
// no Admin da Empresa, "Disparos por usuários" lista só os usuários (sem o Administrador).
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { diasRestantes } from "@/lib/auth/acesso";
import Cabecalho from "@/components/app/Cabecalho";
import { Clock3, Layers, Play, Send, ShieldCheck, Sparkles, TriangleAlert } from "@/components/icons";
import Link from "next/link";

export const dynamic = "force-dynamic";

function diasAte(d: Date) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}

function CardKpi({ icone, cor, valor, titulo, sub, selo }: {
  icone: ReactNode; cor: string; valor: number | string; titulo: string; sub?: string; selo: ReactNode;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--primary-soft)", color: cor }}>
          {icone}
        </div>
        {selo}
      </div>
      <div className="font-display text-[24px] font-extrabold mt-2 leading-none">{valor}</div>
      <div className="font-bold text-[12px] mt-1">{titulo}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

const seloTotal = (
  <span className="chip" style={{ background: "#0b2f1f", color: "#fff", fontSize: "9px", padding: "3px 6px" }}>Total</span>
);
const seloSeus = (
  <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)", fontSize: "9px", padding: "3px 6px" }}>Só seus dados</span>
);

const KPIS = [
  { titulo: "Fila de envios", cor: "#2563eb", icone: <Clock3 size={18} /> },
  { titulo: "Enviados hoje", cor: "var(--primary)", icone: <Send size={18} /> },
  { titulo: "Bloqueados 24h", cor: "#e5484d", icone: <ShieldCheck size={18} /> },
  { titulo: "Leads qualificados pela IA", cor: "#f59e0b", icone: <Sparkles size={18} /> },
];

export default async function DashboardPage() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  const u = sessao.usuario;

  // ================= SUPER ADMIN =================
  if (u.cargo === Cargo.SUPERADMIN) {
    const empresas = await prisma.empresa.findMany({
      where: { modulo: Modulo.EMPRESARIAL },
      include: { usuarios: { select: { id: true } } },
      orderBy: { nome: "asc" },
    });
    const individuais = await prisma.usuario.findMany({
      where: { cargo: Cargo.USUARIO, empresa: { modulo: Modulo.INDIVIDUAL } },
      include: { empresa: true },
      orderBy: { nome: "asc" },
    });
    const cards = [
      { l: "Empresas", v: empresas.length },
      { l: "Usuários Individuais", v: individuais.length },
      { l: "Leads (total)", v: 0 },
      { l: "Campanhas (total)", v: 0 },
      { l: "Enviados (total)", v: 0 },
      { l: "Em fila (total)", v: 0 },
      { l: "Bloqueados 24h (total)", v: 0 },
      { l: "Qualificados pela IA (total)", v: 0 },
    ];
    return (
      <section className="flex-1 flex flex-col">
        <Cabecalho
          rotulo="Super Admin • Dashboard"
          titulo="Visão geral"
          descricao="Total de todas as empresas + todos os usuários individuais, agrupados abaixo. Nunca misturado."
        />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
          {cards.map((c) => (
            <div key={c.l} className="card p-3">
              <div className="font-display text-[24px] font-extrabold leading-none">{c.v}</div>
              <div className="font-bold text-[12px] mt-1">{c.l}</div>
              <span className="chip mt-1" style={{ background: "#0b2f1f", color: "#fff", fontSize: "9px" }}>Total</span>
            </div>
          ))}
        </div>

        <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Empresas”</h2>
        {empresas.length === 0 ? (
          <div className="card p-3 mt-2"><p className="text-[12px]">Nenhuma empresa cadastrada ainda.</p></div>
        ) : (
          <div className="card p-3 mt-2">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Empresa</th><th>Usuários</th><th>Dias restantes</th><th>Leads</th><th>Campanhas</th><th>Enviados</th><th>Fila</th></tr>
                </thead>
                <tbody>
                  {empresas.map((e) => (
                    <tr key={e.id}>
                      <td className="font-bold">{e.nome}</td>
                      <td>{e.usuarios.length} / {e.limiteUsuarios}</td>
                      <td>{diasAte(e.expiraEm)}</td>
                      <td>0</td><td>0</td><td>0</td><td>0</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <h2 className="font-display font-bold text-[14px] mt-4">Grupo “Usuários Individuais”</h2>
        {individuais.length === 0 ? (
          <div className="card p-3 mt-2"><p className="text-[12px]">Nenhum usuário individual cadastrado ainda.</p></div>
        ) : (
          <div className="card p-3 mt-2">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Usuário individual</th><th>Dias restantes</th><th>Leads</th><th>Campanhas</th><th>Enviados</th><th>Fila</th></tr>
                </thead>
                <tbody>
                  {individuais.map((i) => (
                    <tr key={i.id}>
                      <td className="font-bold">
                        {i.nome}
                        <span className="block text-[11px] font-normal" style={{ color: "var(--muted)" }}>{i.email}</span>
                      </td>
                      <td>{i.empresa ? diasAte(i.empresa.expiraEm) : "—"}</td>
                      <td>0</td><td>0</td><td>0</td><td>0</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    );
  }

  // ================= ADMIN DA EMPRESA =================
  if (u.cargo === Cargo.ADMIN_EMPRESA) {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: u.empresaId, cargo: Cargo.USUARIO }, // sem o Administrador
      orderBy: { nome: "asc" },
    });
    const subs = [
      "Total de leads na fila • só os usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
      "Soma só dos usuários da sua empresa",
    ];
    return (
      <section className="flex-1 flex flex-col">
        <Cabecalho
          rotulo="Admin da Empresa • Dashboard"
          titulo="Visão geral"
          descricao={<>Acompanhamento por usuário da sua empresa: {u.empresa?.nome}. Outras empresas nunca aparecem aqui.</>}
          direita={<span className="chip" style={{ background: "#0b2f1f", color: "#fff" }}><Layers size={12} /> Total</span>}
        />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
          {KPIS.map((k, i) => (
            <CardKpi key={k.titulo} icone={k.icone} cor={k.cor} valor={0} titulo={k.titulo} sub={subs[i]} selo={seloTotal} />
          ))}
        </div>
        <div className="card p-3 mt-3 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <h2 className="font-display font-bold text-[14px]">Disparos por usuários</h2>
            <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
              {usuarios.length} {usuarios.length === 1 ? "usuário" : "usuários"} da sua empresa
            </span>
          </div>
          {usuarios.length === 0 ? (
            <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum usuário cadastrado na sua empresa ainda.</p>
          ) : (
            <div className="table-wrap mt-2">
              <table style={{ minWidth: "560px" }}>
                <thead>
                  <tr><th>Usuário</th><th>Enviados</th><th>Em fila</th><th>Bloqueados 24h</th><th>Qualificados pela IA</th></tr>
                </thead>
                <tbody>
                  {usuarios.map((x) => (
                    <tr key={x.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          <span style={{ width: 26, height: 26, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {(x.nome || "?")[0]}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <b>{x.nome}</b><span style={{ color: "var(--muted)" }}> • {x.email}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>0</td><td>0</td><td>0</td><td>0</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-3 mt-3 flex flex-wrap items-center gap-2">
          <TriangleAlert size={16} style={{ color: "#92400e" }} />
          <b className="text-[13px]">Admin não envia mensagens.</b>
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>Enviar, Conectar WhatsApp e Nova Campanha estão bloqueados para Admin.</span>
        </div>
      </section>
    );
  }

  // ================= USUÁRIO =================
  const dias = diasRestantes(sessao);
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const primeiroNome = u.nome.split(" ")[0];
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Visão geral • Hoje"
        titulo={<>{saudacao}, {primeiroNome} 👋</>}
        descricao={dias !== null ? `Seu acesso vale por mais ${dias} ${dias === 1 ? "dia" : "dias"}.` : undefined}
        direita={
          <div className="flex items-center gap-2">
            <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
              <ShieldCheck size={12} /> Só seus dados
            </span>
            <Link href="/campanhas" className="btn-primary"><Play size={14} /> Criar campanha</Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3 shrink-0">
        {KPIS.map((k) => (
          <CardKpi key={k.titulo} icone={k.icone} cor={k.cor} valor={0} titulo={k.titulo} selo={seloSeus} />
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.55fr_.85fr] gap-3 mt-3">
        <div className="card p-3">
          <h2 className="font-display font-bold text-[14px]">Leads recentes</h2>
          <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum lead ainda. O cadastro de leads chega na etapa 7.</p>
        </div>
        <div className="card p-3">
          <h3 className="font-display font-bold text-[13px]">Próximos na fila</h3>
          <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Fila vazia.</p>
        </div>
      </div>
    </section>
  );
}
