-- Pálpito — juego "Despegue" (estilo crash) con fichas de prueba.
--
-- Reglas del diseño, iguales a las de las apuestas:
--   · El punto de estrellada se decide AL INICIAR y se guarda en el servidor.
--     El navegador nunca lo conoce, así que no puede retirarse justo antes.
--   · El multiplicador se calcula por TIEMPO DEL SERVIDOR (now() - iniciada_at),
--     no por lo que diga el cliente.
--   · Verificable: se guarda una semilla y su hash. El hash se muestra antes de
--     jugar y la semilla se revela al terminar, así se puede comprobar que el
--     resultado ya estaba decidido y no se cambió a mitad de la ronda.

-- Los movimientos del juego se distinguen de las apuestas deportivas
alter table movimientos drop constraint if exists movimientos_tipo_check;
alter table movimientos add constraint movimientos_tipo_check
  check (tipo in ('regalo','apuesta','ganancia','devolucion','ajuste','juego','premio'));

create table rondas_despegue (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  monto numeric(12,2) not null check (monto > 0),
  semilla text not null,              -- se revela al terminar
  hash text not null,                 -- se muestra antes de jugar
  punto_crash numeric(10,2) not null, -- secreto hasta que termina
  estado text not null default 'volando'
    check (estado in ('volando','retirada','estrellada')),
  multiplicador numeric(10,2),        -- al que se retiró (si retiró)
  pago numeric(12,2),
  idempotency_key text unique,
  iniciada_at timestamptz not null default now(),
  cerrada_at timestamptz
);

create index idx_rondas_usuario on rondas_despegue(usuario_id, iniciada_at desc);

alter table rondas_despegue enable row level security;

-- Cada quien ve solo sus rondas (para el historial). Escribir: solo el servidor.
create policy "rondas_solo_propias" on rondas_despegue
  for select to authenticated using (usuario_id = (select auth.uid()));

-- Velocidad de la curva: multiplicador = e^(K * segundos).
-- Con K = 0.09: 5 s → 1.57x · 10 s → 2.46x · 20 s → 6.05x
create or replace function public.despegue_k() returns numeric
language sql immutable as $$ select 0.09::numeric $$;

-- ============ INICIAR ============
create or replace function public.despegue_iniciar(
  p_usuario uuid,
  p_monto numeric,
  p_semilla text,
  p_hash text,
  p_crash numeric,
  p_idempotency text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_saldo numeric;
  v_ronda uuid;
begin
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;

  -- Doble toque: devolver la ronda ya creada en vez de cobrar otra vez
  select id into v_ronda from rondas_despegue where idempotency_key = p_idempotency;
  if found then
    return jsonb_build_object('ok', true, 'ronda_id', v_ronda, 'repetida', true);
  end if;

  -- Una ronda a la vez por usuario
  if exists (select 1 from rondas_despegue
              where usuario_id = p_usuario and estado = 'volando') then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_en_curso');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  insert into rondas_despegue (usuario_id, monto, semilla, hash, punto_crash, idempotency_key)
  values (p_usuario, p_monto, p_semilla, p_hash, p_crash, p_idempotency)
  returning id into v_ronda;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'juego', -p_monto, 'Despegue: apuesta');

  return jsonb_build_object('ok', true, 'ronda_id', v_ronda, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ RETIRAR ============
-- El multiplicador sale del reloj del servidor. Si ya pasó el punto de
-- estrellada, la ronda se cierra como perdida aunque el cliente pida retirar.
create or replace function public.despegue_retirar(
  p_ronda uuid,
  p_usuario uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_seg numeric;
  v_mult numeric;
  v_pago numeric;
begin
  select * into r from rondas_despegue
   where id = p_ronda and usuario_id = p_usuario
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_inexistente');
  end if;
  if r.estado <> 'volando' then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_cerrada',
      'estado', r.estado, 'punto_crash', r.punto_crash, 'semilla', r.semilla);
  end if;

  v_seg := extract(epoch from (now() - r.iniciada_at));
  v_mult := floor(exp(despegue_k() * v_seg) * 100) / 100;

  if v_mult >= r.punto_crash then
    update rondas_despegue
       set estado = 'estrellada', cerrada_at = now(), multiplicador = r.punto_crash, pago = 0
     where id = r.id;
    return jsonb_build_object('ok', true, 'resultado', 'estrellada',
      'punto_crash', r.punto_crash, 'semilla', r.semilla);
  end if;

  v_pago := round(r.monto * v_mult, 2);
  update rondas_despegue
     set estado = 'retirada', cerrada_at = now(), multiplicador = v_mult, pago = v_pago
   where id = r.id;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'premio', v_pago, 'Despegue: retiro en ' || v_mult || 'x');

  return jsonb_build_object('ok', true, 'resultado', 'retirada',
    'multiplicador', v_mult, 'pago', v_pago,
    'punto_crash', r.punto_crash, 'semilla', r.semilla);
end $$;

-- ============ ESTADO ============
-- Consulta ligera mientras el avión sube. No revela el punto de estrellada
-- hasta que la ronda termina.
create or replace function public.despegue_estado(
  p_ronda uuid,
  p_usuario uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_seg numeric;
  v_mult numeric;
begin
  select * into r from rondas_despegue
   where id = p_ronda and usuario_id = p_usuario;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_inexistente');
  end if;

  if r.estado <> 'volando' then
    return jsonb_build_object('ok', true, 'estado', r.estado,
      'multiplicador', r.multiplicador, 'pago', r.pago,
      'punto_crash', r.punto_crash, 'semilla', r.semilla);
  end if;

  v_seg := extract(epoch from (now() - r.iniciada_at));
  v_mult := floor(exp(despegue_k() * v_seg) * 100) / 100;

  if v_mult >= r.punto_crash then
    update rondas_despegue
       set estado = 'estrellada', cerrada_at = now(), multiplicador = r.punto_crash, pago = 0
     where id = r.id;
    return jsonb_build_object('ok', true, 'estado', 'estrellada',
      'punto_crash', r.punto_crash, 'semilla', r.semilla);
  end if;

  return jsonb_build_object('ok', true, 'estado', 'volando', 'multiplicador', v_mult);
end $$;

revoke execute on function public.despegue_iniciar(uuid, numeric, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.despegue_retirar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.despegue_estado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.despegue_iniciar(uuid, numeric, text, text, numeric, text) to service_role;
grant execute on function public.despegue_retirar(uuid, uuid) to service_role;
grant execute on function public.despegue_estado(uuid, uuid) to service_role;
