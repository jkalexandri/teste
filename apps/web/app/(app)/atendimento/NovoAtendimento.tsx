"use client";

// Escolher qualquer cliente para abrir a conversa (o Super Admin pode chamar quem quiser — decisão #102).
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NovoAtendimento({ clientes }: { clientes: { id: string; rotulo: string }[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const achados = busca.trim().length >= 2 ? clientes.filter((c) => c.rotulo.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 8) : [];
  return (
    <div>
      <label className="label" htmlFor="busca-cliente">Falar com um cliente</label>
      <input id="busca-cliente" className="input !py-1.5 max-w-[420px]" placeholder="Digite o nome, e-mail ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {achados.length > 0 && (
        <div className="mt-1 max-w-[420px] rounded-lg" style={{ border: "1px solid var(--border)" }}>
          {achados.map((c) => (
            <button key={c.id} type="button" className="block w-full text-left px-2 py-1.5 text-[12px] hover:underline" onClick={() => { setBusca(""); router.push(`/atendimento?cliente=${c.id}`); }}>{c.rotulo}</button>
          ))}
        </div>
      )}
    </div>
  );
}
