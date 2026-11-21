// Telas do menu que ainda não têm conteúdo: mostram o título e a etapa em que
// serão entregues (decisão #20). Nenhuma função é simulada aqui.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/session";
import { itemDaRota } from "@/lib/menu";
import Cabecalho from "@/components/app/Cabecalho";

export const dynamic = "force-dynamic";

export default async function SecaoEmConstrucao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  const caminho = (await headers()).get("x-pathname") || "";
  const u = sessao.usuario;
  const item = itemDaRota(u.cargo, caminho, u.cargo === "USUARIO" ? u.permissoes : undefined);
  if (!item) redirect("/dashboard");

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo={item.grupo + (item.subgrupo ? ` • ${item.subgrupo}` : "")} titulo={item.label} />
      <div className="card p-4 mt-3">
        <p className="text-[13px] font-bold">Esta tela será entregue na etapa {item.etapa}.</p>
        <p className="help mt-1">O menu e o acesso por perfil já estão funcionando; o conteúdo desta tela ainda não foi construído.</p>
      </div>
    </section>
  );
}
