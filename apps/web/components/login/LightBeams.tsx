"use client";

// 5 feixes de luz correndo pelos circuitos do login, em loop infinito.
// Lógica copiada da prévia, com a decisão do dono do projeto:
// cada feixe percorre a trilha em 4,2 s (duração fixa — docs/decisoes.md #2).
// Trilha, direção, cor, tamanho e rastro continuam aleatórios a cada volta.
import { useEffect, useRef } from "react";

const BEAM_DURATION_MS = 4200;
const BEAM_COUNT = 5;

// Trilhas por onde os feixes podem correr (copiadas da prévia).
const BEAM_PATHS = [
  "M-20 28 H420 L480 88 H760 L820 148 H1020",
  "M-20 872 H300 L360 812 H620 L680 752 H900",
  "M1460 28 H1040 L980 88 H760",
  "M1460 872 H1120 L1060 812 H860 L800 752 H620",
  "M28 -20 V240 L88 300 V560 L148 620 V920",
  "M1412 -20 V210 L1352 270 V520 L1292 580 V920",
  "M28 28 H180 L240 88 H380",
  "M1412 28 H1260 L1200 88 H1060",
  "M28 872 H210 L270 812 H430",
  "M1412 872 H1230 L1170 812 H1010",
  "M612 334 H760 L820 394 H960",
  "M470 492 V590 L530 650 H660",
  "M986 224 V330 L1040 384 H1140",
  "M1080 416 V520 L1140 580 H1280",
  "M-20 96 H172 L232 156 H430",
  "M-20 214 H118 L178 274 H352 L412 334 H612",
  "M-20 512 H148 L208 572 H402",
  "M-20 668 H212 L272 728 H486",
  "M1460 138 H1182 L1122 198 H986",
  "M1460 342 H1248 L1198 392 H1080",
  "M1460 712 H1292 L1232 652 H1118",
  "M88 -20 V296 L148 356 V692",
  "M430 156 V252 L470 292 H612",
  "M252 362 V486 L292 526 H470",
  "M760 -20 V168 L800 208 H928",
  "M760 920 V756 L800 716 H912",
];

const BEAM_COLORS = ["#7dffb8", "#2dd4ff", "#25D366", "#7fe7ff", "#a7ffcb", "#4dd8ff"];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

type Beam = {
  pathIdx: number;
  dir: 1 | -1;
  startAt: number;
  resumeAt: number;
  size: number;
  color: string;
  trail: number;
  traveling: boolean;
};

export default function LightBeams() {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const headRefs = useRef<(SVGCircleElement | null)[]>([]);
  const glowRefs = useRef<(SVGCircleElement | null)[]>([]);
  const trailRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let stopped = false;
    const now = performance.now();

    const beams: Beam[] = Array.from({ length: BEAM_COUNT }, (_, i) => ({
      pathIdx: Math.floor(Math.random() * BEAM_PATHS.length),
      dir: Math.random() < 0.5 ? 1 : -1,
      startAt: 0,
      resumeAt: now + rand(0, 2600) + i * rand(80, 420),
      size: rand(2.4, 3.9),
      color: BEAM_COLORS[i % BEAM_COLORS.length],
      trail: rand(46, 92),
      traveling: false,
    }));

    // Começa cada feixe em uma trilha diferente.
    const used = new Set<number>();
    beams.forEach((b) => {
      while (used.has(b.pathIdx)) b.pathIdx = Math.floor(Math.random() * BEAM_PATHS.length);
      used.add(b.pathIdx);
    });

    const hide = (i: number) => {
      headRefs.current[i]?.setAttribute("opacity", "0");
      glowRefs.current[i]?.setAttribute("opacity", "0");
      trailRefs.current[i]?.setAttribute("opacity", "0");
    };

    // Sorteia uma nova trilha (diferente da anterior) e reinicia o feixe.
    const restart = (b: Beam, t: number) => {
      let next = Math.floor(Math.random() * BEAM_PATHS.length);
      while (next === b.pathIdx) next = Math.floor(Math.random() * BEAM_PATHS.length);
      b.pathIdx = next;
      b.dir = Math.random() < 0.5 ? 1 : -1;
      b.size = rand(2.4, 3.9);
      b.color = pick(BEAM_COLORS);
      b.trail = rand(46, 92);
      b.startAt = t;
      b.traveling = true;
    };

    const tick = (t: number) => {
      if (stopped) return;
      beams.forEach((b, i) => {
        const path = pathRefs.current[b.pathIdx];
        const head = headRefs.current[i];
        const glow = glowRefs.current[i];
        const trail = trailRefs.current[i];
        if (!path || !head || !glow || !trail) return;

        if (!b.traveling) {
          hide(i);
          if (t >= b.resumeAt) restart(b, t);
          return;
        }

        const total = path.getTotalLength();
        if (!total) return;
        const progress = (t - b.startAt) / BEAM_DURATION_MS;
        if (progress >= 1) {
          hide(i);
          b.traveling = false;
          b.resumeAt = t + rand(350, 1500);
          return;
        }

        const dist = b.dir === 1 ? progress * total : (1 - progress) * total;
        const p = path.getPointAtLength(dist);
        head.setAttribute("cx", String(p.x));
        head.setAttribute("cy", String(p.y));
        head.setAttribute("r", String(b.size));
        head.setAttribute("fill", b.color);
        head.setAttribute("opacity", "1");
        glow.setAttribute("cx", String(p.x));
        glow.setAttribute("cy", String(p.y));
        glow.setAttribute("r", String(b.size * 3.4));
        glow.setAttribute("fill", b.color);
        glow.setAttribute("opacity", "0.32");

        // Rastro: 14 segmentos atrás da cabeça do feixe.
        const steps = 14;
        let d = "";
        for (let s = 0; s <= steps; s++) {
          const back = (s / steps) * b.trail;
          const at = b.dir === 1 ? Math.max(0, dist - back) : Math.min(total, dist + back);
          const q = path.getPointAtLength(at);
          d += `${s === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)} `;
        }
        trail.setAttribute("d", d);
        trail.setAttribute("stroke", b.color);
        trail.setAttribute("stroke-width", String(b.size * 1.35));
        trail.setAttribute("stroke-linecap", "round");
        trail.setAttribute("opacity", "0.85");
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <g className="light-beams" aria-hidden="true" style={{ pointerEvents: "none" }}>
      {BEAM_PATHS.map((d, i) => (
        <path
          key={i}
          ref={(el) => { pathRefs.current[i] = el; }}
          d={d}
          fill="none"
          stroke="none"
          opacity={0}
          style={{ pointerEvents: "none" }}
        />
      ))}
      {Array.from({ length: BEAM_COUNT }, (_, i) => (
        <g key={`beam-${i}`} style={{ pointerEvents: "none" }}>
          <path ref={(el) => { trailRefs.current[i] = el; }} fill="none" opacity={0} style={{ pointerEvents: "none" }} />
          <circle ref={(el) => { glowRefs.current[i] = el; }} r={0} opacity={0} style={{ pointerEvents: "none" }} />
          <circle ref={(el) => { headRefs.current[i] = el; }} r={0} opacity={0} className="light-beam-head" style={{ pointerEvents: "none" }} />
        </g>
      ))}
    </g>
  );
}
