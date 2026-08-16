-- G-Centro · Bloque 4 · Hasta cuándo está pago
--
-- MIGRACIÓN INCREMENTAL. No edita nada anterior.
--
-- Sale del hueco que abre la pantalla 2: **registrar un pago y reactivar son
-- dos acciones separadas.** Con un solo operador el que registraba reactivaba;
-- con varios, alguien registra y no reactiva, y el cliente sigue con el banner
-- de cobranza puesto habiendo pagado.
--
-- Es el mismo daño que §5 cierra para el transporte de la bandera, entrando
-- por otra puerta: un cliente al día pagando por una omisión nuestra. Y es
-- silencioso — de este lado todo se ve normal, porque el pago está registrado.
--
-- Para que la lista pueda detectarlo hace falta saber, por suscripción, hasta
-- cuándo llega la plata. Eso es un agregado sobre `pagos`, que crece sin techo:
-- misma forma que `bandera_ultima_confirmada` (011), misma solución.

begin;

create index if not exists pagos_cobertura_por_suscripcion
  on public.pagos (suscripcion_id, cubre_hasta desc)
  where suscripcion_id is not null and cubre_hasta is not null;

create view public.suscripcion_cobertura
  with (security_invoker = true) as
select
  p.suscripcion_id,
  max(p.cubre_hasta)  as cubierto_hasta,
  max(p.fecha_pago)   as ultimo_pago,
  count(*)            as pagos_registrados
from public.pagos p
where p.suscripcion_id is not null
group by p.suscripcion_id;

comment on view public.suscripcion_cobertura is
  'Hasta cuándo está pago cada contrato. Una fila por suscripción, no por pago: acotada por la cantidad de contratos. `cubierto_hasta` es el MÁXIMO cubre_hasta, no el del último pago — un pago viejo que cubría más lejos sigue valiendo.';

-- ⚠️ `max(cubre_hasta)` y NO `cubre_hasta del pago más reciente`. Son
-- distintos y la diferencia importa: si alguien paga el anual en enero y en
-- marzo registra un ajuste de 20.000 que no cubre nada, el pago más reciente
-- diría que la cobertura terminó en marzo. El máximo dice la verdad.
--
-- `cubre_hasta` puede ser NULL (un ajuste, una implementación): esos pagos
-- entran al conteo pero no mueven la cobertura, que es lo correcto.

-- ── Verificación en transacción ──────────────────────────────────────────
do $$
declare
  con_pagos int;
  filas     int;
begin
  select count(distinct suscripcion_id) into con_pagos
    from public.pagos where suscripcion_id is not null;
  select count(*) into filas from public.suscripcion_cobertura;

  if filas <> con_pagos then
    raise exception 'la vista devolvio % filas y hay % suscripciones con pagos', filas, con_pagos;
  end if;

  -- Ninguna cobertura puede quedar por debajo de algún `cubre_hasta` real.
  -- Sin esto, un `max` mal escrito devolvería el primero y nadie lo notaría
  -- hasta que un cliente al día apareciera como moroso.
  if exists (
    select 1 from public.suscripcion_cobertura v
      join public.pagos p on p.suscripcion_id = v.suscripcion_id
     where p.cubre_hasta > v.cubierto_hasta
  ) then
    raise exception 'la vista NO esta devolviendo el maximo cubre_hasta';
  end if;

  raise notice 'Vista OK: % suscripciones con pagos registrados', filas;
end $$;

commit;

-- ── Después de aplicar ───────────────────────────────────────────────────
--   supabase gen types typescript --linked > src/types/database.types.ts
--   verificar-rls.sql  (la vista nueva entra a las pruebas 1 y 2)
