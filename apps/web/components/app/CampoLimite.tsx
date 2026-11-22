"use client";

// Campo de limite (decisões #58 e #77): "Ilimitado" ou um máximo.
// Envia no formulário: ilimitado=on (quando marcado) e limiteLeads=<número>.
// Com outro `campo` (ex.: limiteMateriais): <campo>Ilimitado=on e <campo>=<número>.
import { useState } from "react";

export default function CampoLimite({ valor, rotulo = "Limite de leads", id = "limiteLeads", dica, campo = "limiteLeads", placeholder = "Máximo de leads" }: {
  valor: number | null;
  rotulo?: string;
  id?: string;
  dica?: string;
  campo?: string;
  placeholder?: string;
}) {
  const [ilimitado, setIlimitado] = useState(valor == null);
  return (
    <div>
      <span className="label">{rotulo}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] font-bold cursor-pointer shrink-0">
          <input type="checkbox" name={campo === "limiteLeads" ? "ilimitado" : `${campo}Ilimitado`} checked={ilimitado} onChange={(e) => setIlimitado(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          Ilimitado
        </label>
        <input
          id={id}
          name={campo}
          type="number"
          min={1}
          className="input"
          disabled={ilimitado}
          defaultValue={valor ?? ""}
          placeholder={ilimitado ? "Sem limite" : placeholder}
          aria-label={`${rotulo}: máximo`}
        />
      </div>
      {dica && <p className="help mt-0.5">{dica}</p>}
    </div>
  );
}

