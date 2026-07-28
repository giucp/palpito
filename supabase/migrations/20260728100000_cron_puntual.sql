-- El cron que sí es puntual.
--
-- ## Por qué se muda desde GitHub Actions
--
-- El cron de GitHub **no garantiza puntualidad**, y no es un detalle teórico:
-- configurado cada 10 minutos, las corridas reales de la noche del 27/07 fueron
-- a las 22:29, 23:39, 01:04, 04:24 y 07:15 — de una a tres horas de separación.
-- En repos públicos la cola se retrasa cuando GitHub tiene carga, y no hay
-- ajuste que lo cambie.
--
-- Eso rompe lo que el producto promete: que la ganancia se acredite a los pocos
-- minutos de terminar el partido. Y hace que los combos parezcan rotos, porque
-- las patas de un partido terminado tardan horas en pintarse.
--
-- ## Por qué acá y no en Vercel
--
-- El cron de Vercel en el plan Hobby corre **una vez al día**. Y pagar el plan
-- Pro por esto son 20 dólares al mes.
--
-- pg_cron corre dentro de la base que ya se usa: es puntual de verdad, es
-- gratis, y **no suma ningún servicio externo nuevo**, que es el criterio de
-- este proyecto desde el principio.
--
-- ## Qué hay que hacer ANTES de correr esto
--
-- Guardar los dos secretos en Vault, desde el SQL Editor, reemplazando los
-- valores por los de verdad (los mismos que tiene Vercel):
--
--   select vault.create_secret('https://palpito-nine.vercel.app', 'palpito_url');
--   select vault.create_secret('EL_CRON_SECRET_DE_VERCEL',        'palpito_cron_secret');
--
-- Van en Vault y no escritos acá porque **el repositorio es público**. Si
-- alguno ya existe, se actualiza con `vault.update_secret`.

-- ---------------------------------------------------------------- extensiones

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------------- el aviso

-- Llama a una ruta de Pálpito con la cabecera de autorización que espera.
--
-- `net.http_get` es **asíncrono**: encola la petición y devuelve enseguida, así
-- que el trabajo del cron no se queda esperando los 20 segundos que tarda
-- calcular la jornada. La respuesta queda en `net._http_response`, que es donde
-- hay que mirar si algo no funciona.
create or replace function public.avisar_a_palpito(ruta text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  base   text;
  clave  text;
  id_pet bigint;
begin
  select decrypted_secret into base  from vault.decrypted_secrets where name = 'palpito_url';
  select decrypted_secret into clave from vault.decrypted_secrets where name = 'palpito_cron_secret';

  -- Sin secretos no se llama a nada: mejor no hacer nada que pegarle a una URL
  -- vacía cada cinco minutos.
  if base is null or clave is null then
    raise notice 'Faltan los secretos palpito_url / palpito_cron_secret en Vault';
    return null;
  end if;

  select net.http_get(
    url     := rtrim(base, '/') || ruta,
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave),
    timeout_milliseconds := 120000
  ) into id_pet;

  return id_pet;
end;
$$;

revoke all on function public.avisar_a_palpito(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- los trabajos

-- Por si se vuelve a correr esta migración: `cron.schedule` con un nombre que ya
-- existe lo reemplaza, pero desprogramar primero deja claro qué queda.
select cron.unschedule('palpito-resultados') where exists (
  select 1 from cron.job where jobname = 'palpito-resultados'
);
select cron.unschedule('palpito-senales') where exists (
  select 1 from cron.job where jobname = 'palpito-senales'
);

-- Resultados: cada 5 minutos. Es lo que acredita las ganancias y marca las
-- patas de los combos, así que acá la puntualidad es lo que se estaba buscando.
-- Es idempotente: un evento ya cerrado no se vuelve a liquidar.
select cron.schedule(
  'palpito-resultados',
  '*/5 * * * *',
  $$ select public.avisar_a_palpito('/api/resultados'); $$
);

-- La jornada del motor: **cada hora entre las 9 y las 20**, no cada 5 minutos.
--
-- Se guarda UNA vez al día, en cuanto hay suficientes abridores anunciados. Los
-- anuncios llegan a lo largo de la mañana, así que hay que reintentar, pero
-- machacarlo cada cinco minutos no adelanta nada: una vez guardada, la ruta
-- corta enseguida, y antes de que estén los abridores va a decir que no
-- alcanzan por muchas veces que se pregunte.
select cron.schedule(
  'palpito-senales',
  '7 9-20 * * *',
  $$ select public.avisar_a_palpito('/api/senales'); $$
);

-- ## Cómo se comprueba que quedó andando
--
--   select jobname, schedule, active from cron.job;
--
--   select j.jobname, r.status, r.start_time, r.return_message
--     from cron.job_run_details r join cron.job j using (jobid)
--    order by r.start_time desc limit 10;
--
--   select id, status_code, created from net._http_response order by created desc limit 10;
--
-- `status_code` 200 es que Pálpito contestó bien. Un 401 quiere decir que el
-- secreto de Vault no coincide con el de Vercel.
