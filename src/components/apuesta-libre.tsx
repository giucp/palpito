"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icono } from "./iconos";
import { fmt } from "@/lib/dinero";

// Crear una apuesta libre: por cualquier cosa, contra un amigo.
//
// "Te apuesto a que te gano haciendo flexiones". No hay resultado que se pueda
// consultar en ningún lado, así que lo declaran las personas.
//
// ## La pregunta que decide todo
//
// Al crear hay que elegir **cómo se decide quién ganó**, y esa elección cambia
// lo que pasa si después se contradicen:
//
//   · Entre los dos → si no coinciden, vuelve la plata y no gana nadie.
//   · Con alguien más → manda lo que digan 2 de 3, y siempre hay resultado.
//
// Está redactada como "¿cómo deciden?" y no como "¿confiás en él?" a propósito.
// La segunda es más exacta pero incómoda de contestar sobre un amigo, y el que
// la recibe puede leerla como una acusación. Poner un tercero tiene que sentirse
// como lo sensato para un monto grande, no como un insulto.

const RAPIDOS = [10, 25, 50, 100];

type Amigo = { id: string; alias: string };

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

type Paso = "amigo" | "detalle" | "listo";

export function ApuestaLibre({ usuario, saldo, onAviso, onEntrar }: Props) {
  const router = useRouter();
  const [amigos, setAmigos] = useState<Amigo[] | null>(null);
  const [paso, setPaso] = useState<Paso>("amigo");
  const [amigo, setAmigo] = useState<Amigo | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [montoTexto, setMontoTexto] = useState("25");
  const [conMediador, setConMediador] = useState(false);
  const [mediador, setMediador] = useState<Amigo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  const monto = Number(montoTexto.replace(",", ".")) || 0;

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/amigos").then((x) => x.json());
      return (r.ok ? r.amigos : []) as Amigo[];
    } catch {
      return [] as Amigo[];
    }
  }, []);

  useEffect(() => {
    if (!usuario) return;
    let vivo = true;
    (async () => {
      const a = await cargar();
      if (vivo) setAmigos(a);
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, cargar]);

  async function crear() {
    if (!amigo) return;
    if (descripcion.trim().length < 4) return onAviso("Escribí de qué es la apuesta");
    if (monto < 1) return onAviso("Poné un monto");
    if (saldo !== null && monto > saldo) return onAviso("No te alcanzan las fichas");
    if (conMediador && !mediador) return onAviso("Elegí quién va a decidir");

    setEnviando(true);
    try {
      const r = await fetch("/api/apuesta-libre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "crear",
          rival: amigo.id,
          monto,
          descripcion: descripcion.trim(),
          mediador: conMediador ? mediador?.id : null,
        }),
      }).then((x) => x.json());

      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas",
          no_son_amigos: "Primero tienen que ser amigos",
          mediador_no_es_amigo: "Solo podés elegir a un amigo tuyo para decidir",
          sin_descripcion: "Escribí de qué es la apuesta",
          descripcion_larga: "La apuesta es muy larga: contala en menos palabras",
        };
        onAviso(motivos[r.motivo] ?? "No se pudo crear la apuesta");
        return;
      }
      setEnlace(`${window.location.origin}/desafio/${r.desafio}`);
      setPaso("listo");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  function compartir() {
    if (!enlace || !amigo) return;
    const texto =
      `Te apuesto ${monto} fichas en Pálpito:\n"${descripcion.trim()}"\n` +
      (conMediador && mediador
        ? `Si no nos ponemos de acuerdo, decide @${mediador.alias}.\n`
        : "") +
      `Tenés un día para aceptar.\n\n${enlace}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  if (!usuario) {
    return (
      <div className="svacio" style={{ padding: "60px 20px" }}>
        <Icono id="i-user" />
        <b>Entrá para apostar</b>
        <p>Creá tu cuenta y te regalamos 1000 fichas de prueba.</p>
        <button className="bapostar" style={{ maxWidth: 240, margin: "16px auto 0" }} onClick={onEntrar}>
          Entrar
        </button>
      </div>
    );
  }

  if (paso === "listo") {
    return (
      <div className="am-flujo">
        <div className="am-listo">
          <h3 className="am-titulo">Apuesta lista</h3>
          <p className="al-frase">“{descripcion.trim()}”</p>
          <p className="am-sub">
            Se te retuvieron {fmt(monto)}. Mandásela a @{amigo?.alias}: tiene un día para aceptar,
            y si no acepta se te devuelven enteras.
            <br />
            {conMediador && mediador
              ? `Cuando acepten los dos, @${mediador.alias} queda como quien decide si no se ponen de acuerdo.`
              : "Cuando termine, cualquiera de los dos declara quién ganó."}
          </p>

          <button className="bapostar am-wa" onClick={compartir}>
            Enviar por WhatsApp
          </button>
          <button
            className="am-copiar"
            onClick={() => {
              if (enlace) navigator.clipboard?.writeText(enlace);
              onAviso("Enlace copiado");
            }}
          >
            Copiar enlace
          </button>
          <button
            className="am-copiar"
            onClick={() => {
              setPaso("amigo");
              setAmigo(null);
              setEnlace(null);
              setDescripcion("");
              setConMediador(false);
              setMediador(null);
            }}
          >
            Otra apuesta
          </button>
        </div>
      </div>
    );
  }

  const otros = (amigos ?? []).filter((a) => a.id !== amigo?.id);

  return (
    <div className="am-flujo">
      {paso === "detalle" && (
        <button className="am-volver" onClick={() => setPaso("amigo")}>
          <Icono id="i-back" />
          Volver
        </button>
      )}

      {paso === "amigo" && (
        <>
          <h3 className="am-titulo">¿A quién le apostás?</h3>
          <p className="am-sub">
            Por lo que sea: quién corre más rápido, quién llega primero, lo que se les ocurra.
            Después declaran quién ganó.
          </p>
          {amigos === null ? (
            <p className="am-vacio">Cargando…</p>
          ) : amigos.length === 0 ? (
            <p className="am-vacio">
              Todavía no tenés amigos en Pálpito. Agregá uno desde Cuenta → Amigos.
            </p>
          ) : (
            <div className="am-lista">
              {amigos.map((a) => (
                <button
                  key={a.id}
                  className="am-item"
                  onClick={() => {
                    setAmigo(a);
                    setPaso("detalle");
                  }}
                >
                  <span className="am-avatar">{a.alias.slice(0, 2).toUpperCase()}</span>
                  <b>@{a.alias}</b>
                  <Icono id="i-arr" className="ir" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {paso === "detalle" && amigo && (
        <>
          <h3 className="am-titulo">¿De qué es la apuesta?</h3>
          <textarea
            className="al-texto"
            rows={3}
            maxLength={280}
            placeholder="Te gano haciendo flexiones"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <p className="al-ayuda">
            Escribilo claro y de una sola forma de entender. Es lo que van a leer los dos cuando
            tengan que declarar quién ganó.
          </p>

          <h3 className="am-titulo" style={{ marginTop: 18 }}>
            ¿Cuánto ponen?
          </h3>
          <div className="am-monto">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={montoTexto}
              onChange={(e) => setMontoTexto(e.target.value)}
            />
          </div>
          <div className="am-rapidos">
            {RAPIDOS.map((n) => (
              <button
                key={n}
                className={montoTexto === String(n) ? "on" : ""}
                onClick={() => setMontoTexto(String(n))}
              >
                {n}
              </button>
            ))}
          </div>

          {/* La pregunta que decide qué pasa si después se contradicen. */}
          <h3 className="am-titulo" style={{ marginTop: 18 }}>
            ¿Cómo deciden quién ganó?
          </h3>
          <div className="al-modo">
            <button
              className={!conMediador ? "on" : ""}
              onClick={() => {
                setConMediador(false);
                setMediador(null);
              }}
            >
              <b>Entre nosotros dos</b>
              <span>
                Cualquiera declara y el otro confirma. Si no dice nada en una semana, se toma por
                bueno lo declarado.
              </span>
            </button>
            <button className={conMediador ? "on" : ""} onClick={() => setConMediador(true)}>
              <b>Que lo diga alguien más</b>
              <span>
                Un amigo de los dos decide si se contradicen. Manda lo que digan 2 de 3, así
                siempre hay resultado.
              </span>
            </button>
          </div>

          {conMediador && (
            <div className="al-mediador">
              <p className="al-ayuda">
                Elegí a quién. Tiene que aceptar antes de que la apuesta arranque, y @{amigo.alias}{" "}
                también lo tiene que aceptar al entrar.
              </p>
              <div className="am-lista">
                {otros.length === 0 ? (
                  <p className="am-vacio">Necesitás otro amigo más para poder elegir a alguien.</p>
                ) : (
                  otros.map((a) => (
                    <button
                      key={a.id}
                      className={`am-item ${mediador?.id === a.id ? "elegido" : ""}`}
                      onClick={() => setMediador(a)}
                    >
                      <span className="am-avatar">{a.alias.slice(0, 2).toUpperCase()}</span>
                      <b>@{a.alias}</b>
                      {mediador?.id === a.id && <Icono id="i-check" className="ir" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="am-resumen">
            <div className="fila">
              <span>Vos y @{amigo.alias}</span>
              <b>{fmt(monto)} cada uno</b>
            </div>
            <div className="fila total">
              <span>El que gane se lleva</span>
              <b className="mono">{fmt(monto * 2 * 0.995)}</b>
            </div>
          </div>

          <button className="bapostar" disabled={enviando} onClick={crear}>
            {enviando ? "Creando…" : `Apostar ${fmt(monto)}`}
          </button>
        </>
      )}
    </div>
  );
}
