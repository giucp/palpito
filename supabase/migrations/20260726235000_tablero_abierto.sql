-- Pálpito — El tablero abierto de apuestas
--
-- Apuestas deja de ser el listado de parleys contra la casa y pasa a ser el
-- tablero donde cualquiera publica una apuesta sobre un partido y espera a que
-- otro se la tome. No hace falta ser amigo de nadie.
--
-- Las reglas no cambian por ser abiertas: plata pareja, comisión del 0,5% del
-- pozo, y solo la podés tomar si tenés las fichas. Lo único nuevo de verdad es
-- que un desafío puede existir **sin rival todavía**.
--
-- Todo lo demás ya estaba resuelto y se reusa tal cual: `liquidar_desafios`
-- paga al ganador y cobra la comisión, y `caducar_desafios` devuelve entero lo
-- retenido si nadie la tomó antes de que empezara el partido.

-- ============ Partidos que salen de la cartelera ============
--
-- La cartelera que se mira sale de ESPN en vivo y no está en la base; `eventos`
-- la llenaba The Odds API, que está apagada. Como un desafío se engancha a un
-- `evento_id`, publicar sobre un partido de la cartelera exige crearlo acá en
-- ese momento.
--
-- Guardar el id de ESPN cambia la liquidación de raíz: hasta ahora el resultado
-- se buscaba emparejando nombres de equipo y fecha, y con el id se resuelve por
-- coincidencia exacta. De paso se destraban NBA, NFL, NHL y Champions, que
-- están en la cartelera pero no en la lista de ligas de fútbol de
-- `resultados/espn.ts`: una apuesta ahí no se habría liquidado nunca.
alter table eventos
  add column espn_id text unique,
  -- La ruta del deporte en ESPN: 'baseball/mlb', 'soccer/arg.1', 'basketball/nba'.
  -- Sin esto habría que adivinar a qué liga pedirle el marcador.
  add column espn_ruta text;

comment on column eventos.espn_id is 'Id del partido en ESPN; permite liquidar por coincidencia exacta';
comment on column eventos.espn_ruta is 'Ruta del deporte en ESPN, p. ej. soccer/arg.1';

-- ============ Un desafío puede no tener rival todavía ============
--
-- `rival_id is null` es exactamente lo que significa "publicada y esperando":
-- no hace falta una columna aparte que pueda contradecir a esta.
alter table desafios alter column rival_id drop not null;

comment on column desafios.rival_id is 'Null mientras la apuesta está publicada y nadie la tomó';

-- El tablero pide siempre lo mismo: las abiertas, las nuevas primero.
create index idx_desafios_abiertos on desafios (created_at desc)
  where estado = 'pendiente' and rival_id is null;

-- ============ PUBLICAR UNA APUESTA ============
--
-- Igual que `crear_desafio` pero sin rival y sin exigir amistad: eso es todo lo
-- que la distingue. Las fichas se retienen ahí mismo, como en un desafío.
create or replace function public.publicar_apuesta(
  p_creador uuid,
  p_evento uuid,
  p_lado text,
  p_monto numeric
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_saldo numeric;
  e record;
  v_id uuid;
begin
  if p_lado not in ('local', 'visitante') then
    return jsonb_build_object('ok', false, 'motivo', 'lado_invalido');
  end if;
  if p_monto is null or p_monto < 1 or p_monto > 100000 then
    return jsonb_build_object('ok', false, 'motivo', 'monto_invalido');
  end if;

  select * into e from eventos where id = p_evento;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'evento_inexistente');
  end if;
  if e.estado <> 'programado' or e.comienza_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'evento_cerrado');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_creador;
  if v_saldo < p_monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  insert into desafios (creador_id, rival_id, evento_id, lado_creador, monto, tipo)
  values (p_creador, null, p_evento, p_lado, p_monto, 'deportivo')
  returning id into v_id;

  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_creador, 'apuesta', -p_monto, v_id, 'Apuesta publicada');

  return jsonb_build_object('ok', true, 'desafio', v_id, 'saldo_nuevo', v_saldo - p_monto);
end $$;

-- ============ TOMAR UNA APUESTA PUBLICADA ============
--
-- El `for update` es lo que hace que dos personas que tocan "Tomar" en el mismo
-- segundo no se lleven las dos la misma apuesta: la segunda espera, ve que ya
-- tiene rival y se va con 'ya_tomada'.
--
-- Que haya fondos se comprueba **acá**, en la misma transacción que mueve el
-- dinero. Comprobarlo en la pantalla no sirve de nada: el saldo pudo cambiar
-- entre que se dibujó el tablero y que se tocó el botón.
create or replace function public.tomar_apuesta(p_desafio uuid, p_usuario uuid)
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
  if d.rival_id is not null then
    return jsonb_build_object('ok', false, 'motivo', 'ya_tomada');
  end if;
  if d.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'motivo', 'ya_resuelto', 'estado', d.estado);
  end if;
  -- Tomarte tu propia apuesta sería moverte fichas de un bolsillo al otro y
  -- pagarle comisión a Pálpito por hacerlo.
  if d.creador_id = p_usuario then
    return jsonb_build_object('ok', false, 'motivo', 'es_tuya');
  end if;

  select * into e from eventos where id = d.evento_id;
  if not found or e.estado <> 'programado' or e.comienza_at <= now() then
    return jsonb_build_object('ok', false, 'motivo', 'evento_cerrado');
  end if;

  select coalesce(sum(monto), 0) into v_saldo from movimientos where usuario_id = p_usuario;
  if v_saldo < d.monto then
    return jsonb_build_object('ok', false, 'motivo', 'saldo', 'saldo', v_saldo);
  end if;

  select alias into v_alias from perfiles where usuario_id = d.creador_id;

  update desafios
     set rival_id = p_usuario, estado = 'aceptado', aceptado_at = now()
   where id = d.id;

  insert into movimientos (usuario_id, tipo, monto, desafio_id, nota)
  values (p_usuario, 'apuesta', -d.monto, d.id, 'Apuesta de @' || coalesce(v_alias, '?'));

  return jsonb_build_object('ok', true, 'saldo_nuevo', v_saldo - d.monto);
end $$;

-- ============ Arreglo: cancelar con rival vacío ============
--
-- `cancelar_desafio` decidía de quién era con `p_usuario <> d.rival_id`. Contra
-- un rival NULL eso no da falso: da NULL, y un `if NULL then` no entra, así que
-- la guarda se caía sola y **cualquier desconocido podía cancelar una apuesta
-- publicada ajena**. No le robaba las fichas (la devolución siempre va a quien
-- las puso), pero le tiraba la publicación abajo.
--
-- `is distinct from` es la comparación que sí trata NULL como un valor más.
create or replace function public.cancelar_desafio(p_desafio uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare d record;
begin
  select * into d from desafios where id = p_desafio for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;
  if p_usuario is distinct from d.rival_id and p_usuario is distinct from d.creador_id then
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

-- ============ Seguridad ============
-- Como todo lo que mueve dinero: solo desde el servidor, con la clave de
-- servicio. La pantalla nunca llama a estas funciones.
revoke execute on function public.publicar_apuesta(uuid, uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.tomar_apuesta(uuid, uuid) from public, anon, authenticated;

grant execute on function public.publicar_apuesta(uuid, uuid, text, numeric) to service_role;
grant execute on function public.tomar_apuesta(uuid, uuid) to service_role;
