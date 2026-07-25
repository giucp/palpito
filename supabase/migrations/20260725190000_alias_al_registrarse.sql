-- Elegir el nombre de usuario al registrarse, y poder agregar un amigo por correo.
--
-- Hasta ahora el alias se inventaba a partir del correo. Eso deja nombres feos
-- ("loveandpainsport", cortado a 16) y, peor, el usuario no sabe cuál es el suyo
-- hasta que entra a Amigos.

-- ============ El alias que se pidió al registrarse ============
-- Llega en los metadatos del usuario (auth.signUp con options.data.alias).
-- Si no vino, no es válido o ya está tomado, se cae al inventado de siempre:
-- registrarse nunca debe fallar por el alias.

create or replace function public.perfil_inicial()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_pedido text;
  v_alias text;
begin
  v_pedido := lower(trim(coalesce(new.raw_user_meta_data->>'alias', '')));

  if v_pedido ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.perfiles where alias = v_pedido) then
    v_alias := v_pedido;
  else
    v_alias := public.alias_libre(new.email);
  end if;

  begin
    insert into public.perfiles (usuario_id, alias)
    values (new.id, v_alias)
    on conflict (usuario_id) do nothing;
  exception when unique_violation then
    -- Dos registros pidieron el mismo alias en el mismo instante.
    insert into public.perfiles (usuario_id, alias)
    values (new.id, public.alias_libre(new.email))
    on conflict (usuario_id) do nothing;
  end;

  return new;
end $$;

-- ============ Agregar un amigo por alias O por correo ============
-- El correo es lo que uno tiene a mano de un amigo; pedirle el alias primero es
-- una fricción tonta. Se busca por alias y, si no aparece, por correo.

create or replace function public.solicitar_amistad(p_usuario uuid, p_alias text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_busqueda text;
  v_otro uuid;
  v_existente amistades%rowtype;
begin
  v_busqueda := lower(trim(coalesce(p_alias, '')));
  if length(v_busqueda) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  end if;

  select usuario_id into v_otro from perfiles where alias = v_busqueda;
  if v_otro is null and v_busqueda like '%@%' then
    select id into v_otro from auth.users where lower(email) = v_busqueda;
  end if;

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

revoke execute on function public.solicitar_amistad(uuid, text) from public, anon, authenticated;
grant execute on function public.solicitar_amistad(uuid, text) to service_role;
