-- El Muelle: dos tablas por paso, y la ventaja del 3% exacta.
--
-- QUÉ CAMBIA EN EL JUEGO. Antes cada paso tenía una sola tabla y saltar era
-- apretar un botón: no había decisión, solo suerte. Ahora hay **dos tablas** y
-- elegís una; la otra se rompe igual, para que veas qué habría pasado.
--
-- QUÉ CAMBIA EN LA MATEMÁTICA. Antes se fijaban las probabilidades y el premio
-- salía de dividir 0.97 entre ellas; como eso casi nunca cae en un número de
-- dos decimales, había que recortarlo y el recorte se lo quedaba la casa: la
-- ventaja real iba de 3,02% a 3,49% según dónde te bajaras, no el 3% prometido.
-- Ahora se eligen primero los premios (1.12x, 1.40x, 1.80x…) y de ahí se
-- deducen las probabilidades, así que el retorno es 97% exacto en cada escalón.
--
-- CÓMO SE GUARDA. `pasos` tiene un número por paso:
--   0 = ninguna podrida (pasás seguro)   1 = la izquierda está podrida
--   2 = la derecha está podrida          3 = las dos (no ocurre con esta escalera)
-- y `elecciones` guarda de qué lado saltaste, para poder reconstruir la partida.

alter table partidas_muelle
  add column pasos int[],
  add column elecciones int[] not null default '{}';

comment on column partidas_muelle.pasos is
  'Por paso: 0 ninguna podrida, 1 izquierda, 2 derecha, 3 ambas';
comment on column partidas_muelle.elecciones is
  'De qué lado saltó el jugador en cada paso: 0 izquierda, 1 derecha';

-- Las partidas a medio jugar quedarían con el tablero viejo y sin `pasos`, así
-- que se cierran y se devuelve lo apostado. Es plata de prueba, pero el
-- principio es el mismo de siempre: ante la duda, el jugador no pierde.
do $$
declare p record;
begin
  for p in select * from partidas_muelle where estado = 'jugando' loop
    update partidas_muelle
       set estado = 'cobrada', cerrada_at = now(), pago = p.monto
     where id = p.id;
    insert into movimientos (usuario_id, tipo, monto, nota)
    values (p.usuario_id, 'premio', p.monto, 'El Muelle: partida anulada por cambio de juego');
  end loop;
end $$;

-- ============ INICIAR ============
create or replace function public.muelle_iniciar(
  p_usuario uuid,
  p_monto numeric,
  p_semilla text,
  p_hash text,
  p_pasos int[],
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

  -- `podridas` ya no se usa, pero la columna es NOT NULL de la versión anterior.
  insert into partidas_muelle
    (usuario_id, monto, semilla, hash, podridas, pasos, mults, idempotency_key)
  values
    (p_usuario, p_monto, p_semilla, p_hash, '{}', p_pasos, p_mults, p_idempotency)
  returning id into v_partida;

  insert into movimientos (usuario_id, tipo, monto, nota)
  values (p_usuario, 'juego', -p_monto, 'El Muelle: apuesta');

  return jsonb_build_object('ok', true, 'partida_id', v_partida, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ SALTAR ============
-- Ahora hace falta decir a qué tabla saltás: 0 izquierda, 1 derecha.
create or replace function public.muelle_saltar(
  p_partida uuid,
  p_usuario uuid,
  p_lado int
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_sig int;
  v_paso int;
  v_cede boolean;
begin
  if p_lado is null or p_lado not in (0, 1) then
    return jsonb_build_object('ok', false, 'motivo', 'lado_invalido');
  end if;

  select * into r from partidas_muelle
   where id = p_partida and usuario_id = p_usuario for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'partida_inexistente');
  end if;
  if r.estado <> 'jugando' then
    return jsonb_build_object('ok', false, 'motivo', 'partida_cerrada');
  end if;

  v_sig := r.posicion + 1;
  if v_sig > array_length(r.pasos, 1) then
    return jsonb_build_object('ok', false, 'motivo', 'fin_del_muelle');
  end if;

  v_paso := r.pasos[v_sig];
  -- Cede si están las dos podridas, o si la podrida es justo la que elegiste.
  v_cede := v_paso = 3 or v_paso = (p_lado + 1);

  update partidas_muelle
     set elecciones = array_append(r.elecciones, p_lado)
   where id = r.id;

  if v_cede then
    update partidas_muelle
       set estado = 'hundida', posicion = v_sig, cerrada_at = now(), pago = 0
     where id = r.id;
    return jsonb_build_object('ok', true, 'resultado', 'hundida', 'posicion', v_sig,
      'paso', v_paso, 'lado', p_lado, 'pasos', r.pasos, 'semilla', r.semilla);
  end if;

  update partidas_muelle set posicion = v_sig where id = r.id;

  -- Al pisar la última tabla la partida se cierra sola y se paga el máximo.
  if v_sig = array_length(r.pasos, 1) then
    update partidas_muelle
       set estado = 'cobrada', cerrada_at = now(), pago = round(r.monto * r.mults[v_sig], 2)
     where id = r.id;
    insert into movimientos (usuario_id, tipo, monto, nota)
    values (p_usuario, 'premio', round(r.monto * r.mults[v_sig], 2),
            'El Muelle: cruzaste entero (' || r.mults[v_sig] || 'x)');
    return jsonb_build_object('ok', true, 'resultado', 'completado', 'posicion', v_sig,
      'paso', v_paso, 'lado', p_lado,
      'multiplicador', r.mults[v_sig], 'pago', round(r.monto * r.mults[v_sig], 2),
      'pasos', r.pasos, 'semilla', r.semilla);
  end if;

  return jsonb_build_object('ok', true, 'resultado', 'firme', 'posicion', v_sig,
    'paso', v_paso, 'lado', p_lado, 'multiplicador', r.mults[v_sig]);
end $$;

-- ============ COBRAR ============
-- Igual que antes, pero revelando `pasos` en vez de `podridas`.
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
    'pasos', r.pasos, 'semilla', r.semilla);
end $$;

-- La firma vieja de saltar e iniciar ya no sirve.
drop function if exists public.muelle_saltar(uuid, uuid);
drop function if exists public.muelle_iniciar(uuid, numeric, text, text, boolean[], numeric(10,2)[], text);

revoke execute on function public.muelle_iniciar(uuid, numeric, text, text, int[], numeric(10,2)[], text) from public, anon, authenticated;
revoke execute on function public.muelle_saltar(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.muelle_cobrar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.muelle_iniciar(uuid, numeric, text, text, int[], numeric(10,2)[], text) to service_role;
grant execute on function public.muelle_saltar(uuid, uuid, int) to service_role;
grant execute on function public.muelle_cobrar(uuid, uuid) to service_role;
