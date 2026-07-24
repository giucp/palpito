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
- Números siempre en JetBrains Mono con `tabular-nums` (clase `.mono`).
- Iconos propios en SVG; nunca emoji para deportes ni banderas.
- Next 16: el middleware se llama `proxy.ts` y la función exportada `proxy`.
