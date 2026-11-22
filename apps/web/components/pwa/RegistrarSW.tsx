"use client";

// Liga o service worker do app (instalação no celular e notificações — decisões #85 e #99).
import { useEffect } from "react";

export default function RegistrarSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
