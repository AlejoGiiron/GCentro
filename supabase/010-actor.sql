-- G-Centro · Bloque 5 · Quién hizo qué
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- Sale de la entrevista de producto del 14/08/2026. Hasta hoy el panel se
-- diseñó para UN operador, y con uno solo "quién lo hizo" tenía respuesta
-- trivial. El panel va a ser donde Giiron centraliza los cobros, con varias
-- personas, y ninguna tabla guardaba el actor: ni `suscripcion_eventos`, ni
-- `pagos`, ni `banderas_pendientes`. No había una sola FK a `admins` fuera de
-- la propia tabla.
--
-- "¿Quién suspendió a este cliente?" es la pregunta que aparece cuando un
-- cliente llama enojado, y hoy no tiene respuesta. Peor: este panel escribe
-- en la base de producción del cliente, así que una acción sin autor es una
-- acción sin responsable.

begin;

-- ── 1. Quién es el que está actuando ─────────────────────────────────────
--
-- ⚠️ NO se usa `auth.uid()` pelado como DEFAULT, y la razón es operativa.
--
-- `auth.uid()` devuelve el uid del JWT, exista o no en `admins`. Con la FK
-- puesta, un uid que no esté en `admins` haría FALLAR el INSERT — y eso
-- rompería una emergencia desde el SQL Editor, que es exactamente el camino
-- que tiene que seguir funcionando cuando algo se rompió.
--
-- Esta función devuelve el uid SOLO si es un admin de verdad, y NULL en
-- cualquier otro caso: sin sesión (SQL Editor como `postgres`), con una
-- sesión que no es admin, o con claims a medio setear. El default nunca
-- puede hacer fallar una escritura.
--
-- `security definer` con `search_path = ''`, mismo patrón que `es_admin()`
-- (§8): sin eso la consulta a `admins` pasaría por RLS y devolvería NULL
-- justamente cuando más importa.
create or replace function public.admin_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.admins where id = (select auth.uid());
$$;

revoke execute on function public.admin_actual() from public;
grant  execute on function public.admin_actual() to authenticated;
grant  execute on function public.admin_actual() to anon;

comment on function public.admin_actual() is
  'El admin que está actuando, o NULL. Nunca falla ni tira: es DEFAULT de columnas y una excepción acá bloquearía la escritura. Devuelve NULL si no hay sesión (SQL Editor) o si el uid no está en admins.';

-- ── 2. La columna, en las tres tablas ────────────────────────────────────
--
-- ⚠️ NULLABLE A PROPÓSITO, y el NULL significa algo. Tres orígenes:
--
--   · Fila escrita ANTES de esta migración (todo lo anterior al 14/08/2026).
--   · Escritura desde el SQL Editor, sin sesión de usuario.
--   · Sesión válida cuyo uid no está en `admins`.
--
-- Un NOT NULL con default habría hecho lo contrario de lo que se busca:
-- rellenar el histórico con un autor inventado, o bloquear la emergencia.
-- El autor de lo viejo NO ES RECUPERABLE y decirlo es más honesto que
-- fabricarlo.
--
-- ⚠️ `on delete set null`, no `restrict`. Es la parte incómoda: borrar a un
-- admin BORRA SU AUTORÍA del histórico. Se eligió igual porque revocar un
-- acceso no puede quedar bloqueado por el registro de auditoría — en una
-- emergencia se revoca primero y se discute después. La consecuencia queda
-- anotada como decisión abierta en §9.7: lo correcto es no borrar admins
-- sino desactivarlos, y para eso hace falta una columna que hoy no existe.
alter table public.suscripcion_eventos
  add column admin_id uuid default public.admin_actual()
    references public.admins (id) on delete set null;

alter table public.pagos
  add column admin_id uuid default public.admin_actual()
    references public.admins (id) on delete set null;

alter table public.banderas_pendientes
  add column admin_id uuid default public.admin_actual()
    references public.admins (id) on delete set null;

comment on column public.suscripcion_eventos.admin_id is
  'Quién ejecutó el cambio. NULL = anterior al 14/08/2026, o escrito desde el SQL Editor. No es recuperable. Identifica a una PERSONA: va filtrado en el reporte de errores.';
comment on column public.pagos.admin_id is
  'Quién registró el pago. NULL = anterior al 14/08/2026, o desde el SQL Editor.';
comment on column public.banderas_pendientes.admin_id is
  'Quién disparó la sincronización. Lo escribe el DEFAULT: la Edge Function inserta con el JWT de quien llamó, así que no hace falta pasarlo a mano.';

-- ── 3. El trigger: ningún cambio de estado se queda sin evento ───────────
--
-- §3 pide que todo cambio de estado deje un `suscripcion_evento`. Hasta hoy
-- eso dependía de que la UI se acordara de escribirlo — o sea que no era una
-- garantía, era una intención. Es la misma clase de error que el 14/08:
-- una propiedad afirmada que el código no sostenía.
--
-- El trigger la vuelve una garantía: da igual si el cambio vino del panel,
-- del SQL Editor o de un script. Si `estado` cambió, hay evento.
--
-- ⚠️ LO QUE EL TRIGGER NO PUEDE SABER ES EL `motivo`. Un trigger ve el
-- antes y el después, nunca el por qué. Queda en NULL, y capturarlo exige
-- que el cambio pase por una función que lo reciba como parámetro. Anotado
-- como pendiente; no se inventa un motivo genérico, que sería peor que el
-- NULL porque parecería información.
create or replace function public.registrar_cambio_de_estado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tipo_evento text;
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

  insert into public.suscripcion_eventos
    (suscripcion_id, tipo, estado_anterior, estado_nuevo, admin_id)
  values
    (new.id, tipo_evento, old.estado, new.estado, public.admin_actual());

  return new;
end;
$$;

create trigger suscripciones_cambio_de_estado
  after update on public.suscripciones
  for each row
  -- Solo cuando el estado CAMBIÓ. Un update de precio o de fecha no genera
  -- evento de estado, y re-guardar el mismo estado tampoco: la tabla de
  -- eventos cuenta la historia, no cada vez que alguien apretó guardar.
  when (old.estado is distinct from new.estado)
  execute function public.registrar_cambio_de_estado();

-- ── 4. Verificación en transacción ───────────────────────────────────────
do $$
declare
  sus_id      uuid;
  previo      text;
  destino     text;
  tipo_espera text;
  ids_antes   uuid[];
  nuevos      int;
  ev          record;
begin
  -- Se prueba contra LAB, nunca contra un cliente que paga: una prueba en un
  -- cliente real le pondría un banner de cobranza en la pantalla de venta.
  select s.id, s.estado into sus_id, previo
    from public.suscripciones s
    join public.clientes c on c.id = s.cliente_id
   where c.es_prueba = true
   limit 1;

  if sus_id is null then
    raise exception 'no hay suscripcion de prueba (es_prueba) para verificar el trigger';
  end if;

  -- El destino se DERIVA del estado actual. Fijar 'gracia' a ciegas haría que
  -- la verificación pasara sola si LAB ya estuviera en gracia: el trigger no
  -- dispara cuando el estado no cambia, y el test no probaría nada.
  destino     := case when previo = 'gracia' then 'activa' else 'gracia' end;
  tipo_espera := case destino when 'gracia' then 'A_GRACIA' else 'REACTIVADA' end;

  -- Los ids de antes, no el conteo: dentro de una transacción todos los
  -- `creado_en` valen lo mismo (`now()` es fijo), así que ordenar por fecha
  -- puede devolver la fila equivocada. La diferencia de conjuntos no empata.
  select coalesce(array_agg(id), '{}') into ids_antes
    from public.suscripcion_eventos where suscripcion_id = sus_id;

  update public.suscripciones set estado = destino where id = sus_id;

  select count(*) into nuevos from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids_antes));
  if nuevos <> 1 then
    raise exception 'el trigger escribio % eventos, se esperaba 1', nuevos;
  end if;

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids_antes));

  if ev.tipo <> tipo_espera or ev.estado_anterior <> previo or ev.estado_nuevo <> destino then
    raise exception 'el evento salio mal: tipo=% (esperaba %) de=% a=%',
      ev.tipo, tipo_espera, ev.estado_anterior, ev.estado_nuevo;
  end if;

  -- Desde el SQL Editor `admin_actual()` da NULL y la escritura NO falla. Es
  -- el requisito de la emergencia: se escribe igual, sin autor.
  raise notice 'trigger OK: % -> % (%). admin_id=% (NULL desde el SQL Editor es lo esperado)',
    previo, destino, ev.tipo, ev.admin_id;

  -- Un update que NO toca el estado no genera evento.
  update public.suscripciones set sedes_adicionales = sedes_adicionales where id = sus_id;
  select count(*) into nuevos from public.suscripcion_eventos
   where suscripcion_id = sus_id and not (id = any(ids_antes));
  if nuevos <> 1 then
    raise exception 'el trigger disparo con un update que no cambio el estado';
  end if;

  -- Todo lo de arriba se deshace: es una verificación, no un cambio.
  raise exception using message = 'VERIFICACION_OK', errcode = 'RB999';
exception
  when sqlstate 'RB999' then
    raise notice 'Verificacion del trigger: OK (los cambios de prueba se descartaron)';
end $$;

commit;

-- ── Después de aplicar ───────────────────────────────────────────────────
--
--   supabase gen types typescript --linked > src/types/database.types.ts
--
-- Y comprobar que LAB quedó en `activa`: el bloque de verificación deshace
-- sus propios cambios, pero conviene mirarlo con los ojos.
--
--   select c.nombre_comercial, s.estado
--     from public.suscripciones s
--     join public.clientes c on c.id = s.cliente_id;
