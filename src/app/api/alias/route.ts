import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// ¿Está libre este nombre de usuario?
//
// Es pública a propósito: hace falta al registrarse, cuando todavía no hay
// sesión, y los alias son públicos por diseño (es el nombre con el que te
// encuentran tus amigos). No revela nada que no se vea después en la app.

export const ALIAS_VALIDO = /^[a-z0-9_]{3,20}$/;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  if (!ALIAS_VALIDO.test(q)) {
    return NextResponse.json({ libre: false, motivo: "invalido" });
  }

  const admin = crearClienteAdmin();
  const { data } = await admin.from("perfiles").select("alias").eq("alias", q).maybeSingle();

  return NextResponse.json({ libre: !data, motivo: data ? "tomado" : null });
}
