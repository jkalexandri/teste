// Manifesto do app (PWA — decisões #85 e #86): instalar pela tela inicial, em tela cheia, com o ícone aprovado.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FilaPro Leads",
    short_name: "FilaPro Leads",
    description: "WhatsApp para leads com IA, antibloqueio e fila 24/7.",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050d18",
    theme_color: "#050d18",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
