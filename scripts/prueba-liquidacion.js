// Prueba de punta a punta de la liquidación:
// evento sintético → apuesta → resultado final → liquidar → pago.
// Uso: node scripts/prueba-liquidacion.js
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const USUARIO = "11ebfa36-34e4-4936-8c16-c69d43c85d99"; // prueba@palpito.test

const saldo = async () => {
  const { data } = await sb.from("saldos").select("saldo").eq("usuario_id", USUARIO).maybeSingle();
  return Number(data?.saldo ?? 0);
};

(async () => {
  console.log("Saldo inicial:", await saldo());

  // 1) Evento sintético que "empieza" en 2 minutos
  const { data: ev } = await sb
    .from("eventos")
    .insert({
      deporte: "prueba",
      liga: "Prueba interna de liquidación",
      equipo_a: "Tigres de Prueba",
      equipo_b: "Leones de Prueba",
      comienza_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  const { data: mercado } = await sb
    .from("mercados")
    .insert({ evento_id: ev.id, tipo: "h2h", nombre: "Ganador", orden: 0 })
    .select("id")
    .single();

  const { data: sels } = await sb
    .from("selecciones")
    .insert([
      { mercado_id: mercado.id, nombre: "Local", cuota: 2.0, orden: 0, lado: "local", punto: null },
      { mercado_id: mercado.id, nombre: "Visitante", cuota: 1.8, orden: 1, lado: "visitante", punto: null },
    ])
    .select("id, nombre");
  const local = sels.find((s) => s.nombre === "Local");
  console.log("Evento sintético creado:", ev.id);

  // 2) Apostar $10 al Local a cuota 2.00 (misma función que usa la app)
  const { data: apuesta, error: e1 } = await sb.rpc("apostar", {
    p_usuario: USUARIO,
    p_tipo: "simple",
    p_monto: 10,
    p_idempotency: randomUUID(),
    p_selecciones: [{ seleccion_id: local.id, cuota_vista: 2.0 }],
  });
  console.log("Resultado de apostar:", JSON.stringify(apuesta), e1?.message ?? "");
  console.log("Saldo tras apostar:", await saldo());

  // 3) El partido "termina" 2-1 a favor del Local
  await sb
    .from("eventos")
    .update({ estado: "finalizado", resultado: "a", marcador_a: 2, marcador_b: 1 })
    .eq("id", ev.id);

  // 4) Liquidar (lo mismo que hace la automatización al cerrar un evento)
  const { data: liq, error: e2 } = await sb.rpc("liquidar_evento", { p_evento: ev.id });
  console.log("Resultado de liquidar:", JSON.stringify(liq), e2?.message ?? "");
  console.log("Saldo final:", await saldo());

  // 5) Rastro contable
  const { data: movs } = await sb
    .from("movimientos")
    .select("tipo, monto, nota")
    .eq("usuario_id", USUARIO)
    .order("id", { ascending: true });
  console.log("Libro de movimientos:");
  for (const m of movs) console.log(`  ${m.tipo.padEnd(10)} ${String(m.monto).padStart(8)}  ${m.nota ?? ""}`);
})();
