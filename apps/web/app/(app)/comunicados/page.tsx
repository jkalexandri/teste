// Mensagens aos usuários (decisão #102): enviar e acompanhar quem leu (clicou OK).
import { redirect } from "next/navigation";
import { prisma, Cargo, Modulo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import FormComunicado from "./FormComunicado";

export const dynamic = "force-dynamic";
const dataBR = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function ComunicadosPage() {
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");

  const [empresas, usuarios, comunicados] = await Promise.all([
    prisma.empresa.findMany({ where: { modulo: Modulo.EMPRESARIAL }, orderBy: { nome: "asc" }, select: { id: true, nome: true, codigo: true } }),
    prisma.usuario.findMany({ where: { cargo: { not: Cargo.SUPERADMIN }, status: "ATIVO" }, orderBy: { nome: "asc" }, take: 2000, select: { id: true, nome: true, email: true, empresa: { select: { nome: true } } } }),
    prisma.comunicado.findMany({
      orderBy: { criadoEm: "desc" },
      take: 50,
      include: { destinos: { select: { usuarioId: true, lidoEm: true } } },
    }),
  ]);
  const ids = [...new Set(comunicados.flatMap((c) => c.destinos.map((d) => d.usuarioId)))];
  const nomes = new Map((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, email: true } })).map((x) => [x.id, `${x.nome} (${x.email})`]));

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Principal • Mensagens aos usuários" titulo="Mensagens aos usuários" descricao="Avisos em popup na tela dos usuários, com relatório de quem leu." />
      <div className="card p-4 mt-3">
        <FormComunicado
          empresas={empresas.map((e) => ({ id: e.id, rotulo: `${e.codigo ? `${e.codigo} • ` : ""}${e.nome}` }))}
          usuarios={usuarios.map((u) => ({ id: u.id, rotulo: `${u.nome} • ${u.email}${u.empresa ? ` • ${u.empresa.nome}` : ""}` }))}
        />
      </div>
      <div className="card p-3 mt-3">
        <h2 className="font-display font-extrabold text-[15px] mb-2">Enviadas</h2>
        {comunicados.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nenhuma mensagem enviada ainda.</p>
        ) : (
          <div className="grid gap-2" data-testid="lista-comunicados">
            {comunicados.map((c) => {
              const lidos = c.destinos.filter((d) => d.lidoEm);
              const pendentes = c.destinos.filter((d) => !d.lidoEm);
              const vencido = c.validoAte && c.validoAte < new Date();
              return (
                <details key={c.id} className="rounded-lg p-2" style={{ border: "1px solid var(--border)" }} data-testid="comunicado">
                  <summary className="cursor-pointer text-[13px]">
                    <b>{c.titulo}</b> <span style={{ color: "var(--muted)" }}>• {dataBR(c.criadoEm)} • {c.publico}</span>{" "}
                    <span className="font-extrabold" data-testid="leitura">{lidos.length} de {c.destinos.length} leram</span>
                    {c.validoAte && <span style={{ color: vencido ? "#b42318" : "var(--muted)" }}> • {vencido ? "vencida em" : "vale até"} {c.validoAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
                  </summary>
                  <p className="text-[12px] whitespace-pre-wrap mt-2">{c.texto}</p>
                  {c.link && <p className="text-[12px] mt-1">Link: <a className="underline" href={c.link} target="_blank" rel="noreferrer noopener">{c.link}</a></p>}
                  <div className="grid sm:grid-cols-2 gap-2 mt-2 text-[12px]">
                    <div><b>Leram ({lidos.length})</b><ul className="mt-1">{lidos.map((d) => <li key={d.usuarioId}>✓ {nomes.get(d.usuarioId) ?? "—"} <span style={{ color: "var(--muted)" }}>• {dataBR(d.lidoEm!)}</span></li>)}</ul></div>
                    <div><b>Ainda não leram ({pendentes.length})</b><ul className="mt-1">{pendentes.map((d) => <li key={d.usuarioId}>• {nomes.get(d.usuarioId) ?? "—"}</li>)}</ul></div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
