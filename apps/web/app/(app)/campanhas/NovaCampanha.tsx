"use client";

// Aba "Nova" de Campanhas (prompt seções 8 e 9; decisões #57, #64–#68).
// Passos: Mensagem → Leads → Antibloqueio → Prévia|envio. Salvar rascunho nas 3 primeiras;
// Agendar e Iniciar (nessa ordem) só na Prévia|envio. Depois de iniciar/agendar, o formulário é limpo.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/app/Toast";
import { Check, FolderOpen, Play, ShieldCheck, Sparkles, TriangleAlert, X } from "@/components/icons";
import { MODOS, TEXTO_DESCADASTRO_PADRAO, ANEXOS, montarMensagem, saudacao, temLink, type Modo } from "@filapro/db/src/envio";
import { LISTA_STATUS, STATUS_LEAD } from "@/lib/leads-status";
import { salvarColados } from "../leads/actions";
import FormJanela from "@/components/envio/FormJanela";
import { buscarLeads, enviarArquivo, iniciarCampanha, previaLeads, salvarRascunho } from "./actions";

type ArquivoInfo = { id: string; nome: string; tipo: string; tamanho: number };
export type Rascunho = {
  id: string; assunto: string; referencia: string; mensagem: string; variacoes: string[]; modo: Modo; bloqueio24h: boolean;
  descadastro: boolean; textoDescadastro: string; incluirDataHora: boolean; eliminarDuplicados: boolean; randomizar: boolean;
  selecaoTodos: boolean; selecaoStatus: string[]; leadsEscolhidos: string[]; manterQuemSaiu: string[]; arquivoId: string | null; arquivo: ArquivoInfo | null;
};

const VAZIO: Omit<Rascunho, "id" | "arquivo"> = {
  assunto: "", referencia: "", mensagem: "", variacoes: ["", "", ""], modo: "CONSERVADOR", bloqueio24h: true,
  descadastro: true, textoDescadastro: "", incluirDataHora: false, eliminarDuplicados: true, randomizar: true,
  selecaoTodos: true, selecaoStatus: [], leadsEscolhidos: [], manterQuemSaiu: [], arquivoId: null,
};
const PASSOS = ["Mensagem", "Leads", "Antibloqueio", "Prévia|envio"];
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export type JanelaInfo = { texto: string; inicio: string; fim: string; faixa: string; podeAlterar: boolean };

export default function NovaCampanha({ rascunho, whatsappConectado, totalLeadsAtivos, arquivos, janela, restantesTeste }: {
  rascunho: Rascunho | null; whatsappConectado: boolean; totalLeadsAtivos: number; arquivos: ArquivoInfo[]; janela: JanelaInfo; restantesTeste: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [passo, setPasso] = useState(0);
  const [id, setId] = useState<string | null>(rascunho?.id ?? null);
  const [d, setD] = useState({ ...VAZIO, ...(rascunho ?? {}), variacoes: [0, 1, 2].map((i) => rascunho?.variacoes[i] ?? "") });
  const [arquivo, setArquivo] = useState<ArquivoInfo | null>(rascunho?.arquivo ?? null);
  const [aviso, setAviso] = useState("");
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  const dados = () => ({ ...d, id, arquivoId: arquivo?.id ?? null });

  function salvar(origem: string) {
    iniciar(async () => {
      const r = await salvarRascunho(dados());
      if (r.ok && r.id) setId(r.id);
      const msg = r.ok ? `Rascunho salvo com as alterações atuais de ${origem}.` : r.mensagem;
      setAviso(msg);
      toast(msg, r.ok ? "ok" : "erro");
    });
  }

  function limpar() {
    setD({ ...VAZIO, variacoes: ["", "", ""] });
    setArquivo(null);
    setId(null);
    setPasso(0);
    router.replace("/campanhas?aba=nova");
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {!whatsappConectado && (
        <div className="card p-3 flex flex-wrap items-center gap-2 text-[12px]" style={{ background: "#fff7e0", color: "#8a5a00" }}>
          <TriangleAlert size={15} /> Seu WhatsApp não está conectado. Você pode montar e agendar, mas para iniciar precisa conectar.
          <Link href="/whatsapp" className="font-bold underline">Conectar WhatsApp</Link>
        </div>
      )}

      {/* Passos — espaço entre os nomes reduzido (prompt seção 8) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Passos da nova campanha">
          {PASSOS.map((p, i) => (
            <button
              key={p}
              role="tab"
              aria-selected={passo === i}
              onClick={() => setPasso(i)}
              className="shrink-0 px-2 py-1 rounded-lg text-[12px] font-bold whitespace-nowrap"
              style={passo === i ? { background: "var(--primary-soft)", color: "var(--primary-dark)" } : { color: "var(--muted)" }}
            >
              {p}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>Passo {passo + 1} de 4</span>
      </div>

      {passo === 0 && <PassoMensagem d={d} set={set} arquivo={arquivo} setArquivo={setArquivo} arquivos={arquivos} />}
      {passo === 1 && <PassoLeads d={d} set={set} totalLeadsAtivos={totalLeadsAtivos} restantesTeste={restantesTeste} />}
      {passo === 2 && <PassoAntibloqueio d={d} set={set} janela={janela} />}
      {passo === 3 && (
        <PassoPrevia
          d={d}
          arquivo={arquivo}
          pendente={pendente}
          voltar={() => setPasso(0)}
          enviar={(agendar) =>
            iniciar(async () => {
              const r = await iniciarCampanha(dados(), agendar);
              toast(r.mensagem, r.ok ? "ok" : "erro");
              setAviso(r.mensagem);
              if (r.ok) limpar(); // Após Iniciar ou Agendar, a tela é limpa (prompt seção 8)
            })
          }
        />
      )}

      {passo < 3 && (
        <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" style={{ border: "1px solid var(--border)", background: "var(--surface-3)" }}>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
            Salve o rascunho com o texto atual. Para agendar ou iniciar, avance até a aba Prévia|envio.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={pendente} onClick={() => salvar(PASSOS[passo]!)}>Salvar rascunho</button>
            {id && <button type="button" className="btn-ghost" onClick={limpar}>Limpar edição</button>}
          </div>
        </div>
      )}
      {aviso && <p role="status" data-testid="aviso-campanha" className="text-[12px] font-semibold">{aviso}</p>}

      <div className="flex items-center justify-between">
        <button className="btn-ghost" disabled={passo === 0} onClick={() => setPasso((p) => p - 1)}>← Anterior</button>
        <span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>Passo {passo + 1} de 4</span>
        <button className="btn-ghost" disabled={passo === 3} onClick={() => setPasso((p) => p + 1)}>Próximo →</button>
      </div>
    </div>
  );
}

type Dados = typeof VAZIO;
type Setter = <K extends keyof Dados>(k: K, v: Dados[K]) => void;

// ===================== Passo 1: Mensagem =====================
function PassoMensagem({ d, set, arquivo, setArquivo, arquivos }: { d: Dados; set: Setter; arquivo: ArquivoInfo | null; setArquivo: (a: ArquivoInfo | null) => void; arquivos: ArquivoInfo[] }) {
  const toast = useToast();
  const [enviando, iniciar] = useTransition();
  const link = temLink([d.mensagem, ...d.variacoes].join(" "));
  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-4">
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display font-bold text-[17px] leading-tight">Mensagem</h2>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>Texto que cada lead vai receber</p>
      </div>
      <div>
        <label className="label" htmlFor="assunto">Assunto da campanha</label>
        <input id="assunto" className="input" value={d.assunto} onChange={(e) => set("assunto", e.target.value)} placeholder="Ex.: Retomada de conversa — novembro" />
      </div>
      <div>
        <label className="label" htmlFor="referencia">Mensagem de Referência</label>
        <textarea id="referencia" className="input min-h-[70px]" value={d.referencia} onChange={(e) => set("referencia", e.target.value)} placeholder="Digite aqui a mensagem de referência que a IA vai usar como base..." />
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className="help">Texto base para a IA gerar a Mensagem Principal. Use {"{nome}"} para personalizar.</p>
          <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" disabled title="A IA chega na etapa 9">
            <Sparkles size={12} /> Atualizar prévia
          </button>
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>A geração pela IA chega na etapa 9. Por enquanto, escreva abaixo.</span>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="msg">Mensagem principal • use {"{nome}"} e {"{saudacao}"}</label>
        <textarea id="msg" className="input min-h-[90px]" value={d.mensagem} onChange={(e) => set("mensagem", e.target.value)} placeholder="{saudacao} {nome}, tudo bem? ..." />
        <p className="help mt-0.5">{"{nome}"} vira o primeiro nome de cada lead. {"{saudacao}"} alterna entre “Oi”, “Olá” e “Bom dia/Boa tarde/Boa noite”.</p>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <label className="label" htmlFor={`var${i}`}>Variação {i + 1}</label>
          <textarea id={`var${i}`} className="input min-h-[60px]" value={d.variacoes[i]} onChange={(e) => set("variacoes", d.variacoes.map((v, j) => (j === i ? e.target.value : v)))} placeholder="Outra forma de dizer a mesma coisa (opcional)" />
        </div>
      ))}
      {link && (
        <p className="text-[12px] rounded-lg p-2.5 flex gap-1.5" style={{ background: "#fff7e0", color: "#8a5a00" }} data-testid="aviso-link">
          <TriangleAlert size={14} className="shrink-0" /> A mensagem tem link. Link na primeira mensagem para quem não conhece você aumenta as denúncias e o risco de bloqueio. Prefira enviar o link depois que o lead responder.
        </p>
      )}

      {/* Anexo (decisões #67 e #68) */}
      <div className="rounded-xl p-3 border border-dashed" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-1.5 font-bold text-[12px]"><FolderOpen size={15} style={{ color: "var(--primary)" }} /> Envio de arquivo</div>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
          Um arquivo por campanha, enviado junto com a mensagem (o texto vira a legenda). {ANEXOS.map((a) => `${a.rotulo} até ${a.maxMB} MB`).join(" • ")}.
        </p>
        {arquivo ? (
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px]" data-testid="anexo-escolhido">
            <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}><Check size={12} /> {arquivo.nome} • {mb(arquivo.tamanho)}</span>
            <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => setArquivo(null)}><X size={11} /> Remover</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <input
              type="file"
              aria-label="Escolher arquivo para anexar"
              accept={ANEXOS.flatMap((a) => a.tipos).join(",")}
              className="input !py-1.5 !w-auto"
              disabled={enviando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.set("arquivo", f);
                iniciar(async () => {
                  const r = await enviarArquivo(fd);
                  toast(r.mensagem, r.ok ? "ok" : "erro");
                  if (r.ok && r.arquivo) setArquivo(r.arquivo);
                  e.target.value = "";
                });
              }}
            />
            {enviando && <span className="text-[12px]">Enviando…</span>}
            {arquivos.length > 0 && (
              <select className="input !w-auto !py-1.5" aria-label="Usar um arquivo já enviado" value="" onChange={(e) => setArquivo(arquivos.find((a) => a.id === e.target.value) ?? null)}>
                <option value="">Ou usar um arquivo já enviado…</option>
                {arquivos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===================== Passo 2: Leads =====================
type Previa = Awaited<ReturnType<typeof previaLeads>>;
function PassoLeads({ d, set, totalLeadsAtivos, restantesTeste }: { d: Dados; set: Setter; totalLeadsAtivos: number; restantesTeste: number | null }) {
  const toast = useToast();
  const router = useRouter();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [busca, setBusca] = useState("");
  const [encontrados, setEncontrados] = useState<Awaited<ReturnType<typeof buscarLeads>>>([]);
  const [colado, setColado] = useState("");
  const [pendente, iniciar] = useTransition();
  const chave = JSON.stringify([d.selecaoTodos, d.selecaoStatus, d.leadsEscolhidos, d.manterQuemSaiu]);

  useEffect(() => {
    let ativo = true;
    previaLeads({ selecaoTodos: d.selecaoTodos, selecaoStatus: d.selecaoStatus, leadsEscolhidos: d.leadsEscolhidos, manterQuemSaiu: d.manterQuemSaiu }).then((p) => ativo && setPrevia(p));
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  useEffect(() => {
    if (d.selecaoTodos) return;
    const t = setTimeout(() => buscarLeads(busca).then(setEncontrados), 250);
    return () => clearTimeout(t);
  }, [busca, d.selecaoTodos]);

  const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-4">
      <div className="pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display font-bold text-[17px] leading-tight">Leads</h2>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>{totalLeadsAtivos} leads ativos no seu espaço</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1.5 text-[13px] font-bold cursor-pointer">
          <input type="radio" name="sel" checked={d.selecaoTodos} onChange={() => set("selecaoTodos", true)} className="accent-emerald-600" /> Todos os meus leads ativos
        </label>
        <label className="flex items-center gap-1.5 text-[13px] font-bold cursor-pointer">
          <input type="radio" name="sel" checked={!d.selecaoTodos} onChange={() => set("selecaoTodos", false)} className="accent-emerald-600" /> Escolher leads
        </label>
      </div>

      {d.selecaoTodos ? (
        <div>
          <span className="label">Só com estes status (nenhum marcado = todos)</span>
          <div className="flex flex-wrap gap-1.5">
            {LISTA_STATUS.filter((s) => s !== "PEDIU_SAIR").map((s) => (
              <label key={s} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold cursor-pointer" style={{ border: "1px solid var(--border)" }}>
                <input type="checkbox" checked={d.selecaoStatus.includes(s)} onChange={() => set("selecaoStatus", alternar(d.selecaoStatus, s))} className="w-4 h-4 accent-emerald-600" />
                {STATUS_LEAD[s].rotulo}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <input className="input !py-1.5" placeholder="Buscar nome, telefone ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar leads para a campanha" />
          <div className="mt-2 max-h-[260px] overflow-y-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
            {encontrados.length === 0 ? (
              <p className="text-[12px] p-2" style={{ color: "var(--muted)" }}>Nenhum lead encontrado.</p>
            ) : (
              encontrados.map((l) => (
                <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 text-[12px] cursor-pointer" style={{ borderBottom: "1px solid var(--border)" }}>
                  <input type="checkbox" checked={d.leadsEscolhidos.includes(l.id)} onChange={() => set("leadsEscolhidos", alternar(d.leadsEscolhidos, l.id))} className="w-4 h-4 accent-emerald-600" />
                  <span className="font-mono">{l.codigo}</span> <b>{l.nome || "(sem nome)"}</b> <span style={{ color: "var(--muted)" }}>{l.telefone}</span>
                </label>
              ))
            )}
          </div>
          <p className="help mt-1">{d.leadsEscolhidos.length} escolhidos.</p>
        </div>
      )}

      {/* Resumo + "pediu para sair" (decisão #57) */}
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }} data-testid="resumo-leads">
        <b className="text-[13px]">{previa ? `${previa.total} leads prontos para esta campanha` : "Calculando…"}</b>
        {previa && previa.bloqueados > 0 && (
          <p className="text-[12px] mt-1" style={{ color: "#9e1d2f" }}>{previa.bloqueados} pediram para sair há menos de 45 dias e estão bloqueados.</p>
        )}
        {previa && restantesTeste != null && (
          <p className="text-[12px] mt-1" style={{ color: "#8a5a00" }}>Teste grátis: restam {restantesTeste} disparos. Os leads além disso ficam na fila sem enviar.</p>
        )}
        {previa && previa.antigosSair.length > 0 && (
          <div className="mt-2 rounded-lg p-2.5" style={{ background: "#fff7e0" }} data-testid="aviso-sair">
            <p className="text-[12px] font-bold" style={{ color: "#8a5a00" }}>Estes leads pediram para sair há mais de 45 dias. Quer manter na campanha?</p>
            <ul className="mt-1 space-y-1">
              {previa.antigosSair.map((l) => (
                <li key={l.id} className="text-[12px] flex flex-wrap items-center gap-2">
                  <span>{l.codigo} • {l.nome || "(sem nome)"} • {l.telefone} • pediu em {l.pediuSairEm ? new Date(l.pediuSairEm).toLocaleDateString("pt-BR") : "—"}</span>
                  <button type="button" className="btn-ghost !py-0.5 !px-2 !text-[11px]" onClick={() => set("manterQuemSaiu", [...d.manterQuemSaiu, l.id])}>Manter</button>
                  <span className="text-[11px] font-bold" style={{ color: "#8a5a00" }}>Retirar (padrão)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.manterQuemSaiu.length > 0 && (
          <p className="text-[12px] mt-1">
            {d.manterQuemSaiu.length} lead(s) que pediram para sair foram mantidos.{" "}
            <button type="button" className="underline font-bold" onClick={() => set("manterQuemSaiu", [])}>Retirar de novo</button>
          </p>
        )}
      </div>

      {/* Importar rápido (como na prévia) */}
      <div>
        <label className="label" htmlFor="bulk-nova">Importar leads • um por linha, formato Nome; telefone</label>
        <textarea id="bulk-nova" className="input min-h-[64px]" value={colado} onChange={(e) => setColado(e.target.value)} aria-label="Importar leads para a campanha" />
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <button
            type="button"
            className="btn-dark"
            disabled={pendente || !colado.trim()}
            onClick={() => iniciar(async () => {
              const r = await salvarColados(colado, "");
              toast(r.mensagem, r.ok ? "ok" : "erro");
              if (r.ok) { setColado(""); router.refresh(); setPrevia(await previaLeads(d)); }
            })}
          >
            {pendente ? "Salvando…" : "Importar leads"}
          </button>
          <Link href="/leads" className="text-[12px] font-bold" style={{ color: "var(--primary)" }}>Gerenciar leads →</Link>
        </div>
      </div>
    </div>
  );
}

// ===================== Passo 3: Antibloqueio =====================
function PassoAntibloqueio({ d, set, janela }: { d: Dados; set: Setter; janela: JanelaInfo }) {
  const [editando, setEditando] = useState(false);
  const [editJanela, setEditJanela] = useState(false);
  const [texto, setTexto] = useState(d.textoDescadastro || TEXTO_DESCADASTRO_PADRAO);
  const m = MODOS[d.modo];
  return (
    <div className="flex flex-col gap-3">
      {/* Bloco 1: Bloqueio 24h */}
      <div className="card p-4 sm:p-5">
        <h2 className="font-display font-bold text-[15px]">Bloqueio de 24h</h2>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>Proteção contra repetição</p>
        <label className="flex items-center gap-2 mt-2 cursor-pointer text-[13px] font-bold">
          <input type="checkbox" checked={d.bloqueio24h} onChange={(e) => set("bloqueio24h", e.target.checked)} className="w-5 h-5 accent-emerald-600" />
          Bloqueio de 24h {d.bloqueio24h ? "ativado" : "desativado"}
        </label>
        <p className="help mt-1">Impede novo envio para o mesmo contato antes de 24h.</p>
      </div>

      {/* Bloco 2: Antibloqueio (com o resumo dentro — prompt seção 9) */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-[15px]">Antibloqueio</h2>
          <span className="chip" style={{ background: m.fundo, color: m.cor }}><ShieldCheck size={12} /> Modo ativo: {m.rotulo}</span>
        </div>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>Como as campanhas serão enviadas</p>
        <div className="grid sm:grid-cols-3 gap-2 mt-3" role="radiogroup" aria-label="Modo do Antibloqueio">
          {(Object.keys(MODOS) as Modo[]).map((k) => {
            const x = MODOS[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={d.modo === k}
                onClick={() => set("modo", k)}
                className="rounded-xl p-3 text-left"
                style={{ border: `2px solid ${d.modo === k ? x.cor : "var(--border)"}`, background: d.modo === k ? x.fundo : "var(--surface)" }}
              >
                <span className="flex items-center gap-1.5 font-bold text-[13px]" style={{ color: x.cor }}><ShieldCheck size={16} /> {x.rotulo}</span>
                <span className="block text-[11px] mt-1" style={{ color: "var(--muted)" }}>{x.segMin} a {x.segMax} seg. • blocos de ~{x.bloco} msgs, espera {x.esperaMin} min • até {x.porDia}/dia</span>
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={d.descadastro} onChange={(e) => set("descadastro", e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-600" />
            <span className="text-[12px] font-bold leading-snug">
              Opção de cancelamento de subscrição{" "}
              <button type="button" className="underline" style={{ color: "var(--primary)" }} onClick={() => setEditando(true)}>(Editar)</button>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={d.incluirDataHora} onChange={(e) => set("incluirDataHora", e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-600" />
            <span className="text-[12px] font-bold leading-snug">Incluir data e hora</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={d.eliminarDuplicados} onChange={(e) => set("eliminarDuplicados", e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-600" />
            <span className="text-[12px] font-bold leading-snug">Eliminação de Duplicados</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={d.randomizar} onChange={(e) => set("randomizar", e.target.checked)} className="w-4 h-4 mt-0.5 accent-emerald-600" />
            <span className="text-[12px] font-bold leading-snug">Randomização de Mensagens</span>
          </label>
        </div>

        {/* Bloco 3: Resumo das regras ativas (dentro do Antibloqueio) */}
        <div className="rounded-xl border p-3 mt-3" style={{ borderColor: "var(--border)", background: "var(--surface-3)" }} data-testid="resumo-regras">
          <b className="text-[13px]">Resumo das regras ativas</b>
          <span className="block text-[11px]" style={{ color: "var(--muted)" }}>Modo ativo — Resumo • atualiza sozinho ao trocar o modo acima.</span>
          <ul className="text-[12px] mt-2 space-y-1">
            <li><b>Tempo entre envios:</b> de {m.segMin} a {m.segMax} seg. (sorteado a cada envio, com “digitando…” antes)</li>
            <li><b>Blocos:</b> pausa de {m.esperaMin} minutos a cada {Math.round(m.bloco * 0.9)}–{Math.round(m.bloco * 1.1)} mensagens</li>
            <li><b>Limite do número:</b> até {m.porDia} por dia e {m.porHora} por hora (número novo começa com 20/dia e aumenta aos poucos)</li>
            <li>
              <b>Janela de envio:</b> {janela.texto}{" "}
              {janela.podeAlterar ? (
                <button type="button" className="underline font-bold" style={{ color: "var(--primary)" }} onClick={() => setEditJanela(true)}>(Alterar)</button>
              ) : (
                <span style={{ color: "var(--muted)" }}>(definida pelo administrador da empresa)</span>
              )}
            </li>
            <li><b>Proteções:</b> confere se o número tem WhatsApp • no máximo 2 mensagens sem resposta por lead em 30 dias • quem responde sai da fila • pausa automática se houver muitas falhas</li>
            <li><b>Bloqueio 24h:</b> {d.bloqueio24h ? "ligado" : "desligado"} • <b>Cancelamento:</b> {d.descadastro ? "ligado" : "desligado"} • <b>Data/hora:</b> {d.incluirDataHora ? "ligado" : "desligado"} • <b>Duplicados:</b> {d.eliminarDuplicados ? "ligado" : "desligado"} • <b>Randomização:</b> {d.randomizar ? "ligado" : "desligado"}</li>
          </ul>
        </div>
      </div>

      {editJanela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Janela de envio">
          <div className="card w-full max-w-[480px] p-4">
            <div className="flex justify-between items-start">
              <h2 className="font-display font-extrabold text-[16px]">Janela de envio</h2>
              <button type="button" className="btn-ghost !p-1.5" onClick={() => setEditJanela(false)} aria-label="Fechar"><X size={14} /></button>
            </div>
            <div className="mt-2"><FormJanela inicio={janela.inicio} fim={janela.fim} faixa={janela.faixa} aoSalvar={() => setEditJanela(false)} /></div>
          </div>
        </div>
      )}

      {/* Popup do texto de descadastro: só o texto, com Restaurar (prompt seção 9) */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(10,20,15,.55)" }} role="dialog" aria-modal="true" aria-label="Texto de cancelamento">
          <div className="card w-full max-w-[460px] p-4">
            <textarea className="input min-h-[90px]" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto de cancelamento de subscrição" />
            <div className="flex justify-between gap-2 mt-3">
              <button type="button" className="btn-ghost" onClick={() => setTexto(TEXTO_DESCADASTRO_PADRAO)}>Restaurar</button>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={() => { set("textoDescadastro", texto.trim() === TEXTO_DESCADASTRO_PADRAO ? "" : texto.trim()); setEditando(false); }}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== Passo 4: Prévia|envio =====================
function PassoPrevia({ d, arquivo, pendente, voltar, enviar }: { d: Dados; arquivo: ArquivoInfo | null; pendente: boolean; voltar: () => void; enviar: (agendar: string | null) => void }) {
  const [versao, setVersao] = useState(0);
  const [agendando, setAgendando] = useState(false);
  const [quando, setQuando] = useState("");
  const textos = [d.mensagem, ...d.variacoes];
  const texto = useMemo(
    () => montarMensagem(textos[versao] || "", { nome: "Maria", saudacao: saudacao(versao, new Date().getHours() * 60), descadastro: d.descadastro, textoDescadastro: d.textoDescadastro, incluirDataHora: d.incluirDataHora }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versao, d],
  );
  const m = MODOS[d.modo];
  return (
    <div className="card p-4 sm:p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-display font-bold text-[17px]">Prévia|envio</h2>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>Veja como a mensagem vai chegar no WhatsApp antes de agendar ou iniciar.</p>
      </div>
      <div className="grid lg:grid-cols-[1fr_1fr] gap-3">
        <div>
          <span className="label">Ver prévia de</span>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Prévia da mensagem">
            {["Principal", "Var 1", "Var 2", "Var 3"].map((r, i) => (
              <button key={r} role="tab" aria-selected={versao === i} disabled={!textos[i]} onClick={() => setVersao(i)} className="px-2.5 py-1 rounded-full text-[11px] font-bold border"
                style={versao === i ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : { borderColor: "var(--border)", opacity: textos[i] ? 1 : 0.4 }}>
                {r}
              </button>
            ))}
          </div>
          {/* Simulação do WhatsApp */}
          <div className="rounded-xl overflow-hidden mt-2" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#008069", color: "#fff" }}>
              <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold" style={{ background: "#ffffff33" }}>M</span>
              <div className="leading-tight"><b className="text-[13px]">Maria</b><span className="block text-[11px] opacity-80">online</span></div>
            </div>
            <div className="p-3 min-h-[220px]" style={{ background: "#efeae2" }}>
              <div className="text-center"><span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#fff", color: "#54656f" }}>HOJE</span></div>
              <div className="ml-auto mt-2 max-w-[85%] rounded-lg p-2 text-[13px] shadow-sm" style={{ background: "#d9fdd3", color: "#111b21" }} data-testid="bolha-previa">
                {arquivo && <AnexoPrevia a={arquivo} />}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{texto ? formatoWhatsapp(texto) : <i style={{ color: "#667781" }}>Escreva a mensagem na aba Mensagem.</i>}</p>
                <span className="block text-right text-[10px]" style={{ color: "#53bdeb" }}>✓✓</span>
              </div>
            </div>
          </div>
          <p className="help mt-1">Prévia com nome de exemplo “Maria”. No envio real, {"{nome}"} vira o nome de cada lead.</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-display font-bold text-[14px]">Resumo compacto</h3>
          <ResumoLinha rotulo="Assunto" valor={d.assunto || "—"} />
          <ResumoLinha rotulo="Leads selecionados" valor={d.selecaoTodos ? `Todos os ativos${d.selecaoStatus.length ? ` (${d.selecaoStatus.map((s) => STATUS_LEAD[s as keyof typeof STATUS_LEAD].rotulo).join(", ")})` : ""}` : `${d.leadsEscolhidos.length} escolhidos`} />
          <ResumoLinha rotulo="Modo Antibloqueio" valor={`${m.rotulo}: ${m.segMin} a ${m.segMax} seg., blocos de ~${m.bloco} msgs, espera ${m.esperaMin} min`} />
          <ResumoLinha rotulo="Bloqueio de 24h" valor={d.bloqueio24h ? "Ligado — Impede novo envio para o mesmo contato antes de 24h." : "Desligado — Novos envios para o mesmo contato não serão bloqueados por 24h."} />
          <ResumoLinha rotulo="Anexo" valor={arquivo ? arquivo.nome : "Nenhum"} />

          {agendando && (
            <div className="rounded-lg p-2.5" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
              <label className="label" htmlFor="agendar-em">Começar em (horário de Brasília)</label>
              <input id="agendar-em" type="datetime-local" className="input" value={quando} onChange={(e) => setQuando(e.target.value)} />
              <p className="help mt-0.5">Se cair fora da janela de envio, começa no próximo horário permitido.</p>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary" disabled={pendente || !quando} onClick={() => enviar(new Date(`${quando}:00-03:00`).toISOString())}>Confirmar agendamento</button>
                <button className="btn-ghost" onClick={() => setAgendando(false)}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-auto pt-2">
            <button className="btn-ghost" onClick={voltar}>← Revisar mensagem</button>
            {/* Agendar e Iniciar, nessa ordem (prompt seção 8) */}
            <button className="btn-ghost" disabled={pendente} onClick={() => setAgendando(true)}>Agendar envio</button>
            <button className="btn-primary" disabled={pendente} onClick={() => enviar(null)}><Play size={14} /> Iniciar disparo</button>
          </div>
          <p className="help">Após Iniciar ou Agendar, o formulário é limpo e já fica livre para uma nova campanha.</p>
        </div>
      </div>
    </div>
  );
}

function ResumoLinha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg px-2.5 py-2 text-[12px]" style={{ background: "var(--surface-3)" }}>
      <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{rotulo}</span>
      <span className="[overflow-wrap:anywhere]">{valor}</span>
    </div>
  );
}

function AnexoPrevia({ a }: { a: ArquivoInfo }) {
  const url = `/api/arquivos/${a.id}`;
  if (a.tipo.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={a.nome} className="rounded-md mb-1 max-h-[220px] w-full object-cover" />;
  }
  if (a.tipo.startsWith("video/")) return <video src={url} controls className="rounded-md mb-1 max-h-[220px] w-full" />;
  if (a.tipo.startsWith("audio/")) return <audio src={url} controls className="mb-1 w-full" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md p-2 mb-1 text-[12px] font-bold" style={{ background: "#ffffffaa" }}>
      <FolderOpen size={16} /> {a.nome}
    </a>
  );
}

/** Mostra a formatação do WhatsApp na prévia: *negrito*, _itálico_ e ~riscado~. */
function formatoWhatsapp(t: string) {
  return t.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g).map((parte, i) => {
    if (/^\*[^*]+\*$/.test(parte)) return <b key={i}>{formatoWhatsapp(parte.slice(1, -1))}</b>;
    if (/^_[^_]+_$/.test(parte)) return <i key={i}>{formatoWhatsapp(parte.slice(1, -1))}</i>;
    if (/^~[^~]+~$/.test(parte)) return <s key={i}>{parte.slice(1, -1)}</s>;
    return parte;
  });
}
