"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/dinero";
import { LIGAS, type PartidoTablero } from "@/lib/tablero";

// Amigos y desafíos: apuestas entre dos personas, plata pareja, sin la casa
// de por medio. El flujo completo vive acá: elegir amigo, buscar el partido,
// elegir equipo, poner el monto y mandarlo por WhatsApp.
//
// Los partidos salen de la cartelera de ESPN, la misma que se mira en Deportes
// y la misma que usa el tablero abierto. Antes salían del catálogo de la base,
// que lo llenaba The Odds API: al apagarla quedó congelado, así que este paso
// ofrecía partidos viejos o ninguno.

const ZONA = "America/Caracas";
const DEPORTES = [...new Set(LIGAS.map((l) => l.deporte))];

const diaISO = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ZONA,
  }).format(new Date(iso));

function etiquetaDia(d: Date, n: number): string {
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  return new Intl.DateTimeFormat("es", { weekday: "short", timeZone: ZONA })
    .format(d)
    .replace(".", "");
}

type Amigo = { id: string; alias: string };
type Invitacion = { id: string; alias: string };

type Paso = "inicio" | "amigo" | "partido" | "lado" | "monto" | "listo";

type Respuesta = {
  ok: boolean;
  alias?: string | null;
  amigos?: Amigo[];
  recibidas?: Invitacion[];
  enviadas?: Invitacion[];
};

// Ni la lista de desafíos ni el alias viven acá. Los retos están en su propia
// sección de Cuenta y el alias arriba, con la identidad. Acá quedó una sola
// cosa: a quién podés retar.

export function PanelAmigos({
  onAviso,
  onCambio,
}: {
  onAviso: (t: string) => void;
  onCambio: () => void;
}) {
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [recibidas, setRecibidas] = useState<Invitacion[]>([]);
  const [enviadas, setEnviadas] = useState<Invitacion[]>([]);
  const [cargando, setCargando] = useState(true);

  const [buscarAlias, setBuscarAlias] = useState("");

  // Flujo de creación
  const [paso, setPaso] = useState<Paso>("inicio");
  const [amigo, setAmigo] = useState<Amigo | null>(null);
  const [deporte, setDeporte] = useState(DEPORTES[0]);
  const [ligaId, setLigaId] = useState(LIGAS[0].id);
  const [offset, setOffset] = useState(0);
  const [cartelera, setCartelera] = useState<{ clave: string; partidos: PartidoTablero[] } | null>(
    null
  );
  const [busqueda, setBusqueda] = useState("");
  const [evento, setEvento] = useState<PartidoTablero | null>(null);
  const [lado, setLado] = useState<"local" | "visitante" | null>(null);
  const [monto, setMonto] = useState("100");
  const [enviando, setEnviando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  const traerTodo = async (): Promise<Respuesta> => fetch("/api/amigos").then((r) => r.json());

  const aplicar = useCallback((a: Respuesta) => {
    if (a.ok) {
      setAmigos(a.amigos ?? []);
      setRecibidas(a.recibidas ?? []);
      setEnviadas(a.enviadas ?? []);
    }
    setCargando(false);
  }, []);

  const recargar = useCallback(async () => {
    aplicar(await traerTodo());
  }, [aplicar]);

  // La carga inicial va dentro de una función asíncrona y con guarda: así el
  // estado no se toca de forma síncrona en el efecto, ni después de desmontar.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const datos = await traerTodo();
      if (vivo) aplicar(datos);
    })();
    return () => {
      vivo = false;
    };
  }, [aplicar]);

  async function invitar() {
    const q = buscarAlias.trim().toLowerCase();
    if (q.length < 3) return;
    const r = await fetch("/api/amigos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "invitar", alias: q }),
    }).then((x) => x.json());

    const motivos: Record<string, string> = {
      no_existe: q.includes("@")
        ? `Nadie usa el correo ${q}`
        : `Nadie usa el alias @${q}`,
      sos_vos: "Ese sos vos",
      alias_invalido: "Escribí un alias o un correo",
    };
    onAviso(r.ok ? (r.estado === "aceptada" ? "¡Ya son amigos!" : "Invitación enviada") : (motivos[r.motivo] ?? "No se pudo"));
    if (r.ok) {
      setBuscarAlias("");
      recargar();
    }
  }

  async function responder(id: string, aceptar: boolean) {
    await fetch("/api/amigos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "responder", amistad: id, aceptar }),
    });
    onAviso(aceptar ? "Amigo agregado" : "Invitación rechazada");
    recargar();
  }

  // La cartelera del paso "elegir partido", igual que en el tablero abierto.
  const hoy = useMemo(() => new Date(), []);
  const fecha = diaISO(new Date(hoy.getTime() + offset * 86_400_000));
  const clave = `${ligaId}|${fecha}`;

  useEffect(() => {
    if (paso !== "partido") return;
    let vivo = true;
    const [liga, dia] = clave.split("|");
    (async () => {
      try {
        const r = await fetch(`/api/tablero?liga=${liga}&fecha=${dia}`).then((x) => x.json());
        if (vivo) setCartelera({ clave, partidos: r.ok ? (r.partidos as PartidoTablero[]) : [] });
      } catch {
        if (vivo) setCartelera({ clave, partidos: [] });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [paso, clave]);

  const partidos = cartelera?.clave === clave ? cartelera.partidos : null;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    // Solo los que no empezaron: sobre un partido en curso no se desafía.
    const abiertos = (partidos ?? []).filter((p) => p.estado === "programado");
    if (!q) return abiertos;
    return abiertos.filter(
      (p) =>
        p.local.nombre.toLowerCase().includes(q) || p.visitante.nombre.toLowerCase().includes(q)
    );
  }, [partidos, busqueda]);

  async function crear() {
    if (!amigo || !evento || !lado) return;
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 1) {
      onAviso("Poné un monto válido");
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/desafios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "crear",
          rival: amigo.id,
          liga: ligaId,
          partido: evento.id,
          fecha,
          lado,
          monto: n,
        }),
      }).then((x) => x.json());

      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas",
          evento_cerrado: "Ese partido ya no admite desafíos",
          partido_desconocido: "Ese partido ya no está en la cartelera",
          no_son_amigos: "Primero tienen que ser amigos",
        };
        onAviso(motivos[r.motivo] ?? "No se pudo crear el desafío");
        return;
      }
      setEnlace(`${window.location.origin}/desafio/${r.desafio}`);
      setPaso("listo");
      onCambio();
      recargar();
    } finally {
      setEnviando(false);
    }
  }

  function compartir() {
    if (!enlace || !evento || !lado || !amigo) return;
    const elegido = lado === "local" ? evento.local.nombre : evento.visitante.nombre;
    const texto =
      `Te desafío en Pálpito: ${evento.local.nombre} vs ${evento.visitante.nombre}.\n` +
      `Yo voy con ${elegido} y ponemos ${Number(monto).toFixed(0)} fichas cada uno.\n` +
      `¿Aceptás?\n\n${enlace}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  function reiniciar() {
    setPaso("inicio");
    setAmigo(null);
    setEvento(null);
    setLado(null);
    setEnlace(null);
    setBusqueda("");
  }

  if (cargando) {
    return <div className="am-cargando">Cargando…</div>;
  }

  // ---------- Flujo de creación ----------
  if (paso !== "inicio") {
    return (
      <div className="am-flujo">
        <button className="am-volver" onClick={reiniciar}>
          <Icono id="i-back" />
          Volver
        </button>

        {paso === "amigo" && (
          <>
            <h3 className="am-titulo">¿A quién desafiás?</h3>
            {amigos.length === 0 ? (
              <p className="am-vacio">Todavía no tenés amigos en Pálpito. Agregá uno primero.</p>
            ) : (
              <div className="am-lista">
                {amigos.map((a) => (
                  <button
                    key={a.id}
                    className="am-item"
                    onClick={() => {
                      setAmigo(a);
                      setPaso("partido");
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

        {paso === "partido" && (
          <>
            <h3 className="am-titulo">Elegí el partido</h3>

            <div className="tb-deportes">
              {DEPORTES.map((d) => (
                <button
                  key={d}
                  className={d === deporte ? "on" : ""}
                  onClick={() => {
                    setDeporte(d);
                    const primera = LIGAS.find((l) => l.deporte === d);
                    if (primera) setLigaId(primera.id);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            {LIGAS.filter((l) => l.deporte === deporte).length > 1 && (
              <div className="tb-ligas">
                {LIGAS.filter((l) => l.deporte === deporte).map((l) => (
                  <button
                    key={l.id}
                    className={l.id === ligaId ? "on" : ""}
                    onClick={() => setLigaId(l.id)}
                  >
                    {l.nombre}
                  </button>
                ))}
              </div>
            )}

            <div className="tb-dias">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  className={`tb-dia ${n === offset ? "on" : ""}`}
                  onClick={() => setOffset(n)}
                >
                  <b>{etiquetaDia(new Date(hoy.getTime() + n * 86_400_000), n)}</b>
                </button>
              ))}
            </div>

            <div className="am-buscar">
              <Icono id="i-lupa" />
              <input
                type="search"
                placeholder="Buscar equipo…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="am-lista">
              {partidos === null ? (
                <p className="am-vacio">Cargando la cartelera…</p>
              ) : filtrados.length === 0 ? (
                <p className="am-vacio">No hay partidos por empezar en este día.</p>
              ) : (
                filtrados.map((p) => (
                  <button
                    key={p.id}
                    className="am-partido"
                    onClick={() => {
                      setEvento(p);
                      setPaso("lado");
                    }}
                  >
                    <span className="liga">{p.liga}</span>
                    <b>
                      {p.local.nombre} vs {p.visitante.nombre}
                    </b>
                    <span className="hora mono">{hora(p.comienzaAt)}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {paso === "lado" && evento && (
          <>
            <h3 className="am-titulo">¿Quién gana?</h3>
            <p className="am-sub">
              A @{amigo?.alias} le va a tocar el otro. Si empatan, cada uno recupera lo suyo.
            </p>
            <div className="am-lados">
              <button
                className={`am-lado ${lado === "local" ? "on" : ""}`}
                onClick={() => setLado("local")}
              >
                <span>Local {evento.local.dinero.precio ?? ""}</span>
                <b>{evento.local.nombre}</b>
              </button>
              <button
                className={`am-lado ${lado === "visitante" ? "on" : ""}`}
                onClick={() => setLado("visitante")}
              >
                <span>Visitante {evento.visitante.dinero.precio ?? ""}</span>
                <b>{evento.visitante.nombre}</b>
              </button>
            </div>
            <button className="bapostar" disabled={!lado} onClick={() => setPaso("monto")}>
              Seguir
            </button>
          </>
        )}

        {paso === "monto" && evento && lado && (
          <>
            <h3 className="am-titulo">¿Cuánto ponen?</h3>
            <p className="am-sub">Los dos ponen lo mismo. El ganador se lleva el pozo.</p>
            <div className="am-monto">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="am-rapidos">
              {[50, 100, 250, 500].map((n) => (
                <button key={n} onClick={() => setMonto(String(n))} className={monto === String(n) ? "on" : ""}>
                  {n}
                </button>
              ))}
            </div>
            <div className="am-resumen">
              <div className="fila">
                <span>Vos</span>
                <b>{lado === "local" ? evento.local.nombre : evento.visitante.nombre}</b>
              </div>
              <div className="fila">
                <span>@{amigo?.alias}</span>
                <b>{lado === "local" ? evento.visitante.nombre : evento.local.nombre}</b>
              </div>
              <div className="fila total">
                <span>El ganador se lleva</span>
                <b className="mono">{fmt(Number(monto) * 2 * 0.995)}</b>
              </div>
            </div>
            <button className="bapostar" disabled={enviando} onClick={crear}>
              {enviando ? "Creando…" : `Crear desafío y poner ${fmt(Number(monto) || 0)}`}
            </button>
          </>
        )}

        {paso === "listo" && (
          <div className="am-listo">
            <div className="am-tic">
              <Icono id="i-amigos" />
            </div>
            <h3 className="am-titulo">Desafío creado</h3>
            <p className="am-sub">
              Se te retuvieron {fmt(Number(monto))}. Mandáselo a @{amigo?.alias} para que lo acepte.
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
            <button className="am-copiar" onClick={reiniciar}>
              Listo
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- Pantalla principal ----------
  //
  // El alias ya no se edita acá: es tu identidad, así que vive arriba en Cuenta,
  // junto al correo y el saldo. Acá quedó solo tu gente.
  return (
    <div className="am-panel">
      <button className="bapostar am-desafiar" onClick={() => setPaso("amigo")}>
        Desafiar a un amigo
      </button>

      {recibidas.length > 0 && (
        <div className="pf-card">
          <div className="pf-titulo">Te quieren agregar</div>
          {recibidas.map((i) => (
            <div key={i.id} className="am-invitacion">
              <span className="am-avatar">{i.alias.slice(0, 2).toUpperCase()}</span>
              <b>@{i.alias}</b>
              <button className="si" onClick={() => responder(i.id, true)}>
                Aceptar
              </button>
              <button className="no" onClick={() => responder(i.id, false)}>
                <Icono id="i-x" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pf-card">
        <div className="pf-titulo">Agregar un amigo</div>
        <div className="am-buscar">
          <Icono id="i-lupa" />
          {/* Sin tope de 20: ese límite es para el alias, y acá también entra un
              correo, que casi siempre es más largo. */}
          <input
            placeholder="Su alias o su correo"
            value={buscarAlias}
            onChange={(e) => setBuscarAlias(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invitar()}
            maxLength={80}
            autoCapitalize="none"
            spellCheck={false}
          />
          <button onClick={invitar}>Invitar</button>
        </div>
      </div>

      <div className="pf-card">
        <div className="pf-titulo">
          Amigos <span className="mono">{amigos.length}</span>
        </div>
        {amigos.length === 0 ? (
          <p className="am-vacio">Todavía ninguno. Pedile el alias a alguien y agregalo.</p>
        ) : (
          <div className="am-lista">
            {amigos.map((a) => (
              <div key={a.id} className="am-item estatico">
                <span className="am-avatar">{a.alias.slice(0, 2).toUpperCase()}</span>
                <b>@{a.alias}</b>
              </div>
            ))}
          </div>
        )}
        {enviadas.length > 0 && (
          <small className="am-pista">
            {enviadas.length} invitación{enviadas.length > 1 ? "es" : ""} esperando respuesta:{" "}
            {enviadas.map((e) => `@${e.alias}`).join(", ")}
          </small>
        )}
      </div>

    </div>
  );
}
