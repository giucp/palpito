-- Pálpito — Lo que dijo el motor de señales cada día
--
-- Sin esta tabla el motor es una opinión. Con ella, en un mes se puede contestar
-- la única pregunta que importa: **¿los que eligió ganaron más que los que
-- descartó?**
--
-- ## Se guardan TODOS los candidatos, no solo los recomendados
--
-- Es la decisión de fondo. Guardando solo los elegidos se podría decir
-- "acertamos el 62%", y ese número suelto no significa nada: si los descartados
-- también ganaron el 62%, el motor no está eligiendo, está mirando. Los
-- descartados son el grupo de comparación y sin ellos no hay validación posible.
--
-- Por eso `entra` es una columna y no un filtro de entrada.
--
-- ## Y se guarda el detalle por modelo
--
-- `detalle` lleva lo que dijo cada uno de los ocho modelos, con su score y sus
-- motivos. Ocupa más, pero permite preguntar dentro de tres meses "¿el modelo de
-- descanso aportó algo o solo hizo ruido?" sin recalcular nada y sin haber
-- guardado los datos crudos de aquel día, que ya no se pueden recuperar (las
-- estadísticas de temporada cambian todos los días).

create table senales_dia (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,

  -- El partido. `juego` es el gamePk de MLB: con él se resuelve por coincidencia
  -- exacta, sin emparejar nombres.
  juego text not null,
  partido text not null,
  hora timestamptz,

  -- El candidato: un equipo de ese partido, no el partido.
  lado text not null check (lado in ('local', 'visita')),
  equipo text not null,

  -- El veredicto del motor
  score int not null,
  midieron int not null,
  total_modelos int not null,
  acuerdo int not null,
  entra boolean not null,
  -- Por qué no entró. Es lo que permite mover los umbrales mirando datos.
  motivo_descarte text,
  -- Qué modelo contradijo al resto, si hubo alguno.
  contradice text,

  -- Lo que dijo cada modelo: [{id, nombre, score, motivos[]}]
  detalle jsonb not null,

  -- ---- La curación a mano ----
  -- Se guarda APARTE de lo que decidió el motor, a propósito. Al mes se pueden
  -- comparar las dos series y saber si las correcciones humanas mejoran el
  -- resultado. Si lo mejoran, hay que mirar qué se estaba viendo y convertirlo en
  -- un modelo; si no, también es una respuesta. Pisando el veredicto del motor
  -- esa comparación se pierde para siempre.
  curado boolean,        -- null = sin revisar · true = aprobado · false = quitado
  curado_nota text,
  curado_at timestamptz,

  -- ---- El resultado ----
  -- `gano` null con `resuelto_at` puesto = el partido no se jugó: no acertó ni
  -- falló, y queda fuera de la estadística.
  gano boolean,
  resuelto_at timestamptz,

  creado_at timestamptz not null default now(),

  constraint un_senal_por_dia unique (fecha, juego, lado)
);

comment on table senales_dia is 'Todos los candidatos del motor de señales, elegidos y descartados, con su resultado';
comment on column senales_dia.entra is 'Si el motor lo recomendó. Los false son el grupo de comparación.';
comment on column senales_dia.detalle is 'Lo que dijo cada modelo: score y motivos';
comment on column senales_dia.curado is 'Decisión humana, guardada aparte de la del motor';

create index idx_senales_fecha on senales_dia (fecha desc);
create index idx_senales_pendientes on senales_dia (resuelto_at) where resuelto_at is null;
create index idx_senales_entra on senales_dia (entra, gano);

-- ============ Seguridad ============
-- Mientras se afina el motor esto no se muestra en la app: lo lee el servidor
-- con la clave de servicio y nadie más. Cuando haya pantalla se abrirá la
-- lectura, no antes.
alter table senales_dia enable row level security;
