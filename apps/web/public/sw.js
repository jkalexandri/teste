// Service worker do FilaPro Leads (PWA — decisões #85 e #99).
// Não guarda páginas em cache (os dados mudam o tempo todo); serve para instalar o app e receber notificações.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // passa direto para a rede

// Notificação no celular (mesmos avisos da tela Avisos)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "FilaPro Leads", {
    body: d.corpo || "",
    icon: "/icones/icone-192.png",
    badge: "/icones/icone-192.png",
    data: { url: d.url || "/dashboard" },
    tag: d.tag || undefined,
  }));
});

// Tocar na notificação abre o app na tela certa
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/dashboard";
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) { if ("focus" in c) { await c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
