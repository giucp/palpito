-- Pálpito — Amigos y desafíos (apuestas P2P entre amigos)
--
-- Cómo funciona un desafío:
--   1. Elegís un partido y un equipo, ponés un monto y se lo mandás a un amigo.
--      Pálpito te retiene el monto en ese momento.
--   2. Tu amigo abre el enlace y confirma. Se le retiene el mismo monto y queda
--      con el otro equipo (si vos fuiste al Madrid, él va al Barcelona).
--   3. Al terminar el partido, el ganador se lleva el pozo menos la comisión.
--      Si empatan, se le devuelve a cada uno lo suyo, menos la comisión igual.
--
-- Plata pareja: los dos ponen lo mismo y las cuotas de la casa no entran en juego.
-- Es una apuesta entre amigos, no contra la casa.
--
-- Los movimientos usan los tipos que ya existían ('apuesta', 'ganancia',
-- 'devolucion') a propósito: así el panel de administración sigue calculando
-- bien el margen y la circulación sin tener que tocarlo. Lo que distingue a un
-- desafío de una apuesta normal es la columna `desafio_id`.

-- ============ Identidad pública ============
-- Hasta ahora un usuario era solo un correo, y un correo no se puede mostrar:
-- para agregar amigos hace falta un nombre público que se pueda buscar.

create table perfiles (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null unique,
  created_at timestamptz default now(),
  constraint alias_valido check (alias ~ '^[a-z0-9_]{3,20}$')
);

-- Propone un alias libre a partir del correo: "juan.perez@x.com" → "juanperez",
-- y si ya está tomado, "juanperez2", "juanperez3"…
create or replace function public.alias_libre(p_correo text) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_base text;
  v_alias text;
  i int := 1;
begin
  v_base := lower(regexp_replace(split_part(coalesce(p_correo, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  v_base := left(v_base, 16);
  if length(v_base) < 3 then v_base := 'jugador'; end if;

  v_alias := v_base;
  while exists (select 1 from perfiles where alias = v_alias) loop
    i := i + 1;
    v_alias := v_base || i::text;
  end loop;
  return v_alias;
end $$;

create or replace function public.perfil_inicial()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfiles (usuario_id, alias)
  values (new.id, public.alias_libre(new.email))
  on conflict (usuario_id) do nothing;
  return new;
end $$;

create trigger trg_perfil_inicial
after insert on auth.users
for each row execute function public.perfil_inicial();

-- Los que ya existían se quedaron sin perfil: dárselo ahora.
insert into perfiles (usuario_id, alias)
select u.id, public.alias_libre(u.email)
from auth.users u
where not exists (select 1 from perfiles p where p.usuario_id = u.id);

-- Cambiar el alias propio (el usuario elige cómo lo ven sus amigos).
create or replace function public.cambiar_alias(p_usuario uuid, p_alias text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_alias text;
begin
  v_alias := lower(trim(p_alias));
  if v_alias !~ '^[a-z0-9_]{3,20}$' then
    return jsonb_build_object('ok', false, 'motivo', 'alias_invalido');
  end if;
  if exists (select 1 from perfiles where alias = v_alias and usuario_id <> p_usuario) then
    return jsonb_build_object('ok', false, 'motivo', 'alias_tomado');
  end if;
  update perfiles set alias = v_alias where usuario_id = p_usuario;
  return jsonb_build_object('ok', true, 'alias', v_alias);
end $$;

-- ============ Amistades ============

create table amistades (
  id uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references auth.users(id) on delete cascade,
  destinatario_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz default now(),
  respondida_at timestamptz,
  constraint no_amigo_de_si_mismo check (solicitante_id <> destinatario_id)
);

-- Una sola relación por par, sin importar quién invitó a quién.
create unique index idx_amistad_par on amistades (
  least(solicitante_id, destinatario_id),
  greatest(solicitante_id, destinatario_id)
);
create index idx_amistad_destinatario on amistades (destinatario_id, estado);
create index idx_amistad_solicitante on amistades (solicitante_id, estado);

create or replace function public.son_amigos(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from amistades
    where estado = 'aceptada'
      and ((solicitante_id = p_a and destinatario_id = p_b)
        or (solicitante_id = p_b and destinatario_id = p_a))
  );
$$;

create or replace function public.solicitar_amistad(p_usuario uuid, p_alias text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_otro uuid;
  v_existente amistades%rowtype;
begin
  select usuario_id into v_otro from perfiles where alias = lower(trim(p_alias));
  if v_otro is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if v_otro = p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'sos_vos');
  end if;

  select * into v_existente from amistades
   where least(solicitante_id, destinatario_id) = least(p_usuario, v_otro)
     and greatest(solicitante_id, destinatario_id) = greatest(p_usuario, v_otro);

  if found then
    -- Si el otro ya te había invitado, pedirla de vuelta es aceptarla.
    if v_existente.estado = 'pendiente' and v_existente.destinatario_id = p_usuario then
      update amistades set estado = 'aceptada', respondida_at = now() where id = v_existente.id;
      return jsonb_build_object('ok', true, 'estado', 'aceptada');
    end if;
    if v_existente.estado = 'rechazada' then
      update amistades
         set estado = 'pendiente', solicitante_id = p_usuario, destinatario_id = v_otro,
             created_at = now(), respondida_at = null
       where id = v_existente.id;
      return jsonb_build_object('ok', true, 'estado', 'pendiente');
    end if;
    return jsonb_build_object('ok', true, 'estado', v_existente.estado, 'repetida', true);
  end if;

  insert into amistades (solicitante_id, destinatario_id) values (p_usuario, v_otro);
  return jsonb_build_object('ok', true, 'estado', 'pendiente');
end $$;

create or replace function public.responder_amistad(
  p_usuario uuid, p_amistad uuid, p_aceptar boolean
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  update amistades
     set estado = case when p_aceptar then 'aceptada' else 'rechazada' end,
         respondida_at = now()
   where id = p_amistad and destinatario_id = p_usuario and estado = 'pendiente';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ============ Desafíos ============

create table desafios (
  id uuid primary key default gen_random_uuid(),
  creador_id uuid not null references auth.users(id),
  rival_id uuid not null references auth.users(id),
  evento_id uuid not null references eventos(id),
  -- El lado que eligió quien lo creó; al rival le toca el otro.
  lado_creador text not null check (lado_creador in ('local', 'visitante')),
  monto numeric(12,2) not null check (monto > 0),
  -- Comisión en puntos básicos: 50 = 0,5 %. Se guarda por desafío para que
  -- cambiarla mañana no altere los que ya se jugaron.
  comision_bps int not null default 50 check (comision_bps between 0 and 1000),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptado', 'ganado_creador', 'ganado_rival', 'empate', 'cancelado')),
  created_at timestamptz default now(),
  aceptado_at timestamptz,
  liquidado_at timestamptz,
  constraint no_desafio_a_si_mismo check (creador_id <> rival_id)
);

create index idx_desafios_evento on desafios (evento_id, estado);
create index idx_desafios_creador on desafios (creador_id, created_at desc);
create index idx_desafios_rival on desafios (rival_id, created_at desc);

alter table movimientos add column desafio_id uuid references desafios(id);

-- ---- Crear ----
create or replace function public.crear_desafio(
  p_creador uuid, p_rival uuid, p_evento uuid, p_lado text, p_monto numeric
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_saldo numeric;
  e record;
  v_id uuid;
  v_alias text;
begin
  if p_lado not in ('local', 'visitante') then
    return jsonb_build_object('ok', false, 'motivo', 'lado_invalido');
  end if;
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;
  if p_creador = p_rival then
    return jsonb_build_object('ok', false, 'motivo', 'sos_vos');
  end if;
  if not son_amigos(p_creador, p_rival) then
    return jsonb_build_object('ok', false, 'motivo', 'no_son_amigos');
  end if;

  select * into e from eventos where id = p_evento;
  if not found or e.estado <> 'programado' or e.comienza_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'evento_cerrado');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_creador;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = p_rival;

  insert into desafios (creador_id, rival_id, evento_id, lado_creador, monto)
  values (p_creador, p_rival, p_evento, p_lado, p_monto)
  returning id into v_id;

  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_creador, 'apuesta', -p_monto, v_id, 'Desafío a @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'desafio', v_id, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ---- Aceptar ----
create or replace function public.aceptar_desafio(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  e record;
  v_saldo numeric;
  v_alias text;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if d.rival_id <> p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;

  select * into e from eventos where id = d.evento_id;
  if e.estado <> 'programado' or e.comienza_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'evento_cerrado');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if v_saldo < d.monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = d.creador_id;

  update desafios set estado = 'aceptado', aceptado_at = now() where id = d.id;
  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_usuario, 'apuesta', -d.monto, d.id, 'Desafío de @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'saldo_nuevo', v_saldo - d.monto);
end $$;

-- ---- Rechazar o cancelar ----
-- Lo puede hacer el rival (rechazar) o quien lo creó (arrepentirse), siempre que
-- todavía no se haya aceptado. Se devuelve lo retenido, sin comisión: no se jugó.
create or replace function public.cancelar_desafio(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare d record;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p_usuario <> d.rival_id and p_usuario <> d.creador_id then
    return jsonb_build_object('ok', false, 'motivo', 'no_es_tuyo');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;

  update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío cancelado: devolución');

  return jsonb_build_object('ok', true);
end $$;

-- ---- Liquidar los de un evento ----
-- Se llama justo después de liquidar_evento(), con el mismo criterio: el dinero
-- se mueve solo acá dentro, en una transacción.
create or replace function public.liquidar_desafios(p_evento uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  e record;
  d record;
  v_ganador text;
  v_pozo numeric;
  v_comision numeric;
  v_cerrados int := 0;
begin
  select * into e from eventos where id = p_evento;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'evento_inexistente');
  end if;

  -- Los que nadie llegó a aceptar: se devuelve lo retenido, sin comisión.
  for d in select * from desafios where evento_id = p_evento and estado = 'pendiente' loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío sin respuesta: devolución');
    v_cerrados := v_cerrados + 1;
  end loop;

  -- Partido suspendido o anulado: no se jugó, así que vuelve todo entero.
  if e.estado <> 'finalizado' or e.marcador_a is null or e.marcador_b is null then
    for d in select * from desafios where evento_id = p_evento and estado = 'aceptado' loop
      update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.creador_id, 'devolucion', d.monto, d.id, 'Partido sin resultado: devolución');
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.rival_id, 'devolucion', d.monto, d.id, 'Partido sin resultado: devolución');
      v_cerrados := v_cerrados + 1;
    end loop;
    return jsonb_build_object('ok', true, 'desafios_cerrados', v_cerrados);
  end if;

  v_ganador := case
    when e.marcador_a > e.marcador_b then 'local'
    when e.marcador_a < e.marcador_b then 'visitante'
    else 'empate' end;

  for d in select * from desafios where evento_id = p_evento and estado = 'aceptado' loop
    v_pozo := d.monto * 2;
    v_comision := round(v_pozo * d.comision_bps / 10000.0, 2);

    if v_ganador = 'empate' then
      -- Se devuelve lo de cada uno, pero la comisión se cobra igual.
      update desafios set estado = 'empate', liquidado_at = now() where id = d.id;
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.creador_id, 'devolucion', round(d.monto - v_comision / 2, 2), d.id, 'Desafío empatado');
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.rival_id, 'devolucion', round(d.monto - v_comision / 2, 2), d.id, 'Desafío empatado');
    elsif v_ganador = d.lado_creador then
      update desafios set estado = 'ganado_creador', liquidado_at = now() where id = d.id;
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.creador_id, 'ganancia', v_pozo - v_comision, d.id, 'Desafío ganado');
    else
      update desafios set estado = 'ganado_rival', liquidado_at = now() where id = d.id;
      insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
      values (d.rival_id, 'ganancia', v_pozo - v_comision, d.id, 'Desafío ganado');
    end if;
    v_cerrados := v_cerrados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'desafios_cerrados', v_cerrados);
end $$;

-- ---- Caducar los que quedaron sin responder y su partido ya empezó ----
-- Sin esto, la plata de quien lo creó quedaría retenida hasta que el evento
-- cierre, horas después. Corre en cada pasada de resultados.
create or replace function public.caducar_desafios()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_n int := 0;
begin
  for d in
    select ds.* from desafios ds
      join eventos ev on ev.id = ds.evento_id
     where ds.estado = 'pendiente' and ev.comienza_at <= now()
  loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío sin respuesta: devolución');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'caducados', v_n);
end $$;

-- ============ Seguridad ============

alter table perfiles enable row level security;
alter table amistades enable row level security;
alter table desafios enable row level security;

-- Los alias son públicos a propósito: es el nombre con el que te encuentran.
create policy "perfiles_lectura" on perfiles
  for select to authenticated using (true);

create policy "amistades_propias" on amistades
  for select to authenticated using (
    solicitante_id = (select auth.uid()) or destinatario_id = (select auth.uid())
  );

create policy "desafios_propios" on desafios
  for select to authenticated using (
    creador_id = (select auth.uid()) or rival_id = (select auth.uid())
  );

-- Todo lo que mueve dinero, solo desde el servidor con la clave de servicio.
revoke execute on function public.crear_desafio(uuid, uuid, uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.aceptar_desafio(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cancelar_desafio(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.liquidar_desafios(uuid) from public, anon, authenticated;
revoke execute on function public.caducar_desafios() from public, anon, authenticated;
revoke execute on function public.solicitar_amistad(uuid, text) from public, anon, authenticated;
revoke execute on function public.responder_amistad(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.cambiar_alias(uuid, text) from public, anon, authenticated;

grant execute on function public.crear_desafio(uuid, uuid, uuid, text, numeric) to service_role;
grant execute on function public.aceptar_desafio(uuid, uuid) to service_role;
grant execute on function public.cancelar_desafio(uuid, uuid) to service_role;
grant execute on function public.liquidar_desafios(uuid) to service_role;
grant execute on function public.caducar_desafios() to service_role;
grant execute on function public.solicitar_amistad(uuid, text) to service_role;
grant execute on function public.responder_amistad(uuid, uuid, boolean) to service_role;
grant execute on function public.cambiar_alias(uuid, text) to service_role;
