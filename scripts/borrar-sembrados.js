// Borra los eventos de fútbol/béisbol sembrados a mano (externo_id null),
// ya reemplazados por los datos reales de The Odds API.
// Uso: node scripts/borrar-sembrados.js  (desde la raíz del proyecto)
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

(async () => {
  const { data, error } = await sb
    .from("eventos")
    .delete()
    .is("externo_id", null)
    .in("deporte", ["futbol", "beisbol"])
    .select("id");
  console.log(error ? "ERROR: " + error.message : "Borrados: " + data.length);
})();
