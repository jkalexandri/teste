"use client";

// Tela "Crie sua nova senha" (link de recuperação — decisão #164). Mesmo estilo da tela de primeiro acesso.
// O link só é gasto quando a senha nova é aceita; abrir esta página não o consome.
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleDashed, Eye, EyeOff, Lock, TriangleAlert } from "@/components/icons";
import { checkPassword, gerarSenhaForte } from "@/lib/password-policy";

export default function DefinirSenhaForm() {
  const [token, setToken] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [gerada, setGerada] = useState(false);
  const [copiada, setCopiada] = useState(false);

  // Lê o código do fragmento (#t=…) e o tira da barra de endereços (não fica no histórico nem em capturas de tela)
  useEffect(() => {
    const m = /(?:^|[#&])t=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    setToken(m ? m[1]! : null);
    if (m) window.history.replaceState(null, "", window.location.pathname);
    setPronto(true);
  }, []);

  function gerar() { setSenha(gerarSenhaForte()); setVer(true); setGerada(true); setCopiada(false); setErro(""); }
  async function copiar() { try { await navigator.clipboard.writeText(senha); setCopiada(true); } catch { setCopiada(false); } }
  const regras = useMemo(() => checkPassword(senha), [senha]);

  async function salvar() {
    if (!regras.every((r) => r.ok)) { setErro("Sua nova senha precisa cumprir todos os requisitos abaixo."); return; }
    setEnviando(true); setErro("");
    const r = await fetch("/api/auth/definir-senha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, senha }) });
    const dados = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) { setErro(dados.erro || "Não foi possível salvar. Tente novamente."); return; }
    setSenha(""); setConcluido(true);
  }

  const semLink = pronto && !token && !concluido;

  return (
    <div style={{ boxSizing: "border-box", minHeight: "100dvh", background: "var(--bg)" }} className="overflow-x-clip">
      <div className="min-h-[100dvh] flex items-center justify-center p-3 py-6">
        <div className="card w-full max-w-[520px] p-4">
          <span className="chip" style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}>
            <Lock size={12} /> Recuperar senha
          </span>
          {concluido ? (
            <>
              <h1 className="font-display text-[22px] font-extrabold mt-2 leading-tight" data-testid="senha-definida">Senha definida!</h1>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                Sua nova senha está valendo. Por segurança, os outros aparelhos conectados na sua conta foram desconectados. Entre com a nova senha.
              </p>
              <a className="btn-primary w-full mt-3 justify-center" href="/login">Ir para o login</a>
            </>
          ) : semLink ? (
            <>
              <h1 className="font-display text-[22px] font-extrabold mt-2 leading-tight" data-testid="sem-link">Link inválido</h1>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                Abra o link completo que enviamos ao seu e-mail. Se ele expirou ou já foi usado, peça um novo em “Esqueci minha senha”, na tela de login.
              </p>
              <a className="btn-ghost w-full mt-3 justify-center" href="/login">Voltar para o login</a>
            </>
          ) : (
            <>
              <h1 className="font-display text-[22px] font-extrabold mt-2 leading-tight">Crie sua nova senha</h1>
              <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                Escolha uma senha definitiva. Este link vale por 30 minutos e só pode ser usado uma vez.
              </p>
              <label className="label mt-3" htmlFor="nova-senha">Nova senha</label>
              <div className="relative">
                <input id="nova-senha" className="input pr-10" type={ver ? "text" : "password"} value={senha}
                  onChange={(e) => { setSenha(e.target.value); setGerada(false); }} placeholder="Mínimo de 12 caracteres" autoComplete="new-password" />
                <button type="button" onClick={() => setVer(!ver)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>
                  {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <button type="button" className="btn-ghost !py-1.5 !text-[12px]" onClick={gerar} data-testid="gerar-senha">Gerar senha forte</button>
                {gerada && <button type="button" className="btn-ghost !py-1.5 !text-[12px]" onClick={copiar} data-testid="copiar-senha">{copiada ? "Copiada!" : "Copiar senha"}</button>}
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
                <div className="flex gap-2 text-[12px] font-semibold text-[#b42318] bg-[#fff1f1] border border-[#ffd7d7] rounded-xl p-2 mt-3" data-testid="erro-definir">
                  <TriangleAlert size={15} className="shrink-0" />
                  {erro}
                </div>
              )}
              <button className="btn-primary w-full mt-3" onClick={salvar} disabled={enviando}>{enviando ? "Salvando…" : "Salvar nova senha"}</button>
              <a className="btn-ghost w-full mt-2 justify-center" href="/login">Voltar para o login</a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
