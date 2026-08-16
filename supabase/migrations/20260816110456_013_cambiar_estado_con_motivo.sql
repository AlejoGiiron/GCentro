-- G-Centro · Bloque 4 · El motivo de un cambio de estado
--
-- MIGRACIÓN INCREMENTAL. Reemplaza la función del trigger de `010` con
-- `create or replace`; no toca la tabla ni el trigger en sí.
--
-- Cierra §9.7-4. El trigger de `010` garantiza que TODO cambio de estado deja
-- evento, venga de donde venga — esa garantía se conserva intacta. Lo que no
-- puede es saber el POR QUÉ: un trigger ve el antes y el después, nunca la
-- intención.
--
-- Con un operador el motivo se podía reconstruir de memoria. Con varios, un
-- historial que dice "pasó a suspendida" sin decir por qué obliga a preguntarle
-- a quien lo hizo — y para eso primero hay que saber quién fue, que es lo que
-- `010` recién empezó a registrar.
--
-- ⚠️ REPARTO DE RESPONSABILIDADES, y es lo que hace que esto no sea frágil:
--
--   · La RPC es el camino NORMAL. Recibe el motivo y lo deja disponible.
--   · El trigger sigue siendo la GARANTÍA. Un UPDATE directo desde el SQL
--     Editor no pasa por la RPC, no tiene motivo, y el evento se escribe
--     igual con `motivo` en NULL. La emergencia sigue funcionando.
--
-- El motivo viaja por un GUC de transacción y no por un parámetro del trigger
-- porque un trigger no recibe parámetros. `set_config(..., true)` lo hace
-- LOCAL a la transacción: muere con ella y no se filtra a la siguiente
-- operación de la misma conexión, que en un pooler sería de otro usuario.
--
-- ⚠️ Local a la TRANSACCIÓN no es local a la SENTENCIA, y esa diferencia es un
-- defecto real que encontró el bloque de verificación de acá abajo. Ver el
-- comentario de la RPC: el motivo se limpia apenas termina el update.

begin;

create or replace function public.registrar_cambio_de_estado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tipo_evento text;
  el_motivo   text;
begin
  -- `suscripciones.estado` es el estado COMERCIAL (§4), cuatro valores. No
  -- confundir con el nivel de gating, que tiene cinco y vive en
  -- `banderas_pendientes.valor_deseado`. Por eso acá nunca sale
  -- 'RESTRINGIDA': ese valor del enum pertenece al otro vocabulario.
  tipo_evento := case new.estado
    when 'gracia'     then 'A_GRACIA'
    when 'suspendida' then 'SUSPENDIDA'
    when 'cancelada'  then 'CANCELADA'
    when 'activa'     then 'REACTIVADA'
  end;

  if tipo_evento is null then
    raise exception 'estado sin evento asociado: %', new.estado;
  end if;

  -- `true` como segundo argumento = "si no está seteado, devolvé NULL en vez
  -- de tirar". Un cambio hecho por fuera de la RPC no tiene que fallar por no
  -- traer motivo. El `nullif` convierte el string vacío en NULL: un motivo en
  -- blanco es la ausencia de motivo, no un motivo que dice "".
  el_motivo := nullif(current_setting('app.motivo', true), '');

  insert into public.suscripcion_eventos
    (suscripcion_id, tipo, estado_anterior, estado_nuevo, motivo, admin_id)
  values
    (new.id, tipo_evento, old.estado, new.estado, el_motivo, public.admin_actual());

  return new;
end;
$$;

/**
 * El camino normal para cambiar de estado desde el panel.
 *
 * `security invoker`: corre con los permisos de quien llama, así que las
 * policies de §8 siguen siendo la única autorización. Un no-admin no puede
 * usarla para saltearse RLS — el UPDATE de adentro le va a fallar igual.
 */
create or replace function public.cambiar_estado_suscripcion(
  p_suscripcion_id uuid,
  p_estado         text,
  p_motivo         text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filas int;
begin
  if p_estado not in ('activa','gracia','suspendida','cancelada') then
    raise exception 'estado invalido: %', p_estado;
  end if;

  perform set_config('app.motivo', coalesce(p_motivo, ''), true);

  update public.suscripciones
     set estado = p_estado
   where id = p_suscripcion_id;

  -- ⚠️ ROW_COUNT y no `FOUND`. `perform` es una sentencia SQL y PISA `FOUND`:
  -- con el `set_config` de abajo en el medio, un `if not found` siempre daría
  -- falso y una suscripción inexistente pasaría en silencio en vez de fallar.
  -- Se captura acá, pegado al update, antes de que nada lo toque.
  get diagnostics filas = row_count;

  -- ⚠️ SE LIMPIA APENAS TERMINA EL UPDATE, y esto no es prolijidad.
  --
  -- `set_config(..., true)` es local a la TRANSACCIÓN, no a la sentencia: sin
  -- esta línea el motivo queda seteado para todo lo que venga después en la
  -- misma transacción, y el trigger se lo aplica a un cambio que no es suyo.
  --
  -- Lo encontró el bloque de verificación de esta misma migración, que hacía
  -- un UPDATE directo después de llamar a la RPC y recibió el motivo de la
  -- llamada anterior. En producción cada request de supabase-js es su propia
  -- transacción, así que hoy no se dispara — pero el día que alguien envuelva
  -- dos cambios en una transacción, el segundo hereda el motivo del primero y
  -- el historial miente sin que nada falle.
  --
  -- Se limpia DESPUÉS del update y no dentro del trigger a propósito: un
  -- UPDATE que toca varias filas dispara el trigger una vez por fila, y todas
  -- son parte del mismo cambio. Consumir el valor en la primera le robaría el
  -- motivo a las demás.
  perform set_config('app.motivo', '', true);

  if filas = 0 then
    raise exception 'la suscripcion no existe o no es visible: %', p_suscripcion_id;
  end if;
end;
$$;

revoke execute on function public.cambiar_estado_suscripcion(uuid, text, text) from public;
grant  execute on function public.cambiar_estado_suscripcion(uuid, text, text) to authenticated;

comment on function public.cambiar_estado_suscripcion(uuid, text, text) is
  'Cambia el estado comercial dejando el motivo en el evento. El trigger sigue siendo la garantía de que el evento existe: un UPDATE directo escribe el evento igual, con motivo NULL.';

-- ── Verificación en transacción ──────────────────────────────────────────
do $$
declare
  sus_id  uuid;
  previo  text;
  destino text;
  ids     uuid[];
  ev      record;
begin
  select s.id, s.estado into sus_id, previo
    from public.suscripciones s join public.clientes c on c.id = s.cliente_id
   where c.es_prueba = true limit 1;
  if sus_id is null then
    raise exception 'no hay suscripcion de prueba para verificar';
  end if;

  destino := case when previo = 'gracia' then 'activa' else 'gracia' end;
  select coalesce(array_agg(id), '{}') into ids
    from public.suscripcion_eventos where suscripcion_id = sus_id;

  perform public.cambiar_estado_suscripcion(sus_id, destino, 'prueba de la migracion 013');

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids));

  if ev.motivo is distinct from 'prueba de la migracion 013' then
    raise exception 'el motivo no llego al evento: %', ev.motivo;
  end if;

  -- Y un UPDATE DIRECTO sigue funcionando, SIN heredar el motivo de arriba.
  --
  -- Esta comprobación encontró un defecto real el 16/08/2026: el GUC es local
  -- a la transacción, así que sin limpiarlo el update de acá abajo recibía el
  -- motivo de la llamada anterior y el evento salía con un motivo ajeno.
  --
  -- Verifica dos cosas a la vez: que el camino de la emergencia sigue abierto,
  -- y que el motivo no se derrama al cambio siguiente.
  select coalesce(array_agg(id), '{}') into ids
    from public.suscripcion_eventos where suscripcion_id = sus_id;
  update public.suscripciones set estado = previo where id = sus_id;
  select * into ev from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids));
  if ev.motivo is not null then
    raise exception 'un update directo trajo motivo, y no deberia: %', ev.motivo;
  end if;

  -- Y dos llamadas seguidas en la MISMA transacción: la segunda no hereda.
  -- Es la forma más filosa de la invariante, y la que se rompía.
  select coalesce(array_agg(id), '{}') into ids
    from public.suscripcion_eventos where suscripcion_id = sus_id;
  perform public.cambiar_estado_suscripcion(sus_id, destino, null);
  select * into ev from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids));
  if ev.motivo is not null then
    raise exception 'la segunda llamada heredo el motivo de la primera: %', ev.motivo;
  end if;

  -- Y una suscripcion inexistente TIENE que fallar (el chequeo de ROW_COUNT).
  begin
    perform public.cambiar_estado_suscripcion(
      '00000000-0000-4000-8000-000000000000'::uuid, 'activa', null);
    raise exception 'una suscripcion inexistente no fallo, y deberia';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%no existe o no es visible%' then raise; end if;
  end;

  raise notice 'RPC OK: motivo registrado, no se derrama, y el UPDATE directo sigue funcionando';
  raise exception using message = 'VERIFICACION_OK', errcode = 'RB999';
exception
  when sqlstate 'RB999' then
    raise notice 'Verificacion de 013: OK (los cambios de prueba se descartaron)';
end $$;

commit;
