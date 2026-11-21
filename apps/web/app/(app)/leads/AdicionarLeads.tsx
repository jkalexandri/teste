"use client";

// Adicionar leads (decisão #53): um a um, colando vários ("Nome; telefone") ou por arquivo
// .xlsx / .csv — com resumo para conferir antes de salvar. Admin e Super Admin escolhem o dono.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { Plus } from "@/components/icons";
import { adicionarUm, analisarArquivo, salvarColados, salvarImportacao, type Analise } from "./actions";

type Opcao = { id: string; rotulo: string };

export default function AdicionarLeads({ donos, escolherDono, meuId }: { donos: Opcao[]; escolherDono: boolean; meuId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [dono, setDono] = useState(escolherDono ? (donos.find((d) => d.id === meuId)?.id ?? "") : meuId);
  const [colado, setColado] = useState("");
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const semDono = escolherDono && !dono;
  function terminar(r: { ok: boolean; mensagem: string }, limpar?: () => void) {
    setResultado(r);
    toast(r.mensagem, r.ok ? "ok" : "erro");
    if (r.ok) limpar?.();
    router.refresh();
  }

  return (
    <div className="card p-3 flex flex-col">
      <h2 className="font-display font-bold text-[14px]">Adicionar leads</h2>

      {escolherDono && (
        <div className="mt-2">
          <label className="label" htmlFor="dono">Dono dos leads</label>
          <select id="dono" className="input" value={dono} onChange={(e) => setDono(e.target.value)}>
            <option value="">Escolha o usuário</option>
            {donos.map((d) => <option key={d.id} value={d.id}>{d.rotulo}</option>)}
          </select>
        </div>
      )}

      {/* Um a um */}
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          fd.set("donoId", dono);
          iniciar(async () => terminar(await adicionarUm(fd), () => form.reset()));
        }}
      >
        <div>
          <label className="label" htmlFor="ln">Nome</label>
          <input id="ln" name="nome" className="input" placeholder="Nome do lead" />
        </div>
        <div>
          <label className="label" htmlFor="lf">Telefone</label>
          <input id="lf" name="telefone" className="input" placeholder="(11) 90000-0000" required />
        </div>
        <button className="btn-primary w-full" disabled={pendente || semDono}><Plus size={14} /> {pendente ? "Salvando…" : "Adicionar lead"}</button>
      </form>

      <div className="my-2 text-center text-[10px] font-bold" style={{ color: "var(--muted)" }}>OU COLAR VÁRIOS DE UMA VEZ</div>
      <label className="label" htmlFor="bulk">Um por linha • formato Nome; telefone</label>
      <textarea id="bulk" className="input min-h-[64px]" value={colado} onChange={(e) => setColado(e.target.value)} placeholder={"Maria Souza; (11) 98765-4321\nJoão; +1 305 555 1234"} />
      <button
        className="btn-dark w-full mt-2"
        disabled={pendente || semDono || !colado.trim()}
        onClick={() => iniciar(async () => terminar(await salvarColados(colado, dono), () => setColado("")))}
      >
        {pendente ? "Salvando leads…" : "Salvar leads colados"}
      </button>

      <div className="my-2 text-center text-[10px] font-bold" style={{ color: "var(--muted)" }}>OU IMPORTAR ARQUIVO</div>
      <label className="label" htmlFor="arquivo">Planilha Excel (.xlsx) ou CSV</label>
      <input
        id="arquivo"
        ref={arquivoRef}
        type="file"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="input !py-1.5"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setAnalise(null);
          if (!f) return;
          const fd = new FormData();
          fd.set("arquivo", f);
          iniciar(async () => {
            const r = await analisarArquivo(fd);
            setAnalise(r);
            if (!r.ok) toast(r.mensagem, "erro");
          });
        }}
      />
      <p className="help mt-1">Com ou sem cabeçalho: as colunas de nome e telefone são encontradas sozinhas.</p>

      {analise?.ok && (
        <div className="rounded-lg p-2.5 mt-2 text-[12px]" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }} data-testid="resumo-arquivo">
          <b>Conferir antes de salvar</b>
          <ul className="mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
            <li>{analise.temCabecalho ? "Cabeçalho encontrado (1ª linha ignorada)" : "Sem cabeçalho"} • {analise.colunas}</li>
            <li><b style={{ color: "var(--text)" }}>{analise.linhas.length.toLocaleString("pt-BR")}</b> com telefone válido</li>
            {analise.totalInvalidos > 0 && <li><b style={{ color: "#9e1d2f" }}>{analise.totalInvalidos}</b> com telefone inválido (não serão salvos)</li>}
          </ul>
          {analise.invalidos.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer font-bold">Ver inválidos</summary>
              <ul className="mt-1 max-h-[120px] overflow-y-auto">
                {analise.invalidos.map((i) => <li key={i.linha}>Linha {i.linha}: {i.nome || "(sem nome)"} — “{i.telefone || "vazio"}”</li>)}
              </ul>
            </details>
          )}
          <p className="mt-1" style={{ color: "var(--muted)" }}>Repetidos e números de outros usuários da empresa são ignorados ao salvar.</p>
          <div className="flex gap-2 mt-2">
            <button
              className="btn-primary"
              disabled={pendente || semDono}
              onClick={() =>
                iniciar(async () =>
                  terminar(await salvarImportacao(analise.linhas, dono, analise.totalInvalidos), () => {
                    setAnalise(null);
                    if (arquivoRef.current) arquivoRef.current.value = "";
                  }),
                )
              }
            >
              Salvar {analise.linhas.length.toLocaleString("pt-BR")} leads
            </button>
            <button className="btn-ghost" onClick={() => { setAnalise(null); if (arquivoRef.current) arquivoRef.current.value = ""; }}>Cancelar</button>
          </div>
        </div>
      )}

      {resultado && (
        <div className="rounded-lg p-2.5 mt-2 text-[12px]" role="status" data-testid="resultado-leads" style={{ background: resultado.ok ? "var(--primary-soft)" : "#fff1f1" }}>
          {resultado.mensagem}
        </div>
      )}
      <p className="help mt-2">{escolherDono ? "Os leads ficam no espaço do usuário escolhido." : "Os leads salvos ficam apenas no seu espaço."}</p>
    </div>
  );
}
