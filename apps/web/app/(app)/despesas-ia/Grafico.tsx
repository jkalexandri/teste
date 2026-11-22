"use client";

// Gráfico de barras do gasto com IA (uma série: cor primária, sem legenda; dica ao passar o mouse;
// barras finas com cantos de 4px na ponta, 2px de espaço entre elas; grade discreta; tabela opcional).
import { useState } from "react";

export type Barra = { rotulo: string; valor: number; chamadas: number };

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;

function escala(max: number) {
  if (max <= 0) return [0, 0.01];
  const passo = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / passo) * passo;
  return [0, topo];
}

export default function Grafico({ barras, cotacao }: { barras: Barra[]; cotacao: number | null }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 900, H = 240, ml = 56, mb = 26, mt = 10, mr = 8;
  const max = Math.max(0, ...barras.map((b) => b.valor));
  const [, topo] = escala(max);
  const larg = (W - ml - mr) / Math.max(1, barras.length);
  const y = (v: number) => mt + (H - mt - mb) * (1 - v / topo!);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * topo!);
  const cadaRotulo = Math.ceil(barras.length / 12);
  const b = foco != null ? barras[foco] : null;

  return (
    <div className="mt-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Gasto com IA no período">
          {marcas.map((m) => (
            <g key={m}>
              <line x1={ml} x2={W - mr} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth={1} />
              <text x={ml - 6} y={y(m) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{m === 0 ? "0" : `$${m.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}`}</text>
            </g>
          ))}
          {barras.map((br, i) => {
            const x = ml + i * larg + 1, w = Math.max(2, larg - 2);
            const h = br.valor > 0 ? Math.max(2, y(0) - y(br.valor)) : 0;
            const r = Math.min(4, w / 2, h);
            return (
              <g key={i} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} data-barra={br.rotulo}>
                {/* área de toque maior que a barra */}
                <rect x={ml + i * larg} y={mt} width={larg} height={H - mt - mb} fill="transparent" />
                {h > 0 && <path d={`M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`} fill="var(--primary)" opacity={foco == null || foco === i ? 1 : 0.45} />}
                {i % cadaRotulo === 0 && <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{br.rotulo}</text>}
              </g>
            );
          })}
          <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
        </svg>
        {b && (
          <div className="absolute top-1 right-2 card px-2.5 py-1.5 text-[12px] pointer-events-none" role="status">
            <b>{b.rotulo}</b> • {usd(b.valor)}{cotacao ? ` • R$ ${(b.valor * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""} • {b.chamadas} chamadas
          </div>
        )}
      </div>
      <details className="mt-1">
        <summary className="text-[12px] font-bold cursor-pointer">Ver em tabela</summary>
        <div className="table-wrap mt-1"><table style={{ fontSize: 12 }}>
          <thead><tr><th>{barras.length === 24 ? "Hora" : "Dia"}</th><th>Chamadas</th><th>Dólar</th>{cotacao && <th>Reais</th>}</tr></thead>
          <tbody>{barras.filter((x) => x.chamadas > 0).map((x) => (
            <tr key={x.rotulo}><td>{x.rotulo}</td><td>{x.chamadas}</td><td>{usd(x.valor)}</td>{cotacao && <td>R$ {(x.valor * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>}</tr>
          ))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
