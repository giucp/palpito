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

self.addEventListener("fetch", (evento) => {
  // Pasar de largo: la red decide, como si no estuviéramos.
  evento.respondWith(fetch(evento.request));
});
