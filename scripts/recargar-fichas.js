// Recarga fichas de prueba a una cuenta. Solo para desarrollo: las fichas no
// tienen valor y el movimiento queda registrado como 'ajuste' en el libro.
// Uso: node scripts/recargar-fichas.js correo@ejemplo.com 10000
const { createClient } = require("@supabase/supabase-js");
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

const correo = process.argv[2];
const cantidad = Number(process.argv[3]);

if (!correo || !Number.isFinite(cantidad) || cantidad === 0) {
  console.log("Uso: node scripts/recargar-fichas.js correo@ejemplo.com 10000");
  process.exit(1);
}

(async () => {
  // Buscar la cuenta por correo entre los usuarios de Auth
  let usuario = null;
  for (let pagina = 1; pagina <= 10 && !usuario; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) {
      console.error("Error listando usuarios:", error.message);
      process.exit(1);
    }
    usuario = data.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase()) ?? null;
    if (data.users.length < 200) break;
  }

  if (!usuario) {
    console.error(`No hay ninguna cuenta con el correo ${correo}`);
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    console.log("\nCuentas registradas:");
    for (const u of data?.users ?? []) console.log("  " + u.email);
    process.exit(1);
  }

  const saldoDe = async () => {
    const { data } = await sb.from("saldos").select("saldo").eq("usuario_id", usuario.id).maybeSingle();
    return Number(data?.saldo ?? 0);
  };

  const antes = await saldoDe();
  const { error } = await sb.from("movimientos").insert({
    usuario_id: usuario.id,
    tipo: "ajuste",
    monto: cantidad,
    nota: `Recarga de prueba (${cantidad > 0 ? "+" : ""}${cantidad})`,
  });
  if (error) {
    console.error("No se pudo registrar el movimiento:", error.message);
    process.exit(1);
  }

  console.log(`Cuenta: ${usuario.email}`);
  console.log(`Saldo antes:   ${antes.toFixed(2)}`);
  console.log(`Saldo después: ${(await saldoDe()).toFixed(2)}`);
})();
