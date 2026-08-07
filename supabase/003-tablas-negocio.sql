-- G-Centro · Bloque 2 · Tablas de negocio
--
-- MIGRACIÓN INCREMENTAL. No edita `schema-inicial.sql`, que ya está aplicado.
-- Se corre DESPUÉS de `002-terminos-corregidos.sql`: `suscripciones` tiene una
-- FK a `terminos` y el trimestral ya no debe existir cuando esto corra.
--
-- Crea las cinco tablas de §3 que faltaban: el contrato, su bitácora, los
-- hechos de plata y la cola de escritura hacia los productos.
--
-- NO incluye: Edge Functions ni nada de la mecánica de la bandera (Bloque 3).
-- `banderas_pendientes` se crea acá porque es una tabla, no un mecanismo.

begin;

-- ── clientes ─────────────────────────────────────────────────────────────
-- La entidad comercial. G-10 y Salchimelo existen una sola vez aunque mañana
-- compren tres productos (§3).
create table public.clientes (
  id                  uuid primary key default gen_random_uuid(),
  nombre_comercial    text not null,
  razon_social        text,
  nit                 text,
  contacto_nombre     text,
  contacto_email      text,
  contacto_telefono   text,
  notas               text,
  creado_en           timestamptz not null default now()
);

comment on table public.clientes is
  'Entidad comercial, independiente del producto que compre. Todas sus columnas de identidad son PII: el filtro de Sentry las trata como no publicables (ver src/lib/sentry.ts).';

-- ── suscripciones ────────────────────────────────────────────────────────
-- El contrato.
create table public.suscripciones (
  id                        uuid primary key default gen_random_uuid(),
  cliente_id                uuid not null references public.clientes (id),
  producto_id               uuid not null references public.productos (id),
  plan_id                   uuid not null references public.planes (id),
  termino                   text not null references public.terminos (codigo),
  estado                    text not null default 'activa'
                              check (estado in ('activa','gracia','suspendida','cancelada')),
  sedes_adicionales         smallint not null default 0 check (sedes_adicionales >= 0),

  -- CONGELADOS AL FIRMAR (§3). Base gravable, sin IVA (§9.1). No se leen del
  -- catálogo: cuando suban los precios de lista, los contratos vigentes no
  -- deben moverse solos.
  precio_base_mensual       integer not null check (precio_base_mensual >= 0),
  precio_sede_adicional     integer not null check (precio_sede_adicional >= 0),
  -- Descuento por término congelado. OJO: no siempre coincide con el del
  -- término vigente — puede ser un acuerdo puntual con el cliente.
  descuento_pct             smallint not null default 0
                              check (descuento_pct between 0 and 100),

  fecha_inicio              date not null,
  periodo_actual_inicio     date not null,
  -- INCLUSIVO: es el último día cubierto, no el día del próximo cobro. El
  -- cálculo de días de `cambioDePlan` cuenta [inicio, fin] cerrado en ambos
  -- extremos, así que un cambio el último día todavía tiene un día de saldo.
  periodo_actual_fin        date not null,
  proximo_cobro             date not null,
  check (periodo_actual_fin >= periodo_actual_inicio),

  -- CUATRO estados, no tres. `exonerada_condicional` es la que resuelve
  -- §9.2.2: un anual arranca acá, y solo al completar los doce meses de
  -- servicio pasa a `exonerada` y deja de ser reclamable. Si cambia de
  -- término antes del año, vuelve a `pendiente`. Cancelar NO la hace
  -- exigible: los doce meses ya se pagaron por adelantado.
  estado_implementacion     text not null default 'pendiente'
                              check (estado_implementacion in
                                ('pendiente','cobrada','exonerada_condicional','exonerada')),

  -- Único puente con la base del producto. Nullable hasta que la
  -- organización exista del otro lado (§3).
  organizacion_externa_id   uuid,
  creado_en                 timestamptz not null default now(),

  -- Una organización, una suscripción. NO sobre (cliente_id, producto_id):
  -- un cliente puede terminar con dos negocios distintos (§3).
  --
  -- En Postgres los NULL son distintos entre sí, así que esta restricción NO
  -- impide varias suscripciones con `organizacion_externa_id` en null — que
  -- es justo lo que hace falta hoy, con los dos clientes reales todavía sin
  -- id del otro lado.
  unique (producto_id, organizacion_externa_id)
);

comment on column public.suscripciones.periodo_actual_fin is
  'INCLUSIVO: último día cubierto. Los cálculos de cambio de plan cuentan días sobre [periodo_actual_inicio, periodo_actual_fin] cerrado.';
comment on column public.suscripciones.descuento_pct is
  'Congelado al firmar. Puede no coincidir con el descuento del término vigente si hubo un acuerdo puntual.';

-- ── suscripcion_eventos ──────────────────────────────────────────────────
-- Bitácora, NO event sourcing (§3): la fila de `suscripciones` es el estado
-- mutable; esto es auditoría.
create table public.suscripcion_eventos (
  id                uuid primary key default gen_random_uuid(),
  suscripcion_id    uuid not null references public.suscripciones (id),
  tipo              text not null check (tipo in (
                      'CREADA','CAMBIO_PLAN','CAMBIO_TERMINO','SEDES_MODIFICADAS',
                      'A_GRACIA','RESTRINGIDA','SUSPENDIDA','REACTIVADA','CANCELADA')),
  estado_anterior   text,
  estado_nuevo      text,
  -- Forma libre a propósito: acá va el detalle del cambio (saldo, fecha
  -- vieja, fecha nueva). El filtro de Sentry lo colapsa entero sin mirar
  -- adentro, porque una columna sin esquema fijo no se puede allowlistear.
  datos             jsonb,
  -- En el futuro = cambio agendado (§4).
  efectivo_desde    date,
  motivo            text,
  creado_en         timestamptz not null default now()
);

-- ── pagos ────────────────────────────────────────────────────────────────
-- Se registra plata que ENTRÓ; la obligación se calcula. Sin ledger de cargos
-- en v1 (§3).
create table public.pagos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references public.clientes (id),
  suscripcion_id   uuid references public.suscripciones (id),
  concepto         text not null
                     check (concepto in ('suscripcion','implementacion','ajuste','otro')),

  -- §9.1: `monto` es el TOTAL RECIBIDO, lo que entró a la cuenta.
  monto            integer not null,
  -- Base gravable y tasa. HOY iva_pct es SIEMPRE 0 y monto_base = monto:
  -- Giiron no es responsable de IVA. Las columnas se quedan para el día que
  -- se cruce el umbral, y ese día un pago viejo tiene que seguir
  -- explicándose con la tasa que tenía — por eso la tasa va por fila y no en
  -- una constante.
  monto_base       integer not null,
  iva_pct          smallint not null default 0 check (iva_pct between 0 and 100),
  check (monto_base <= monto),

  fecha_pago       date not null,
  metodo           text,
  referencia       text,
  -- El par que hace que el histórico sirva: `proximo_cobro` se deriva del
  -- último `cubre_hasta`, no de un campo que se actualiza a mano (§3).
  cubre_desde      date,
  cubre_hasta      date,
  check (cubre_hasta is null or cubre_desde is null or cubre_hasta >= cubre_desde),
  nota             text,
  registrado_en    timestamptz not null default now()
);

comment on column public.pagos.iva_pct is
  'Siempre 0 por ahora: Giiron no es responsable de IVA (§9.1). La columna existe para el día que se cruce el umbral.';

-- ── banderas_pendientes ──────────────────────────────────────────────────
-- Outbox hacia los productos (§5). Primero se guarda la intención, después se
-- intenta escribir. Nunca al revés.
create table public.banderas_pendientes (
  id                     uuid primary key default gen_random_uuid(),
  suscripcion_id         uuid not null references public.suscripciones (id),
  -- Nivel de gating que se quiere escribir en el producto (§4).
  valor_deseado          text not null check (valor_deseado in
                           ('activa','por_vencer','gracia','restringida','suspendida')),
  intentos               smallint not null default 0 check (intentos >= 0),

  -- Texto crudo del error. NO viaja a Sentry: ya se comprobó que ahí termina
  -- cayendo un nombre propio ("HMAC invalido para org de Juan Perez"). Se
  -- mira en el panel, no en el reporte de errores.
  ultimo_error           text,
  -- El enum derivado que SÍ sirve para triage sin exponer nada. Responde la
  -- única pregunta que importa cuando falla la sincronización: ¿es el
  -- secreto, la red, o el otro lado?
  bandera_error_codigo   text check (bandera_error_codigo in (
                           'HMAC_INVALIDO','TIMEOUT','HTTP_4XX','HTTP_5XX',
                           'ORG_NO_ENCONTRADA','RED','DESCONOCIDO')),

  confirmado_en          timestamptz,
  creado_en              timestamptz not null default now()
);

comment on column public.banderas_pendientes.ultimo_error is
  'Texto crudo, para mirar en el panel. NUNCA se manda a Sentry: es texto libre y ya dejó salir un nombre propio en la auditoría del filtro.';
comment on column public.banderas_pendientes.bandera_error_codigo is
  'Enum derivado del error, apto para diagnóstico externo. Es lo que se reporta en vez de ultimo_error.';

-- ── Índices ──────────────────────────────────────────────────────────────
-- Las tres consultas del panel: las suscripciones de un cliente, los pagos de
-- una suscripción, y la cola de banderas sin confirmar.
create index on public.suscripciones (cliente_id);
create index on public.suscripcion_eventos (suscripcion_id, creado_en desc);
create index on public.pagos (suscripcion_id, fecha_pago desc);
create index on public.pagos (cliente_id, fecha_pago desc);
create index on public.banderas_pendientes (suscripcion_id)
  where confirmado_en is null;

-- ── RLS: deny by default, sin excepciones ────────────────────────────────
-- Mismo patrón que el catálogo: todo contra `es_admin()`, la función
-- `security definer` que evita la recursión de una policy sobre `admins`
-- (ver §8 y schema-inicial.sql). Sin fila en `admins`, ninguna de estas
-- tablas devuelve nada.
--
-- Estas cinco son las que tienen la PII y la plata: son exactamente las que
-- no pueden quedar afuera.

alter table public.clientes             enable row level security;
alter table public.suscripciones        enable row level security;
alter table public.suscripcion_eventos  enable row level security;
alter table public.pagos                enable row level security;
alter table public.banderas_pendientes  enable row level security;

create policy "clientes_solo_admins" on public.clientes
  for all using (public.es_admin()) with check (public.es_admin());

create policy "suscripciones_solo_admins" on public.suscripciones
  for all using (public.es_admin()) with check (public.es_admin());

create policy "suscripcion_eventos_solo_admins" on public.suscripcion_eventos
  for all using (public.es_admin()) with check (public.es_admin());

create policy "pagos_solo_admins" on public.pagos
  for all using (public.es_admin()) with check (public.es_admin());

create policy "banderas_pendientes_solo_admins" on public.banderas_pendientes
  for all using (public.es_admin()) with check (public.es_admin());

commit;
