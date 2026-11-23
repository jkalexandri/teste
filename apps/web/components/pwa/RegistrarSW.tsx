"use client";

// Liga o service worker do app (instalação no celular e notificações — decisões #85 e #99).
// Também guarda o pedido de instalação do Chrome (Android) para o botão "Instalar app" do login (decisão #112).
import { useEffect } from "react";

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global { interface Window { __filaproInstalar?: PedidoInstalacao | null } }

export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const guardar = (e: Event) => {
      // No login, o nosso botão oferece a instalação; nas outras telas o Chrome mostra o aviso dele
      if (window.location.pathname !== "/login") return;
      e.preventDefault();
      window.__filaproInstalar = e as PedidoInstalacao;
      window.dispatchEvent(new Event("filapro-instalavel"));
    };
    const instalado = () => { window.__filaproInstalar = null; window.dispatchEvent(new Event("filapro-instalado")); };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalado);
    return () => { window.removeEventListener("beforeinstallprompt", guardar); window.removeEventListener("appinstalled", instalado); };
  }, []);
  return null;
}
