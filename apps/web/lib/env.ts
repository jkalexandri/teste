// Ambiente atual: development | staging | production.
// Em produção, os botões de acesso demo do login ficam ocultos (docs/decisoes.md #3).
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || "development";
export const IS_PRODUCTION = APP_ENV === "production";
