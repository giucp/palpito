// Genera los iconos de la app y la imagen para compartir.
//
// Se dibujan con el mismo generador de imágenes que ya usan la tarjeta del
// desafío y la del ticket, así que no hace falta ninguna herramienta de diseño
// ni ninguna librería nueva: el logo es una ruta, y de ahí salen todos los
// tamaños sin perder nitidez.
//
// Se corre a mano cuando cambia la marca, no en cada compilación:
//   node scripts/generar-iconos.ts

import { ImageResponse } from "next/og.js";
import React from "react";
import fs from "fs";
import path from "path";

const LIMA = "#b6ff3d";
const FONDO = "#08090b";
const INK = "#edf1f3";
const MIST = "#828c96";

const salida = path.join(import.meta.dirname, "..", "public");

// El latido de Pálpito. Es la misma ruta del logo del encabezado.
const pulso = (ancho: number, color: string) =>
  React.createElement("svg", {
    width: ancho,
    height: ancho,
    viewBox: "0 0 48 48",
    children: [
      React.createElement("path", {
        key: "a",
        d: "M3 27h7l4-11 5 20 5-27 4 18h4",
        fill: "none",
        stroke: color,
        strokeWidth: 3.2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
      React.createElement("path", {
        key: "b",
        d: "M32 27l7-9 7 9",
        fill: "none",
        stroke: color,
        strokeWidth: 3.2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        opacity: 0.5,
      }),
      React.createElement("circle", { key: "c", cx: 39, cy: 18, r: 3.4, fill: color }),
    ],
  });

// `margen` deja aire alrededor para los iconos "maskable": Android los recorta
// en círculo y sin ese aire se come el dibujo.
function icono(lado: number, margen: number, fondoRedondo: boolean) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: FONDO,
        borderRadius: fondoRedondo ? lado * 0.22 : 0,
      },
    },
    pulso(lado * (1 - margen * 2) * 0.86, LIMA)
  );
}

async function escribir(nombre: string, elemento: React.ReactElement, w: number, h: number) {
  const res = new ImageResponse(elemento, { width: w, height: h });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(salida, nombre), buf);
  console.log(`  ${nombre.padEnd(26)} ${w}×${h}  ${(buf.length / 1024).toFixed(1)} kB`);
}

console.log("Iconos de la app:");
await escribir("icono-192.png", icono(192, 0.12, true), 192, 192);
await escribir("icono-512.png", icono(512, 0.12, true), 512, 512);
// Maskable: más aire, porque Android recorta en círculo.
await escribir("icono-maskable-512.png", icono(512, 0.22, false), 512, 512);
// iOS no redondea por su cuenta: se entrega cuadrado y él le pone las esquinas.
await escribir("apple-touch-icon.png", icono(180, 0.14, false), 180, 180);

console.log("\nImagen para compartir:");
await escribir(
  "og.png",
  React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: FONDO,
        padding: 80,
        fontFamily: "sans-serif",
      },
    },
    [
      React.createElement(
        "div",
        { key: "m", style: { display: "flex", alignItems: "center", gap: 18 } },
        [
          pulso(64, LIMA),
          // El nombre y el punto van juntos, sin `gap` entre medio: el punto es
          // parte de la marca, no una palabra aparte.
          React.createElement(
            "div",
            { key: "n", style: { display: "flex", alignItems: "baseline" } },
            [
              React.createElement(
                "span",
                { key: "t", style: { color: INK, fontSize: 58, fontWeight: 800, letterSpacing: -2 } },
                "Pálpito"
              ),
              React.createElement(
                "span",
                { key: "d", style: { color: LIMA, fontSize: 58, fontWeight: 800 } },
                "."
              ),
            ]
          ),
        ]
      ),
      React.createElement(
        "div",
        {
          key: "l",
          style: {
            display: "flex",
            color: INK,
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -4,
            marginTop: 44,
          },
        },
        "La casa no juega"
      ),
      React.createElement(
        "div",
        { key: "s", style: { display: "flex", color: MIST, fontSize: 34, marginTop: 20 } },
        "Apostá con tus amigos. El pozo es de ustedes."
      ),
    ]
  ),
  1200,
  630
);

console.log("\nListo. Se guardaron en public/.");
