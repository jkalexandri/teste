"use client";

// Tela "Troque sua senha temporária" — reproduzida da prévia.
import { useMemo, useState } from "react";
import { CircleCheck, CircleDashed, Eye, EyeOff, Lock, TriangleAlert } from "@/components/icons";
import { checkPassword, gerarSenhaForte } from "@/lib/password-policy";

export default function TrocarSenhaForm({ nome, email }: { nome: string; email: string }) {
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // "Gerar senha forte" (decisão #98): preenche, mostra e permite copiar
  const [gerada, setGerada] = useState(false);
  const [copiada, setCopiada] = useState(false);
  function gerar() {
    setSenha(gerarSenhaForte());
    setVer(true);
    setGerada(true);
    setCopiada(false);
    setErro("");
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(senha); setCopiada(true); } catch { setCopiada(false); }
  }
  const regras = useMemo(() => checkPassword(senha), [senha]);

  async function salvar() {
    if (!regras.every((r) => r.ok)) {
      setErro("Sua nova senha precisa cumprir todos os requisitos abaixo.");
      return;
    }
    setEnviando(true);
    setErro("");
    const r = await fetch("/api/auth/trocar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    const dados = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) {
      setErro(dados.erro || "Não foi possível salvar. Tente novamente.");
      return;
    }
    window.location.href = dados.destino || "/dashboard";
  }

  async function voltar() {
    await fetch("/api/auth/sair", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div style={{ boxSizing: "border-box", minHeight: "100dvh", background: "var(--bg)" }} className="overflow-x-clip">
      <div className="min-h-[100dvh] flex items-center justify-center p-3 py-6">
        <div className="card w-full max-w-[520px] p-4">
          <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
            <Lock size={12} /> Primeiro acesso
          </span>
          <h1 className="font-display text-[22px] font-extrabold mt-2 leading-tight">Troque sua senha temporária</h1>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
            Olá, <b style={{ color: "var(--text)" }}>{nome}</b>. Você entrou com a senha temporária enviada para{" "}
            <b className="[overflow-wrap:anywhere]" style={{ color: "var(--text)" }}>{email}</b>. Crie agora uma senha definitiva.
          </p>
          <label className="label mt-3" htmlFor="new-pw">Nova senha</label>
          <div className="relative">
            <input
              id="new-pw"
              className="input pr-10"
              type={ver ? "text" : "password"}
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setGerada(false); }}
              placeholder="Mínimo de 12 caracteres"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setVer(!ver)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted)" }}
              aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
            >
              {ver ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" className="btn-ghost !py-1.5 !text-[12px]" onClick={gerar} data-testid="gerar-senha">Gerar senha forte</button>
            {gerada && (
              <button type="button" className="btn-ghost !py-1.5 !text-[12px]" onClick={copiar} data-testid="copiar-senha">{copiada ? "Copiada!" : "Copiar senha"}</button>
            )}
          </div>
          {gerada && (
            <p className="text-[12px] mt-1.5 font-semibold" style={{ color: "#8a5a00" }} data-testid="aviso-senha-gerada">
              Guarde esta senha antes de salvar (por exemplo, no gerenciador de senhas do celular ou do navegador).
            </p>
          )}
          <div className="rounded-xl p-3 mt-3" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
            <p className="text-[12px] font-bold mb-2">Sua senha deve ter:</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {regras.map((r) => (
                <span key={r.label} className="flex gap-1 text-[12px]" style={{ color: r.ok ? "var(--primary-dark)" : "var(--muted)" }}>
                  {r.ok ? <CircleCheck size={15} /> : <CircleDashed size={15} />} {r.label}
                </span>
              ))}
            </div>
          </div>
          {erro && (
            <div className="flex gap-2 text-[12px] font-semibold text-[#b42318] bg-[#fff1f1] border border-[#ffd7d7] rounded-xl p-2 mt-3">
              <TriangleAlert size={15} className="shrink-0" />
              {erro}
            </div>
          )}
          <button className="btn-primary w-full mt-3" onClick={salvar} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar nova senha e entrar"}
          </button>
          <button className="btn-ghost w-full mt-2 justify-center" onClick={voltar}>
            Voltar para o login
          </button>
        </div>
      </div>
    </div>
  );
}
