# Referência do LOGIN — extraída da prévia (Meta AI)

Fonte: código compilado da prévia do FilaPro Leads (React 18 + Tailwind 3.4 + ícones lucide-react).
Este documento é a referência oficial do login. **Não alterar nada sem ordem expressa.**

## 1. Fontes
- Corpo: **Plus Jakarta Sans** (400, 500, 600, 700, 800)
- Títulos (`.font-display`): **Sora** (600, 700, 800)
- Google Fonts: `family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800`

## 2. Cores do login (fixas — o login é sempre escuro/futurista)
| Uso | Cor |
|---|---|
| Fundo | `#050A14` |
| Texto | `#eaf6ff` |
| Verde WhatsApp (principal) | `#25D366` |
| Ciano | `#2dd4ff` |
| Verde neon | `#7dffb8` |
| Ciano claro | `#7fe7ff` |
| Variações dos feixes | `#a7ffcb`, `#4dd8ff` |
| Branco (traços neutros) | `#ffffff` (opacidade .36–.45) |
| Label | `#cfe8dc` |
| Placeholder | `#7d8ea3` |
| Checkbox texto | `#9fb3c8` |
| Botão "Admin da Empresa" (ícone) | `#ffb020` |

Tokens do app (resto das telas): ver seção 9.

## 3. Estrutura e layout
- Container `.login-future .login-shell`: `height: 100dvh`, `overflow: hidden` (sem scroll). Flex coluna no mobile, linha em `lg` (≥1024px).
  No mobile (até 1023px), o conjunto (lado esquerdo + card) fica **centralizado na altura da tela** (`justify-content:center`; `.login-right` sem `flex:1`) — decisão #118.
  Telas de até 600px de altura escondem o subtítulo (antes 560px), para o card caber inteiro — decisão #122.
- **Esquerda** (`aside.login-aside`): `lg:w-[52%]`, centralizado verticalmente em `lg`.
- **Direita** (`.login-right`): `lg:w-[48%]`, card centralizado, `max-width: 420px`.
- Todos os textos da esquerda com `margin-left: 75.6px` (0 em telas < 1024px).

### Ordem dos elementos (lado esquerdo)
1. **Marca**: `FilaPro Leads` + ponto verde `.` (`#25D366`)
   - `font-display font-extrabold leading-none tracking-tight`
   - `font-size: clamp(24pt, calc(2.6vw + 8pt), 30pt)`, `letter-spacing: -0.01em`
   - Texto com gradiente `.login-neon-text`: `linear-gradient(90deg,#fff 10%,#7dffb8 42%,#4dd8ff 78%)` + `drop-shadow(0 0 18px rgba(37,211,102,.38))`
2. **Selo**: `IA • AUTOMAÇÃO • WHATSAPP`
   - pílula, `9pt`, `font-extrabold`, `tracking 0.14em`, cor `#7dffb8`, fundo `rgba(37,211,102,.10)`, borda `rgba(37,211,102,.45)`, sombra `0 0 22px rgba(37,211,102,.18)`
   - ⚠️ No código o selo fica **abaixo** da marca (o prompt diz "selo acima").
3. **Headline**: `O futuro do` ⏎ `disparo inteligente.`
   - `font-display font-extrabold leading-[1.02] tracking-tight`, `max-w 522px`
   - `font-size: clamp(17pt, calc(2.4vw + 2pt), 26pt)`
4. **Subtítulo** (texto completo):
   `Envios com ritmo, contexto e proteção sua operação de WhatsApp pronta para escalar sem perder o controle.`
   - `10pt` (≥640px: `10.5pt`), `leading-snug`, `text-slate-300`, `max-w 442px`
5. **3 blocos de benefício** (só em `lg`), `gap-0.5`, `max-w 502px`, cartão `.login-glass .benefit-card` (padding `6px 8px`, `rounded-xl`):
   | Ícone (lucide) | Cor ícone / fundo | Título (13pt, bold) | Descrição (12.25pt, slate-400) |
   |---|---|---|---|
   | `ShieldCheck` | `#25D366` / `rgba(37,211,102,.14)` | **Antibloqueio Inteligente** | Cadência, blocos e pausas que protegem sua conta. |
   | `Sparkles` (classe `--cyan`) | `#2dd4ff` / `rgba(45,212,255,.13)` | **IA que Atende, Contorna Objeções e Qualifica** ⚠️ | Conversas com contexto do seu negócio. |
   | `Zap` | `#7dffb8` / `rgba(37,211,102,.14)` | **Online na Nuvem 24/7** | Seus envios seguem a cadência definida, sem parar. |
   - Caixa do ícone: `29pt × 29pt`, `rounded-lg`, ícone `size 19.67`.
   - ⚠️ O prompt diz "IA Qualifica e Trata Objeções"; a prévia dizia "IA que Qualifica e Contorna Objeções". Trocado a pedido do dono do projeto (decisão #73) para "IA que Atende, Contorna Objeções e Qualifica".
6. **Pílula de status**: bolinha verde pulsando + `Sistema Online • Fila Ativa • 99.9% Uptime` (10px, bold).

### Lado direito
1. Acima do card, alinhados à direita (decisão #28): botão **Planos** (fundo `#2dd4ff`, texto `#04120a`, ícone de etiqueta) e, depois dele, o botão de tema **só com o ícone** lua/sol (`.login-ghost-btn`).
2. Card `.login-glass .login-card`, `rounded-[18px]`, padding `p-3 sm:p-3.5`:
   - Bolinha verde + `ACESSO SEGURO` (10px, tracking .18em, emerald-300)
   - `Acesse sua conta` (Sora 19px extrabold, branco)
   - ~~Texto "Escolha o módulo..."~~ — **removido** (decisoes.md #7)
   - **Abas de módulo**: `Módulo Individual` (ativo: fundo `#25D366`) · `Módulo Empresarial` (ativo: fundo `#2dd4ff`)
   - ~~Linha "Módulo atual: ..."~~ — **removida**; não usar este espaço para exibir informação (decisoes.md #7)
   - Campo **E-mail** (ícone `Mail`, `#7dffb8`) — placeholder `voce@empresa.com.br`
   - Campo **Senha** (ícone `Lock`, olho mostrar/ocultar) — placeholder `Sua senha de acesso`
   - `☐ Lembrar de mim` · `Esqueci minha senha` (cyan-300)
   - Requisitos ao vivo: `12+ caracteres` `Maiúscula` `Minúscula` `Número` `Especial` (verde `#7dffb8` quando ok)
   - Botão **Entrar →** (`.login-cta`: gradiente `#25D366 → #2dd4ff`, texto `#04120a`)
   - Divisor `ou entre como`
   - Botões demo (grid 2 col): `Entrar como Super Admin` · `Entrar como Admin da Empresa` · `Entrar como Usuário (Individual|Empresarial)` (linha inteira)
   - Rodapés (10px, slate-400): "Admin não envia mensagens…", "Senha mínima de 12 caracteres…", "Sem cadastro público. Acesso criado pelo administrador.", "Demonstração com credenciais salvas nos botões acima." + chip `v1.25`
3. Modal **Recuperar senha**: "Voltar para o login", "Recuperar senha", "Informe o e-mail cadastrado pelo administrador.", botão "Enviar senha temporária", confirmação "Solicitação registrada".

### Contas demo encontradas no código ⚠️ (diferem do prompt)
| Perfil | E-mail | Senha |
|---|---|---|
| Super Admin | superadmin@disparopro.com.br | Super@12345678 |
| Admin da Empresa | admin-empresa@empresaexemplo.com.br | Admin@12345678 |
| Usuário Individual | usuario@disparopro.com.br | User@12345678 |
| Usuário Empresarial | ana@empresaexemplo.com.br | User@12345678 |

## 4. Fundo (camadas, de trás para frente)
1. Grade: linhas `rgba(37,211,102,.12)` de 1px a cada **44px**, com máscara `radial-gradient(ellipse 90% 80% at 30% 20%, #000 30%, transparent 78%)`.
2. **SVG de circuitos** `.login-circuit` — `viewBox="0 0 1440 900"`, `preserveAspectRatio="xMidYMid slice"`:
   - ~40 trilhas (verde `#25D366`, ciano `#2dd4ff`, branco), opacidade .36–.55, espessura 2–2.6, algumas com `.circuit-glow` / `.circuit-glow-cyan`, `.circuit-flow`.
   - 13 "chips" (retângulos `rx 6` com quadrado interno).
   - ~30 nós (círculo externo r 9/10/11 + anel interno + ponto central).
   - 2 pulsos (`.circuit-pulse`, `.circuit-pulse-slow`), 8 trilhas de energia (`.circuit-energy` a–h), 4 sequências (`.circuit-seq`).
   - Geometria completa: copiar 1:1 do arquivo original da prévia.
3. Vinheta `::after`: dois `radial-gradient` escuros `rgba(2,6,14,.58)` em 22%/38% e 78%/58%.
4. 3 orbes desfocados (`blur(70px)`): 420px verde `.22` (topo-esquerda), 360px ciano `.18` (direita 8%, topo 28%), 280px verde `.13` (base).
5. 4 partículas flutuando (`loginFloat 7s`): 6/4/5/4px.

## 5. Animações e interações
| Elemento | Comportamento |
|---|---|
| Trilhas com glow | `circuitTraceGlow` opacidade .55↔.95, 5.5s (ciano 6.8s, delay 1.4s) |
| `.circuit-flow` | tracejado `5 11` correndo, 7s linear infinito |
| Pulsos | `circuitPulse` 5.5s / 7.5s (delay 1.4s) |
| Energia a–h | tracejado `14 260`, 4.2s–11s, alguns reversos |
| Sequências 1–4 | acendem em sequência, 4.8s, delays 0/1.2/2.4/3.6s |
| **Nós** (r 9/10/11) | "respiram" `scale 1→1.28`, 3–4.9s; **hover: `scale(1.8)` + brilho branco**; **clique: anel expande `scale 2.2` e volta em 1s** |
| **5 feixes de luz** | `requestAnimationFrame`; cada feixe escolhe 1 de 26 trilhas aleatória, direção aleatória, duração 4.2–9.8s, raio 2.4–3.9, rastro 46–92px, cor aleatória da paleta; pausa 350–1500ms e recomeça — loop infinito ⚠️ |
| **Ícones dos 3 blocos** | auto-pulso aleatório a cada **~4s (±0.5s)**: `scale(1.35)` + brilho; hover `scale(1.5)`; clique: `benefitIconPulse` 1s até `scale(1.6)` e o card fica ativo |
| Bolinha de status | `loginPulse` 2s |
| Input foco | borda `#25D366` + sombra verde |
| CTA hover | `brightness(1.07)` + sobe 1px |
| `prefers-reduced-motion` | desliga animações e feixes |

⚠️ O prompt diz "5 feixes a cada 4 segundos"; no código os feixes têm duração aleatória 4.2–9.8s. Quem segue exatamente 4s é o auto-pulso dos ícones.

## 6. Responsivo (regras do código)
- `< 1024px`: coluna; brand `22pt`; h1 `20px`; margens 0; blocos de benefício ocultos.
- `< 640px`: brand `24pt`, pode quebrar linha.
- altura `< 760px`: esconde rodapés do card (`.login-compact-hide`).
- altura `< 700px`: h1 `19px`.
- altura `< 620px`: esconde pílula de status.
- altura `< 560px`: esconde subtítulo.

## 7. CSS original do login (verbatim)
```css
.login-future{background:#050A14;color:#eaf6ff;position:relative;isolation:isolate}
.login-future::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(37,211,102,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(37,211,102,.12) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse 90% 80% at 30% 20%,#000 30%,transparent 78%);mask-image:radial-gradient(ellipse 90% 80% at 30% 20%,#000 30%,transparent 78%)}
.login-future::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 62% 58% at 22% 38%,rgba(2,6,14,.58) 0%,rgba(2,6,14,.28) 42%,transparent 72%),radial-gradient(ellipse 58% 62% at 78% 58%,rgba(2,6,14,.55) 0%,rgba(2,6,14,.25) 42%,transparent 72%)}
.login-orb{position:absolute;border-radius:999px;filter:blur(70px);pointer-events:none;z-index:0}
.login-particle{position:absolute;border-radius:999px;pointer-events:none;z-index:0;animation:loginFloat 7s ease-in-out infinite}
@keyframes loginFloat{0%,100%{transform:translateY(0);opacity:.35}50%{transform:translateY(-18px);opacity:.95}}
@keyframes loginPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,.55)}50%{box-shadow:0 0 0 7px rgba(37,211,102,0)}}
.login-pulse{animation:loginPulse 2s ease-in-out infinite}
.login-glass{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.08)}
.login-neon-text{background:linear-gradient(90deg,#fff 10%,#7dffb8 42%,#4dd8ff 78%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(37,211,102,.38))}
.login-shell{height:calc(100dvh - var(--safe-area-inset-top));max-height:calc(100dvh - var(--safe-area-inset-top));min-height:0;overflow:hidden}
.login-shell>*{min-height:0;overflow:hidden}
.login-card{max-height:100%;overflow:hidden}
.benefit-card{padding:6px 8px!important}
.login-input{width:100%;background:rgba(3,10,20,.72)!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:12px!important;padding:7px 10px 7px 38px!important;color:#eaf6ff!important;outline:none!important;font-size:12.5px}
.login-input::placeholder{color:#7d8ea3}
.login-input:focus{border-color:#25D366!important;box-shadow:0 0 0 3px rgba(37,211,102,.18),0 0 22px rgba(37,211,102,.18)!important}
.login-cta{width:100%;border:0;border-radius:12px;padding:8px 14px;font-weight:800;color:#04120a;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;background:linear-gradient(90deg,#25D366,#2dd4ff);box-shadow:0 10px 30px rgba(37,211,102,.32),inset 0 1px 0 rgba(255,255,255,.45)}
.login-cta:hover{filter:brightness(1.07);transform:translateY(-1px)}
.login-ghost-btn{border:1px solid rgba(255,255,255,.16)!important;background:rgba(255,255,255,.06)!important;color:#eaf6ff!important;border-radius:12px!important;padding:6px 7px!important;font-weight:700!important;font-size:11px!important;line-height:1.25!important;display:flex;align-items:center;justify-content:center;gap:6px;text-align:center}
.login-ghost-btn:hover{border-color:rgba(37,211,102,.55)!important;box-shadow:0 0 18px rgba(37,211,102,.14)}
.login-label{font-size:11px;font-weight:700;margin-bottom:4px;display:block;color:#cfe8dc}
.login-check{color:#9fb3c8;font-size:12px;font-weight:600}
/* circuitos, nós, energia, sequência, ícones e feixes: copiar 1:1 do arquivo original */
```

## 8. Confirmado pelo print da tela (referência visual)
O print enviado pelo dono do projeto bate com o código. Valem **o print e o código**:
- Selo `IA • AUTOMAÇÃO • WHATSAPP` fica **abaixo** da marca.
- Bloco 2: **"IA que Atende, Contorna Objeções e Qualifica"** (decisão #73).
- Login com fundo **escuro** (circuitos verde/ciano), mesmo com o tema claro como padrão do app; botão "Tema escuro" no canto superior direito.
- Em telas mais baixas, a pílula de status e os rodapés do card ficam ocultos (regras da seção 6) — como no print.

### Ainda a confirmar
1. Feixes: manter durações aleatórias do código (4.2–9.8s) ou forçar ciclo de 4s?
2. Contas demo: as do código (4 perfis) ou as do prompt (2 perfis)?

### Decidido
- **Sem API oficial da Meta.** A API de WhatsApp é própria, criada neste projeto (conexão por QR Code).
  Os textos da prévia "Conectado via API Oficial", "QR via provedor homologado" e "Não usamos Baileys…"
  (fora do login) serão substituídos por textos que reflitam a conexão própria por QR Code.

## 9. Tokens do app (demais telas)
```css
:root{--bg:#f4f6f5;--surface:#ffffff;--surface-2:#eef7f0;--surface-3:#f8faf9;--text:#101815;--muted:#5b6b62;--muted-2:#8a9a90;--border:#dce6df;--primary:#0e9f5a;--primary-dark:#087a44;--primary-soft:#dff6e9;--accent:#ffb020;--danger:#e5484d;--info:#2563eb;--shadow:0 6px 18px rgba(16,40,28,.07);--radius:14px}
[data-theme="dark"]{--bg:#0d1512;--surface:#16211c;--surface-2:#1d2e26;--surface-3:#1a2822;--text:#eef5f1;--muted:#a9bdb1;--muted-2:#7f9488;--border:#2a3a32;--primary:#22c06f;--primary-dark:#2ee07f;--primary-soft:#173e2a;--accent:#ffbe3d;--shadow:0 8px 20px rgba(0,0,0,.35)}
```
