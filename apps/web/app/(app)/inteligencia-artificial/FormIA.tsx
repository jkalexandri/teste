"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { salvarConfigIA, salvarCotacao, testarConfigIA } from "./actions";

type Modelo = { id: string; nome: string; entrada: number; saida: number };
type Inicial = { provedor: string; modelo: string; urlBase: string; temChave: boolean; precoEntrada: number; precoSaida: number };

export default function FormIA({ tarefa, titulo, inicial, modelosClaude, permitirSimulado }: {
  tarefa: string; titulo: string; inicial: Inicial; modelosClaude: Modelo[]; permitirSimulado: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [provedor, setProvedor] = useState(inicial.provedor);
  const [modelo, setModelo] = useState(inicial.modelo);
  const [precoEntrada, setPrecoEntrada] = useState(String(inicial.precoEntrada));
  const [precoSaida, setPrecoSaida] = useState(String(inicial.precoSaida));
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const claudeConhecido = modelosClaude.some((m) => m.id === modelo);

  function escolherModelo(id: string) {
    setModelo(id);
    const m = modelosClaude.find((x) => x.id === id);
    if (m) { setPrecoEntrada(String(m.entrada)); setPrecoSaida(String(m.saida)); }
  }

  return (
    <form
      className="card p-4 space-y-2"
      data-tarefa={tarefa}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        iniciar(async () => {
          const r = await salvarConfigIA(tarefa, fd);
          toast(r.mensagem, r.ok ? "ok" : "erro");
          setResultado(r.ok ? null : r);
          if (r.ok) {
            // Limpa o campo da chave (não existe no provedor "simulado")
            const campo = form.querySelector<HTMLInputElement>("input[name=chave]");
            if (campo) campo.value = "";
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-display font-bold text-[14px]">{titulo}</h2>
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`prov-${tarefa}`}>Provedor</label>
          <select id={`prov-${tarefa}`} name="provedor" className="input" value={provedor} onChange={(e) => { setProvedor(e.target.value); if (e.target.value === "anthropic") escolherModelo("claude-haiku-5-5"); }}>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="compativel">Padrão compatível (Gemini, OpenAI, Groq, própria…)</option>
            {permitirSimulado && <option value="simulado">Simulado (só testes, sem custo)</option>}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`mod-${tarefa}`}>Modelo</label>
          {provedor === "anthropic" && claudeConhecido ? (
            <select id={`mod-${tarefa}`} name="modelo" className="input" value={modelo} onChange={(e) => escolherModelo(e.target.value)}>
              {modelosClaude.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          ) : (
            <input id={`mod-${tarefa}`} name="modelo" className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="nome do modelo" />
          )}
        </div>
        {provedor === "compativel" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`url-${tarefa}`}>Endereço do provedor</label>
            <input id={`url-${tarefa}`} name="urlBase" className="input" defaultValue={inicial.urlBase} placeholder="https://api.exemplo.com/v1" />
          </div>
        )}
        {provedor !== "simulado" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`key-${tarefa}`}>Chave de acesso {inicial.temChave && <span className="chip ml-1" style={{ background: "var(--primary-soft)", color: "#087a44" }}>chave salva</span>}</label>
            <input id={`key-${tarefa}`} name="chave" type="password" autoComplete="off" className="input" placeholder={inicial.temChave ? "Deixe em branco para manter a chave salva" : "Cole a chave aqui"} />
            {inicial.temChave && <label className="flex items-center gap-1.5 text-[11px] mt-1"><input type="checkbox" name="removerChave" className="accent-emerald-600" /> Remover a chave salva</label>}
          </div>
        )}
        <div>
          <label className="label" htmlFor={`pe-${tarefa}`}>Preço de entrada (US$ / 1 mi tokens)</label>
          <input id={`pe-${tarefa}`} name="precoEntrada" className="input" value={precoEntrada} onChange={(e) => setPrecoEntrada(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`ps-${tarefa}`}>Preço de saída (US$ / 1 mi tokens)</label>
          <input id={`ps-${tarefa}`} name="precoSaida" className="input" value={precoSaida} onChange={(e) => setPrecoSaida(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button className="btn-primary" disabled={pendente}>Salvar</button>
        <button
          type="button"
          className="btn-ghost"
          disabled={pendente}
          onClick={(e) => {
            const fd = new FormData(e.currentTarget.form!);
            iniciar(async () => setResultado(await testarConfigIA(tarefa, fd)));
          }}
        >
          {pendente ? "Testando…" : "Testar"}
        </button>
      </div>
      {resultado && (
        <p className="text-[12px] rounded-lg p-2" data-testid="resultado-teste-ia" style={{ background: resultado.ok ? "var(--primary-soft)" : "#fff1f1", color: resultado.ok ? "#087a44" : "#b42318" }}>
          {resultado.mensagem}
        </p>
      )}
    </form>
  );
}

export function FormCotacao({ cotacao }: { cotacao: number | null }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="card p-4 mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => { const r = await salvarCotacao(fd); toast(r.mensagem, r.ok ? "ok" : "erro"); router.refresh(); });
      }}
    >
      <div>
        <label className="label" htmlFor="cotacao">Cotação do dólar (R$) para a tela de despesas</label>
        <input id="cotacao" name="cotacao" className="input !w-[160px]" defaultValue={cotacao ? String(cotacao).replace(".", ",") : ""} placeholder="ex.: 5,40" />
      </div>
      <button className="btn-primary" disabled={pendente}>Salvar cotação</button>
      <p className="help w-full">A IA é cobrada em dólar. Informe a cotação para ver também em reais (não é buscada automaticamente).</p>
    </form>
  );
}
