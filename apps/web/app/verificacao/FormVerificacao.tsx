"use client";

// Tela do código de 6 dígitos (ou código de recuperação) — decisão #105.
import { useState } from "react";
import { Lock } from "@/components/icons";

export default function FormVerificacao({ email }: { email: string }) {
  const [codigo, setCodigo] = useState("");
  const [recuperacao, setRecuperacao] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/auth/verificar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo, recuperacao }) })
      .then((x) => x.json()).catch(() => ({ erro: "Não foi possível conferir agora." }));
    setEnviando(false);
    if (r.destino) {
      if (r.restantes != null && r.restantes <= 3) alert(`Restam ${r.restantes} códigos de recuperação. Gere novos em Segurança.`);
      window.location.href = r.destino;
      return;
    }
    if (r.voltar) { window.location.href = "/login"; return; }
    setErro(r.erro || "Código incorreto.");
  }

  return (
    <div style={{ boxSizing: "border-box", minHeight: "100dvh", background: "var(--bg)" }} className="overflow-x-clip">
      <div className="min-h-[100dvh] flex items-center justify-center p-3 py-6">
        <form className="card w-full max-w-[420px] p-5" onSubmit={enviar}>
          <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}><Lock size={12} /> Verificação em duas etapas</span>
          <h1 className="font-display text-[22px] font-extrabold mt-2 leading-tight">{recuperacao ? "Código de recuperação" : "Digite o código do app"}</h1>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
            {recuperacao ? "Use um dos códigos que você guardou ao ativar a verificação. Cada um vale uma vez." : <>Abra o app autenticador no celular e digite o código de 6 dígitos de <b style={{ color: "var(--text)" }}>{email}</b>.</>}
          </p>
          <label className="label mt-3" htmlFor="codigo-2fa">{recuperacao ? "Código de recuperação" : "Código de 6 dígitos"}</label>
          <input id="codigo-2fa" className="input text-center text-[20px] tracking-[.3em] font-bold" value={codigo} autoFocus autoComplete="one-time-code"
            inputMode={recuperacao ? "text" : "numeric"} maxLength={recuperacao ? 9 : 6} placeholder={recuperacao ? "XXXX-XXXX" : "000000"}
            onChange={(e) => setCodigo(recuperacao ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))} />
          {erro && <p className="text-[12px] font-bold mt-2" style={{ color: "#b42318" }} role="alert">{erro}</p>}
          <button className="btn-primary w-full justify-center mt-3" disabled={enviando || (recuperacao ? codigo.length < 8 : codigo.length !== 6)}>{enviando ? "Conferindo…" : "Entrar"}</button>
          <button type="button" className="text-[12px] underline mt-3 block mx-auto" style={{ color: "var(--muted)" }} onClick={() => { setRecuperacao(!recuperacao); setCodigo(""); setErro(""); }}>
            {recuperacao ? "Usar o código do app" : "Perdi o celular: usar um código de recuperação"}
          </button>
        </form>
      </div>
    </div>
  );
}
