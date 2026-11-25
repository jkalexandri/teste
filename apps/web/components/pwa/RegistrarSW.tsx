"use client";

// Liga o service worker do app (instalação no celular e notificações — decisões #85 e #99).
// O pedido de instalação do Chrome (botão "Instalar app" do login) é guardado por um script no início da página,
// em app/layout.tsx (decisão #123), para não se perder antes de o React carregar.
import { useEffect } from "react";

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global { interface Window { __filaproInstalar?: PedidoInstalacao | null } }

export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
