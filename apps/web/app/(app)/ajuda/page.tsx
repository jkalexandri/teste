// Ajuda (decisão #101): manuais do perfil de quem está logado e a versão do sistema.
import Link from "next/link";
import { redirect } from "next/navigation";
import Cabecalho from "@/components/app/Cabecalho";
import { obterSessao } from "@/lib/auth/session";
import { manuaisDoPerfil } from "@/lib/ajuda";
import { VERSAO_CURTA, VERSAO_DATA } from "@/lib/versao";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function AjudaPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  const manuais = manuaisDoPerfil(s.usuario.cargo);
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Sistema • Ajuda" titulo="Ajuda" descricao={`Manuais do FilaPro Leads • versão ${VERSAO_CURTA}${VERSAO_DATA ? ` de ${VERSAO_DATA}` : ""}`} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
        {manuais.map((m) => (
          <Link key={m.id} href={`/ajuda/${m.id}`} className="card p-4 hover:shadow-md transition-shadow" data-testid="manual">
            <h2 className="font-display font-extrabold text-[16px]">{m.titulo}</h2>
            <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>{m.resumo}</p>
            <span className="text-[12px] font-bold mt-2 inline-block" style={{ color: "var(--primary)" }}>Abrir →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
