"use client";

// Barra de menu do login (decisão #186): Planos e Preços | Fale conosco | Sobre.
// Na borda verde corre um pulso estilo cometa: luz na ponta e cauda azul em degradê que ocupa 70% do percurso, uma volta a cada 8 s (velocidade reduzida em 50% a pedido do dono).
// Os nomes pulsam no mesmo estilo das luzes paradas da tela. Com "reduzir movimento" ligado no sistema, nada se mexe.
import { useState } from "react";
import PopupPlanos from "@/components/planos/PopupPlanos";
import ChatInteressado from "@/components/planos/ChatInteressado";
import SobreLogin from "./SobreLogin";
import PulsoBorda from "./PulsoBorda";

export default function BarraMenuLogin() {
  const [planos, setPlanos] = useState(false);
  const [chat, setChat] = useState(false);
  const [sobre, setSobre] = useState(false);

  // Visual do menu aprovado (print do dono): sem fundo, borda cinza fina arredondada e nomes em azul-ciano
  const item = "login-menu-item px-2.5 sm:px-4 py-1.5 text-[12.5px] sm:text-[14px] font-semibold tracking-[.02em] whitespace-nowrap";
  // No computador (altura suficiente) a barra fica fixa no topo da coluna, como no layout aprovado; no celular e em telas baixas fica acima do card
  const posicao = "lg:[@media(min-height:720px)]:absolute lg:[@media(min-height:720px)]:top-5 lg:[@media(min-height:720px)]:left-1/2 lg:[@media(min-height:720px)]:-translate-x-1/2 lg:[@media(min-height:720px)]:w-[calc(100%-1.5rem)]";
  return (
    <>
      <div className={`login-menu-barra relative w-full max-w-[420px] mb-1.5 ${posicao}`} data-testid="barra-menu-login">
        <nav className="relative flex items-center justify-around rounded-[9px]" aria-label="Menu" style={{ border: "1.5px solid rgba(150,160,166,.75)", color: "#56bfdc", ["--pulso" as string]: "77,216,255" }}>
          <button type="button" className={item} style={{ ["--atraso" as string]: "0s" }} onClick={() => setPlanos(true)} data-testid="menu-planos">Planos e Preços</button>
          <button type="button" className={item} style={{ ["--atraso" as string]: ".6s" }} onClick={() => setChat(true)} data-testid="menu-fale-conosco">Fale conosco</button>
          <button type="button" className={item} style={{ ["--atraso" as string]: "1.2s" }} onClick={() => setSobre(true)} data-testid="menu-sobre">Sobre</button>
        </nav>
        <PulsoBorda raio={9} voltaMs={8000} testid="pulso-menu" />
      </div>
      {planos && <PopupPlanos onFechar={() => setPlanos(false)} />}
      {chat && <ChatInteressado onFechar={() => setChat(false)} />}
      {sobre && <SobreLogin onFechar={() => setSobre(false)} />}
    </>
  );
}
