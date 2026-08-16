-- G-Centro · Cierre v1 · `proximo_cobro` deja de ser un dato guardado
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- §3 decía, en dos lugares distintos, que `proximo_cobro` se DERIVA del
-- último `cubre_hasta`. **Nunca se construyó.** Era una columna que sólo
-- tenía el valor del seed, y registrar un pago no la movía.
--
-- La consecuencia era diaria y silenciosa: un cliente paga septiembre, se
-- registra el pago con `cubre_hasta = 30/09`, y la columna sigue diciendo
-- `01/09`. Del 2 en adelante el panel sugiere `por_vencer` para alguien que
-- está al día — para siempre, hasta que alguien edite la fecha a mano.
-- Justo lo que la vista «Hoy» promete no hacer.
--
-- ⚠️ SE DERIVA, NO SE ACTUALIZA. La alternativa era escribirla en cada pago,
-- y eso reintroduce el problema entero: cada camino de escritura nuevo —un
-- importador, el SQL Editor, una pantalla futura— tiene que acordarse, y el
-- que se olvide falla en silencio. Una invariante que depende de que alguien
-- la recuerde no es una invariante. Mismo argumento que `MAX(cubre_hasta)`.

begin;

-- ── 1. La cobertura expone la fecha ──────────────────────────────────────
drop view if exists public.suscripcion_cobertura;

create view public.suscripcion_cobertura
  with (security_invoker = true) as
select
  p.suscripcion_id,
  max(p.cubre_hasta)      as cubierto_hasta,
  max(p.fecha_pago)       as ultimo_pago,
  count(*)                as pagos_registrados,
  -- ⚠️ `NULL + 1` es NULL, y eso es EXACTAMENTE lo que se quiere.
  --
  -- Sin pagos con cobertura, no hay fecha que calcular. La respuesta honesta
  -- no es una fecha inventada: es «no se sabe». Misma familia que `admin_id`
  -- («sin autor registrado»), `cambio_efectivo` («sin dato») y `mensaje`
  -- («sin registrar») — el histórico no se rellena, se admite.
  (max(p.cubre_hasta) + 1) as proximo_cobro
from public.pagos p
where p.suscripcion_id is not null
group by p.suscripcion_id;

comment on view public.suscripcion_cobertura is
  'Hasta cuándo está pago cada contrato, y cuándo toca cobrar de nuevo. Una fila por suscripción. `proximo_cobro` NULL = no hay pagos con cobertura registrada; no significa "vence hoy" ni "nunca vence".';

-- ── 2. Fuera la columna ──────────────────────────────────────────────────
--
-- `suscripciones_cobrables` se definió con `select s.*`, que Postgres expande
-- a columnas explícitas al crearla. Por eso depende de `proximo_cobro` y hay
-- que bajarla y volverla a levantar: un `drop column` a secas falla con
-- "cannot drop ... because other objects depend on it".
--
-- Dejarla y no usarla habría sido peor que sacarla: dos fuentes para el mismo
-- dato divergen, y la que miente es siempre la que alguien lee sin pensar.
drop view if exists public.suscripciones_cobrables;

alter table public.suscripciones drop column proximo_cobro;

create view public.suscripciones_cobrables
  with (security_invoker = true) as
  select s.*
    from public.suscripciones s
    join public.clientes c on c.id = s.cliente_id
   where c.es_prueba = false;

comment on view public.suscripciones_cobrables is
  'Suscripciones de clientes que facturan. Ya NO trae proximo_cobro: esa fecha se deriva de los pagos y vive en suscripcion_cobertura (015).';

-- ── 3. Verificación en transacción ───────────────────────────────────────
do $$
declare
  con_cobertura int;
  sin_pagos     int;
  ejemplo       record;
begin
  -- La columna se fue de verdad.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'suscripciones'
       and column_name = 'proximo_cobro'
  ) then
    raise exception 'la columna proximo_cobro sigue en suscripciones';
  end if;

  -- Y la vista la expone.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'suscripcion_cobertura'
       and column_name = 'proximo_cobro'
  ) then
    raise exception 'la vista no expone proximo_cobro';
  end if;

  -- Las dos vistas siguen siendo security_invoker: sin esto serían un agujero
  -- por donde `anon` lee todo, esquivando §8. Se recrearon, así que se
  -- comprueba de nuevo.
  if exists (
    select 1 from pg_class c
     where c.relname in ('suscripcion_cobertura', 'suscripciones_cobrables')
       and c.relnamespace = 'public'::regnamespace
       and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
  ) then
    raise exception 'alguna vista quedo SIN security_invoker';
  end if;

  select count(*) into con_cobertura
    from public.suscripcion_cobertura where proximo_cobro is not null;
  select count(*) into sin_pagos
    from public.suscripciones s
   where not exists (select 1 from public.pagos p where p.suscripcion_id = s.id);

  -- La aritmética: el día siguiente al último cubierto, no el mismo.
  for ejemplo in
    select cubierto_hasta, proximo_cobro from public.suscripcion_cobertura
     where cubierto_hasta is not null
  loop
    if ejemplo.proximo_cobro <> ejemplo.cubierto_hasta + 1 then
      raise exception 'proximo_cobro mal calculado: % vs % + 1',
        ejemplo.proximo_cobro, ejemplo.cubierto_hasta;
    end if;
  end loop;

  raise notice 'OK. % suscripciones con fecha calculable, % SIN NINGUN PAGO REGISTRADO.',
    con_cobertura, sin_pagos;
  raise notice 'Las que no tienen pagos pasan a "sin historial de pagos" en el panel. Es correcto: la fecha que mostraban salia de un seed.';
end $$;

commit;

-- ── Después de aplicar ───────────────────────────────────────────────────
--   supabase gen types typescript --linked > src/types/database.types.ts
--
-- ⚠️ G-10 y Salchimelo no tienen pagos cargados, así que van a aparecer como
-- «sin historial de pagos». No es un efecto secundario: es el hallazgo. La
-- fecha que mostraban antes era una ficción del seed. Se arregla cargándoles
-- el histórico real, no volviendo a inventar una fecha.
