"use client";

// Fundo de circuitos do login — geometria copiada 1:1 da prévia.
// viewBox 1440x900, preserveAspectRatio "xMidYMid slice".
// NÃO ALTERAR coordenadas, cores, opacidades ou classes sem ordem expressa.
import { useRef, useState, type MouseEvent } from "react";
import LightBeams from "./LightBeams";

const G = "#25D366"; // verde WhatsApp
const C = "#2dd4ff"; // ciano
const W = "#ffffff"; // branco

// Trilhas: [d, cor, opacidade, espessura, classe]
const TRACES: [string, string, string, string, string?][] = [
  ["M-20 28 H420 L480 88 H760 L820 148 H1020", G, ".52", "2.6", "circuit-glow"],
  ["M-20 872 H300 L360 812 H620 L680 752 H900", C, ".5", "2.5", "circuit-glow-cyan"],
  ["M1460 28 H1040 L980 88 H760", C, ".48", "2.5", "circuit-glow-cyan"],
  ["M1460 872 H1120 L1060 812 H860 L800 752 H620", G, ".5", "2.6", "circuit-glow"],
  ["M28 -20 V240 L88 300 V560 L148 620 V920", G, ".5", "2.5", "circuit-glow"],
  ["M1412 -20 V210 L1352 270 V520 L1292 580 V920", C, ".48", "2.5", "circuit-glow-cyan"],
  ["M28 28 H180 L240 88 H380", G, ".55", "2.4", "circuit-glow"],
  ["M180 28 V140 L240 200 H360", C, ".45", "2.2"],
  ["M1412 28 H1260 L1200 88 H1060", C, ".52", "2.4", "circuit-glow-cyan"],
  ["M1260 28 V130 L1200 190 H1080", G, ".45", "2.2"],
  ["M28 872 H210 L270 812 H430", C, ".5", "2.4", "circuit-glow-cyan"],
  ["M210 872 V760 L270 700 H390", G, ".44", "2.2"],
  ["M1412 872 H1230 L1170 812 H1010", G, ".52", "2.4", "circuit-glow"],
  ["M1230 872 V770 L1170 710 H1050", C, ".44", "2.2"],
  ["M612 334 H760 L820 394 H960", C, ".44", "2.2"],
  ["M470 492 V590 L530 650 H660", G, ".42", "2.1"],
  ["M986 224 V330 L1040 384 H1140", G, ".42", "2.1"],
  ["M1080 416 V520 L1140 580 H1280", C, ".42", "2.1"],
  ["M402 572 H560 L620 632 H780", W, ".36", "2"],
  ["M-20 96 H172 L232 156 H430", G, ".55", "2.6", "circuit-glow"],
  ["M-20 214 H118 L178 274 H352 L412 334 H612", C, ".5", "2.4", "circuit-glow-cyan"],
  ["M-20 362 H252 L312 422 H548", W, ".42", "2.2"],
  ["M-20 512 H148 L208 572 H402", G, ".52", "2.5", "circuit-glow"],
  ["M-20 668 H212 L272 728 H486", C, ".48", "2.4", "circuit-glow-cyan"],
  ["M-20 812 H96 L156 752 H330", W, ".4", "2.2"],
  ["M88 -20 V296 L148 356 V692", G, ".5", "2.4", "circuit-glow"],
  ["M312 -20 V128 L372 188 V462", W, ".4", "2.1"],
  ["M512 -20 V212 L472 252 V498", C, ".48", "2.3"],
  ["M430 156 V252 L470 292 H612", G, ".5", "2.4", "circuit-glow"],
  ["M178 274 V392 L238 452 H402", W, ".38", "2.1"],
  ["M252 362 V486 L292 526 H470", C, ".46", "2.3"],
  ["M612 334 V452 L572 492 H470", G, ".44", "2.2", "circuit-flow"],
  ["M1460 138 H1182 L1122 198 H986", C, ".52", "2.5", "circuit-glow-cyan"],
  ["M1460 342 H1248 L1198 392 H1080", G, ".5", "2.4", "circuit-glow"],
  ["M1460 712 H1292 L1232 652 H1118", W, ".4", "2.2"],
  ["M1232 652 V560 L1192 520 V392", C, ".46", "2.3"],
  ["M1122 198 V318 L1082 358 H986", G, ".44", "2.2", "circuit-flow"],
  ["M760 -20 V168 L800 208 H928", W, ".38", "2.1"],
  ["M760 920 V756 L800 716 H912", G, ".46", "2.3"],
];

// Chips: [x, y, largura/altura, rx, cor, opacidade, preenchido?]
const CHIPS: [string, string, string, string, string, string, boolean?][] = [
  ["424", "126", "68", "6", G, ".55"],
  ["439", "141", "38", "2", G, ".5"],
  ["451", "153", "14", "1", C, ".5", true],
  ["980", "170", "60", "6", C, ".52"],
  ["993", "183", "34", "2", W, ".42"],
  ["1074", "366", "56", "6", G, ".5"],
  ["1086", "378", "32", "2", G, ".46"],
  ["202", "542", "62", "6", C, ".52"],
  ["215", "555", "36", "2", W, ".42"],
  ["464", "496", "54", "6", G, ".5"],
  ["475", "507", "32", "2", C, ".46"],
  ["1180", "620", "56", "6", G, ".48"],
  ["1192", "632", "32", "2", C, ".44"],
];

// Nós: anel externo (interativo), anel interno opcional e ponto central.
type Node = {
  cx: string; cy: string; color: string;
  outer: [string, string, string]; // r, opacidade, espessura
  cls?: string;
  ring?: [string, string, string]; // r, opacidade, espessura
  dot: [string, string]; // r, opacidade
};
const NODES: Node[] = [
  { cx: "232", cy: "156", color: G, outer: ["11", ".55", "2.2"], cls: "circuit-node", ring: ["5", ".4", "1.4"], dot: ["3.2", ".85"] },
  { cx: "178", cy: "274", color: C, outer: ["11", ".52", "2.2"], cls: "circuit-node-cyan", ring: ["5", ".4", "1.4"], dot: ["3.2", ".8"] },
  { cx: "312", cy: "422", color: W, outer: ["10", ".45", "2"], ring: ["4.5", ".35", "1.3"], dot: ["2.8", ".7"] },
  { cx: "412", cy: "334", color: G, outer: ["11", ".52", "2.2"], cls: "circuit-node", ring: ["5", ".4", "1.4"], dot: ["3.2", ".85"] },
  { cx: "148", cy: "356", color: G, outer: ["10", ".5", "2"], cls: "circuit-node", ring: ["4.5", ".38", "1.3"], dot: ["2.8", ".8"] },
  { cx: "208", cy: "572", color: C, outer: ["10", ".5", "2"], cls: "circuit-node-cyan", ring: ["4.5", ".38", "1.3"], dot: ["2.8", ".8"] },
  { cx: "272", cy: "728", color: W, outer: ["10", ".42", "2"], ring: ["4.5", ".32", "1.3"], dot: ["2.8", ".65"] },
  { cx: "1122", cy: "198", color: C, outer: ["11", ".52", "2.2"], cls: "circuit-node-cyan", ring: ["5", ".4", "1.4"], dot: ["3.2", ".8"] },
  { cx: "1198", cy: "392", color: G, outer: ["10", ".5", "2"], cls: "circuit-node", ring: ["4.5", ".38", "1.3"], dot: ["2.8", ".8"] },
  { cx: "1232", cy: "652", color: W, outer: ["10", ".42", "2"], ring: ["4.5", ".32", "1.3"], dot: ["2.8", ".65"] },
  { cx: "800", cy: "208", color: W, outer: ["9", ".4", "1.8"], ring: ["4", ".32", "1.2"], dot: ["2.6", ".6"] },
  { cx: "372", cy: "188", color: G, outer: ["9", ".48", "1.8"], cls: "circuit-node", ring: ["4", ".36", "1.2"], dot: ["2.6", ".75"] },
  { cx: "470", cy: "292", color: C, outer: ["9", ".46", "1.8"], cls: "circuit-node-cyan", ring: ["4", ".34", "1.2"], dot: ["2.6", ".75"] },
  { cx: "88", cy: "300", color: G, outer: ["10", ".5", "2"], cls: "circuit-node", dot: ["3", ".85"] },
  { cx: "1352", cy: "270", color: C, outer: ["10", ".5", "2"], cls: "circuit-node-cyan", dot: ["3", ".8"] },
  { cx: "480", cy: "88", color: G, outer: ["10", ".5", "2"], cls: "circuit-node", dot: ["3", ".85"] },
  { cx: "980", cy: "88", color: C, outer: ["10", ".5", "2"], cls: "circuit-node-cyan", dot: ["3", ".8"] },
  { cx: "360", cy: "812", color: C, outer: ["10", ".48", "2"], cls: "circuit-node-cyan", dot: ["3", ".8"] },
  { cx: "1060", cy: "812", color: G, outer: ["10", ".5", "2"], cls: "circuit-node", dot: ["3", ".85"] },
  { cx: "240", cy: "88", color: G, outer: ["9", ".48", "1.8"], cls: "circuit-node", dot: ["2.6", ".8"] },
  { cx: "1200", cy: "88", color: C, outer: ["9", ".48", "1.8"], cls: "circuit-node-cyan", dot: ["2.6", ".8"] },
];

// Trilhas de energia (tracejado correndo): [d, cor, espessura, classe]
const ENERGY: [string, string, string, string][] = [
  ["M-20 28 H420 L480 88 H760 L820 148 H1020", "#7dffb8", "3", "energy-a"],
  ["M-20 872 H300 L360 812 H620 L680 752 H900", "#7fe7ff", "3", "energy-b"],
  ["M1460 28 H1040 L980 88 H760", "#7fe7ff", "2.8", "energy-c"],
  ["M28 28 H180 L240 88 H380", "#7dffb8", "2.6", "energy-d"],
  ["M1412 872 H1230 L1170 812 H1010", "#7dffb8", "2.8", "energy-e"],
  ["M-20 512 H148 L208 572 H402", "#7dffb8", "2.6", "energy-f"],
  ["M1460 342 H1248 L1198 392 H1080", "#7dffb8", "2.6", "energy-g"],
  ["M88 -20 V296 L148 356 V692", "#7fe7ff", "2.6", "energy-h"],
];

// Sequências que acendem em ordem: [d, cor, classe]
const SEQ: [string, string, string][] = [
  ["M172 96 H232 L292 156 H430", "#7dffb8", "seq-1"],
  ["M1182 138 H1122 L1062 198 H986", "#7fe7ff", "seq-2"],
  ["M480 88 H760 L820 148 H1020", "#7dffb8", "seq-3"],
  ["M300 872 H360 L420 812 H620", "#7fe7ff", "seq-4"],
];

type ClickPulse = { x: number; y: number; color: string; key: number };

export default function CircuitBackground() {
  // Pulso exibido por 1s quando o usuário clica em um nó.
  const [pulse, setPulse] = useState<ClickPulse | null>(null);
  const timer = useRef<number | null>(null);

  function handleClick(ev: MouseEvent<SVGSVGElement>) {
    const el = ev.target as Element | null;
    if (!el || el.tagName.toLowerCase() !== "circle") return;
    const x = Number(el.getAttribute("cx"));
    const y = Number(el.getAttribute("cy"));
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    const cls = el.getAttribute("class") || "";
    const color = cls.includes("cyan") ? C : cls.includes("node") ? G : W;
    setPulse({ x, y, color, key: Date.now() });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPulse(null), 1000);
  }

  return (
    <svg
      className={`login-circuit${pulse ? " is-node-active" : ""}`}
      onClick={handleClick}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* Trilhas */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {TRACES.map(([d, stroke, op, sw, cls], i) => (
          <path key={i} d={d} stroke={stroke} strokeOpacity={op} strokeWidth={sw} className={cls} />
        ))}
      </g>

      {/* Chips */}
      <g fill="none" strokeWidth="2.2">
        {CHIPS.map(([x, y, s, rx, stroke, op, filled], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={s}
            height={s}
            rx={rx}
            stroke={stroke}
            strokeOpacity={op}
            {...(filled ? { fill: "#050A14", fillOpacity: ".55" } : {})}
          />
        ))}
      </g>

      {/* Nós (a ordem dos círculos importa para os atrasos de animação nth-of-type) */}
      <g fill="none">
        {NODES.flatMap((n, i) => {
          const items = [
            <circle key={`${i}o`} cx={n.cx} cy={n.cy} r={n.outer[0]} stroke={n.color} strokeOpacity={n.outer[1]} strokeWidth={n.outer[2]} className={n.cls} />,
          ];
          if (n.ring) {
            items.push(<circle key={`${i}r`} cx={n.cx} cy={n.cy} r={n.ring[0]} stroke={n.color} strokeOpacity={n.ring[1]} strokeWidth={n.ring[2]} />);
          }
          items.push(<circle key={`${i}d`} cx={n.cx} cy={n.cy} r={n.dot[0]} fill={n.color} fillOpacity={n.dot[1]} />);
          return items;
        })}
      </g>

      {/* Pulsos */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-20 96 H172 L232 156 H430" stroke="#7dffb8" strokeOpacity=".9" strokeWidth="3" className="circuit-pulse" />
        <path d="M1460 138 H1182 L1122 198 H986" stroke="#7fe7ff" strokeOpacity=".9" strokeWidth="3" className="circuit-pulse-slow" />
      </g>

      {/* Energia */}
      <g className="circuit-energy" aria-hidden="true">
        {ENERGY.map(([d, stroke, sw, cls]) => (
          <path key={cls} d={d} stroke={stroke} strokeWidth={sw} className={cls} />
        ))}
      </g>

      {/* Sequências */}
      <g className="circuit-seq" aria-hidden="true">
        {SEQ.map(([d, stroke, cls]) => (
          <path key={cls} d={d} stroke={stroke} className={cls} />
        ))}
      </g>

      {/* Pulso do clique em um nó */}
      {pulse && (
        <g aria-hidden="true" key={pulse.key}>
          <circle cx={pulse.x} cy={pulse.y} r="18" fill={pulse.color} className="circuit-node-click-glow" />
          <circle cx={pulse.x} cy={pulse.y} r="16" fill="none" stroke={pulse.color} strokeWidth="2.5" className="circuit-node-click-pulse" />
        </g>
      )}

      <LightBeams />
    </svg>
  );
}
