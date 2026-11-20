// Cabeçalho padrão das telas (rótulo pequeno + título), no estilo da prévia.
import type { ReactNode } from "react";

export default function Cabecalho({ rotulo, titulo, descricao, direita }: {
  rotulo: string;
  titulo: ReactNode;
  descricao?: ReactNode;
  direita?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 shrink-0">
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--primary)" }}>{rotulo}</p>
        <h1 className="font-display font-extrabold leading-tight mt-0.5" style={{ fontSize: "clamp(22px,2.8vw,30px)" }}>{titulo}</h1>
        {descricao && <p className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>{descricao}</p>}
      </div>
      {direita}
    </div>
  );
}
