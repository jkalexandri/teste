"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";
import { salvarDadosLegais } from "./actions";

type D = { responsavel: string; documento: string; endereco: string; emailPrivacidade: string; encarregadoNome: string; encarregadoEmail: string; foro: string };
const CAMPOS: { k: keyof D; rotulo: string; dica: string }[] = [
  { k: "responsavel", rotulo: "Responsável (razão social ou nome completo)", dica: "Ex.: Minha Empresa Ltda." },
  { k: "documento", rotulo: "CNPJ ou CPF", dica: "00.000.000/0001-00" },
  { k: "endereco", rotulo: "Endereço", dica: "Rua, número, bairro, cidade/UF, CEP" },
  { k: "emailPrivacidade", rotulo: "E-mail para privacidade", dica: "privacidade@filaproleads.com.br" },
  { k: "encarregadoNome", rotulo: "Encarregado de dados (DPO) — nome", dica: "Pode ser você" },
  { k: "encarregadoEmail", rotulo: "Encarregado de dados (DPO) — e-mail", dica: "" },
  { k: "foro", rotulo: "Foro (cidade/UF)", dica: "Ex.: São Paulo/SP" },
];

export default function FormDadosLegais({ inicial }: { inicial: D }) {
  const router = useRouter();
  const toast = useToast();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="card p-4 mt-3 grid sm:grid-cols-2 gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarDadosLegais(fd);
          setErro(r.ok ? "" : r.mensagem);
          if (r.ok) { toast(r.mensagem); router.refresh(); }
        });
      }}
    >
      {CAMPOS.map((c) => (
        <div key={c.k} className={c.k === "endereco" || c.k === "responsavel" ? "sm:col-span-2" : undefined}>
          <label className="label" htmlFor={`dl-${c.k}`}>{c.rotulo}</label>
          <input id={`dl-${c.k}`} name={c.k} className="input" defaultValue={inicial[c.k]} placeholder={c.dica} />
        </div>
      ))}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
        {erro && <span className="text-[12px] font-semibold text-[#b42318]">{erro}</span>}
      </div>
    </form>
  );
}
