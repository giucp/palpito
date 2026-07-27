-- Pálpito — Apuestas libres: apostar por cualquier cosa
--
-- "Te apuesto a que te gano haciendo flexiones". No hay dato público que
-- consultar, así que el resultado lo declaran las personas.
--
-- ## El problema que resuelve, y por qué la regla es como es
--
-- La primera idea era "se paga si los dos están de acuerdo, y si no, se
-- devuelve". **Está mal, y el dueño lo vio enseguida:** si el silencio anula, el
-- que pierde nunca declara. Callarse le sale gratis y apostar deja de tener
-- consecuencia.
--
-- De ahí la regla que manda acá dentro:
--
--   **El silencio confirma. Nunca anula.**
--
-- Quien declara pone su versión sobre la mesa; el otro tiene un plazo para
-- desconocerla. Si no hace nada, se paga lo declarado. La regla general que hay
-- detrás vale para cualquier cosa que se construya después: **nunca premiar la
-- inacción del que se beneficia de ella**.
--
-- ## Y para cuando eso no alcanza: el mediador
--
-- Si el que pierde desconoce activamente, no hay mecanismo que averigüe la
-- verdad. Por eso al crear la apuesta se elige cómo se decide:
--
--   · **Entre los dos** — si se contradicen, vuelve la plata y queda registrado.
--   · **Con alguien más** — un tercero, y manda lo que digan 2 de 3.
--
-- Lo importante del mediador: **tiene que aceptarlo el rival también**, no solo
-- quien crea la apuesta. Si lo eligiera uno solo elegiría a su amigo, y sería
-- peor que no tener ninguno. Y el mediador mismo tiene que aceptar el rol antes
-- de que la apuesta arranque: nadie queda de árbitro sin enterarse.
--
-- Con 2 de 3, el que pierde **deja de poder bloquear**: si quien gana declara y
-- el mediador coincide, son dos votos y se paga, sin que importe lo que haga el
-- tercero.

-- ============ 1) Un tipo nuevo y lo que necesita ============

alter table desafios drop constraint if exists desafios_tipo_check;
alter table desafios
  add constraint desafios_tipo_check check (tipo in ('deportivo', 'carta', 'dados', 'libre'));

alter table desafios
  -- De qué es la apuesta. Sin esto los dos podrían estar declarando sobre cosas
  -- distintas.
  add column if not exists descripcion text,
  add column if not exists mediador_id uuid references auth.users(id),
  add column if not exists mediador_acepto_at timestamptz,
  -- Los votos. Cada uno dice quién ganó, no "gané yo": así el del mediador se
  -- lee igual que los otros dos y la cuenta es una sola.
  add column if not exists voto_creador text,
  add column if not exists voto_rival text,
  add column if not exists voto_mediador text,
  -- Hasta cuándo se puede declarar. Pasado el plazo, manda lo que haya.
  add column if not exists declara_hasta timestamptz;

alter table desafios drop constraint if exists desafios_votos_check;
alter table desafios add constraint desafios_votos_check check (
  (voto_creador is null or voto_creador in ('creador', 'rival')) and
  (voto_rival is null or voto_rival in ('creador', 'rival')) and
  (voto_mediador is null or voto_mediador in ('creador', 'rival'))
);

-- El mediador no puede ser uno de los dos que apuestan.
alter table desafios drop constraint if exists desafios_mediador_check;
alter table desafios add constraint desafios_mediador_check check (
  mediador_id is null or (mediador_id <> creador_id and mediador_id <> rival_id)
);

-- ============ 2) Crear ============

create or replace function public.crear_apuesta_libre(
  p_creador uuid,
  p_rival uuid,
  p_monto numeric,
  p_descripcion text,
  p_mediador uuid default null,
  p_minutos int default 1440   -- un día para aceptar
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_saldo numeric;
  v_id uuid;
  v_alias text;
begin
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;
  if p_descripcion is null or length(trim(p_descripcion)) < 4 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_descripcion');
  end if;
  if length(p_descripcion) > 280 then
    return jsonb_build_object('ok', false, 'motivo', 'descripcion_larga');
  end if;
  if p_creador = p_rival then
    return jsonb_build_object('ok', false, 'motivo', 'sos_vos');
  end if;
  if not son_amigos(p_creador, p_rival) then
    return jsonb_build_object('ok', false, 'motivo', 'no_son_amigos');
  end if;

  -- El mediador tiene que ser amigo de quien crea: si no, no hay forma de que
  -- lo elija ni de que el otro lo reconozca.
  if p_mediador is not null then
    if p_mediador = p_creador or p_mediador = p_rival then
      return jsonb_build_object('ok', false, 'motivo', 'mediador_invalido');
    end if;
    if not son_amigos(p_creador, p_mediador) then
      return jsonb_build_object('ok', false, 'motivo', 'mediador_no_es_amigo');
    end if;
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_creador;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = p_rival;

  insert into desafios (creador_id, rival_id, tipo, monto, descripcion, mediador_id, expira_at)
  values (p_creador, p_rival, 'libre', p_monto, trim(p_descripcion), p_mediador,
          now() + make_interval(mins => greatest(1, p_minutos)))
  returning id into v_id;

  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_creador, 'apuesta', -p_monto, v_id, 'Apuesta a @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'desafio', v_id, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ 3) Aceptar ============
-- La usan los dos: el rival para entrar y poner lo suyo, y el mediador para
-- aceptar el rol. La apuesta solo queda en juego cuando **están los dos**.

create or replace function public.aceptar_apuesta_libre(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_saldo numeric;
  v_rival_listo boolean;
  v_mediador_listo boolean;
begin
  select * into d from desafios where id = p_desafio and tipo = 'libre' for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;
  if d.expira_at is not null and now() > d.expira_at then
    return jsonb_build_object('ok', false, 'motivo', 'vencido');
  end if;

  -- ---- El mediador acepta el rol ----
  if p_usuario = d.mediador_id then
    update desafios set mediador_acepto_at = now() where id = d.id;
    v_mediador_listo := true;
    v_rival_listo := d.aceptado_at is not null;

  -- ---- El rival entra y pone lo suyo ----
  elsif p_usuario = d.rival_id then
    if d.aceptado_at is not null then
      return jsonb_build_object('ok', false, 'motivo', 'ya_aceptaste');
    end if;
    select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
    if v_saldo < d.monto then
      return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
    end if;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (p_usuario, 'apuesta', -d.monto, d.id, 'Apuesta aceptada');
    update desafios set aceptado_at = now() where id = d.id;
    v_rival_listo := true;
    v_mediador_listo := d.mediador_id is null or d.mediador_acepto_at is not null;

  else
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  -- Cuando están los dos, la apuesta arranca y empieza a correr el plazo para
  -- declarar. Antes no: si el mediador todavía no aceptó, nadie puede declarar
  -- nada porque no se sabe cómo se va a decidir.
  if v_rival_listo and v_mediador_listo then
    update desafios
       set estado = 'aceptado',
           declara_hasta = now() + interval '7 days'
     where id = d.id;
    return jsonb_build_object('ok', true, 'estado', 'aceptado');
  end if;

  return jsonb_build_object('ok', true, 'estado', 'esperando',
    'falta', case when not v_rival_listo then 'rival' else 'mediador' end);
end $$;

-- ============ 4) Pagar ============
-- Aparte para que la use tanto la declaración como el vencimiento, y para que
-- el dinero se mueva en un solo sitio.

create or replace function public.liquidar_libre(p_desafio uuid, p_gana text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_pozo numeric;
  v_comision numeric;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if d.liquidado_at is not null then
    return jsonb_build_object('ok', true, 'estado', 'ya_liquidado');
  end if;

  v_pozo := d.monto * 2;
  v_comision := round(v_pozo * d.comision_bps / 10000.0, 2);

  -- Un desacuerdo no cobra comisión: no hubo resultado, así que no hay servicio
  -- que cobrar. Vuelve todo entero.
  if p_gana = 'desacuerdo' then
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'No se pusieron de acuerdo: devolución');
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.rival_id, 'devolucion', d.monto, d.id, 'No se pusieron de acuerdo: devolución');
    return jsonb_build_object('ok', true, 'estado', 'resuelto', 'gana', 'desacuerdo');
  end if;

  if p_gana = 'creador' then
    update desafios set estado = 'ganado_creador', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'ganancia', v_pozo - v_comision, d.id, 'Apuesta ganada');
  else
    update desafios set estado = 'ganado_rival', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.rival_id, 'ganancia', v_pozo - v_comision, d.id, 'Apuesta ganada');
  end if;

  return jsonb_build_object('ok', true, 'estado', 'resuelto', 'gana', p_gana);
end $$;

-- ============ 5) Declarar quién ganó ============

create or replace function public.declarar_apuesta(
  p_desafio uuid,
  p_usuario uuid,
  p_gana text                 -- 'creador' | 'rival'
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_creador int;
  v_rival int;
  v_faltan int;
begin
  if p_gana not in ('creador', 'rival') then
    return jsonb_build_object('ok', false, 'motivo', 'voto_invalido');
  end if;

  select * into d from desafios where id = p_desafio and tipo = 'libre' for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if d.estado <> 'aceptado' then
    return jsonb_build_object('ok', false, 'motivo', 'no_jugable', 'estado', d.estado);
  end if;

  -- Cada uno vota una vez. Cambiar el voto después de ver el del otro sería
  -- justamente lo que permite hacer trampa.
  if p_usuario = d.creador_id then
    if d.voto_creador is not null then return jsonb_build_object('ok', false, 'motivo', 'ya_declaraste'); end if;
    update desafios set voto_creador = p_gana where id = d.id;
  elsif p_usuario = d.rival_id then
    if d.voto_rival is not null then return jsonb_build_object('ok', false, 'motivo', 'ya_declaraste'); end if;
    update desafios set voto_rival = p_gana where id = d.id;
  elsif p_usuario = d.mediador_id then
    if d.voto_mediador is not null then return jsonb_build_object('ok', false, 'motivo', 'ya_declaraste'); end if;
    update desafios set voto_mediador = p_gana where id = d.id;
  else
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;

  select
    (case when voto_creador  = 'creador' then 1 else 0 end)
  + (case when voto_rival    = 'creador' then 1 else 0 end)
  + (case when voto_mediador = 'creador' then 1 else 0 end),
    (case when voto_creador  = 'rival' then 1 else 0 end)
  + (case when voto_rival    = 'rival' then 1 else 0 end)
  + (case when voto_mediador = 'rival' then 1 else 0 end),
    (case when voto_creador is null then 1 else 0 end)
  + (case when voto_rival is null then 1 else 0 end)
  + (case when mediador_id is not null and voto_mediador is null then 1 else 0 end)
  into v_creador, v_rival, v_faltan
  from desafios where id = d.id;

  -- ¿Ya está decidido sin esperar a nadie más?
  --
  -- Con mediador manda 2 de 3, así que dos votos iguales cierran la apuesta
  -- aunque el tercero no haya hablado: eso es lo que impide que el que pierde
  -- bloquee callándose.
  --
  -- Sin mediador hacen falta los dos, y que coincidan.
  if d.mediador_id is not null then
    if v_creador >= 2 then return liquidar_libre(d.id, 'creador'); end if;
    if v_rival >= 2 then return liquidar_libre(d.id, 'rival'); end if;
  elsif v_faltan = 0 then
    if v_creador = 2 then return liquidar_libre(d.id, 'creador'); end if;
    if v_rival = 2 then return liquidar_libre(d.id, 'rival'); end if;
    -- Se contradicen y no hay quien desempate.
    return liquidar_libre(d.id, 'desacuerdo');
  end if;

  return jsonb_build_object('ok', true, 'estado', 'esperando', 'faltan', v_faltan);
end $$;

-- ============ 6) Los plazos ============
-- Tres casos, y cada uno se resuelve distinto **según quién pudo hacer algo al
-- respecto**. Esa es la regla que evita premiar a quien se calla.

create or replace function public.vencer_apuestas_libres()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_sin_aceptar int := 0;
  v_por_silencio int := 0;
  v_sin_acuerdo int := 0;
  v_creador int;
  v_rival int;
begin
  -- 1) Nadie la aceptó: vuelve lo del que apostó.
  for d in
    select * from desafios
     where tipo = 'libre' and estado = 'pendiente'
       and expira_at is not null and now() > expira_at
  loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Apuesta vencida: devolución');
    v_sin_aceptar := v_sin_aceptar + 1;
  end loop;

  -- 2) Se aceptó y venció el plazo para declarar.
  for d in
    select * from desafios
     where tipo = 'libre' and estado = 'aceptado'
       and declara_hasta is not null and now() > declara_hasta
  loop
    v_creador := (case when d.voto_creador = 'creador' then 1 else 0 end)
               + (case when d.voto_rival = 'creador' then 1 else 0 end)
               + (case when d.voto_mediador = 'creador' then 1 else 0 end);
    v_rival := (case when d.voto_creador = 'rival' then 1 else 0 end)
             + (case when d.voto_rival = 'rival' then 1 else 0 end)
             + (case when d.voto_mediador = 'rival' then 1 else 0 end);

    -- **Acá está la regla que sostiene todo.** Gana el que tenga más votos,
    -- aunque sea uno solo contra ningún otro: el silencio confirma lo declarado.
    -- Si anulara, al que pierde le bastaría con callarse y apostar no tendría
    -- consecuencia.
    if v_creador > v_rival then
      perform liquidar_libre(d.id, 'creador');
      v_por_silencio := v_por_silencio + 1;
    elsif v_rival > v_creador then
      perform liquidar_libre(d.id, 'rival');
      v_por_silencio := v_por_silencio + 1;
    else
      -- Empate: o no declaró nadie, o se contradicen y el mediador no votó.
      -- Ninguno de los dos pudo hacer más, así que vuelve la plata.
      perform liquidar_libre(d.id, 'desacuerdo');
      v_sin_acuerdo := v_sin_acuerdo + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true,
    'sin_aceptar', v_sin_aceptar, 'por_silencio', v_por_silencio, 'sin_acuerdo', v_sin_acuerdo);
end $$;

-- ============ Permisos ============
-- Todo pasa por el servidor con la clave de servicio, como el resto del dinero.
revoke execute on function public.crear_apuesta_libre(uuid, uuid, numeric, text, uuid, int) from public, anon, authenticated;
revoke execute on function public.aceptar_apuesta_libre(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.declarar_apuesta(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.liquidar_libre(uuid, text) from public, anon, authenticated;
revoke execute on function public.vencer_apuestas_libres() from public, anon, authenticated;

grant execute on function public.crear_apuesta_libre(uuid, uuid, numeric, text, uuid, int) to service_role;
grant execute on function public.aceptar_apuesta_libre(uuid, uuid) to service_role;
grant execute on function public.declarar_apuesta(uuid, uuid, text) to service_role;
grant execute on function public.liquidar_libre(uuid, text) to service_role;
grant execute on function public.vencer_apuestas_libres() to service_role;
