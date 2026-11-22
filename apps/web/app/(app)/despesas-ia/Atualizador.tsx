"use client";

// Atualiza a tela de despesas sozinha (decisão #77) — só enquanto a aba está visível.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Atualizador({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, segundos * 1000);
    return () => window.clearInterval(t);
  }, [router, segundos]);
  return null;
}
