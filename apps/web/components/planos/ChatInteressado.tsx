"use client";

// Chat para interessados (decisão #104), dentro da tela de Planos: antes de conversar, nome, WhatsApp, e-mail opcional
// e aceite da Política de Privacidade. A IA responde primeiro; o Super Admin pode assumir. Continua neste aparelho por 30 dias.
import { useEffect, useState } from "react";
import ChatSuporte from "@/components/app/ChatSuporte";
import { ToastProvider } from "@/components/app/Toast";

export default function ChatInteressado({ onFechar }: { onFechar: () => void }) {
  const [estado, setEstado] = useState<"carregando" | "form" | "chat">("carregando");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [f, setF] = useState({ nome: "", whatsapp: "", email: "", aceite: false });

  useEffect(() => {
    fetch("/api/interessados", { cache: "no-store" }).then((r) => r.json()).then((r) => setEstado(r.novo ? "form" : "chat")).catch(() => setEstado("form"));
  }, []);

  async function comecar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/interessados", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) })
      .then((x) => x.json()).catch(() => ({ ok: false, mensagem: "Não foi possível começar agora." }));
    setEnviando(false);
    if (!r.ok) { setErro(r.mensagem); return; }
    setEstado("chat");
  }

  return (
    <ToastProvider>
      <div className="fixed z-[60] bottom-3 right-3 left-3 sm:left-auto sm:w-[380px] rounded-2xl overflow-hidden shadow-2xl bg-white text-[#13221a]" role="dialog" aria-label="Fale conosco" data-testid="chat-interessado"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2" style={{ background: "#0b2f1f", color: "#fff" }}>
          <div><b className="text-[13px]">Fale conosco</b><p className="text-[10px] opacity-80">Tire suas dúvidas sobre os planos</p></div>
          <button type="button" onClick={onFechar} aria-label="Fechar o chat" className="text-[18px] leading-none px-1">×</button>
        </div>
        {estado === "carregando" && <p className="p-4 text-[12px]">Carregando…</p>}
        {estado === "form" && (
          <form className="p-3 grid gap-2 text-[12px]" onSubmit={comecar}>
            <p>Para conversar, informe os seus dados. Respondemos aqui mesmo e, se você sair, pelo WhatsApp.</p>
            <label className="grid gap-0.5"><b>Nome *</b><input className="rounded-lg border px-2 py-1.5" value={f.nome} maxLength={80} required onChange={(e) => setF({ ...f, nome: e.target.value })} aria-label="Seu nome" /></label>
            <label className="grid gap-0.5"><b>WhatsApp com DDD *</b><input className="rounded-lg border px-2 py-1.5" value={f.whatsapp} inputMode="tel" required placeholder="(11) 99999-9999" onChange={(e) => setF({ ...f, whatsapp: e.target.value })} aria-label="Seu WhatsApp" /></label>
            <label className="grid gap-0.5"><b>E-mail (opcional)</b><input className="rounded-lg border px-2 py-1.5" type="email" value={f.email} maxLength={120} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Seu e-mail" /></label>
            <label className="flex gap-2 items-start">
              <input type="checkbox" checked={f.aceite} onChange={(e) => setF({ ...f, aceite: e.target.checked })} aria-label="Aceito a Política de Privacidade" className="mt-0.5" />
              <span>Li e aceito a <a href="/privacidade" target="_blank" rel="noreferrer" className="underline font-bold">Política de Privacidade</a>.</span>
            </label>
            {erro && <p className="font-bold" style={{ color: "#b42318" }} role="alert">{erro}</p>}
            <button className="rounded-lg py-2 font-bold text-white" style={{ background: "#0e9f5a" }} disabled={enviando || !f.aceite}>{enviando ? "Aguarde…" : "Começar conversa"}</button>
          </form>
        )}
        {estado === "chat" && <ChatSuporte modo="visitante" altura={320} />}
      </div>
    </ToastProvider>
  );
}
