-- Despegue: que la ventaja de la casa sea el 3% que decimos, y no más.
--
-- EL PROBLEMA. El punto de estrellada y el multiplicador del jugador son los dos
-- números de dos decimales. La condición era `v_mult >= punto_crash`, así que
-- para cobrar en 2.00x hacía falta que la ronda aguantara hasta 2.01x: un
-- centavo más de lo que uno cree. Como la probabilidad de llegar a X es 0.97/X,
-- el retorno real era:
--
--     v * 0.97/(v + 0.01)
--
-- que no es 97% sino menos, y peor cuanto más bajo el retiro:
--
--     retiro 1.02x  ->  96.06%  (ventaja 3.94%, no 3%)
--     retiro 2.00x  ->  96.52%  (ventaja 3.48%)
--     retiro 10.0x  ->  96.90%  (ventaja 3.10%)
--
-- Cobraba de más justo a quien juega conservador, que es la mayoría.
--
-- EL ARREGLO. Cambiar `>=` por `>`: te estrellás si pasaste el punto, no si lo
-- alcanzaste. Ahora la probabilidad de cobrar en v es exactamente 0.97/v y el
-- retorno queda en 97,000% para cualquier multiplicador. Es un cambio a favor
-- del jugador y no cambia nada de lo que se ve en pantalla.

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

  -- `>` y no `>=`: alcanzar el punto todavía cuenta como llegar.
  if v_mult > r.punto_crash then
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

  -- Mismo criterio que al retirar: si no se pasó, sigue volando.
  if v_mult > r.punto_crash then
    update rondas_despegue
       set estado = 'estrellada', cerrada_at = now(), multiplicador = r.punto_crash, pago = 0
     where id = r.id;
    return jsonb_build_object('ok', true, 'estado', 'estrellada',
      'punto_crash', r.punto_crash, 'semilla', r.semilla);
  end if;

  return jsonb_build_object('ok', true, 'estado', 'volando', 'multiplicador', v_mult);
end $$;

revoke execute on function public.despegue_retirar(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.despegue_estado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.despegue_retirar(uuid, uuid) to service_role;
grant execute on function public.despegue_estado(uuid, uuid) to service_role;
