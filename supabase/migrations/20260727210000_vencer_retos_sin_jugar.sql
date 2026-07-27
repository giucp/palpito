-- Pálpito — Un reto aceptado que nadie juega también devuelve las fichas
--
-- `vencer_desafios_de_juego` solo miraba los retos en estado 'pendiente': los
-- que nadie llegó a aceptar. Pero faltaba el otro caso, y es peor, porque ahí
-- hay plata retenida de los **dos**: el reto se acepta, los dos ponen, y uno de
-- los dos no juega nunca. Sin esto, esas fichas se quedaban retenidas para
-- siempre y el reto no se cerraba jamás.
--
-- Se devuelve **entero y a los dos**, sin comisión: no se jugó nada, así que no
-- hay pozo que repartir ni servicio que cobrar. Da igual si uno alcanzó a jugar
-- y el otro no: una jugada sola no es una partida.
--
-- ## El plazo cuenta desde que acepta, no desde que se creó
--
-- `expira_at` es el plazo para **aceptar**: una hora desde que se creó el reto.
-- Usar ese mismo momento para jugar sería injusto — quien acepta en el minuto 59
-- se quedaría con un minuto para tirar. Por eso este caso mira `aceptado_at`, y
-- cada uno tiene su hora completa desde que entró.

create or replace function public.vencer_desafios_de_juego()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  d record;
  v_sin_aceptar int := 0;
  v_sin_jugar int := 0;
begin
  -- ---- 1) Nadie lo aceptó: vuelve lo del que retó ----
  for d in
    select * from desafios
     where tipo <> 'deportivo' and estado = 'pendiente'
       and expira_at is not null and now() > expira_at
  loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío vencido: devolución');
    v_sin_aceptar := v_sin_aceptar + 1;
  end loop;

  -- ---- 2) Lo aceptaron pero no lo jugaron: vuelve lo de los dos ----
  for d in
    select * from desafios
     where tipo <> 'deportivo' and estado = 'aceptado'
       and aceptado_at is not null
       and now() > aceptado_at + interval '1 hour'
  loop
    update desafios set estado = 'cancelado', liquidado_at = now() where id = d.id;
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.creador_id, 'devolucion', d.monto, d.id, 'Desafío sin jugar: devolución');
    insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
    values (d.rival_id, 'devolucion', d.monto, d.id, 'Desafío sin jugar: devolución');
    v_sin_jugar := v_sin_jugar + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'vencidos', v_sin_aceptar + v_sin_jugar,
    'sin_aceptar', v_sin_aceptar,
    'sin_jugar', v_sin_jugar
  );
end $$;

revoke execute on function public.vencer_desafios_de_juego() from public, anon, authenticated;
grant execute on function public.vencer_desafios_de_juego() to service_role;
