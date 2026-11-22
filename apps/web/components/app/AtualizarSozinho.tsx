"use client";

// Recarrega os dados da tela (componentes do servidor) a cada N segundos, sem perder o que está aberto.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AtualizarSozinho({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
