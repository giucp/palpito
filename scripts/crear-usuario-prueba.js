// Crea (o recrea) el usuario de prueba con el correo ya confirmado.
// Uso: node scripts/crear-usuario-prueba.js
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
  const { data, error } = await sb.auth.admin.createUser({
    email: "prueba@palpito.test",
    password: "palpito123",
    email_confirm: true,
  });
  if (error) {
    console.log("Aviso:", error.message);
    return;
  }
  console.log("Usuario de prueba creado:", data.user.email, "→ id", data.user.id);
})();
