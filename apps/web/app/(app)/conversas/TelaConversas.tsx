"use client";

// Tela Conversas IA (etapa 10 — decisão #92), no estilo WhatsApp Web: lista à esquerda, conversa à direita.
// Atualiza sozinha a cada 5 s para mostrar as mensagens novas e as respostas da IA.
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { LISTA_STATUS, STATUS_LEAD, type StatusLeadId } from "@/lib/leads-status";
import { assumirConversa, devolverParaIA, enviarMensagem, ligarIAConversas, marcarLida, mudarStatusConversa, mudarTemperatura } from "./actions";

type Autor = "LEAD" | "IA" | "USUARIO" | "CAMPANHA";
type Item = {
  id: string; nome: string; telefone: string; codigo: string; status: StatusLeadId; temperatura: string | null; naoLidas: number;
  iaPausada: boolean; quando: string; dono: string | null; ultima: { texto: string; tipo: string; autor: Autor } | null;
};
type Aberto = {
  id: string; nome: string; telefone: string; codigo: string; status: StatusLeadId; temperatura: string | null; motivo: string | null;
  iaPausada: boolean; iaPausaMotivo: string | null; dono: string; podeResponder: boolean; naoLidas: number;
};
type Msg = { id: string; autor: Autor; texto: string; tipo: string; arquivoId: string | null; arquivoNome: string | null; criadoEm: string };

const TEMP: Record<string, { rotulo: string; fundo: string; cor: string }> = {
  QUENTE: { rotulo: "Quente", fundo: "#ffeef0", cor: "#b42318" },
  MORNO: { rotulo: "Morno", fundo: "#fff7e0", cor: "#8a5a00" },
  FRIO: { rotulo: "Frio", fundo: "#eef2ff", cor: "#3730a3" },
};
const AUTOR: Record<Autor, string> = { LEAD: "", IA: "IA", USUARIO: "Você", CAMPANHA: "Campanha" };
const TIPO: Record<string, string> = { imagem: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", documento: "📄 Documento", outro: "Mensagem" };

const hora = (iso: string) => {
  const d = new Date(iso), hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const previa = (u: Item["ultima"]) => (!u ? "" : `${u.autor !== "LEAD" ? `${AUTOR[u.autor]}: ` : ""}${u.texto || TIPO[u.tipo] || ""}`);

function Chip({ t }: { t: string | null }) {
  if (!t || !TEMP[t]) return null;
  return <span className="chip !text-[10px] !py-0.5" style={{ background: TEMP[t].fundo, color: TEMP[t].cor }} data-testid="temperatura">{TEMP[t].rotulo}</span>;
}

export default function TelaConversas(p: {
  temIA: boolean; iaLigada: boolean; filtros: { status: string; temp: string; q: string };
  lista: Item[]; aberto: Aberto | null; mensagens: Msg[]; arquivos: { id: string; nome: string; tipo: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState(p.filtros.q);
  const fim = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivoId, setArquivoId] = useState("");

  // Atualiza a cada 5 s (mensagens novas e respostas da IA)
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  // Abrir a conversa zera as não lidas
  useEffect(() => {
    if (p.aberto?.podeResponder && p.aberto.naoLidas > 0) void marcarLida(p.aberto.id);
  }, [p.aberto?.id, p.aberto?.naoLidas, p.aberto?.podeResponder]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [p.aberto?.id, p.mensagens.length]);

  const ir = (mudar: Record<string, string>) => {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(mudar)) if (v) q.set(k, v); else q.delete(k);
    router.push(`${pathname}?${q.toString()}`);
  };
  const rodar = (acao: () => Promise<{ ok: boolean; mensagem: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) depois?.();
      router.refresh();
    });

  const a = p.aberto;
  return (
    <>
      <div className="card p-3 mt-3 flex flex-wrap items-center gap-2">
        <form className="flex gap-2 flex-1 min-w-[220px]" onSubmit={(e) => { e.preventDefault(); ir({ q: busca.trim() }); }}>
          <input className="input !py-1.5" placeholder="Buscar por nome, telefone ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conversa" />
          <button className="btn-ghost !py-1.5">Buscar</button>
        </form>
        <select className="input !py-1.5 !w-auto" value={p.filtros.status} onChange={(e) => ir({ status: e.target.value })} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LEAD[s].rotulo}</option>)}
        </select>
        <select className="input !py-1.5 !w-auto" value={p.filtros.temp} onChange={(e) => ir({ temp: e.target.value })} aria-label="Filtrar por temperatura">
          <option value="">Quente, Morno e Frio</option>
          {Object.entries(TEMP).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        {p.temIA && (
          <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer ml-auto">
            <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={p.iaLigada} disabled={pendente}
              onChange={(e) => rodar(() => ligarIAConversas(e.target.checked))} data-testid="ia-geral" />
            IA responde sozinha
          </label>
        )}
      </div>

      <div className="card mt-3 flex-1 min-h-[520px] grid md:grid-cols-[320px_1fr] overflow-hidden">
        {/* Lista de conversas */}
        <aside className={`${a ? "hidden md:flex" : "flex"} flex-col min-h-0`} style={{ borderRight: "1px solid var(--border)" }}>
          {p.lista.length === 0 ? (
            <p className="text-[12px] p-4" style={{ color: "var(--muted)" }}>Nenhuma conversa ainda. Elas aparecem quando um lead responde ou recebe uma campanha.</p>
          ) : (
            <ul className="overflow-y-auto flex-1" data-testid="lista-conversas">
              {p.lista.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => ir({ lead: c.id })} className="w-full text-left px-3 py-2.5 flex gap-2"
                    style={{ borderBottom: "1px solid var(--border)", background: a?.id === c.id ? "var(--primary-soft)" : undefined }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <b className="text-[13px] truncate">{c.nome || c.telefone}</b>
                        <Chip t={c.temperatura} />
                        {c.iaPausada && <span className="text-[10px] font-bold" style={{ color: "#b54708" }}>IA pausada</span>}
                      </div>
                      <p className="text-[12px] truncate" style={{ color: "var(--muted)" }}>{previa(c.ultima)}</p>
                      {c.dono && <p className="text-[10px]" style={{ color: "var(--muted)" }}>Usuário: {c.dono}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>{hora(c.quando)}</span>
                      {c.naoLidas > 0 && <span className="chip !text-[10px] !py-0 !px-1.5" style={{ background: "var(--primary)", color: "#fff" }} data-testid="nao-lidas">{c.naoLidas}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Conversa aberta */}
        {a ? (
          <div className="flex flex-col min-h-0" data-testid="conversa">
            <div className="px-3 py-2 flex flex-wrap items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <button type="button" className="btn-ghost !py-1 !px-2 md:hidden" onClick={() => ir({ lead: "" })} aria-label="Voltar">←</button>
              <div className="min-w-0 flex-1 basis-[calc(100%-56px)] md:basis-auto">
                <b className="text-[14px]">{a.nome || a.telefone}</b>
                <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {a.telefone} • <span style={{ fontFamily: "monospace" }}>{a.codigo}</span>{!a.podeResponder && ` • Usuário: ${a.dono}`}
                  {a.motivo && ` • ${a.motivo}`}
                </p>
              </div>
              {a.podeResponder ? (
                <>
                  <select className="input !py-1 !w-auto !text-[12px]" value={a.temperatura ?? ""} disabled={pendente} aria-label="Temperatura"
                    onChange={(e) => rodar(() => mudarTemperatura(a.id, e.target.value))}>
                    <option value="">Sem temperatura</option>
                    {Object.entries(TEMP).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                  </select>
                  <select className="input !py-1 !w-auto !text-[12px]" value={a.status} disabled={pendente} aria-label="Status do lead"
                    onChange={(e) => rodar(() => mudarStatusConversa(a.id, e.target.value))}>
                    {LISTA_STATUS.map((s) => <option key={s} value={s}>{STATUS_LEAD[s].rotulo}</option>)}
                  </select>
                  {a.iaPausada ? (
                    <button type="button" className="btn-primary !py-1 !text-[12px]" disabled={pendente} onClick={() => rodar(() => devolverParaIA(a.id))}>Devolver para a IA</button>
                  ) : (
                    <button type="button" className="btn-ghost !py-1 !text-[12px]" disabled={pendente} onClick={() => rodar(() => assumirConversa(a.id))}>Assumir conversa</button>
                  )}
                </>
              ) : (
                <>
                  <Chip t={a.temperatura} />
                  <span className="chip !text-[10px]" style={{ background: STATUS_LEAD[a.status].fundo, color: STATUS_LEAD[a.status].cor }}>{STATUS_LEAD[a.status].rotulo}</span>
                </>
              )}
            </div>
            {a.iaPausada && (
              <p className="px-3 py-1.5 text-[12px] font-bold" style={{ background: "#fff7e0", color: "#8a5a00" }} data-testid="aviso-pausa">
                IA pausada nesta conversa{a.iaPausaMotivo ? `: ${a.iaPausaMotivo}` : "."}
              </p>
            )}
            {p.temIA && !p.iaLigada && a.podeResponder && (
              <p className="px-3 py-1.5 text-[12px]" style={{ background: "var(--surface-3)" }}>A IA está desligada para todos os seus leads (opção “IA responde sozinha”).</p>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ background: "var(--surface-2, rgba(0,0,0,.03))" }}>
              {p.mensagens.map((m) => {
                const doLead = m.autor === "LEAD";
                return (
                  <div key={m.id} className={`flex ${doLead ? "justify-start" : "justify-end"}`}>
                    <div className="max-w-[78%] rounded-xl px-3 py-2 text-[13px] shadow-sm" data-autor={m.autor}
                      style={{ background: doLead ? "var(--surface, #fff)" : m.autor === "IA" ? "#e7f8ef" : "#dcf8c6", color: "#13221a" }}>
                      {!doLead && <p className="text-[10px] font-bold mb-0.5" style={{ color: "#087a44" }}>{AUTOR[m.autor]}</p>}
                      {m.tipo !== "texto" && (
                        <p className="text-[12px] font-bold">
                          {m.arquivoId ? <a href={`/api/arquivos/${m.arquivoId}`} target="_blank" rel="noreferrer" className="underline">{TIPO[m.tipo] ?? "Arquivo"}: {m.arquivoNome}</a> : TIPO[m.tipo] ?? "Mensagem"}
                        </p>
                      )}
                      {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
                      <p className="text-[10px] text-right mt-0.5" style={{ color: "#5b6b62" }}>{new Date(m.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>

            {a.podeResponder ? (
              <form
                className="p-2 flex flex-wrap items-end gap-2"
                style={{ borderTop: "1px solid var(--border)" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData();
                  fd.set("texto", texto);
                  if (arquivoId) fd.set("arquivoId", arquivoId);
                  const f = arquivoRef.current?.files?.[0];
                  if (f) fd.set("arquivo", f);
                  rodar(() => enviarMensagem(a.id, fd), () => { setTexto(""); setArquivoId(""); if (arquivoRef.current) arquivoRef.current.value = ""; });
                }}
              >
                <textarea className="input flex-1 min-w-[200px] !min-h-[42px] max-h-[140px]" rows={1} placeholder="Escreva uma mensagem (ao enviar, a conversa fica assumida por você)"
                  value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} aria-label="Mensagem" id="conv-texto"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
                <select className="input !py-1.5 !w-auto !text-[12px] max-w-[180px]" value={arquivoId} onChange={(e) => setArquivoId(e.target.value)} aria-label="Arquivo dos Arquivos">
                  <option value="">Sem arquivo</option>
                  {p.arquivos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <input ref={arquivoRef} type="file" className="input !py-1 !w-[190px] !text-[11px]" aria-label="Arquivo do computador" id="conv-arquivo"
                  accept="image/jpeg,image/png,application/pdf,video/mp4,audio/mpeg,audio/ogg,audio/mp4,audio/x-m4a" />
                <button className="btn-primary" disabled={pendente}>{pendente ? "Enviando…" : "Enviar"}</button>
              </form>
            ) : (
              <p className="p-3 text-[12px]" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>Somente leitura: só o usuário dono do lead responde.</p>
            )}
          </div>
        ) : (
          <div className="hidden md:flex items-center justify-center p-6 text-[13px]" style={{ color: "var(--muted)" }}>Escolha uma conversa.</div>
        )}
      </div>
    </>
  );
}
