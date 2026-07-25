"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icono } from "./iconos";
import { fmt } from "@/lib/cupon";
import { cargarEventos } from "@/lib/eventos";
import type { Evento } from "@/lib/tipos";

// Amigos y desafíos: apuestas entre dos personas, plata pareja, sin la casa
// de por medio. El flujo completo vive acá: elegir amigo, buscar el partido,
// elegir equipo, poner el monto y mandarlo por WhatsApp.

type Amigo = { id: string; alias: string };
type Invitacion = { id: string; alias: string };

type Desafio = {
  id: string;
  lado_creador: "local" | "visitante";
  monto: number;
  comision_bps: number;
  estado: string;
  soyCreador: boolean;
  aliasCreador: string;
  aliasRival: string;
  eventos: {
    id: string;
    liga: string;
    equipo_a: string;
    equipo_b: string;
    comienza_at: string;
    marcador_a: number | null;
    marcador_b: number | null;
  };
};

type Paso = "inicio" | "amigo" | "partido" | "lado" | "monto" | "listo";

type Respuesta = {
  ok: boolean;
  alias?: string | null;
  amigos?: Amigo[];
  recibidas?: Invitacion[];
  enviadas?: Invitacion[];
  desafios?: Desafio[];
};

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Esperando respuesta",
  aceptado: "En juego",
  ganado_creador: "Resuelto",
  ganado_rival: "Resuelto",
  empate: "Empate",
  cancelado: "Cancelado",
};

export function PanelAmigos({ onAviso, onCambio }: { onAviso: (t: string) => void; onCambio: () => void }) {
  const [alias, setAlias] = useState<string | null>(null);
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [recibidas, setRecibidas] = useState<Invitacion[]>([]);
  const [enviadas, setEnviadas] = useState<Invitacion[]>([]);
  const [desafios, setDesafios] = useState<Desafio[]>([]);
  const [cargando, setCargando] = useState(true);

  const [buscarAlias, setBuscarAlias] = useState("");
  const [editandoAlias, setEditandoAlias] = useState(false);
  const [aliasNuevo, setAliasNuevo] = useState("");

  // Flujo de creación
  const [paso, setPaso] = useState<Paso>("inicio");
  const [amigo, setAmigo] = useState<Amigo | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [evento, setEvento] = useState<Evento | null>(null);
  const [lado, setLado] = useState<"local" | "visitante" | null>(null);
  const [monto, setMonto] = useState("100");
  const [enviando, setEnviando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);

  async function traerTodo() {
    const [a, d] = await Promise.all([
      fetch("/api/amigos").then((r) => r.json()),
      fetch("/api/desafios").then((r) => r.json()),
    ]);
    return { a, d };
  }

  const aplicar = useCallback(({ a, d }: { a: Respuesta; d: Respuesta }) => {
    if (a.ok) {
      setAlias(a.alias ?? null);
      setAmigos(a.amigos ?? []);
      setRecibidas(a.recibidas ?? []);
      setEnviadas(a.enviadas ?? []);
    }
    if (d.ok) setDesafios(d.desafios ?? []);
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

  async function guardarAlias() {
    const q = aliasNuevo.trim().toLowerCase();
    const r = await fetch("/api/amigos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "alias", alias: q }),
    }).then((x) => x.json());
    const motivos: Record<string, string> = {
      alias_tomado: "Ese alias ya está tomado",
      alias_invalido: "Usá 3 a 20 letras, números o guión bajo",
    };
    onAviso(r.ok ? "Alias actualizado" : (motivos[r.motivo] ?? "No se pudo"));
    if (r.ok) {
      setEditandoAlias(false);
      recargar();
    }
  }

  async function abrirPartidos() {
    setPaso("partido");
    if (eventos.length === 0) {
      const { eventos: evs } = await cargarEventos();
      setEventos(evs);
    }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return eventos.slice(0, 40);
    return eventos
      .filter(
        (e) =>
          e.equipoA.toLowerCase().includes(q) ||
          e.equipoB.toLowerCase().includes(q) ||
          e.liga.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [eventos, busqueda]);

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
          evento: evento.id,
          lado,
          monto: n,
        }),
      }).then((x) => x.json());

      if (!r.ok) {
        const motivos: Record<string, string> = {
          saldo: "No te alcanzan las fichas",
          evento_cerrado: "Ese partido ya no admite desafíos",
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
    const elegido = lado === "local" ? evento.equipoA : evento.equipoB;
    const texto =
      `Te desafío en Pálpito: ${evento.equipoA} vs ${evento.equipoB}.\n` +
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
                      abrirPartidos();
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
            <div className="am-buscar">
              <Icono id="i-lupa" />
              <input
                type="search"
                placeholder="Buscar equipo o liga…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="am-lista">
              {filtrados.map((e) => (
                <button
                  key={e.id}
                  className="am-partido"
                  onClick={() => {
                    setEvento(e);
                    setPaso("lado");
                  }}
                >
                  <span className="liga">{e.liga}</span>
                  <b>
                    {e.equipoA} vs {e.equipoB}
                  </b>
                  <span className="hora mono">{e.hora}</span>
                </button>
              ))}
              {filtrados.length === 0 && <p className="am-vacio">No hay partidos que coincidan.</p>}
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
                <span>Local</span>
                <b>{evento.equipoA}</b>
              </button>
              <button
                className={`am-lado ${lado === "visitante" ? "on" : ""}`}
                onClick={() => setLado("visitante")}
              >
                <span>Visitante</span>
                <b>{evento.equipoB}</b>
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
                <b>{lado === "local" ? evento.equipoA : evento.equipoB}</b>
              </div>
              <div className="fila">
                <span>@{amigo?.alias}</span>
                <b>{lado === "local" ? evento.equipoB : evento.equipoA}</b>
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
  return (
    <div className="am-panel">
      <div className="pf-card">
        <div className="pf-titulo">Tu alias</div>
        {editandoAlias ? (
          <div className="am-alias-editar">
            <input
              value={aliasNuevo}
              onChange={(e) => setAliasNuevo(e.target.value)}
              placeholder={alias ?? "tu_alias"}
              maxLength={20}
            />
            <button onClick={guardarAlias}>Guardar</button>
            <button className="ghost" onClick={() => setEditandoAlias(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="am-alias">
            <b>@{alias ?? "—"}</b>
            <button
              onClick={() => {
                setAliasNuevo(alias ?? "");
                setEditandoAlias(true);
              }}
            >
              Cambiar
            </button>
          </div>
        )}
        <small className="am-pista">Así te encuentran tus amigos.</small>
      </div>

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

      {desafios.length > 0 && (
        <div className="pf-card">
          <div className="pf-titulo">Tus desafíos</div>
          {desafios.map((d) => {
            const rival = d.soyCreador ? d.aliasRival : d.aliasCreador;
            const miLado = d.soyCreador
              ? d.lado_creador
              : d.lado_creador === "local"
                ? "visitante"
                : "local";
            const miEquipo = miLado === "local" ? d.eventos.equipo_a : d.eventos.equipo_b;
            const gane =
              (d.estado === "ganado_creador" && d.soyCreador) ||
              (d.estado === "ganado_rival" && !d.soyCreador);
            const perdi =
              (d.estado === "ganado_creador" && !d.soyCreador) ||
              (d.estado === "ganado_rival" && d.soyCreador);
            return (
              <a key={d.id} className="am-desafio" href={`/desafio/${d.id}`}>
                <div className="am-d-cab">
                  <span className="am-d-vs">vs @{rival}</span>
                  <span className={`am-d-estado ${gane ? "gano" : perdi ? "perdio" : ""}`}>
                    {gane ? "Ganaste" : perdi ? "Perdiste" : (ETIQUETA_ESTADO[d.estado] ?? d.estado)}
                  </span>
                </div>
                <b className="am-d-partido">
                  {d.eventos.equipo_a} vs {d.eventos.equipo_b}
                </b>
                <div className="am-d-pie">
                  <span>Vas con {miEquipo}</span>
                  <b className="mono">{fmt(Number(d.monto))}</b>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
