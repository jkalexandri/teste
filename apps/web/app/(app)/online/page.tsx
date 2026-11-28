// Online (decisão #102): quem está usando o sistema agora (ativo nos últimos 2 minutos), em que tela e por qual aparelho.
// Abas: Super Admin, Individual, Empresarial (agrupado por empresa) e Todos (com o último acesso).
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AtualizarSozinho from "@/components/app/AtualizarSozinho";
import { obterSessao } from "@/lib/auth/session";
import { nomeDaTela } from "@/lib/menu";
import { ONLINE_MS } from "@/lib/suporte";
import BotaoChamar from "./BotaoChamar";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";
const ABAS = [
  { id: "superadmin", label: "Super Admin" },
  { id: "individual", label: "Individual" },
  { id: "empresarial", label: "Business" },
  { id: "todos", label: "Todos" },
] as const;
type Aba = (typeof ABAS)[number]["id"];
const CARGOS: Record<string, string> = { SUPERADMIN: "Super Admin", ADMIN_EMPRESA: "Admin da Empresa", USUARIO: "Usuário" };

function quando(d: Date | null) {
  if (!d) return "Nunca entrou";
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function OnlinePage({ searchParams }: { searchParams: Promise<{ aba?: string; busca?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const p = await searchParams;
  const aba: Aba = (ABAS.some((a) => a.id === p.aba) ? p.aba : "superadmin") as Aba;
  const limite = new Date(Date.now() - ONLINE_MS);

  const usuarios = await prisma.usuario.findMany({
    where: { vistoEm: { gte: limite } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, email: true, codigo: true, cargo: true, telaAtual: true, aparelho: true, vistoEm: true, empresa: { select: { id: true, nome: true, codigo: true, modulo: true } } },
  });
  const ehIndividual = (u: (typeof usuarios)[number]) => u.cargo !== Cargo.SUPERADMIN && u.empresa?.modulo === Modulo.INDIVIDUAL;
  const ehEmpresarial = (u: (typeof usuarios)[number]) => u.cargo !== Cargo.SUPERADMIN && u.empresa?.modulo === Modulo.EMPRESARIAL;
  const contagem = {
    superadmin: usuarios.filter((u) => u.cargo === Cargo.SUPERADMIN).length,
    individual: usuarios.filter(ehIndividual).length,
    empresarial: usuarios.filter(ehEmpresarial).length,
    todos: usuarios.length,
  };

  // Aba Todos: todas as contas, com o último acesso (online primeiro)
  const busca = (p.busca ?? "").trim();
  const todos = aba === "todos"
    ? await prisma.usuario.findMany({
        where: busca ? { OR: [{ nome: { contains: busca, mode: "insensitive" } }, { email: { contains: busca, mode: "insensitive" } }, { empresa: { nome: { contains: busca, mode: "insensitive" } } }] } : {},
        orderBy: [{ vistoEm: { sort: "desc", nulls: "last" } }, { nome: "asc" }],
        take: 300,
        select: { id: true, nome: true, email: true, codigo: true, cargo: true, telaAtual: true, aparelho: true, vistoEm: true, empresa: { select: { id: true, nome: true, codigo: true, modulo: true } } },
      })
    : [];

  type Linha = (typeof usuarios)[number];
  const tabela = (linhas: Linha[], comUltimo = false) => (
    <div className="table-wrap">
      <table style={{ fontSize: 12, minWidth: 720 }} data-testid="tabela-online">
        <thead><tr><th>Nome</th><th>Perfil</th>{aba === "todos" && <th>Conta</th>}<th>Tela</th><th>Aparelho</th><th>{comUltimo ? "Último acesso" : "Ativo"}</th><th></th></tr></thead>
        <tbody>
          {linhas.map((u) => {
            const on = !!u.vistoEm && u.vistoEm >= limite;
            return (
              <tr key={u.id} data-online={on ? "sim" : "nao"}>
                <td><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: on ? "#16a34a" : "#9ca3af" }} aria-label={on ? "Online" : "Offline"} /><b>{u.nome}</b><br /><span style={{ color: "var(--muted)" }}>{u.codigo ? `${u.codigo} • ` : ""}{u.email}</span></td>
                <td>{CARGOS[u.cargo]}</td>
                {aba === "todos" && <td>{u.empresa ? `${u.empresa.modulo === Modulo.EMPRESARIAL ? "Empresa" : "Individual"}: ${u.empresa.nome}` : "Plataforma"}</td>}
                <td>{on ? nomeDaTela(u.telaAtual) : "—"}</td>
                <td>{on ? u.aparelho ?? "—" : "—"}</td>
                <td>{quando(u.vistoEm)}</td>
                <td className="whitespace-nowrap">{u.cargo !== Cargo.SUPERADMIN && <><BotaoChamar usuarioId={u.id} /> <Link className="btn-ghost !py-1 !px-2 !text-[11px]" href={`/atendimento?cliente=${u.id}`}>Conversa</Link></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const vazio = <p className="text-[12px]" style={{ color: "var(--muted)" }}>Ninguém online nesta aba agora.</p>;
  let conteudo;
  if (aba === "superadmin") { const l = usuarios.filter((u) => u.cargo === Cargo.SUPERADMIN); conteudo = l.length ? tabela(l) : vazio; }
  else if (aba === "individual") { const l = usuarios.filter(ehIndividual); conteudo = l.length ? tabela(l) : vazio; }
  else if (aba === "empresarial") {
    const l = usuarios.filter(ehEmpresarial);
    const grupos = new Map<string, { nome: string; codigo: string | null; linhas: Linha[] }>();
    for (const u of l) {
      const g = grupos.get(u.empresa!.id) ?? { nome: u.empresa!.nome, codigo: u.empresa!.codigo, linhas: [] };
      g.linhas.push(u);
      grupos.set(u.empresa!.id, g);
    }
    conteudo = l.length ? [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((g) => (
      <div key={g.nome} className="mb-3" data-testid="grupo-empresa">
        <p className="text-[13px] font-extrabold mb-1">{g.codigo ? `${g.codigo} • ` : ""}{g.nome} <span className="font-normal" style={{ color: "var(--muted)" }}>({g.linhas.length} online)</span></p>
        {tabela(g.linhas)}
      </div>
    )) : vazio;
  } else {
    conteudo = (
      <>
        <form method="get" className="flex gap-2 mb-2"><input type="hidden" name="aba" value="todos" /><input name="busca" className="input !py-1.5 !w-[260px]" placeholder="Buscar nome, e-mail ou empresa" defaultValue={busca} aria-label="Buscar" /><button className="btn-primary">Buscar</button></form>
        {todos.length ? tabela(todos as Linha[], true) : <p className="text-[12px]">Nenhuma conta encontrada.</p>}
      </>
    );
  }

  return (
    <section className="flex-1 flex flex-col">
      <AtualizarSozinho segundos={20} />
      <Cabecalho rotulo="Principal • Online" titulo="Online" descricao="Quem usou o sistema nos últimos 2 minutos, a tela aberta e o aparelho. Atualiza sozinho a cada 20 segundos." />
      <nav className="flex flex-wrap gap-1.5 mt-3" aria-label="Abas do Online">
        {ABAS.map((a) => (
          <Link key={a.id} href={`/online?aba=${a.id}`} className={aba === a.id ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"} aria-current={aba === a.id ? "page" : undefined}>
            {a.label} <span className="ml-1 font-extrabold" data-testid={`conta-${a.id}`}>{contagem[a.id]}</span>
          </Link>
        ))}
      </nav>
      <div className="card p-3 mt-3">{conteudo}</div>
    </section>
  );
}
