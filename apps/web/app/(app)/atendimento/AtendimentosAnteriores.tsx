"use client";

// Atendimentos anteriores do cliente (decisão #177): só leitura. O chat principal mostra apenas o atendimento atual;
// os anteriores (já encerrados) ficam guardados e aparecem aqui, em blocos com data e hora.
import { useState } from "react";

type Msg = { id: string; autor: "CLIENTE" | "SUPORTE" | "IA" | "SISTEMA"; texto: string; tipo: string; arquivoNome: string | null; criadoEm: string };
type Bloco = { numero: number; inicio: string; fim: string; mensagens: Msg[] };

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const nome = (a: Msg["autor"]) => (a === "SUPORTE" ? "Suporte" : a === "IA" ? "Assistente virtual (IA)" : "Cliente");

export default function AtendimentosAnteriores({ usuarioId }: { usuarioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [erro, setErro] = useState(false);

  async function abrir() {
    setAberto(true);
    setErro(false);
    const r = await fetch(`/api/suporte/${usuarioId}/anteriores`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setBlocos(r.atendimentos as Bloco[]); else { setBlocos([]); setErro(true); }
  }

  return (
    <>
      <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={abrir} data-testid="abrir-anteriores">Atendimentos anteriores</button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(0,0,0,.5)" }} role="dialog" aria-modal="true" aria-label="Atendimentos anteriores" data-testid="anteriores">
          <div className="card w-full max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <b className="text-[14px]">Atendimentos anteriores <span className="text-[11px] font-normal" style={{ color: "var(--muted)" }}>(só leitura)</span></b>
              <button type="button" className="btn-ghost !py-1 !px-2 !text-[11px]" onClick={() => setAberto(false)} data-testid="fechar-anteriores">Fechar</button>
            </div>
            <div className="overflow-y-auto p-3 space-y-4">
              {blocos === null && <p className="text-[12px] text-center" style={{ color: "var(--muted)" }}>Carregando…</p>}
              {erro && <p className="text-[12px] text-center" style={{ color: "#b42318" }}>Não foi possível carregar.</p>}
              {blocos?.length === 0 && !erro && <p className="text-[12px] text-center" style={{ color: "var(--muted)" }} data-testid="sem-anteriores">Este cliente ainda não tem atendimentos anteriores.</p>}
              {blocos?.map((b) => (
                <section key={b.numero} data-testid="atendimento-anterior" data-numero={b.numero}>
                  <h3 className="text-[12px] font-extrabold mb-1.5" style={{ color: "var(--muted)" }}>
                    Atendimento {b.numero} — {quando(b.inicio)} a {hora(b.fim)} • {b.mensagens.filter((m) => m.autor !== "SISTEMA").length} mensagem(ns)
                  </h3>
                  <div className="space-y-1.5 rounded-lg p-2" style={{ background: "var(--surface-2, rgba(0,0,0,.04))" }}>
                    {b.mensagens.map((m) => m.autor === "SISTEMA" ? (
                      <div key={m.id} className="text-center text-[11px] py-0.5" style={{ color: "var(--muted)" }}>{m.texto}</div>
                    ) : (
                      <div key={m.id} className={`flex ${m.autor === "CLIENTE" ? "justify-start" : "justify-end"}`}>
                        <div className="max-w-[85%] rounded-xl px-3 py-1.5 text-[12px] shadow-sm" style={{ background: m.autor === "CLIENTE" ? "var(--surface, #fff)" : "#dcf8c6", color: "#13221a" }}>
                          <p className="text-[10px] font-bold" style={{ color: "#087a44" }}>{nome(m.autor)}</p>
                          {m.arquivoNome && <a className="underline font-bold block" href={`/api/suporte/arquivo/${m.id}`} target="_blank" rel="noreferrer">{m.tipo === "imagem" ? "📷" : "📄"} {m.arquivoNome}</a>}
                          {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
                          <p className="text-[10px] text-right" style={{ color: "#5b6b62" }}>{hora(m.criadoEm)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
