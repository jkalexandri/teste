"use client";

// Barra de menu do login (decisão #186): Planos e Preços | Fale conosco | Sobre.
// Na borda verde corre um pulso estilo cometa: luz na ponta e cauda azul em degradê que ocupa 70% do percurso, uma volta a cada 4 s.
// Os nomes pulsam no mesmo estilo das luzes paradas da tela. Com "reduzir movimento" ligado no sistema, nada se mexe.
import { useEffect, useRef, useState } from "react";
import PopupPlanos from "@/components/planos/PopupPlanos";
import ChatInteressado from "@/components/planos/ChatInteressado";
import SobreLogin from "./SobreLogin";

const VOLTA_MS = 4000;        // uma volta completa da cabeça
const CAUDA = 0.7;            // a cauda ocupa 70% do percurso
const SEGMENTOS = 64;
const RAIO = 9;               // canto arredondado da barra (px)
const ESCALA_PONTA = 0.8;     // tamanho e brilho da luz da ponta: 20% menores que na prévia aprovada

/** Posição no contorno do retângulo arredondado, em sentido horário, saindo do topo logo após o canto esquerdo. */
function criarContorno(w: number, h: number, r: number) {
  const reta1 = w - 2 * r, reta2 = h - 2 * r, arco = (Math.PI * r) / 2;
  const trechos = [reta1, arco, reta2, arco, reta1, arco, reta2, arco];
  const total = trechos.reduce((a, b) => a + b, 0);
  const ponto = (sRaw: number) => {
    let s = ((sRaw % total) + total) % total;
    let i = 0;
    while (s > trechos[i]!) { s -= trechos[i]!; i++; }
    const a = s / r; // ângulo percorrido nos arcos
    switch (i) {
      case 0: return { x: r + s, y: 0 };
      case 1: return { x: w - r + r * Math.sin(a), y: r - r * Math.cos(a) };
      case 2: return { x: w, y: r + s };
      case 3: return { x: w - r + r * Math.cos(a), y: h - r + r * Math.sin(a) };
      case 4: return { x: w - r - s, y: h };
      case 5: return { x: r - r * Math.sin(a), y: h - r + r * Math.cos(a) };
      case 6: return { x: 0, y: h - r - s };
      default: return { x: r - r * Math.cos(a), y: r - r * Math.sin(a) };
    }
  };
  return { total, ponto };
}

export default function BarraMenuLogin() {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [planos, setPlanos] = useState(false);
  const [chat, setChat] = useState(false);
  const [sobre, setSobre] = useState(false);

  useEffect(() => {
    const el = caixa.current, cv = tela.current;
    if (!el || !cv) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, contorno = criarContorno(1, 1, 1), quadro = 0;
    const medir = () => {
      const caixaPx = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // o traço fica sobre a linha da borda (meio pixel para dentro)
      w = Math.max(40, caixaPx.width - 1.5); h = Math.max(24, caixaPx.height - 1.5);
      cv.width = Math.round(caixaPx.width * dpr); cv.height = Math.round(caixaPx.height * dpr);
      cv.style.width = `${caixaPx.width}px`; cv.style.height = `${caixaPx.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0.75 * dpr, 0.75 * dpr);
      contorno = criarContorno(w, h, Math.min(RAIO, h / 2 - 1));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);

    const desenhar = (agora: number) => {
      const cabeca = ((agora % VOLTA_MS) / VOLTA_MS) * contorno.total;
      const tamanhoCauda = contorno.total * CAUDA;
      ctx.clearRect(-2, -2, w + 6, h + 6);
      ctx.lineCap = "round";
      // Cauda de cometa: afina, esmaece e passa de azul-ciano (perto da cabeça) a azul profundo (na ponta da cauda)
      for (let k = 0; k < SEGMENTOS; k++) {
        const f = (k + 1) / SEGMENTOS;
        const a = contorno.ponto(cabeca - tamanhoCauda + (tamanhoCauda * k) / SEGMENTOS);
        const b = contorno.ponto(cabeca - tamanhoCauda + (tamanhoCauda * (k + 1.4)) / SEGMENTOS);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${Math.round(47 + 103 * f * f)},${Math.round(120 + 105 * f)},255,${Math.pow(f, 1.9).toFixed(3)})`;
        ctx.lineWidth = 0.6 + 2.6 * Math.pow(f, 1.3);
        ctx.shadowColor = "rgba(77,216,255,.9)"; ctx.shadowBlur = 5 * f;
        ctx.stroke();
      }
      // Luz da ponta (20% menor e 20% mais fraca)
      const p = contorno.ponto(cabeca);
      ctx.shadowBlur = 0;
      const halo = 11 * ESCALA_PONTA;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * ESCALA_PONTA})`); g.addColorStop(0.35, `rgba(191,233,255,${0.8 * ESCALA_PONTA})`); g.addColorStop(1, "rgba(47,155,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, halo, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = `rgba(77,216,255,${0.9 * ESCALA_PONTA})`; ctx.shadowBlur = 8 * ESCALA_PONTA;
      ctx.fillStyle = `rgba(255,255,255,${ESCALA_PONTA + 0.2})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * ESCALA_PONTA, 0, Math.PI * 2); ctx.fill();
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => { cancelAnimationFrame(quadro); obs.disconnect(); };
  }, []);

  // Visual do menu aprovado (print do dono): sem fundo, borda cinza fina arredondada e nomes em azul-ciano
  const item = "login-menu-item px-2.5 sm:px-4 py-1.5 text-[12.5px] sm:text-[14px] font-semibold tracking-[.02em] whitespace-nowrap";
  // No computador (altura suficiente) a barra fica fixa no topo da coluna, como no layout aprovado; no celular e em telas baixas fica acima do card
  const posicao = "lg:[@media(min-height:720px)]:absolute lg:[@media(min-height:720px)]:top-5 lg:[@media(min-height:720px)]:left-1/2 lg:[@media(min-height:720px)]:-translate-x-1/2 lg:[@media(min-height:720px)]:w-[calc(100%-1.5rem)]";
  return (
    <>
      <div ref={caixa} className={`login-menu-barra relative w-full max-w-[420px] mb-1.5 ${posicao}`} data-testid="barra-menu-login">
        <nav className="relative flex items-center justify-around rounded-[9px]" aria-label="Menu" style={{ border: "1.5px solid rgba(150,160,166,.75)", color: "#56bfdc", ["--pulso" as string]: "77,216,255" }}>
          <button type="button" className={item} style={{ ["--atraso" as string]: "0s" }} onClick={() => setPlanos(true)} data-testid="menu-planos">Planos e Preços</button>
          <button type="button" className={item} style={{ ["--atraso" as string]: ".6s" }} onClick={() => setChat(true)} data-testid="menu-fale-conosco">Fale conosco</button>
          <button type="button" className={item} style={{ ["--atraso" as string]: "1.2s" }} onClick={() => setSobre(true)} data-testid="menu-sobre">Sobre</button>
        </nav>
        <canvas ref={tela} aria-hidden className="absolute left-0 top-0 pointer-events-none" data-testid="pulso-menu" />
      </div>
      {planos && <PopupPlanos onFechar={() => setPlanos(false)} />}
      {chat && <ChatInteressado onFechar={() => setChat(false)} />}
      {sobre && <SobreLogin onFechar={() => setSobre(false)} />}
    </>
  );
}
