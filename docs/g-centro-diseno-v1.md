# G-Centro · Diseño v1

Panel de control de suscripciones. Producto nuevo, repo nuevo, proyecto de Supabase aparte.
No comparte nada con G-Vento salvo una columna.

Estado del documento: **diseño aprobado, sin migración escrita.**

---

## 1. Alcance

**Entra en v1**

- Lista de clientes con producto, plan, término, estado y próximo cobro.
- Registro manual de pagos (monto, fecha, método, nota).
- Cambio de estado de suscripción.
- Escritura de la bandera `estado_suscripcion` en la base del producto.

**No entra**

Pasarela de pago, facturación electrónica propia, portal del cliente, métricas.
Todo eso espera a que el modelo esté probado con uso real.

**Multi-producto desde el modelo.** Hoy solo G-Vento (G-10 y Salchimelo). El esquema
debe soportar G-Mura y G-Quota sin rehacerse: nada asume G-Vento, las suscripciones se
ligan a un producto, y la escritura de la bandera es una función por producto con una
sola implementación por ahora.

---

## 2. Convenciones

Convención Giiron, tomada de `g-cresco-stack`. Aplica solo la parte transferible:
localización, nombres, stack transversal y Git. **No** aplica monorepo, React Native,
PowerSync, offline-first, ni el principio de "una sola fuente de verdad" — G-Centro
duplica estado a propósito (ver §5).

**Localización**

- Español de Colombia en UI, dominio y base de datos.
- COP en pesos enteros, sin decimales. `$79.000` se guarda como `79000` en `integer`.
- Zona `America/Bogota`. Timestamps en UTC en la base, se muestran en hora local.

**Dos tipos de fecha, no mezclarlos**

- `timestamptz` para instantes: `creado_en`, `registrado_en`, `confirmado_en`.
- `date` para fechas de calendario: `fecha_pago`, `cubre_desde`, `cubre_hasta`,
  `proximo_cobro`, `fecha_inicio`, `periodo_actual_inicio`, `periodo_actual_fin`.

Un cobro es un día del calendario colombiano, no un instante. Tratarlo como timestamp
produce corrimientos de un día en los bordes de mes.

**Nombres**

- UUID v4 para todos los identificadores.
- Dominio en español, en el código y en la base.
- `snake_case` en tablas y columnas. `PascalCase` en componentes. `useCamelCase` en
  hooks. `camelCase` en variables y funciones.
- Tipos de evento en MAYÚSCULAS.

**Git**

Rama `develop`. Conventional Commits. Commits atómicos.

---

## 3. Modelo de datos

Tres capas separadas: el **catálogo** (qué vendés), el **contrato** (qué acordaste con
cada cliente), y los **hechos** (qué pasó). Mezclarlas es lo que después obliga a
rehacer el esquema.

### productos

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` pk | |
| `codigo` | `text` único | `g-vento`, `g-mura`, `g-quota` |
| `nombre` | `text` | |
| `url_aplicar_estado` | `text` | endpoint de la Edge Function del producto |
| `activo` | `boolean` | |
| `creado_en` | `timestamptz` | |

El secreto de escritura **no** vive acá. Va en variables de entorno de la Edge Function.

### clientes

`id` · `nombre_comercial` · `razon_social` · `nit` · `contacto_nombre` ·
`contacto_email` · `contacto_telefono` · `notas` · `creado_en`

La entidad comercial. G-10 y Salchimelo existen una sola vez aunque mañana compren
tres productos.

### planes

`id` · `producto_id` fk · `codigo` (`esencial`, `profesional`) · `nombre` ·
`precio_mensual` `integer` · `precio_sede_adicional` `integer` · `incluye_dian`
`boolean` · `vigente_desde` `date` · `activo` `boolean`

Precio de **lista**, no de contrato. Cuando subas precios, las suscripciones vigentes
no deben cambiar solas.

### terminos

`codigo` pk (`mensual`, `trimestral`, `semestral`, `anual`) · `meses` `smallint` ·
`descuento_pct` `smallint`

Valores: 0 / 5 / 10 / 15. Tabla y no enum, porque el descuento es dato y va a cambiar.

### suscripciones

El contrato.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` pk | |
| `cliente_id` | `uuid` fk | |
| `producto_id` | `uuid` fk | |
| `plan_id` | `uuid` fk | |
| `termino` | `text` fk → terminos | |
| `estado` | `text` | ver §4 |
| `sedes_adicionales` | `smallint` | default 0 |
| `precio_base_mensual` | `integer` | **congelado al firmar** |
| `precio_sede_adicional` | `integer` | **congelado al firmar** |
| `descuento_pct` | `smallint` | **congelado al firmar** |
| `fecha_inicio` | `date` | |
| `periodo_actual_inicio` | `date` | |
| `periodo_actual_fin` | `date` | |
| `proximo_cobro` | `date` | derivado del último `cubre_hasta` |
| `estado_implementacion` | `text` | `pendiente` · `cobrada` · `exonerada` |
| `organizacion_externa_id` | `uuid` | id de la organización en la base del producto |
| `creado_en` | `timestamptz` | |

**Restricción única sobre `(producto_id, organizacion_externa_id)`.** Una organización,
una suscripción. No sobre `(cliente_id, producto_id)`: un cliente puede terminar con dos
negocios distintos.

`organizacion_externa_id` es el único puente entre los dos sistemas. Nullable hasta que
la organización exista del otro lado.

**Sede adicional = cantidad, no línea aparte.** El precio es uniforme y no hay metadata
por sede. Lo que se pierde es saber cuándo se agregó cada una; eso lo cubre
`suscripcion_eventos`. Si algún día una sede necesita plan propio, ese día nace
`suscripcion_items` y se migran dos filas.

### suscripcion_eventos

Bitácora. `id` · `suscripcion_id` fk · `tipo` · `estado_anterior` · `estado_nuevo` ·
`datos` `jsonb` · `efectivo_desde` `date` · `motivo` `text` · `creado_en` `timestamptz`

Tipos: `CREADA` · `CAMBIO_PLAN` · `CAMBIO_TERMINO` · `SEDES_MODIFICADAS` ·
`A_GRACIA` · `RESTRINGIDA` · `SUSPENDIDA` · `REACTIVADA` · `CANCELADA`

**Esto no es event sourcing.** La fila de `suscripciones` es estado mutable; esta tabla
es auditoría. Derivar el estado en cada lectura no compra nada en un panel de dos
clientes y cuesta bastante.

`efectivo_desde` en el futuro representa un cambio agendado (ver §4).

### pagos

`id` · `cliente_id` fk · `suscripcion_id` fk nullable · `concepto` · `monto` `integer` ·
`fecha_pago` `date` · `metodo` `text` · `referencia` `text` · `cubre_desde` `date` ·
`cubre_hasta` `date` · `nota` `text` · `registrado_en` `timestamptz`

Conceptos: `suscripcion` · `implementacion` · `ajuste` · `otro`

El par `cubre_desde` / `cubre_hasta` es lo que hace que el histórico sirva:
`proximo_cobro` se calcula del último `cubre_hasta`, no de un campo que se actualiza a
mano y se desincroniza.

**Sin tabla de facturas ni de cargos en v1.** Se registra plata que entró; la obligación
se calcula. Cuando entre la pasarela va a hacer falta el ledger, pero para ese día ya
sabés cómo se comporta el modelo.

### banderas_pendientes

Cola de escritura hacia los productos. Ver §5.

`id` · `suscripcion_id` fk · `valor_deseado` `text` · `intentos` `smallint` ·
`ultimo_error` `text` · `confirmado_en` `timestamptz` nullable · `creado_en`

### admins

`id` `uuid` pk (= `auth.users.id`) · `email` · `creado_en`

Allowlist. Toda política de RLS del proyecto se apoya en esta tabla.

---

## 4. Estados

Dos enums distintos que es fácil confundir.

**`suscripciones.estado`** — estado comercial en G-Centro:
`activa` · `gracia` · `suspendida` · `cancelada`

**`estado_suscripcion`** — nivel de gating que se escribe en el producto:
`activa` · `por_vencer` · `gracia` · `restringida` · `suspendida`

El nivel se **deriva** del estado comercial más los días respecto a `proximo_cobro`:

| Estado comercial | Condición | Nivel sugerido |
|---|---|---|
| `activa` | faltan más de 7 días | `activa` |
| `activa` | faltan 7 días o menos | `por_vencer` |
| `gracia` | vencido 1–7 días | `gracia` |
| `gracia` | vencido 8–15 días | `restringida` |
| `suspendida` | — | `suspendida` |
| `cancelada` | — | `suspendida` |

**En v1 el panel calcula el nivel sugerido y vos confirmás con un botón. Nada escala
solo.** Son dos clientes y los conocés por el nombre. La automatización espera.

### Cambio de plan a mitad de período

Es más política que esquema.

- **Por defecto: efectivo al cierre del período.** Se registra un `CAMBIO_PLAN` con
  `efectivo_desde = periodo_actual_fin` y la suscripción cambia cuando llega la fecha.
  Cero prorrateo.
- **Upgrade urgente** (alguien quiere DIAN ya): se aplica inmediato y la diferencia
  entra como `pago` con `concepto = 'ajuste'` en el ciclo siguiente.
- **Downgrade: nunca inmediato.** Siempre al cierre, si no hay que devolver plata.

Prorrateo real necesita ledger de cargos. No va en v1.

---

## 5. La bandera

### Mecanismo

```
Panel (SPA)
  → sincronizar-bandera        Edge Function en G-Centro
      ├── escribe banderas_pendientes
      └── → aplicar-estado     Edge Function en G-Vento
              └── UPDATE organizaciones.estado_suscripcion
                      ↑
                  POS: solo lee
```

**Por qué Edge Function y no service role.** Guardar la service role de G-Vento en
G-Centro daría poder total sobre la base de los clientes desde una app interna que va a
recibir menos cariño que el POS. El radio de explosión no tiene relación con el tamaño
de la operación. La Edge Function reduce la superficie a exactamente una columna.

Alternativa válida si se quiere menos código: un rol de Postgres dedicado en G-Vento con
`GRANT UPDATE (estado_suscripcion) ON organizaciones`. Permisos aplicados por el motor.
Se descartó por fragilidad operativa (pooler, IPv4/IPv6) y peores logs.

Descartado de plano: que G-Vento consulte a G-Centro. Rompe la propiedad que no se
negocia.

**Autenticación entre sistemas:** firma HMAC con timestamp, ventana corta, para que
nadie pueda repetir una llamada capturada. El secreto vive en variables de entorno de
ambas Edge Functions y se rota como cualquier otra credencial.

**El navegador nunca toca el secreto.** Por eso el salto por la Edge Function de
G-Centro y no una llamada directa desde el SPA.

### El outbox

Nunca asumir que la escritura funcionó. Primero se guarda la intención en
`banderas_pendientes`, después se intenta. Si falla, se reintenta.

La lista de clientes muestra **dos cosas distintas**: el estado en G-Centro y si la
bandera está confirmada en el producto. La mayoría de los bugs feos de sistemas cruzados
son "creí que había escrito y no".

Esto es duplicación de estado deliberada. Es el precio de que el POS sobreviva a la
caída de G-Centro.

### Fail-open, sin excepciones

Si la bandera está ausente, vieja o corrupta, G-Vento asume `activa`.

Ninguna degradación por timeout. Ningún `vigente_hasta` que expire solo. Una bandera
solo restringe cuando se escribió explícitamente que restrinja.

Poner un vencimiento como red de seguridad es tentador y es exactamente el diseño que un
domingo a las diez de la noche deja a un bar sin poder cobrar.

---

## 6. Cambios en G-Vento

Tres columnas nuevas en `organizaciones`:

- `estado_suscripcion` `text` not null default `'activa'`
- `mensaje_suscripcion` `text` nullable — texto que se escribe desde el panel
- `estado_suscripcion_actualizado_en` `timestamptz`

**RLS:** legible por los miembros de la organización. Escribible por nadie. Solo la Edge
Function `aplicar-estado`, con service role, puede tocarla. Los usuarios del cliente no
deben poder actualizar su propio estado — es exactamente la clase de escalada de
privilegios que ya se cerró en G-Vento.

### La escalera

| Nivel | Comportamiento del POS |
|---|---|
| `activa` | Nada. |
| `por_vencer` | Aviso descartable. |
| `gracia` | Banner persistente arriba. Todo funciona. |
| `restringida` | Banner + se bloquean reportes, configuración, exportaciones masivas y gestión de usuarios. |
| `suspendida` | No se abren turnos nuevos. |

**Nunca se bloquea, en ningún nivel:** vender, cobrar, imprimir, facturar a la DIAN,
cerrar una caja ya abierta, y exportar los propios datos.

La facturación electrónica es una obligación legal del cliente. Meterse en el medio de
eso lo convierte en tu problema legal.

### Gating solo en la UI

No en RLS, no en triggers.

El bien protegido acá es la cobranza, no los datos. Un falso positivo en una política de
base de datos es un bar que no puede vender mientras dormís. Un cliente moroso que abre
devtools para desbloquear reportes se resuelve con una llamada. Los riesgos no son
simétricos.

**Un solo `SubscriptionGateProvider`** que lee la fila de la organización al iniciar
sesión y se suscribe a realtime, exponiendo `puede('ver_reportes')`. Si el gating queda
esparcido en veinte componentes, en seis meses hay uno que bloquea algo crítico.

---

## 7. Stack

Mismo stack que G-Vento. La consistencia acá no es estética: el camino de deploy ya se
conoce, Sentry se configura igual, y no hay que cambiar de contexto mental.

- React 18 + TypeScript strict + Vite. SPA, sin SSR.
- Tailwind. Sin design system propio.
- lucide para íconos.
- Zustand · React Query · Zod en los bordes · date-fns.
- Supabase: Postgres + Auth + Edge Functions.
- Repo único, `src/` normal. Sin monorepo.

Se puede recortar sin culpa: responsive más allá de que no se rompa, estados de carga
elegantes, animaciones. Tablas y formularios.

---

## 8. Autenticación

Supabase Auth con email y contraseña, más **TOTP obligatorio**.

Tres cosas que importan más que el método:

1. **Registro público desactivado** en el dashboard. Sin esto, cualquiera se crea una
   cuenta y RLS es la única defensa. Con esto, la puerta no existe.
2. **Deny by default en todas las tablas**, sin excepción, contra
   `auth.uid() in (select id from admins)`.
3. **La service role nunca sale del servidor.** Solo Edge Functions.

Sumar esta base al ciclo de backup nocturno ya montado. Los datos son pocos pero
irreemplazables: si se pierde el histórico de pagos, no hay forma de reconstruir quién
debe qué.

---

## 9. Decisiones pendientes

Bloquean la migración.

1. **IVA.** ¿Los $79.000 son con o sin IVA? Define si `monto` es lo que entró a la
   cuenta o la base gravable.
2. **Cobro anticipado.** ¿Anual = doce meses cobrados de una con 15% de descuento, o
   descuento con cobro mensual? Cambia el significado de `cubre_hasta`.
3. **Implementación exonerada.** ¿Qué pasa si un anual cancela en el mes 3? Si se cobra,
   `estado_implementacion` necesita distinguir exoneración condicional.
4. **`organizacion_externa_id`.** ¿G-Vento ya tiene tabla de organizaciones con id
   estable, y G-10 y Salchimelo ya son filas ahí? De eso depende si el puente existe o
   hay que construirlo antes.
