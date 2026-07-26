import { NextResponse, type NextRequest } from "next/server";
import { traerEventos } from "@/lib/polymarket";

// Se pide por acá y no desde el navegador para poder cachear: si varios miran
// la misma categoría, Polymarket recibe una sola consulta.

export async function GET(req: NextRequest) {
  const categoria = req.nextUrl.searchParams.get("categoria") ?? "mlb";
  const eventos = await traerEventos(categoria);
  return NextResponse.json({ ok: true, eventos });
}
