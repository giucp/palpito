// Lista (y opcionalmente resuelve) rondas de Despegue que quedaron volando.
// Uso: node scripts/rondas-colgadas.js [--resolver]
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
  const { data } = await sb
    .from("rondas_despegue")
    .select("id, usuario_id, monto, punto_crash, iniciada_at")
    .eq("estado", "volando");

  console.log(`Rondas volando: ${data?.length ?? 0}`);
  for (const r of data ?? []) {
    const seg = (Date.now() - new Date(r.iniciada_at).getTime()) / 1000;
    console.log(
      `  ${r.id.slice(0, 8)} · $${r.monto} · crash ${r.punto_crash}x · ${seg.toFixed(0)}s de vuelo`
    );
    if (process.argv.includes("--resolver")) {
      const { data: e } = await sb.rpc("despegue_estado", {
        p_ronda: r.id,
        p_usuario: r.usuario_id,
      });
      console.log(`     → resuelta como: ${e?.estado}`);
    }
  }
})();
