"use client";

// Convite discreto para ativar a verificação em duas etapas (decisão #166): só para o dono da conta que ainda não ativou.
// "Agora não" esconde por 14 dias neste navegador (conveniência de cada pessoa; o armazenamento do navegador pode falhar).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, X } from "@/components/icons";

const CHAVE = "filapro-convite-2fa";
const DIAS_ESCONDIDO = 14;

export default function ConviteVerificacao() {
  const caminho = usePathname();
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    try {
      const ate = Number(window.localStorage.getItem(CHAVE) || 0);
      setVisivel(Date.now() > ate);
    } catch {
      setVisivel(true);
    }
  }, []);
  if (!visivel || caminho === "/seguranca") return null;
  function esconder() {
    try { window.localStorage.setItem(CHAVE, String(Date.now() + DIAS_ESCONDIDO * 86400_000)); } catch { /* sem armazenamento: só fecha agora */ }
    setVisivel(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 mb-3 text-[12.5px]" style={{ background: "var(--primary-soft)", border: "1px solid var(--border)", color: "var(--primary-dark)" }} data-testid="convite-2fa">
      <ShieldCheck size={16} />
      <span className="font-semibold">Proteja a sua conta: ative a verificação em duas etapas.</span>
      <Link href="/seguranca" className="font-bold underline">Ativar agora</Link>
      <button type="button" onClick={esconder} className="ml-auto flex items-center gap-1 font-semibold" style={{ color: "var(--muted)" }} aria-label="Agora não">
        <X size={14} /> Agora não
      </button>
    </div>
  );
}
