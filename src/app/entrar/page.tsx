"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

// Entrar o crear cuenta. Son dos cosas distintas y ahora se eligen antes de
// escribir, en vez de con dos botones al final: crear cuenta pide además el
// nombre de usuario, y un formulario que cambia de forma al final confunde.

const ALIAS_VALIDO = /^[a-z0-9_]{3,20}$/;

type Modo = "entrar" | "crear";
type EstadoAlias = "vacio" | "invalido" | "comprobando" | "libre" | "tomado";

export default function Entrar() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [alias, setAlias] = useState("");
  // Lo único que se guarda es la respuesta del servidor, atada al alias que se
  // preguntó. Lo demás (vacío, formato inválido, comprobando) se deduce al
  // pintar: son estados derivados, no información nueva.
  const [respuesta, setRespuesta] = useState<{ q: string; libre: boolean } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const q = alias.trim().toLowerCase();
  const formatoOk = ALIAS_VALIDO.test(q);

  // Se comprueba mientras escribe, con una pausa para no consultar en cada tecla.
  useEffect(() => {
    if (modo !== "crear" || !formatoOk) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/alias?q=${encodeURIComponent(q)}`).then((x) => x.json());
        if (vivo) setRespuesta({ q, libre: Boolean(r.libre) });
      } catch {
        // Sin respuesta se queda en "comprobando"; el registro igual valida.
      }
    }, 400);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, formatoOk, modo]);

  const estadoAlias: EstadoAlias =
    q === ""
      ? "vacio"
      : !formatoOk
        ? "invalido"
        : respuesta?.q === q
          ? respuesta.libre
            ? "libre"
            : "tomado"
          : "comprobando";

  const enviar = async () => {
    if (!correo || clave.length < 6) {
      setMensaje("Escribe tu correo y una clave de al menos 6 caracteres.");
      return;
    }
    if (modo === "crear") {
      if (!formatoOk) {
        setMensaje("Elegí un nombre de usuario de 3 a 20 letras, números o guión bajo.");
        return;
      }
      if (estadoAlias === "tomado") {
        setMensaje("Ese nombre de usuario ya está tomado.");
        return;
      }
    }

    setCargando(true);
    setMensaje(null);
    const supabase = crearClienteNavegador();

    // El alias viaja en los metadatos: el disparador `perfil_inicial` lo toma de
    // ahí al crear el perfil. Si estuviera tomado, cae a uno inventado, así que
    // registrarse nunca falla por el nombre.
    const { error } =
      modo === "crear"
        ? await supabase.auth.signUp({
            email: correo,
            password: clave,
            options: { data: { alias: q } },
          })
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

  const pistaAlias: Record<EstadoAlias, string> = {
    vacio: "Así te encuentran tus amigos. Entre 3 y 20 letras, números o guión bajo.",
    invalido: "Solo letras, números y guión bajo. Entre 3 y 20.",
    comprobando: "Comprobando…",
    libre: "Libre, es tuyo.",
    tomado: "Ese ya está tomado, probá con otro.",
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

        <div className="amodo">
          <button
            className={modo === "entrar" ? "on" : ""}
            onClick={() => {
              setModo("entrar");
              setMensaje(null);
            }}
          >
            Entrar
          </button>
          <button
            className={modo === "crear" ? "on" : ""}
            onClick={() => {
              setModo("crear");
              setMensaje(null);
            }}
          >
            Crear cuenta
          </button>
        </div>

        {modo === "crear" && (
          <p className="asub">
            Elegí tu nombre de usuario y recibí <b className="mono">1000</b> fichas de prueba de
            regalo.
          </p>
        )}

        {modo === "crear" && (
          <label className="acampo">
            <span>Nombre de usuario</span>
            <div className="aalias">
              <i>@</i>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value.toLowerCase())}
                placeholder="tu_alias"
                autoComplete="username"
                maxLength={20}
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <small className={`apista ${estadoAlias}`}>{pistaAlias[estadoAlias]}</small>
          </label>
        )}

        <label className="acampo">
          <span>Correo</span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="tu@correo.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>

        <label className="acampo">
          <span>Clave</span>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="mínimo 6 caracteres"
            autoComplete={modo === "crear" ? "new-password" : "current-password"}
          />
        </label>

        {mensaje && <p className="aerror">{mensaje}</p>}

        <button className="bapostar" disabled={cargando} onClick={enviar}>
          {cargando
            ? "Un momento…"
            : modo === "crear"
              ? "Crear mi cuenta"
              : "Entrar"}
        </button>

        <button className="avolver" onClick={() => router.push("/")}>
          ← Volver a los partidos
        </button>
      </div>
    </main>
  );
}
