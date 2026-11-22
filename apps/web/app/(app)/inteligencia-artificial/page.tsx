// Super Admin → Inteligência Artificial (decisões #72, #75 e #77).
import { prisma } from "@filapro/db";
import { MODELOS_CLAUDE, PADRAO, TAREFAS } from "@filapro/ia";
import Cabecalho from "@/components/app/Cabecalho";
import { IS_PRODUCTION } from "@/lib/env";
import FormIA, { FormCotacao } from "./FormIA";

export const dynamic = "force-dynamic";

export default async function InteligenciaArtificialPage() {
  const [configs, venda] = await Promise.all([prisma.configIA.findMany(), prisma.configVenda.findUnique({ where: { id: "config" } })]);
  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho
        rotulo="Super Admin • Configurações"
        titulo="Inteligência Artificial"
        descricao="Escolha a IA de cada tarefa sem mexer no código. Padrão: Claude Haiku 5.5, o mais barato. Teste antes de salvar."
      />
      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        {(Object.keys(TAREFAS) as (keyof typeof TAREFAS)[]).map((t) => {
          const c = configs.find((x) => x.tarefa === t);
          return (
            <FormIA
              key={t}
              tarefa={t}
              titulo={TAREFAS[t]}
              inicial={{
                provedor: c?.provedor ?? PADRAO.provedor,
                modelo: c?.modelo ?? PADRAO.modelo,
                urlBase: c?.urlBase ?? "",
                temChave: !!c?.chave,
                precoEntrada: c?.precoEntrada ?? PADRAO.entrada,
                precoSaida: c?.precoSaida ?? PADRAO.saida,
              }}
              modelosClaude={MODELOS_CLAUDE.map((m) => ({ ...m }))}
              permitirSimulado={!IS_PRODUCTION}
            />
          );
        })}
      </div>
      <FormCotacao cotacao={venda?.cotacaoDolar ?? null} />
      <p className="help mt-2">
        Economia aplicada automaticamente: instruções e ficha da empresa em cache (custam ~10% a partir da segunda chamada), respostas curtas,
        esforço baixo e mensagem principal + variações numa única chamada.
      </p>
    </section>
  );
}
