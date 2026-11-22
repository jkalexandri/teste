"use client";

// Aviso de atualização por cima do login (decisão #103) — o desenho do login não muda.
// Só o Super Admin pode entrar durante a manutenção (o servidor recusa os demais).
import { useEffect, useState } from "react";
import TelaManutencao from "@/components/app/TelaManutencao";

export default function AvisoManutencao() {
  const [ligada, setLigada] = useState(false);
  const [dispensada, setDispensada] = useState(false);
  useEffect(() => {
    let vivo = true;
    const ver = () => fetch("/api/manutencao", { cache: "no-store" }).then((x) => x.json()).then((r) => vivo && setLigada(!!r.manutencao)).catch(() => undefined);
    void ver();
    const t = setInterval(ver, 15_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (!ligada || dispensada) return null;
  return <TelaManutencao dispensar={{ rotulo: "Sou Super Admin — entrar para conferir", acao: () => setDispensada(true) }} />;
}
