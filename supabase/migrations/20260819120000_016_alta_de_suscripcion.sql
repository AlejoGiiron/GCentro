-- G-Centro · Bloque 5 · El nacimiento de una suscripción deja rastro
--
-- MIGRACIÓN INCREMENTAL. Prepara el alta desde el panel. No cambia ninguna
-- columna existente ni ningún dato.
--
-- ── POR QUÉ HACE FALTA ────────────────────────────────────────────────────
--
-- El trigger de `010` es `after update`: garantiza que todo CAMBIO de estado
-- deja evento. El NACIMIENTO no lo cubre nadie. Hoy no se nota porque las
-- suscripciones se crearon por migración, pero el momento en que se firma un
-- contrato es justamente el que más importa auditar: es donde se congelan los
-- precios que se van a facturar hasta que alguien los cambie a mano.
--
-- ── REPARTO DE RESPONSABILIDADES (el mismo de `013`) ──────────────────────
--
--   · Las RPC son el camino NORMAL. Reciben el motivo y lo dejan disponible.
--   · Los triggers son la GARANTÍA. Un insert directo desde el SQL Editor no
--     pasa por la RPC, no trae motivo, y el evento se escribe igual. La
--     emergencia sigue funcionando.
--
-- ⚠️ ALCANCE: se pidieron el trigger de `CREADA` y el tipo de evento nuevo.
-- Van además las dos RPC y el trigger de vinculación, porque sin ellos la
-- pantalla del alta no se puede construir sin una `017` — el motivo del
-- precio pactado viaja por un GUC que sólo una RPC puede setear, y el bloqueo
-- de re-vinculación tiene que vivir en la base o no es una garantía.

begin;

-- ── 1. Tipo de evento nuevo ───────────────────────────────────────────────
--
-- `ORGANIZACION_VINCULADA` cubre las dos direcciones —vincular por primera
-- vez y corregir un vínculo equivocado— y el `datos` dice cuál fue. No son
-- dos tipos porque para quien lee el historial es el mismo hecho: alguien
-- decidió a qué organización de G-Vento apunta este contrato.

alter table public.suscripcion_eventos
  drop constraint suscripcion_eventos_tipo_check;

alter table public.suscripcion_eventos
  add constraint suscripcion_eventos_tipo_check check (tipo in (
    'CREADA','CAMBIO_PLAN','CAMBIO_TERMINO','SEDES_MODIFICADAS',
    'A_GRACIA','RESTRINGIDA','SUSPENDIDA','REACTIVADA','CANCELADA',
    'ORGANIZACION_VINCULADA'));

-- ── 2. El evento de nacimiento ────────────────────────────────────────────

create or replace function public.registrar_creacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.suscripcion_eventos
    (suscripcion_id, tipo, estado_anterior, estado_nuevo, motivo, datos, admin_id)
  values (
    new.id,
    'CREADA',
    -- No hay estado anterior: no existía. NULL y no 'ninguno'.
    null,
    new.estado,
    nullif(current_setting('app.motivo', true), ''),
    -- ⚠️ LA FOTO LA SACA EL TRIGGER, NO EL FORMULARIO. Un snapshot que arma
    -- quien inserta puede no coincidir con lo que insertó; éste sale de NEW,
    -- así que no puede mentir. Es lo que permite, meses después, comparar lo
    -- que se firmó contra lo que la fila dice hoy.
    jsonb_build_object(
      'plan_id',               new.plan_id,
      'termino',               new.termino,
      'sedes_adicionales',     new.sedes_adicionales,
      'precio_base_mensual',   new.precio_base_mensual,
      'precio_sede_adicional', new.precio_sede_adicional,
      'descuento_pct',         new.descuento_pct,
      'fecha_inicio',          new.fecha_inicio,
      'estado_implementacion', new.estado_implementacion
    ),
    public.admin_actual()
  );
  return new;
end;
$$;

create trigger suscripciones_creada
  after insert on public.suscripciones
  for each row
  execute function public.registrar_creacion();

-- ── 3. El vínculo con la organización externa ─────────────────────────────
--
-- Un `organizacion_externa_id` equivocado apunta la bandera a la organización
-- de OTRO cliente: la próxima confirmación le pondría —o le sacaría— un
-- banner de cobranza a quien no era, en vivo. Y no hay forma de verificar el
-- id contra G-Vento: el contrato tiene una sola llamada y ESCRIBE (§9.5).
--
-- Por eso el cambio de un vínculo ya hecho no es un update más. Se bloquea en
-- la base, que es donde el bloqueo vale para todos los caminos, y se abre por
-- una RPC que exige motivo. Vincular desde NULL sigue siendo libre: ahí no
-- hay nada que pisar.

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
    jsonb_build_object(
      'anterior', old.organizacion_externa_id,
      'nueva',    new.organizacion_externa_id
    ),
    public.admin_actual()
  );
  return new;
end;
$$;

create trigger suscripciones_vinculo_organizacion
  after update on public.suscripciones
  for each row
  -- Sólo cuando el vínculo cambió. Un update de precio no genera evento acá,
  -- y volver a guardar el mismo id tampoco: no pasó nada.
  when (old.organizacion_externa_id is distinct from new.organizacion_externa_id)
  execute function public.registrar_vinculo_organizacion();

-- ── 4. Las dos RPC: el camino normal ──────────────────────────────────────

-- Firmar una suscripción.
--
-- `security invoker`: corre con los permisos de quien llama, así que las
-- policies siguen siendo la única autorización (§8).
--
-- ⚠️ `p_id` LO ELIGE EL CLIENTE, y no es un capricho. Ésta es la primera
-- pantalla del panel que CREA datos: un doble clic, o un reintento después de
-- un timeout que en realidad había funcionado, crearían dos contratos
-- idénticos y nada los distinguiría. Con el id puesto desde el navegador, el
-- segundo intento choca contra la PK y falla — que es lo correcto.

create or replace function public.crear_suscripcion(
  p_id                     uuid,
  p_cliente_id             uuid,
  p_producto_id            uuid,
  p_plan_id                uuid,
  p_termino                text,
  p_sedes_adicionales      smallint,
  p_precio_base_mensual    integer,
  p_precio_sede_adicional  integer,
  p_descuento_pct          smallint,
  p_fecha_inicio           date,
  p_periodo_actual_fin     date,
  p_estado_implementacion  text,
  p_motivo                 text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('app.motivo', coalesce(p_motivo, ''), true);

  insert into public.suscripciones (
    id, cliente_id, producto_id, plan_id, termino, sedes_adicionales,
    precio_base_mensual, precio_sede_adicional, descuento_pct,
    fecha_inicio, periodo_actual_inicio, periodo_actual_fin,
    estado_implementacion
  ) values (
    p_id, p_cliente_id, p_producto_id, p_plan_id, p_termino, p_sedes_adicionales,
    p_precio_base_mensual, p_precio_sede_adicional, p_descuento_pct,
    -- El período actual arranca el día de inicio. Son dos columnas y no una
    -- porque el período se va a mover con los ciclos; hoy no lo mueve nadie
    -- y está anotado en §9.7-2.
    p_fecha_inicio, p_fecha_inicio, p_periodo_actual_fin,
    p_estado_implementacion
  );

  -- ⚠️ Se limpia apenas termina el insert. `set_config(..., true)` es local a
  -- la TRANSACCIÓN, no a la sentencia: sin esto el motivo queda seteado para
  -- lo que venga después en la misma transacción y otro trigger se lo aplica
  -- a un cambio que no es suyo. Lo encontró el bloque de verificación de
  -- `013` y acá vale igual.
  perform set_config('app.motivo', '', true);

  return p_id;
end;
$$;

-- Corregir un vínculo ya hecho. El camino aparte del que habla el trigger.
--
-- Pide motivo obligatorio: si alguien apunta este contrato a otra
-- organización de G-Vento, el historial tiene que decir por qué. Es la única
-- operación del panel que puede hacer que una bandera caiga en el cliente
-- equivocado.

create or replace function public.corregir_organizacion_externa(
  p_suscripcion_id uuid,
  p_organizacion   uuid,
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
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'corregir un vinculo exige motivo';
  end if;

  perform set_config('app.corregir_vinculo', 'si', true);
  perform set_config('app.motivo', p_motivo, true);

  update public.suscripciones
     set organizacion_externa_id = p_organizacion
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

-- ── Verificación en transacción ───────────────────────────────────────────
--
-- Se crea una suscripción de juguete sobre el cliente de prueba, se la
-- ejercita y se borra todo al final. Si algo no cumple, la transacción entera
-- se cae y la migración no queda aplicada a medias.

do $$
declare
  v_cliente   uuid;
  v_producto  uuid;
  v_plan      uuid;
  v_sus       uuid := gen_random_uuid();
  v_org       uuid := gen_random_uuid();
  v_otra      uuid := gen_random_uuid();
  ev          record;
  n           int;
begin
  select id into v_cliente from public.clientes where es_prueba order by creado_en limit 1;
  select id into v_producto from public.productos where codigo = 'g-vento';
  select id into v_plan from public.planes
   where producto_id = v_producto and codigo = 'esencial';

  if v_cliente is null or v_plan is null then
    raise exception 'faltan datos base para verificar (cliente de prueba o plan esencial)';
  end if;

  -- 1. El alta deja evento CREADA con la foto de lo congelado.
  perform public.crear_suscripcion(
    v_sus, v_cliente, v_producto, v_plan, 'anual', 0::smallint,
    80000, 60000, 30::smallint, date '2026-01-01', date '2026-12-31',
    'exonerada_condicional', 'verificacion de la 016');

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'CREADA';

  if not found then
    raise exception 'el alta no dejo evento CREADA';
  end if;
  if ev.motivo is distinct from 'verificacion de la 016' then
    raise exception 'el motivo no llego al evento: %', ev.motivo;
  end if;
  if (ev.datos ->> 'precio_base_mensual')::int <> 80000
     or ev.datos ->> 'termino' <> 'anual'
     or ev.datos ->> 'estado_implementacion' <> 'exonerada_condicional' then
    raise exception 'la foto de CREADA no coincide con lo insertado: %', ev.datos;
  end if;

  -- 2. El motivo NO se derrama al siguiente cambio de la misma transacción.
  --    Es el defecto que encontró la 013 y por eso se prueba, no se supone.
  update public.suscripciones set estado = 'gracia' where id = v_sus;
  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'A_GRACIA';
  if ev.motivo is not null then
    raise exception 'el motivo del alta se derramo al cambio de estado: %', ev.motivo;
  end if;

  -- 3. Vincular desde NULL: permitido, y deja evento.
  update public.suscripciones set organizacion_externa_id = v_org where id = v_sus;
  select count(*) into n from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA';
  if n <> 1 then
    raise exception 'vincular no dejo evento (n=%)', n;
  end if;

  -- 4. Re-vincular por update directo: BLOQUEADO.
  begin
    update public.suscripciones set organizacion_externa_id = v_otra where id = v_sus;
    raise exception 'se pudo re-vincular por update directo';
  exception
    when raise_exception then
      if position('ya esta vinculada' in sqlerrm) = 0 then raise; end if;
  end;

  -- 5. Corregir por la RPC: exige motivo, y deja el segundo evento.
  begin
    perform public.corregir_organizacion_externa(v_sus, v_otra, '   ');
    raise exception 'la correccion acepto un motivo vacio';
  exception
    when raise_exception then
      if position('exige motivo' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.corregir_organizacion_externa(
    v_sus, v_otra, 'id pegado del cliente equivocado');

  select count(*) into n from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA';
  if n <> 2 then
    raise exception 'la correccion no dejo su evento (n=%)', n;
  end if;

  select * into ev from public.suscripcion_eventos
   where suscripcion_id = v_sus and tipo = 'ORGANIZACION_VINCULADA'
   order by creado_en desc limit 1;
  if (ev.datos ->> 'anterior')::uuid <> v_org or (ev.datos ->> 'nueva')::uuid <> v_otra then
    raise exception 'el evento de correccion no registro el cambio: %', ev.datos;
  end if;

  -- 6. Y la guarda vuelve a cerrarse: la RPC no deja el permiso abierto.
  begin
    update public.suscripciones
       set organizacion_externa_id = gen_random_uuid() where id = v_sus;
    raise exception 'el permiso de correccion quedo abierto despues de la RPC';
  exception
    when raise_exception then
      if position('ya esta vinculada' in sqlerrm) = 0 then raise; end if;
  end;

  delete from public.suscripcion_eventos where suscripcion_id = v_sus;
  delete from public.suscripciones where id = v_sus;

  raise notice 'verificacion 016 OK: alta con foto, motivo sin derrame, vinculo bloqueado y correccion auditada';
end;
$$;

commit;
