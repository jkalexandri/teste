import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_KEY } from "@/lib/theme-key";
import AberturaApp from "@/components/pwa/AberturaApp";
import RegistrarSW from "@/components/pwa/RegistrarSW";

export const metadata: Metadata = {
  title: "FilaPro Leads",
  description: "Envio de WhatsApp para leads com IA, antibloqueio e fila na nuvem 24/7.",
  // App no celular (PWA — decisões #85 e #86)
  applicationName: "FilaPro Leads",
  appleWebApp: { capable: true, title: "FilaPro Leads", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icones/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icones/icone.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icones/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#050d18" };

// Aplica o tema salvo antes da página aparecer (evita piscar claro/escuro).
const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Fontes da prévia: Plus Jakarta Sans (texto) e Sora (títulos) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap"
        />
      </head>
      <body>
        {children}
        <AberturaApp />
        <RegistrarSW />
      </body>
    </html>
  );
}
