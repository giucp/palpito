-- Pálpito — Fase 1: seguridad (RLS)
-- Fuente: palpito_guia.md §6 (Seguridad básica)
--
-- Reglas:
--   eventos, mercados, selecciones  → lectura pública
--   apuestas, apuesta_lineas, movimientos → cada usuario ve solo lo suyo
--   Insertar apuestas y movimientos: solo desde el servidor con la clave
--   de servicio (service role salta el RLS; por eso NO hay políticas de insert).

alter table eventos enable row level security;
alter table mercados enable row level security;
alter table selecciones enable row level security;
alter table apuestas enable row level security;
alter table apuesta_lineas enable row level security;
alter table movimientos enable row level security;

-- ============ Catálogo: lectura pública ============

create policy "catalogo_lectura_publica" on eventos
  for select to anon, authenticated using (true);

create policy "mercados_lectura_publica" on mercados
  for select to anon, authenticated using (true);

create policy "selecciones_lectura_publica" on selecciones
  for select to anon, authenticated using (true);

-- ============ Apuestas y monedero: solo lo propio ============

create policy "apuestas_solo_propias" on apuestas
  for select to authenticated using (usuario_id = (select auth.uid()));

create policy "lineas_solo_propias" on apuesta_lineas
  for select to authenticated using (
    exists (
      select 1 from apuestas a
      where a.id = apuesta_lineas.apuesta_id
        and a.usuario_id = (select auth.uid())
    )
  );

create policy "movimientos_solo_propios" on movimientos
  for select to authenticated using (usuario_id = (select auth.uid()));
