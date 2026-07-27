// Trabajador de servicio mínimo.
//
// Está por una sola razón: Chrome en Android solo ofrece "agregar a la pantalla
// de inicio" si la página tiene uno registrado y con un manejador de `fetch`.
//
// **No cachea nada a propósito.** Pálpito cambia seguido y guarda saldos y
// partidas: una copia vieja servida desde el teléfono mostraría fichas que ya
// no están o una carta que ya se jugó. Preferimos que siempre pida al servidor;
// lo que se gana con esto es la app en la pantalla de inicio, no funcionar sin
// conexión. Si algún día hace falta lo segundo, hay que pensar bien qué se
// puede cachear sin mentirle al jugador.

self.addEventListener("install", () => {
  // Tomar el control sin esperar a que se cierren las pestañas viejas.
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

// El manejador tiene que existir —es lo que Chrome mira para ofrecer la
// instalación— pero **está vacío a propósito**.
//
// Antes hacía `evento.respondWith(fetch(evento.request))`, que parece lo mismo
// que no hacer nada y no lo es: obliga a cada petición de la app a dar un rodeo
// por este hilo y a volver, en vez de dejar que el navegador la resuelva por su
// camino rápido. Sin `respondWith`, la petición sigue de largo de verdad.
self.addEventListener("fetch", () => {});
