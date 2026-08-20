-- G-Centro · Bloque 5 · El nombre del vínculo, y la implementación con rastro
--
-- MIGRACIÓN INCREMENTAL. Tres cosas que van juntas porque las tres cierran el
-- mismo hueco: un cambio con consecuencia de plata que hoy no deja rastro.
--
--   1. `organizacion_externa_nombre`, CACHE del nombre que leyó quien vinculó.
--   2. El evento de vínculo guarda nombre viejo Y nuevo, en la misma
--      transacción que la columna.
--   3. `estado_implementacion` deja evento cuando cambia, y la exoneración
--      por aniversario tiene camino propio (§9.9).
--
-- ── POR QUÉ EL PUNTO 3 NO PODÍA ESPERAR ───────────────────────────────────
--
-- La `010` puso `admin_id` en todo y su trigger garantiza que TODO cambio de
-- estado comercial deja evento. La `016` hizo lo mismo con el nacimiento y
-- con el vínculo. Quedaba UN cambio con consecuencia de plata sin rastro:
-- pasar la implementación de `exonerada_condicional` a `exonerada` la vuelve
-- firme para siempre. Un botón que hiciera ese update en silencio sería el
-- único agujero que sobrevive a la `010`.

begin;

-- ── 1. El nombre de la organización, como CACHE ───────────────────────────

alter table public.suscripciones
  add column organizacion_externa_nombre text;

comment on column public.suscripciones.organizacion_externa_nombre is
  'CACHE, NO FUENTE. Es el nombre que el operador leyó y transcribió al vincular, copiado acá para que el detalle no tenga que recorrer el historial. LA FUENTE es el evento ORGANIZACION_VINCULADA (datos->>nombre_nueva), que es un hecho fechado y con autor; esta columna es su última foto y se reconstruye desde ahí. NO ES IDENTIDAD: lo que identifica es organizacion_externa_id. El nombre es mutable —si G-Vento renombra la organización, este valor queda viejo sin que nada esté mal— y su unique allá distingue mayúsculas, así que no se compara exacto contra nada.';

-- ── 2. El vínculo, con los dos nombres ────────────────────────────────────
--
-- Reemplaza la función de la `016`. El trigger no se toca: sigue disparando
-- cuando cambia el UUID, que es lo que identifica. **Un cambio de sólo el
-- nombre NO genera evento** y es correcto — corregir una mayúscula mal
-- transcripta no es un hecho del contrato.

create or replace function public.registrar_vinculo_organizacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.organizacion_externa_id is not null
     and nullif(current_setting('app.corregir_vinculo', true), '') is distinct from 'si'
  then
    raise exception
      'la suscripcion % ya esta vinculada a %; corregir un vinculo va por corregir_organizacion_externa()',
      new.id, old.organizacion_externa_id;
  end if;

  insert into public.suscripcion_eventos
    (suscripcion_id, tipo, motivo, datos, admin_id)
  values (
    new.id,
    'ORGANIZACION_VINCULADA',
    nullif(current_setting('app.motivo', true), ''),
    -- ⚠️ LOS DOS NOMBRES, no sólo el nuevo. El día que una bandera caiga
    -- donde no era, la pregunta va a ser DOS: qué creía quien vinculó y qué
    -- creía quien corrigió. Con un solo nombre, la primera no tiene respuesta.
    jsonb_build_object(
      'anterior',        old.organizacion_externa_id,
      'nueva',           new.organizacion_externa_id,
      'nombre_anterior', old.organizacion_externa_nombre,
      'nombre_nueva',    new.organizacion_externa_nombre
    ),
    public.admin_actual()
  );
  return new;
end;
$$;

/**
 * Vincular por primera vez.
 *
 * El nombre es OBLIGATORIO y no se compara contra nada: existe para que un
 * humano lo lea antes de confirmar, y para que quede escrito qué creyó. No se
 * valida contra G-Vento porque no hay a quién preguntarle — el contrato tiene
 * una sola llamada y escribe (§9.5).
 */
create or replace function public.vincular_organizacion(
  p_suscripcion_id uuid,
  p_organizacion   uuid,
  p_nombre         text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filas int;
begin
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'vincular exige el nombre de la organizacion';
  end if;

  update public.suscripciones
     set organizacion_externa_id     = p_organizacion,
         -- Se guarda con los bordes recortados y tal cual lo escribió el
         -- operador en lo demás: es lo que leyó, no una versión normalizada.
         organizacion_externa_nombre = btrim(p_nombre)
   where id = p_suscripcion_id;

  get diagnostics filas = row_count;
  if filas = 0 then
    raise exception 'no existe la suscripcion %', p_suscripcion_id;
  end if;
end;
$$;

-- La versión de la `016` tomaba tres argumentos y no sabía del nombre. Se
-- borra en vez de dejar dos: dos funciones con el mismo nombre y distinta
-- firma es cómo se termina llamando a la que no audita.
drop function if exists public.corregir_organizacion_externa(uuid, uuid, text);

/**
 * Corregir un vínculo ya hecho. El camino aparte del que habla el trigger.
 *
 * Las dos columnas se mueven en la MISMA sentencia, así que el evento ve el
 * par viejo y el par nuevo completos. Separarlas dejaría un instante con el
 * UUID de una organización y el nombre de otra.
 */
create or replace function public.corregir_organizacion_externa(
  p_suscripcion_id uuid,
  p_organizacion   uuid,
  p_nombre         text,
  p_motivo         text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  filas int;
begin
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'corregir un vinculo exige el nombre de la organizacion';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'corregir un vinculo exige motivo';
  end if;

  perform set_config('app.corregir_vinculo', 'si', true);
  perform set_config('app.motivo', p_motivo, true);

  update public.suscripciones
     set organizacion_externa_id     = p_organizacion,
         organizacion_externa_nombre = btrim(p_nombre)
   where id = p_suscripcion_id;

  -- ROW_COUNT y no FOUND: los `perform` de arriba pisan FOUND (lección de 013).
  get diagnostics filas = row_count;

  perform set_config('app.corregir_vinculo', '', true);
  perform set_config('app.motivo', '', true);

  if filas = 0 then
    raise exception 'no existe la suscripcion %', p_suscripcion_id;
  end if;
end;
$$;

-- ── 3. La implementación deja rastro ──────────────────────────────────────

alter table public.suscripcion_eventos
  drop constraint suscripcion_eventos_tipo_check;

alter table public.suscripcion_eventos
  add constraint suscripcion_eventos_tipo_check check (tipo in (
    'CREADA','CAMBIO_PLAN','CAMBIO_TERMINO','SEDES_MODIFICADAS',
    'A_GRACIA','RESTRINGIDA','SUSPENDIDA','REACTIVADA','CANCELADA',
    'ORGANIZACION_VINCULADA','IMPLEMENTACION_ACTUALIZADA'));

-- Un solo tipo para los cuatro estados, y `datos` dice de dónde a dónde. No
-- se hace un tipo por transición porque las que faltan —volver a `pendiente`
-- al bajar de término, por ejemplo— todavía no tienen quién las dispare, y
-- reservarles nombres hoy sería inventar vocabulario para código inexistente.

create or replace function public.registrar_cambio_implementacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.suscripcion_eventos
    (suscripcion_id, tipo, motivo, datos, admin_id)
  values (
    new.id,
    'IMPLEMENTACION_ACTUALIZADA',
    nullif(current_setting('app.motivo', true), ''),
    jsonb_build_object(
      'anterior', old.estado_implementacion,
      'nuevo',    new.estado_implementacion,
      -- El monto viaja en el evento porque es lo que se está perdonando o
      -- volviendo exigible. Sin él, el historial dice que algo cambió y no
      -- de cuánto — la mitad inútil de un aviso de cobranza (`006`).
      'monto',    new.monto_implementacion
    ),
    public.admin_actual()
  );
  return new;
end;
$$;

create trigger suscripciones_cambio_implementacion
  after update on public.suscripciones
  for each row
  when (old.estado_implementacion is distinct from new.estado_implementacion)
  execute function public.registrar_cambio_implementacion();

/**
 * Exonerar la implementación al cumplirse el aniversario (§9.3, §9.9).
 *
 * ⚠️ ESTA REGLA ESTÁ ESCRITA DOS VECES: acá y en `transicionImplementacion`
 * de `src/lib/cobro.ts`. Es duplicación deliberada y acotada a UNA regla —
 * `exonerada_condicional` + doce meses cumplidos → `exonerada`— por un
 * motivo: la guarda no puede vivir sólo en el navegador, que es donde
 * cualquiera puede llamar a la RPC sin pasar por la pantalla.
 *
 * Que no diverja lo verifica `src/lib/cobro.esquema.test.ts`, que lee ESTA
 * migración y la compara con el modelo.
 *
 * Los doce meses se cuentan desde `fecha_inicio` —el día que empezó el
 * servicio— y no desde `creado_en`, que es cuándo se cargó la fila.
 */
create or replace function public.exonerar_implementacion(
  p_suscripcion_id uuid,
  p_motivo         text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s record;
begin
  select estado_implementacion, fecha_inicio into s
    from public.suscripciones where id = p_suscripcion_id;

  if not found then
    raise exception 'no existe la suscripcion %', p_suscripcion_id;
  end if;

  if s.estado_implementacion <> 'exonerada_condicional' then
    raise exception 'la implementacion esta en % y solo se exonera desde exonerada_condicional',
      s.estado_implementacion;
  end if;

  -- Exonerar antes del año REGALA la implementación de un contrato que
  -- todavía puede bajar de término y volverla exigible (§9.3). La pantalla ya
  -- no ofrece el botón antes de tiempo; esto lo garantiza igual.
  if current_date < (s.fecha_inicio + interval '12 months') then
    raise exception 'todavia no cumplio los doce meses: empezo el % y los cumple el %',
      s.fecha_inicio, (s.fecha_inicio + interval '12 months')::date;
  end if;

  perform set_config('app.motivo', coalesce(p_motivo, ''), true);

  update public.suscripciones
     set estado_implementacion = 'exonerada'
   where id = p_suscripcion_id;

  perform set_config('app.motivo', '', true);
end;
$$;

-- ── Verificación en transacción ───────────────────────────────────────────

do $$
declare
  v_cliente  uuid;
  v_producto uuid;
  v_plan     uuid;
  v_sus      uuid := gen_random_uuid();
  v_mal      uuid := gen_random_uuid();
  v_bien     uuid := gen_random_uuid();
  ev         record;
  n          int;
begin
  select id into v_cliente from public.clientes where es_prueba order by creado_en limit 1;
  select id into v_producto from public.productos where codigo = 'g-vento';
  select id into v_plan from public.planes
   where producto_id = v_producto and codigo = 'esencial';

  -- Un anual que empezó hace trece meses: el aniversario ya pasó.
  perform public.crear_suscripcion(
    v_sus, v_cliente, v_producto, v_plan, 'anual', 0::smallint,
    80000, 60000, 30::smallint, 250000,
    (current_date - interval '13 months')::date,
    (current_date - interval '1 month')::date,
    'exonerada_condicional', 'verificacion de la 017');

  -- 1. Vincular exige nombre.
  begin
    perform public.vincular_organizacion(v_sus, v_mal, '  ');
    raise exception 'vincular acepto un nombre vacio';
  exception
    when raise_exception then
      if position('exige el nombre' in sqlerrm) = 0 then raise; end if;
  end;

  -- 2. Vincular desde NULL guarda las dos cosas y deja evento con los dos
  --    nombres —el anterior en null, que es el hecho de que no había.
  perform public.vincular_organizacion(v_sus, v_mal, '  Nombre Mal Copiado  ');

  select organizacion_externa_nombre into ev from public.suscripciones where id = v_sus;
  if ev.organizacion_externa_nombre <> 'Nombre Mal Copiado' then
    raise exception 'el nombre no se guardo recortado: [%]', ev.organizacion_externa_nombre;
  end if;

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA'
     and datos ->> 'anterior' is null;
  if not found then
    raise exception 'vincular no dejo evento';
  end if;
  if ev.datos ->> 'nombre_nueva' <> 'Nombre Mal Copiado'
     or ev.datos ->> 'nombre_anterior' is not null then
    raise exception 'el evento de vinculo no guardo los nombres: %', ev.datos;
  end if;

  -- 3. Re-vincular por update directo sigue bloqueado.
  begin
    update public.suscripciones set organizacion_externa_id = v_bien where id = v_sus;
    raise exception 'se pudo re-vincular por update directo';
  exception
    when raise_exception then
      if position('ya esta vinculada' in sqlerrm) = 0 then raise; end if;
  end;

  -- 4. Cambiar SÓLO el nombre no genera evento: no es un hecho del contrato.
  select count(*) into n from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA';
  update public.suscripciones
     set organizacion_externa_nombre = 'nombre mal copiado' where id = v_sus;
  if (select count(*) from public.suscripcion_eventos
       where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA') <> n then
    raise exception 'corregir una mayuscula genero un evento de vinculo';
  end if;

  -- 5. La corrección exige las dos cosas y guarda viejo y nuevo.
  begin
    perform public.corregir_organizacion_externa(v_sus, v_bien, 'LabCentro', '  ');
    raise exception 'la correccion acepto un motivo vacio';
  exception
    when raise_exception then
      if position('exige motivo' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.corregir_organizacion_externa(
    v_sus, v_bien, 'LabCentro', 'el UUID era de otra organizacion');

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA'
     and datos ->> 'anterior' is not null;
  if not found then
    raise exception 'la correccion no dejo su evento';
  end if;
  if (ev.datos ->> 'anterior')::uuid <> v_mal
     or (ev.datos ->> 'nueva')::uuid <> v_bien
     or ev.datos ->> 'nombre_anterior' <> 'nombre mal copiado'
     or ev.datos ->> 'nombre_nueva' <> 'LabCentro' then
    raise exception 'la correccion no registro el par viejo y el nuevo: %', ev.datos;
  end if;
  if ev.motivo <> 'el UUID era de otra organizacion' then
    raise exception 'la correccion no guardo el motivo: %', ev.motivo;
  end if;

  -- 6. La implementación: exonerar deja evento con los dos estados.
  perform public.exonerar_implementacion(v_sus, 'cumplio los doce meses');

  select estado_implementacion into ev from public.suscripciones where id = v_sus;
  if ev.estado_implementacion <> 'exonerada' then
    raise exception 'la implementacion no quedo exonerada: %', ev.estado_implementacion;
  end if;

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'IMPLEMENTACION_ACTUALIZADA';
  if not found then
    raise exception 'exonerar no dejo evento';
  end if;
  if ev.datos ->> 'anterior' <> 'exonerada_condicional'
     or ev.datos ->> 'nuevo' <> 'exonerada'
     or (ev.datos ->> 'monto')::int <> 250000 then
    raise exception 'el evento de implementacion no dice de donde a donde: %', ev.datos;
  end if;

  -- 7. Y no se puede exonerar dos veces: ya no es condicional.
  begin
    perform public.exonerar_implementacion(v_sus);
    raise exception 'se pudo exonerar una implementacion ya exonerada';
  exception
    when raise_exception then
      if position('solo se exonera desde' in sqlerrm) = 0 then raise; end if;
  end;

  -- 8. Ni antes del año. Contrato nuevo, aniversario lejos.
  declare
    v_joven uuid := gen_random_uuid();
  begin
    perform public.crear_suscripcion(
      v_joven, v_cliente, v_producto, v_plan, 'anual', 0::smallint,
      80000, 60000, 30::smallint, 250000,
      current_date, (current_date + interval '12 months' - interval '1 day')::date,
      'exonerada_condicional', null);
    begin
      perform public.exonerar_implementacion(v_joven);
      raise exception 'se pudo exonerar antes del año';
    exception
      when raise_exception then
        if position('todavia no cumplio' in sqlerrm) = 0 then raise; end if;
    end;
    delete from public.suscripcion_eventos where suscripcion_id = v_joven;
    delete from public.suscripciones where id = v_joven;
  end;

  delete from public.suscripcion_eventos where suscripcion_id = v_sus;
  delete from public.suscripciones where id = v_sus;

  raise notice 'verificacion 017 OK: vinculo con nombre, correccion con viejo y nuevo, implementacion con rastro y con guarda';
end;
$$;

commit;
