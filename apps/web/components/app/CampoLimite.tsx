"use client";

// Campo de limite de leads (decisão #58): "Ilimitado" ou um máximo.
// Envia no formulário: ilimitado=on (quando marcado) e limiteLeads=<número>.
import { useState } from "react";

export default function CampoLimite({ valor, rotulo = "Limite de leads", id = "limiteLeads", dica }: {
  valor: number | null;
  rotulo?: string;
  id?: string;
  dica?: string;
}) {
  const [ilimitado, setIlimitado] = useState(valor == null);
  return (
    <div>
      <span className="label">{rotulo}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] font-bold cursor-pointer shrink-0">
          <input type="checkbox" name="ilimitado" checked={ilimitado} onChange={(e) => setIlimitado(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
          Ilimitado
        </label>
        <input
          id={id}
          name="limiteLeads"
          type="number"
          min={1}
          className="input"
          disabled={ilimitado}
          defaultValue={valor ?? ""}
          placeholder={ilimitado ? "Sem limite" : "Máximo de leads"}
          aria-label={`${rotulo}: máximo`}
        />
      </div>
      {dica && <p className="help mt-0.5">{dica}</p>}
    </div>
  );
}

