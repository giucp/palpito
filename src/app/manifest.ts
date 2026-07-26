import type { MetadataRoute } from "next";

// El manifiesto: lo que convierte a Pálpito en algo que se agrega a la pantalla
// de inicio del teléfono y se abre como una app, sin la barra del navegador.
//
// Los iconos se generan con `node scripts/generar-iconos.ts` a partir del mismo
// trazo del logo, así que no hay ningún archivo de diseño que mantener aparte.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pálpito — La casa no juega",
    short_name: "Pálpito",
    description: "Apostá con tus amigos. El pozo es de ustedes.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08090b",
    theme_color: "#08090b",
    lang: "es",
    categories: ["games", "sports", "entertainment"],
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" lleva más aire alrededor: Android recorta el icono en
      // círculo y sin ese margen se comería el latido.
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
