import { NextResponse, type NextRequest } from "next/server";
import { traerResumen } from "@/lib/resumen-partido";
import { ligaPorId } from "@/lib/tablero";

// El resumen de un partido, para la pantalla que se abre al tocarlo.
//
// Existe por una razón concreta: el crudo de ESPN pesa hasta 924 kB y eso no
// puede viajar a un celular. Se pide acá, se recorta a lo que se dibuja —uno o
// dos kB— y se manda eso.
//
// Es de solo lectura y no participa de la automatización: la liquidación corre
// sobre `/scoreboard` por su cuenta y no se entera de que esta ruta existe.

export async function GET(req: NextRequest) {
  const ligaId = req.nextUrl.searchParams.get("liga");
  const partido = req.nextUrl.searchParams.get("partido");

  if (!ligaId || !partido || !/^\d+$/.test(partido)) {
    return NextResponse.json({ ok: false, motivo: "cuerpo_invalido" }, { status: 400 });
  }

  const liga = ligaPorId(ligaId);
  if (!liga) {
    return NextResponse.json({ ok: false, motivo: "liga_desconocida" }, { status: 400 });
  }

  const resumen = await traerResumen(liga.ruta, partido);
  if (!resumen) {
    // No es un error de la app: ESPN puede no tener resumen de un partido, y la
    // pantalla sabe quedarse con lo que ya traía de la cartelera.
    return NextResponse.json({ ok: false, motivo: "sin_resumen" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, resumen });
}
