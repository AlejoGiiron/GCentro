-- G-Centro · Bloque 4 · La lista deja de traerse la cola entera
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- La pantalla 1 hacía `select * from banderas_pendientes` sin límite, en cada
-- carga, para calcular en el navegador "la última confirmada de cada
-- suscripción". Hoy son 8 filas. Pero §5 dice que **la cola crece por LLAMADA,
-- no por cambio de estado**: con 50 clientes y sincronizaciones diarias son
-- miles de filas viajando al navegador para derivar 50 valores.
--
-- ⚠️ EL DATO SE PARTE EN DOS PORQUE SON DOS COSAS DISTINTAS, no por
-- rendimiento:
--
--   · Lo CONFIRMADO es historia y crece sin techo. De todo eso, la lista solo
--     necesita la fila más reciente por suscripción: una cota igual a la
--     cantidad de suscripciones. Eso es esta vista.
--
--   · Lo SIN CONFIRMAR es el backlog del outbox y está acotado por diseño —
--     si crece, ESO ES LA ALARMA, no un problema de paginado. Se sigue
--     leyendo de la tabla, con el índice parcial que ya existe desde `003`.
--
-- Mezclarlas en una sola consulta era lo que obligaba a traer todo.

begin;

-- ── El índice que hace barato el `distinct on` ───────────────────────────
--
-- Parcial sobre las confirmadas: las sin confirmar ya tienen el suyo (003) y
-- meterlas acá haría el índice más grande sin que nadie lo use. `desc` para
-- que el primer registro de cada grupo sea el que la vista pide, sin ordenar.
create index if not exists banderas_confirmadas_por_suscripcion
  on public.banderas_pendientes (suscripcion_id, confirmado_en desc)
  where confirmado_en is not null;

-- ── La vista ─────────────────────────────────────────────────────────────
--
-- `security_invoker = true`, igual que `*_cobrables` (§3). Sin eso correría
-- con los permisos de su dueño y se saltearía RLS: sería un agujero por donde
-- `anon` leería el historial de banderas de todos los clientes.
create view public.bandera_ultima_confirmada
  with (security_invoker = true) as
select distinct on (b.suscripcion_id)
  b.suscripcion_id,
  b.id,
  b.valor_deseado,
  b.cambio_efectivo,
  b.confirmado_en,
  b.admin_id
from public.banderas_pendientes b
where b.confirmado_en is not null
order by b.suscripcion_id, b.confirmado_en desc;

comment on view public.bandera_ultima_confirmada is
  'Una fila por suscripción: la última bandera que el producto confirmó. Acotada por la cantidad de suscripciones, no por el largo del historial. Lo SIN confirmar no está acá — eso se lee de la tabla, donde estar acotado es la propiedad que importa.';

-- ── Verificación en transacción ──────────────────────────────────────────
do $$
declare
  con_confirmadas int;
  filas_vista     int;
  duplicadas      int;
begin
  select count(distinct suscripcion_id) into con_confirmadas
    from public.banderas_pendientes where confirmado_en is not null;

  select count(*) into filas_vista from public.bandera_ultima_confirmada;

  -- Exactamente una fila por suscripción que tenga alguna confirmada.
  if filas_vista <> con_confirmadas then
    raise exception 'la vista devolvio % filas y hay % suscripciones con confirmadas',
      filas_vista, con_confirmadas;
  end if;

  select count(*) into duplicadas from (
    select suscripcion_id from public.bandera_ultima_confirmada
     group by suscripcion_id having count(*) > 1
  ) d;
  if duplicadas > 0 then
    raise exception 'la vista devolvio % suscripciones duplicadas', duplicadas;
  end if;

  -- Y la que devuelve es LA MÁS RECIENTE, no cualquiera. Sin esto el
  -- `distinct on` podría estar ordenando al revés y nadie lo notaría: la
  -- lista mostraría un estado viejo como si fuera el vigente.
  if exists (
    select 1
      from public.bandera_ultima_confirmada v
      join public.banderas_pendientes b
        on b.suscripcion_id = v.suscripcion_id
       and b.confirmado_en is not null
     where b.confirmado_en > v.confirmado_en
  ) then
    raise exception 'la vista NO esta devolviendo la confirmacion mas reciente';
  end if;

  raise notice 'Vista OK: % suscripciones con bandera confirmada', filas_vista;
end $$;

commit;

-- ── Después de aplicar ───────────────────────────────────────────────────
--
--   supabase gen types typescript --linked > src/types/database.types.ts
--
-- Y correr `verificar-rls.sql`: la vista nueva entra a las pruebas 1 y 2, que
-- comprueban que `security_invoker` hace efecto. Si devuelve filas para un no
-- admin, es un agujero y hay que parar.
