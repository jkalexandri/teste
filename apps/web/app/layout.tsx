import type { Metadata } from "next";
import "./globals.css";
import { THEME_KEY } from "@/lib/theme-key";

export const metadata: Metadata = {
  title: "FilaPro Leads",
  description: "Envio de WhatsApp para leads com IA, antibloqueio e fila na nuvem 24/7.",
};

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
      <body>{children}</body>
    </html>
  );
}
