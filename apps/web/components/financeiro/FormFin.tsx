"use client";

// Formulário que chama uma ação do servidor e mostra o resultado (decisão #106).
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/app/Toast";

type Acao = (f: FormData) => Promise<{ ok: boolean; mensagem: string }>;

export default function FormFin({ acao, children, className, limpar = true, confirmar, aoTerminar }: {
  acao: Acao; children: ReactNode; className?: string; limpar?: boolean; confirmar?: string; aoTerminar?: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [ocupado, setOcupado] = useState(false);
  return (
    <form ref={ref} className={className} onSubmit={async (e) => {
      e.preventDefault();
      if (confirmar && !confirm(confirmar)) return;
      setOcupado(true);
      const r = await acao(new FormData(e.currentTarget)).catch(() => ({ ok: false, mensagem: "Não foi possível salvar agora." }));
      setOcupado(false);
      toast(r.mensagem, r.ok ? "ok" : "erro");
      if (r.ok) { if (limpar) ref.current?.reset(); aoTerminar?.(); router.refresh(); }
    }}>
      <fieldset disabled={ocupado} className="contents">{children}</fieldset>
    </form>
  );
}
