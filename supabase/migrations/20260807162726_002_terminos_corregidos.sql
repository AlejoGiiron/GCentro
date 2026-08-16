-- G-Centro · Bloque 2 · Corrección de términos
--
-- MIGRACIÓN INCREMENTAL. `20260805180823_schema_inicial.sql` ya está aplicado en Supabase
-- Cloud y NO se edita — esta es la convención del repo (ver CLAUDE.md).
--
-- Cambia la oferta comercial: desaparece el trimestral y el anual pasa de 15%
-- a 30%. El semestral queda igual. De cuatro términos se pasa a tres.
--
-- Se corre ANTES de crear `suscripciones`: esa tabla tiene una FK a
-- `terminos`, así que el orden importa. Si ya hubiera suscripciones
-- trimestrales, el DELETE fallaría por la FK — que es exactamente lo que
-- debería pasar, y por eso no se fuerza con un CASCADE.

begin;

delete from public.terminos where codigo = 'trimestral';

update public.terminos set descuento_pct = 30 where codigo = 'anual';

-- Verificación dentro de la misma transacción: si el resultado no es el
-- esperado, la migración se revierte entera en vez de dejar el catálogo a
-- medias. Un descuento mal cargado se propaga a precios congelados de
-- contratos, y eso ya no se arregla con un UPDATE.
do $$
declare
  n_filas   int;
  pct_anual int;
begin
  select count(*) into n_filas from public.terminos;
  if n_filas <> 3 then
    raise exception 'terminos deberia tener 3 filas y tiene %', n_filas;
  end if;

  select descuento_pct into pct_anual from public.terminos where codigo = 'anual';
  if pct_anual <> 30 then
    raise exception 'anual deberia ser 30%% y es %', pct_anual;
  end if;

  if exists (select 1 from public.terminos where codigo = 'trimestral') then
    raise exception 'trimestral sigue existiendo';
  end if;
end $$;

commit;

-- Estado final esperado:
--   mensual     1 mes    0%
--   semestral   6 meses  10%
--   anual      12 meses  30%
