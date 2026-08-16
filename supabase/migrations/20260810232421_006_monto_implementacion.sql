-- G-Centro · Bloque 2 · Monto de la implementación
--
-- MIGRACIÓN INCREMENTAL. No edita `20260807162727_003_tablas_negocio.sql`.
--
-- `estado_implementacion` ya guardaba SI se debe la implementación, pero no
-- CUÁNTO. El día que un anual baje de término antes del año, el panel iba a
-- decir "pendiente" sin poder decir de cuánto — que es la mitad inútil de un
-- aviso de cobranza.
--
-- Se congela al firmar, igual que `precio_base_mensual`, `precio_sede_adicional`
-- y `descuento_pct`: cuando suba el precio de la implementación, los contratos
-- vigentes no se mueven solos.

begin;

-- Nullable primero para poder rellenar las filas que ya existen, y recién
-- después NOT NULL. Agregar la columna NOT NULL de una fallaría contra las dos
-- suscripciones ya cargadas.
alter table public.suscripciones
  add column monto_implementacion integer;

comment on column public.suscripciones.monto_implementacion is
  'Cargo de única vez, CONGELADO al firmar. Base gravable, sin IVA (§9.1). Precio de lista vigente: 250.000. Las sedes adicionales NO pagan implementación.';

-- G-10 y Salchimelo: ya tienen `estado_implementacion = cobrada`, así que el
-- monto es histórico.
--
-- ⚠️ 250.000 es el precio de lista de HOY, no un dato verificado de esos dos
-- contratos. Si en su momento se cobró otra cosa, corregir con un UPDATE antes
-- de que el panel muestre históricos de plata. Está reportado.
update public.suscripciones
   set monto_implementacion = 250000
 where monto_implementacion is null;

alter table public.suscripciones
  alter column monto_implementacion set not null;

alter table public.suscripciones
  add constraint suscripciones_monto_implementacion_no_negativo
  check (monto_implementacion >= 0);

-- Sin DEFAULT a propósito. Los otros tres precios congelados tampoco lo tienen:
-- un precio de contrato se decide al firmar, no se hereda de una constante que
-- alguien cambió hace seis meses. Que el INSERT falle si nadie lo puso es la
-- conducta correcta.

do $$
declare
  n int;
begin
  select count(*) into n
    from public.suscripciones
   where monto_implementacion is null or monto_implementacion <> 250000;
  if n <> 0 then
    raise exception 'quedaron % suscripciones sin el monto esperado', n;
  end if;
end $$;

commit;
