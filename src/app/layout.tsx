import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const LEMA = "La casa no juega";
const BAJADA = "Apostá con tus amigos. El pozo es de ustedes.";

// `metadataBase` hace que la imagen para compartir se mande con su dirección
// completa. Sin esto WhatsApp recibe una ruta relativa y no muestra nada.
const SITIO = process.env.NEXT_PUBLIC_SITIO ?? "https://palpito-nine.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: { default: `Pálpito — ${LEMA}`, template: "%s · Pálpito" },
  description: BAJADA,
  applicationName: "Pálpito",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pálpito",
    // El fondo de la barra de estado en iOS, para que no corte con un blanco.
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "Pálpito",
    title: `Pálpito — ${LEMA}`,
    description: BAJADA,
    locale: "es",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `Pálpito — ${LEMA}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `Pálpito — ${LEMA}`,
    description: BAJADA,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icono-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  // `viewportFit: cover` deja que la app use la franja de la muesca y la barra
  // de gestos; sin esto, al agregarla al inicio quedan bandas negras.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

// Registra el trabajador de servicio, que es lo que habilita "agregar a la
// pantalla de inicio" en Android. Va después de cargar para no competir con
// el primer pintado.
// Ojo con el `load`: este script se inyecta después de que la página ya
// cargó, así que ese evento normalmente ya pasó y no vuelve a dispararse.
// Por eso se comprueba `readyState` y, si ya terminó, se registra al toque.
const scriptSW = `(function(){if(!('serviceWorker' in navigator))return;var r=function(){navigator.serviceWorker.register('/sw.js').catch(function(){})};if(document.readyState==='complete')r();else addEventListener('load',r)})()`;

// Aplica el tema guardado antes de pintar, para que no haya parpadeo.
const scriptTema = `try{var t=localStorage.getItem('tema');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${outfit.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="tema-inicial" strategy="beforeInteractive">
          {scriptTema}
        </Script>
        <Script id="sw" strategy="afterInteractive">
          {scriptSW}
        </Script>
        {children}
      </body>
    </html>
  );
}
