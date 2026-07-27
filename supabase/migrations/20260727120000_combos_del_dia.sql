-- Pálpito — Los combos del día
--
-- Ocho parlays de MLB armados con los precios de Polymarket y el FIP de los
-- abridores (MLB StatsAPI). No se juegan en Pálpito: son información, y cada
-- quien los lleva a donde juegue.
--
-- Se guardan por dos razones:
--
-- 1. **Velocidad.** Armarlos son unas treinta consultas a MLB StatsAPI, una por
--    lanzador. Eso no se puede hacer cada vez que alguien abre la pantalla. El
--    primero que entra en el día los arma y los deja guardados; el resto los lee
--    de acá.
--
-- 2. **La estadística de aciertos.** Es lo que el dueño quiere de fondo: poder
--    decir "el combo de duelo de pitcheo pegó 3 de 30". Sin guardar el combo del
--    día, esa serie no existe. Por eso se guarda desde el primer día, aunque la
--    pantalla del historial venga después.
--
-- Congelar el combo tiene además un efecto bueno: todos ven lo mismo durante
-- todo el día, con los precios del momento en que se armó. Un combo que cambia
-- mientras lo mirás no se puede compartir por WhatsApp.

create table combos_dia (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  -- 'favoritos', 'duelo', 'lluvia'... El mismo id todos los días, que es lo que
  -- permite seguir a cada regla en el tiempo.
  combo text not null,
  nombre text not null,
  -- La regla escrita, tal cual se muestra. Se guarda con el combo porque si
  -- mañana se cambia el criterio, los de ayer tienen que seguir diciendo con
  -- cuál se armaron.
  regla text not null,
  tipo text not null check (tipo in ('mercado', 'abridores')),
  -- Las patas: partido, hora, pick, probabilidad y el motivo.
  patas jsonb not null,
  multiplicador numeric(10,2) not null,
  probabilidad numeric(6,4) not null,
  -- Cuándo se leyeron los precios. Va en la tarjeta: a las 7 de la tarde el
  -- mercado ya se movió y prometer exactitud sin decir la hora es mentir.
  armado_at timestamptz not null default now(),

  -- Resultado, cuando los partidos terminen. Null mientras se juega.
  acerto boolean,
  patas_acertadas int,
  resuelto_at timestamptz,

  constraint un_combo_por_dia unique (fecha, combo)
);

comment on table combos_dia is 'Los ocho combos de MLB de cada día, con su regla y su resultado';
comment on column combos_dia.combo is 'Id estable de la regla, para seguirla en el tiempo';
comment on column combos_dia.patas is 'Lista de {partido, hora, pick, probabilidad, motivo}';

create index idx_combos_fecha on combos_dia (fecha desc);
create index idx_combos_regla on combos_dia (combo, fecha desc);

-- ============ Seguridad ============
-- Los combos son información pública: cualquiera que entre a la app los ve, y
-- no hay nada de nadie adentro. Se leen sin sesión.
alter table combos_dia enable row level security;

create policy "combos_lectura_publica" on combos_dia
  for select to anon, authenticated using (true);

-- Escribir, solo el servidor.
