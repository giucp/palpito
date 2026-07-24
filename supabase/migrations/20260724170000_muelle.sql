-- Pálpito — juego "El Muelle": saltas de tabla en tabla sobre el agua.
--
-- Mismas reglas de integridad que el resto: qué tablas están podridas se
-- decide AL INICIAR (derivado de una semilla), se guarda en el servidor y el
-- navegador no lo sabe hasta que la partida termina.

create table partidas_muelle (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  monto numeric(12,2) not null check (monto > 0),
  semilla text not null,          -- se revela al terminar
  hash text not null,             -- se muestra antes de jugar
  podridas boolean[] not null,    -- secreto mientras se juega
  mults numeric(10,2)[] not null, -- lo que paga cada tabla
  posicion int not null default 0, -- 0 = todavía en tierra firme
  estado text not null default 'jugando'
    check (estado in ('jugando','cobrada','hundida')),
  pago numeric(12,2),
  idempotency_key text unique,
  iniciada_at timestamptz not null default now(),
  cerrada_at timestamptz
);

create index idx_muelle_usuario on partidas_muelle(usuario_id, iniciada_at desc);

alter table partidas_muelle enable row level security;

-- Ojo: la política deja leer la fila entera, incluido el array de tablas
-- podridas. Por eso la app NO consulta esta tabla mientras juega; el estado
-- vivo se pide por API, que solo devuelve lo que toca. El historial se lee
-- de la vista de abajo, que no expone el secreto de partidas en curso.
create policy "muelle_solo_propias" on partidas_muelle
  for select to authenticated using (usuario_id = (select auth.uid()));

create view muelle_historial with (security_invoker = on) as
select id, usuario_id, monto, posicion, estado, pago, iniciada_at,
       case when estado <> 'jugando' then podridas end as podridas,
       case when estado <> 'jugando' then semilla end as semilla
  from partidas_muelle;

-- ============ INICIAR ============
create or replace function public.muelle_iniciar(
  p_usuario uuid,
  p_monto numeric,
  p_semilla text,
  p_hash text,
  p_podridas boolean[],
  p_mults numeric(10,2)[],
  p_idempotency text
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_saldo numeric;
  v_partida uuid;
begin
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;

  select id into v_partida from partidas_muelle where idempotency_key = p_idempotency;
  if found then
    return jsonb_build_object('ok', true, 'partida_id', v_partida, 'repetida', true);
  end if;

  if exists (select 1 from partidas_muelle
              where usuario_id = p_usuario and estado = 'jugando') then
    return jsonb_build_object('ok', false, 'motivo', 'partida_en_curso');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  insert into partidas_muelle (usuario_id, monto, semilla, hash, podridas, mults, idempotency_key)
  values (p_usuario, p_monto, p_semilla, p_hash, p_podridas, p_mults, p_idempotency)
  returning id into v_partida;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'juego', -p_monto, 'El Muelle: apuesta');

  return jsonb_build_object('ok', true, 'partida_id', v_partida, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ SALTAR ============
create or replace function public.muelle_saltar(
  p_partida uuid,
  p_usuario uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_sig int;
begin
  select * into r from partidas_muelle
   where id = p_partida and usuario_id = p_usuario for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'partida_inexistente');
  end if;
  if r.estado <> 'jugando' then
    return jsonb_build_object('ok', false, 'motivo', 'partida_cerrada');
  end if;

  v_sig := r.posicion + 1;
  if v_sig > array_length(r.podridas, 1) then
    return jsonb_build_object('ok', false, 'motivo', 'fin_del_muelle');
  end if;

  if r.podridas[v_sig] then
    update partidas_muelle
       set estado = 'hundida', posicion = v_sig, cerrada_at = now(), pago = 0
     where id = r.id;
    return jsonb_build_object('ok', true, 'resultado', 'hundida', 'posicion', v_sig,
      'podridas', r.podridas, 'semilla', r.semilla);
  end if;

  update partidas_muelle set posicion = v_sig where id = r.id;

  -- Al pisar la última tabla la partida se cierra sola y se paga el máximo.
  if v_sig = array_length(r.podridas, 1) then
    update partidas_muelle
       set estado = 'cobrada', cerrada_at = now(), pago = round(r.monto * r.mults[v_sig], 2)
     where id = r.id;
    insert into movimientos (usuario_id, tipo, monto, nota)
    values (p_usuario, 'premio', round(r.monto * r.mults[v_sig], 2),
            'El Muelle: cruzaste entero (' || r.mults[v_sig] || 'x)');
    return jsonb_build_object('ok', true, 'resultado', 'completado', 'posicion', v_sig,
      'multiplicador', r.mults[v_sig], 'pago', round(r.monto * r.mults[v_sig], 2),
      'podridas', r.podridas, 'semilla', r.semilla);
  end if;

  return jsonb_build_object('ok', true, 'resultado', 'firme', 'posicion', v_sig,
    'multiplicador', r.mults[v_sig]);
end $$;

-- ============ COBRAR ============
create or replace function public.muelle_cobrar(
  p_partida uuid,
  p_usuario uuid
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_pago numeric;
begin
  select * into r from partidas_muelle
   where id = p_partida and usuario_id = p_usuario for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'partida_inexistente');
  end if;
  if r.estado <> 'jugando' then
    return jsonb_build_object('ok', false, 'motivo', 'partida_cerrada');
  end if;
  if r.posicion < 1 then
    return jsonb_build_object('ok', false, 'motivo', 'sin_avanzar');
  end if;

  v_pago := round(r.monto * r.mults[r.posicion], 2);
  update partidas_muelle
     set estado = 'cobrada', cerrada_at = now(), pago = v_pago
   where id = r.id;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'premio', v_pago, 'El Muelle: cobró en ' || r.mults[r.posicion] || 'x');

  return jsonb_build_object('ok', true, 'resultado', 'cobrada',
    'multiplicador', r.mults[r.posicion], 'pago', v_pago,
    'podridas', r.podridas, 'semilla', r.semilla);
end $$;

revoke execute on function public.muelle_iniciar(uuid, numeric, text, text, boolean[], numeric(10,2)[], text) from public, anon, authenticated;
revoke execute on function public.muelle_saltar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.muelle_cobrar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.muelle_iniciar(uuid, numeric, text, text, boolean[], numeric(10,2)[], text) to service_role;
grant execute on function public.muelle_saltar(uuid, uuid) to service_role;
grant execute on function public.muelle_cobrar(uuid, uuid) to service_role;
