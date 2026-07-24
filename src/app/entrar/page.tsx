"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

export default function Entrar() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async (crear: boolean) => {
    if (!correo || clave.length < 6) {
      setMensaje("Escribe tu correo y una clave de al menos 6 caracteres.");
      return;
    }
    setCargando(true);
    setMensaje(null);
    const supabase = crearClienteNavegador();
    const { error } = crear
      ? await supabase.auth.signUp({ email: correo, password: clave })
      : await supabase.auth.signInWithPassword({ email: correo, password: clave });
    setCargando(false);

    if (error) {
      setMensaje(
        error.message === "Invalid login credentials"
          ? "Correo o clave incorrectos."
          : error.message
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <main className="auth">
      <div className="acard">
        <div className="alogo">
          <svg viewBox="0 0 48 48" aria-label="Pálpito">
            <path
              d="M3 27h7l4-11 5 20 5-27 4 18h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M32 27l7-9 7 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".5"
            />
            <circle cx="39" cy="18" r="3.4" fill="currentColor" />
          </svg>
          <b>
            Pálpito<i>.</i>
          </b>
        </div>
        <p className="asub">
          Crea tu cuenta y recibe <b className="mono">1000</b> fichas de prueba de regalo.
        </p>

        <label className="acampo">
          <span>Correo</span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="tu@correo.com"
            autoComplete="email"
          />
        </label>
        <label className="acampo">
          <span>Clave</span>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="mínimo 6 caracteres"
            autoComplete="current-password"
          />
        </label>

        {mensaje && <p className="aerror">{mensaje}</p>}

        <button className="bapostar" disabled={cargando} onClick={() => entrar(false)}>
          {cargando ? "Un momento…" : "Entrar"}
        </button>
        <button className="acrear" disabled={cargando} onClick={() => entrar(true)}>
          Crear cuenta nueva
        </button>

        <button className="avolver" onClick={() => router.push("/")}>
          ← Volver a los partidos
        </button>
      </div>
    </main>
  );
}
