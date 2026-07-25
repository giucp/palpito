<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Pálpito

Plataforma de apuestas deportivas en fase de aprendizaje: pre-partido, fichas de prueba,
sin dinero real.

**La guía maestra del proyecto vive en** `C:\Users\PC\OneDrive\Desktop\renda\palpito_guia.md`
(identidad, tokens de color, modelo de datos, flujos de apostar/liquidar, fases). El mockup de
referencia visual es `palpito.html` en esa misma carpeta. Léela antes de diseñar o construir
pantallas.

Reglas no negociables:
- Todo cálculo de dinero ocurre en el servidor (nunca en el navegador).
- El saldo es la suma del libro `movimientos`; jamás una columna editable.
- Las escrituras de apuestas/movimientos van solo por el cliente admin
  (`src/lib/supabase/admin.ts`, clave de servicio).
- Los juegos deciden su resultado al iniciar, en el servidor, y son verificables:
  se publica el hash de la semilla antes y se revela la semilla al terminar.
- **The Odds API es solo para cuotas.** Los resultados salen de fuentes propias y
  gratuitas (`src/lib/resultados/`): statsapi.mlb.com para béisbol y la API pública
  de ESPN para fútbol. Al tocar el emparejamiento de nombres, comprobarlo con
  `node scripts/probar-emparejamiento.ts` antes de dar nada por bueno: si empareja
  mal, una apuesta se liquida con el marcador de otro partido.
- Números siempre en JetBrains Mono con `tabular-nums` (clase `.mono`).
- Iconos propios en SVG; nunca emoji para deportes ni banderas. Sin escudos de
  equipos: el dueño los considera ruido.
- Next 16: el middleware se llama `proxy.ts` y la función exportada `proxy`.

## Trabajar en este proyecto

- **La carpeta es `C:\Dev\palpito`, con D mayúscula.** Con `c:\dev` el build de Next
  falla con `Invariant: Expected workStore to be initialized`.
- **Las migraciones se aplican a mano.** Se escriben en `supabase/migrations/` pero no
  hay CLI conectada: hay que pegarle el SQL completo al dueño para que lo corra en el
  editor de Supabase.
- Verificar los cambios en el navegador antes de darlos por buenos; el dueño prueba
  desde su celular Android.
- `scripts/` tiene utilidades que se corren con node desde la raíz: recargar fichas,
  revisar rondas colgadas y comprobar la matemática de los juegos por simulación.
