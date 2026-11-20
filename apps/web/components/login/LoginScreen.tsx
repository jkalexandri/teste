"use client";

// TELA DE LOGIN — reprodução fiel da prévia (docs/login-referencia.md).
// NÃO redesenhar, NÃO simplificar, NÃO trocar cores, NÃO remover animação,
// NÃO mudar posição, fonte ou tamanho sem ordem expressa do dono do projeto.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import CircuitBackground from "./CircuitBackground";
import {
  ArrowRight, Building2, ChevronRight, CircleCheck, CircleDashed, Eye, EyeOff,
  Lock, Mail, Moon, ShieldCheck, Sparkles, Sun, Tag, TriangleAlert, Users, Zap,
} from "@/components/icons";
import PopupPlanos from "@/components/planos/PopupPlanos";
import { checkPassword } from "@/lib/password-policy";
import { useTheme } from "@/lib/theme";
import { IS_PRODUCTION } from "@/lib/env";

type Modulo = "individual" | "empresarial";

// Contas de teste: existem só fora de produção (docs/decisoes.md #3).
// Nesta etapa os botões apenas preenchem os campos; a entrada real vem na etapa 2.
const DEMO_ACCOUNTS = IS_PRODUCTION
  ? null
  : {
      superadmin: { email: "superadmin@disparopro.com.br", password: "Super@12345678" },
      admin: { email: "admin-empresa@empresaexemplo.com.br", password: "Admin@12345678" },
      userIndividual: { email: "usuario@disparopro.com.br", password: "User@12345678" },
      userEmpresarial: { email: "ana@empresaexemplo.com.br", password: "User@12345678" },
    };

const EMAIL_KEY = "filapro-email-lembrado";

const ML = "75.6px"; // recuo dos textos do lado esquerdo (igual à prévia)

// Ícones dos 3 blocos de benefício: auto-pulso aleatório a cada ~4s (±0,5s).
function useBenefitAutoPulse(hovered: number | null, active: number | null) {
  const [scales, setScales] = useState<(number | null)[]>([null, null, null]);
  const hoveredRef = useRef(hovered);
  const activeRef = useRef(active);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    const timers: number[] = [];
    const GROW = 300, HOLD = 300, SHRINK = 300;
    const CYCLE = GROW + HOLD + SHRINK;

    const schedule = (idx: number) => {
      const run = () => {
        if (stopped) return;
        // Se o usuário está interagindo com este ícone, espera e tenta de novo.
        if (hoveredRef.current === idx || activeRef.current === idx) {
          timers.push(window.setTimeout(run, 350));
          return;
        }
        const interval = 4000 + (Math.random() * 1000 - 500);
        setScales((s) => s.map((v, i) => (i === idx ? 1.35 : v)));
        timers.push(
          window.setTimeout(() => {
            if (stopped) return;
            setScales((s) => s.map((v, i) => (i === idx ? null : v)));
            const wait = Math.max(0, interval - CYCLE);
            timers.push(window.setTimeout(run, wait + SHRINK));
          }, GROW + HOLD),
        );
      };
      timers.push(window.setTimeout(run, Math.random() * 4000));
    };

    [0, 1, 2].forEach(schedule);
    return () => {
      stopped = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return scales;
}

export default function LoginScreen() {
  const { theme, toggleTheme } = useTheme();

  // Blocos de benefício
  const [activeBenefit, setActiveBenefit] = useState<number | null>(null);
  const [hoveredBenefit, setHoveredBenefit] = useState<number | null>(null);
  const activeTimer = useRef<number | null>(null);
  const autoScales = useBenefitAutoPulse(hoveredBenefit, activeBenefit);

  function pulseBenefit(i: number) {
    setActiveBenefit(i);
    if (activeTimer.current) window.clearTimeout(activeTimer.current);
    activeTimer.current = window.setTimeout(() => setActiveBenefit(null), 1000);
  }

  // Formulário
  const [modulo, setModulo] = useState<Modulo>("individual");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const regras = useMemo(() => checkPassword(senha), [senha]);
  const formOk = regras.every((r) => r.ok) && email.includes("@");

  // Popup "Planos" (decisão #25)
  const [planosAberto, setPlanosAberto] = useState(false);

  // Recuperação de senha
  const [recuperando, setRecuperando] = useState(false);
  const [recEmail, setRecEmail] = useState("");
  const [recEnviado, setRecEnviado] = useState(false);

  // "Lembrar de mim": guarda só o e-mail (decisão #10). A senha fica a cargo do navegador.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(EMAIL_KEY);
      if (salvo) setEmail(salvo);
    } catch {
      /* sem acesso ao armazenamento */
    }
    // Motivo de saída forçada (pacote expirado, empresa inativa, bloqueio).
    const motivo = new URLSearchParams(window.location.search).get("motivo");
    const MOTIVOS: Record<string, string> = {
      expirado: "Acesso expirado. Fale com o administrador.",
      inativa: "Empresa inativa. Fale com o administrador.",
      bloqueado: "Acesso bloqueado. Fale com o administrador.",
    };
    if (motivo && MOTIVOS[motivo]) setErro(MOTIVOS[motivo]);
  }, []);

  async function entrar(emailEnvio: string, senhaEnvio: string, moduloEnvio: Modulo) {
    setErro("");
    setAviso("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailEnvio, senha: senhaEnvio, modulo: moduloEnvio }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(dados.erro || "Não foi possível entrar. Tente novamente.");
      return;
    }
    try {
      if (lembrar) localStorage.setItem(EMAIL_KEY, emailEnvio.trim());
      else localStorage.removeItem(EMAIL_KEY);
    } catch {
      /* ignora */
    }
    window.location.href = dados.destino || "/dashboard";
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!formOk) {
      setAviso("");
      setErro("Confira o e-mail e todos os requisitos da senha antes de entrar.");
      return;
    }
    void entrar(email, senha, modulo);
  }

  // Botões de teste: preenchem e entram direto, como na prévia (só fora de produção).
  function fillDemo(acc: { email: string; password: string }, mod?: Modulo) {
    const m = mod ?? modulo;
    if (mod) setModulo(mod);
    setEmail(acc.email);
    setSenha(acc.password);
    void entrar(acc.email, acc.password, m);
  }

  function fecharRecuperacao() {
    setRecuperando(false);
    setRecEnviado(false);
  }

  const benefits: {
    title: string; desc: string; label: string; cyan?: boolean;
    icon: ReactNode; style: CSSProperties;
  }[] = [
    {
      title: "Antibloqueio Inteligente",
      desc: "Cadência, blocos e pausas que protegem sua conta.",
      label: "Expandir Antibloqueio Inteligente",
      icon: <ShieldCheck size={19.67} />,
      style: { background: "rgba(37,211,102,.14)", color: "#25D366", boxShadow: "0 0 18px rgba(37,211,102,.18)" },
    },
    {
      title: "IA que Qualifica e Contorna Objeções",
      desc: "Conversas com contexto do seu negócio.",
      label: "Expandir IA que Qualifica e Contorna Objeções",
      cyan: true,
      icon: <Sparkles size={19.67} />,
      style: { background: "rgba(45,212,255,.13)", color: "#2dd4ff", boxShadow: "0 0 18px rgba(45,212,255,.16)" },
    },
    {
      title: "Online na Nuvem 24/7",
      desc: "Seus envios seguem a cadência definida, sem parar.",
      label: "Expandir Online na Nuvem 24/7",
      icon: <Zap size={19.67} />,
      style: { background: "rgba(37,211,102,.14)", color: "#7dffb8", boxShadow: "0 0 18px rgba(37,211,102,.18)" },
    },
  ];

  return (
    <div
      data-safe-area-inset-root
      style={{ boxSizing: "border-box", paddingTop: "var(--safe-area-inset-top)", minHeight: "100dvh", background: "var(--bg)" }}
      className="overflow-x-clip"
    >
      <div className="login-future login-shell flex flex-col lg:flex-row overflow-hidden">
        <CircuitBackground />

        {/* Orbes e partículas */}
        <span className="login-orb" style={{ width: 420, height: 420, left: "-120px", top: "-100px", background: "rgba(37,211,102,.22)" }} aria-hidden="true" />
        <span className="login-orb" style={{ width: 360, height: 360, right: "8%", top: "28%", background: "rgba(45,212,255,.18)" }} aria-hidden="true" />
        <span className="login-orb" style={{ width: 280, height: 280, left: "38%", bottom: "-110px", background: "rgba(37,211,102,.13)" }} aria-hidden="true" />
        <span className="login-particle" style={{ width: 6, height: 6, left: "18%", top: "22%", background: "#25D366" }} aria-hidden="true" />
        <span className="login-particle" style={{ width: 4, height: 4, left: "42%", top: "14%", background: "#2dd4ff", animationDelay: "1.2s" }} aria-hidden="true" />
        <span className="login-particle" style={{ width: 5, height: 5, left: "8%", top: "62%", background: "#7dffb8", animationDelay: "2s" }} aria-hidden="true" />
        <span className="login-particle" style={{ width: 4, height: 4, right: "12%", top: "18%", background: "#2dd4ff", animationDelay: ".6s" }} aria-hidden="true" />

        {/* ===== Lado esquerdo: marca, headline, subtítulo e benefícios ===== */}
        <aside className="login-aside relative z-[1] lg:w-[52%] shrink-0 flex flex-col p-2 sm:p-2.5 lg:p-3 lg:pr-2 min-h-0 overflow-hidden lg:justify-center">
          <div
            className="login-brand font-display font-extrabold leading-none tracking-tight"
            style={{ fontSize: "clamp(24pt, calc(2.6vw + 8pt), 30pt)", letterSpacing: "-0.01em", marginLeft: ML, maxWidth: "100%", overflowWrap: "anywhere" }}
          >
            <span className="login-neon-text">FilaPro Leads</span>
            <span style={{ color: "#25D366" }}>.</span>
          </div>
          <span
            className="mt-0 inline-flex self-start items-center rounded-full px-2.5 py-0.5 text-[9pt] font-extrabold tracking-[0.14em]"
            style={{ color: "#7dffb8", background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.45)", boxShadow: "0 0 22px rgba(37,211,102,.18)", marginLeft: ML }}
          >
            IA • AUTOMAÇÃO • WHATSAPP
          </span>
          <h1
            className="font-display font-extrabold leading-[1.02] tracking-tight mt-1 max-w-[522px]"
            style={{ fontSize: "clamp(17pt, calc(2.4vw + 2pt), 26pt)", marginLeft: ML }}
          >
            O futuro do
            <br />
            disparo inteligente.
          </h1>
          <p className="text-[10pt] sm:text-[10.5pt] mt-1 leading-snug text-slate-300 max-w-[442px]" style={{ marginLeft: ML }}>
            Envios com ritmo, contexto e proteção sua operação de WhatsApp pronta para escalar sem perder o controle.
          </p>

          <div className="hidden lg:grid gap-0.5 mt-1 max-w-[502px]" style={{ marginLeft: ML }}>
            {benefits.map((b, i) => {
              const auto = autoScales[i] !== null;
              return (
                <div
                  key={b.title}
                  className={`login-glass benefit-card rounded-xl p-2 flex items-center gap-2${activeBenefit === i ? " is-active" : ""}${auto ? " is-auto" : ""}`}
                >
                  <button
                    type="button"
                    className={`benefit-icon${b.cyan ? " benefit-icon--cyan" : ""} rounded-lg shrink-0 flex items-center justify-center${auto ? " is-auto" : ""}`}
                    aria-label={b.label}
                    onClick={() => pulseBenefit(i)}
                    onMouseEnter={() => setHoveredBenefit(i)}
                    onMouseLeave={() => setHoveredBenefit(null)}
                    onFocus={() => setHoveredBenefit(i)}
                    onBlur={() => setHoveredBenefit(null)}
                    style={{ width: "29pt", height: "29pt", ...b.style, ["--auto-scale" as string]: autoScales[i] ?? 1.42 }}
                  >
                    {b.icon}
                  </button>
                  <span className="leading-snug">
                    <b className="block text-[13pt]">{b.title}</b>
                    <span className="block text-[12.25pt] text-slate-400">{b.desc}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="login-glass login-status-pill mt-1.5 rounded-full px-2.5 py-1 inline-flex self-start items-center gap-2 text-[10px] font-bold"
            style={{ marginLeft: ML }}
          >
            <span className="login-pulse w-2 h-2 rounded-full shrink-0" style={{ background: "#25D366" }} aria-hidden="true" />
            <span>Sistema Online</span>
            <span className="text-slate-500">•</span>
            <span>Fila Ativa</span>
            <span className="text-slate-500">•</span>
            <span>99.9% Uptime</span>
          </div>
        </aside>

        {/* ===== Lado direito: tema + card de login ===== */}
        <div className="login-right relative z-[1] lg:w-[48%] flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center p-2 sm:p-2.5 lg:p-3">
          {/* Botão "Planos" antes do tema; tema só com ícone (decisão #28) */}
          <div className="w-full max-w-[420px] flex justify-end gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => setPlanosAberto(true)}
              className="rounded-xl px-3 py-1.5 text-[11px] font-extrabold flex items-center gap-1.5"
              style={{ background: "#2dd4ff", color: "#04120a" }}
            >
              <Tag size={13} /> Planos
            </button>
            <button
              onClick={toggleTheme}
              className="login-ghost-btn !px-2 !py-1.5"
              aria-label={theme === "light" ? "Usar tema escuro" : "Usar tema claro"}
              title={theme === "light" ? "Tema escuro" : "Tema claro"}
            >
              {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
            </button>
          </div>

          <div className="w-full max-w-[420px] min-h-0 overflow-hidden">
            {!recuperando ? (
              <div className="login-glass login-card rounded-[18px] p-3 sm:p-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#25D366", boxShadow: "0 0 12px #25D366" }} />
                  <span className="text-[10px] font-extrabold tracking-[0.18em] text-emerald-300">ACESSO SEGURO</span>
                </div>
                <h2 className="font-display text-[19px] font-extrabold leading-tight text-white mt-1">Acesse sua conta</h2>
                {/* Texto "Escolha o módulo..." removido por ordem do dono do projeto (decisoes.md #7). */}

                <div className="flex gap-1.5 mt-1.5" role="tablist" aria-label="Escolha o módulo">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modulo === "individual"}
                    onClick={() => setModulo("individual")}
                    className="flex-1 rounded-xl px-3 py-2 text-[12px] font-extrabold"
                    style={modulo === "individual"
                      ? { background: "#25D366", color: "#04120a" }
                      : { background: "rgba(255,255,255,.08)", color: "#eaf6ff", border: "1px solid rgba(255,255,255,.16)" }}
                  >
                    Módulo Individual
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modulo === "empresarial"}
                    onClick={() => setModulo("empresarial")}
                    className="flex-1 rounded-xl px-3 py-2 text-[12px] font-extrabold"
                    style={modulo === "empresarial"
                      ? { background: "#2dd4ff", color: "#04120a" }
                      : { background: "rgba(255,255,255,.08)", color: "#eaf6ff", border: "1px solid rgba(255,255,255,.16)" }}
                  >
                    Módulo Empresarial
                  </button>
                </div>
                {/* Linha "Módulo atual: ..." removida por ordem do dono do projeto (decisoes.md #7). */}

                <form onSubmit={onSubmit} className="space-y-1.5 mt-2">
                  <div>
                    <label className="login-label" htmlFor="email">E-mail</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#7dffb8" }} />
                      <input
                        id="email"
                        className="login-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="voce@empresa.com.br"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="login-label" htmlFor="senha">Senha</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#7dffb8" }} />
                      <input
                        id="senha"
                        className="login-input !pr-10"
                        type={showSenha ? "text" : "password"}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Sua senha de acesso"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenha(!showSenha)}
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        style={{ color: "#94a3b8" }}
                        aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="login-check flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lembrar}
                        onChange={(e) => setLembrar(e.target.checked)}
                        className="w-4 h-4 accent-emerald-400"
                      />
                      Lembrar de mim
                    </label>
                    <button type="button" onClick={() => setRecuperando(true)} className="text-[12px] font-bold text-cyan-300">
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {regras.map((r) => (
                      <span key={r.label} className="flex gap-1 text-[11px]" style={{ color: r.ok ? "#7dffb8" : "#7d8ea3" }}>
                        {r.ok ? <CircleCheck size={14} /> : <CircleDashed size={14} />} {r.label}
                      </span>
                    ))}
                  </div>
                  {erro && (
                    <div className="flex gap-2 text-[12px] font-semibold text-rose-200 bg-rose-500/15 border border-rose-400/30 rounded-xl p-2">
                      <TriangleAlert size={15} className="shrink-0" />
                      {erro}
                    </div>
                  )}
                  {aviso && (
                    <div
                      className="flex gap-2 text-[12px] font-semibold text-emerald-300 rounded-xl p-2"
                      style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}
                    >
                      <CircleCheck size={15} className="shrink-0" />
                      {aviso}
                    </div>
                  )}
                  <button className="login-cta" type="submit">
                    Entrar <ArrowRight size={15} />
                  </button>
                </form>

                {/* Acesso demo: só fora de produção (docs/decisoes.md #3) */}
                {DEMO_ACCOUNTS && (
                  <>
                    <div className="my-1.5 flex items-center gap-2">
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] font-bold text-slate-400">ou entre como</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => fillDemo(DEMO_ACCOUNTS.superadmin)} className="login-ghost-btn">
                        <ShieldCheck size={16} style={{ color: "#25D366" }} />
                        Entrar como Super Admin
                      </button>
                      <button type="button" onClick={() => fillDemo(DEMO_ACCOUNTS.admin, "empresarial")} className="login-ghost-btn">
                        <Building2 size={16} style={{ color: "#ffb020" }} />
                        Entrar como Admin da Empresa
                      </button>
                      <button
                        type="button"
                        onClick={() => fillDemo(modulo === "individual" ? DEMO_ACCOUNTS.userIndividual : DEMO_ACCOUNTS.userEmpresarial)}
                        className="login-ghost-btn col-span-2"
                      >
                        <Users size={16} style={{ color: "#2dd4ff" }} />
                        Entrar como Usuário ({modulo === "individual" ? "Individual" : "Empresarial"})
                      </button>
                    </div>
                    <p className="login-compact-hide text-[10px] leading-relaxed mt-1.5 text-center text-slate-400">
                      Admin não envia mensagens. Super Admin vê tudo, agrupado por empresa e por usuário individual, sem enviar mensagem por eles.
                    </p>
                    <p className="login-compact-hide text-[10px] leading-relaxed mt-2.5 text-center text-slate-400">
                      Senha mínima de 12 caracteres, com maiúscula, minúscula, número e caractere especial.
                    </p>
                    <p className="login-compact-hide text-[10px] leading-relaxed mt-1 text-center font-semibold text-slate-400">
                      Sem cadastro público. Acesso criado pelo administrador.
                    </p>
                    <div className="login-compact-hide mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span>Demonstração com credenciais salvas nos botões acima.</span>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                        style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.35)" }}
                      >
                        v1.25
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ===== Recuperar senha ===== */
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-3"
                style={{ background: "rgba(3,6,14,.72)", backdropFilter: "blur(6px)" }}
                role="dialog"
                aria-modal="true"
                aria-label="Recuperar senha"
              >
                <div className="login-glass rounded-[24px] p-4 w-full max-w-[440px] text-slate-100">
                  <button onClick={fecharRecuperacao} className="flex items-center gap-1 text-[13px] font-bold text-slate-300">
                    <ChevronRight className="rotate-180" size={15} /> Voltar para o login
                  </button>
                  <h2 className="font-display text-[22px] font-extrabold mt-2 text-white">Recuperar senha</h2>
                  <p className="text-[13px] mt-0.5 text-slate-400">Informe o e-mail cadastrado pelo administrador.</p>
                  {!recEnviado ? (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!recEmail.includes("@")) return;
                        // Resposta é sempre a mesma, exista o e-mail ou não.
                        void fetch("/api/auth/recuperar", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: recEmail }),
                        }).finally(() => setRecEnviado(true));
                      }}
                    >
                      <label className="login-label" htmlFor="rec-email">E-mail cadastrado</label>
                      <input
                        id="rec-email"
                        className="login-input"
                        type="email"
                        value={recEmail}
                        onChange={(e) => setRecEmail(e.target.value)}
                        placeholder="voce@empresa.com.br"
                      />
                      <button className="login-cta" type="submit">
                        <Mail size={15} /> Enviar senha temporária
                      </button>
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        Se o e-mail existir na base do administrador, enviaremos uma senha temporária para ele.
                      </p>
                    </form>
                  ) : (
                    <div className="mt-3 rounded-xl p-3" style={{ background: "rgba(37,211,102,.10)", border: "1px solid rgba(37,211,102,.30)" }}>
                      <div className="flex gap-2 font-bold text-[13px] text-emerald-300">
                        <CircleCheck size={16} /> Solicitação registrada
                      </div>
                      <p className="text-[13px] mt-1.5 leading-relaxed text-slate-300">
                        Se <b className="[overflow-wrap:anywhere]">{recEmail}</b> estiver cadastrado pelo administrador, uma senha
                        temporária será enviada para esse e-mail. Ao entrar, crie uma senha com no mínimo 12 caracteres.
                      </p>
                      <button className="login-ghost-btn mt-3" onClick={fecharRecuperacao}>Voltar para o login</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {planosAberto && <PopupPlanos onFechar={() => setPlanosAberto(false)} />}
    </div>
  );
}
