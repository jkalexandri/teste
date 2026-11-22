"use client";

// Chat do suporte em tempo real (decisão #102). Usado pelo cliente (botão Suporte) e pelo Super Admin (Atendimento).
// Busca as mensagens novas a cada 3 s enquanto está aberto.
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/app/Toast";

type Msg = { id: string; autor: "CLIENTE" | "SUPORTE"; texto: string; tipo: string; arquivoNome: string | null; criadoEm: string };

export default function ChatSuporte({ modo, usuarioId, altura = 360 }: { modo: "cliente" | "suporte"; usuarioId?: string; altura?: number }) {
  const toast = useToast();
  const base = modo === "cliente" ? "/api/suporte" : `/api/suporte/${usuarioId}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const ultima = useRef<string | null>(null);

  const buscar = useCallback(async (tudo = false) => {
    const q = new URLSearchParams({ aberto: "1", ...(!tudo && ultima.current ? { desde: ultima.current } : {}) });
    const r = await fetch(`${base}?${q}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    const novas = r.mensagens as Msg[];
    if (novas.length) {
      ultima.current = novas[novas.length - 1]!.criadoEm;
      setMsgs((m) => (tudo ? novas : [...m, ...novas.filter((n) => !m.some((x) => x.id === n.id))]));
    } else if (tudo) setMsgs([]);
  }, [base]);

  useEffect(() => {
    ultima.current = null;
    void buscar(true);
    const t = setInterval(() => void buscar(), 3000);
    return () => clearInterval(t);
  }, [buscar]);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  async function enviar() {
    const f = arquivoRef.current?.files?.[0];
    if (!texto.trim() && !f) return;
    setEnviando(true);
    const fd = new FormData();
    fd.set("texto", texto);
    if (f) fd.set("arquivo", f);
    const r = await fetch(base, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível enviar." }));
    setEnviando(false);
    if (!r.ok) { toast(r.mensagem, "erro"); return; }
    setTexto("");
    if (arquivoRef.current) arquivoRef.current.value = "";
    await buscar();
  }

  const minha = (m: Msg) => (modo === "cliente" ? m.autor === "CLIENTE" : m.autor === "SUPORTE");
  return (
    <div className="flex flex-col" data-testid="chat-suporte">
      <div className="overflow-y-auto p-3 space-y-2" style={{ height: altura, background: "var(--surface-2, rgba(0,0,0,.03))" }}>
        {msgs.length === 0 && <p className="text-[12px] text-center mt-6" style={{ color: "var(--muted)" }}>{modo === "cliente" ? "Escreva sua dúvida. O suporte responde por aqui." : "Nenhuma mensagem ainda."}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${minha(m) ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[82%] rounded-xl px-3 py-2 text-[13px] shadow-sm" data-autor={m.autor}
              style={{ background: minha(m) ? "#dcf8c6" : "var(--surface, #fff)", color: "#13221a" }}>
              {!minha(m) && <p className="text-[10px] font-bold" style={{ color: "#087a44" }}>{m.autor === "SUPORTE" ? "Suporte FilaPro Leads" : "Cliente"}</p>}
              {m.arquivoNome && <a className="underline text-[12px] font-bold block" href={`/api/suporte/arquivo/${m.id}`} target="_blank" rel="noreferrer">{m.tipo === "imagem" ? "📷" : "📄"} {m.arquivoNome}</a>}
              {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
              <p className="text-[10px] text-right" style={{ color: "#5b6b62" }}>{new Date(m.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <form className="p-2 flex flex-wrap gap-1.5 items-end" style={{ borderTop: "1px solid var(--border)" }} onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <textarea className="input flex-1 min-w-[160px] !min-h-[38px] max-h-[110px] !text-[13px]" rows={1} value={texto} maxLength={4000} aria-label="Mensagem para o suporte"
          placeholder="Escreva a mensagem" onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }} />
        <input ref={arquivoRef} type="file" accept="image/jpeg,image/png,application/pdf" className="input !py-1 !w-[150px] !text-[11px]" aria-label="Anexo (imagem ou PDF)" />
        <button className="btn-primary !py-2" disabled={enviando}>{enviando ? "…" : "Enviar"}</button>
      </form>
    </div>
  );
}
