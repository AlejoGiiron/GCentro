# G-Centro · Diseño v1

Panel de control de suscripciones. Producto nuevo, repo nuevo, proyecto de Supabase aparte.
No comparte nada con G-Vento salvo una columna.

Estado del documento: **Bloque 1 aplicado al repo** — catálogo, `admins`, RLS y auth
escritos en `supabase/schema-inicial.sql`. Decisión de IVA resuelta (§9.1). Falta cargar
los precios de `planes` (dato del contador) y todo lo de §5 en adelante.

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

`precio_mensual` y `precio_sede_adicional` son **base gravable, SIN IVA** (ver §9.1).
Único en `(producto_id, codigo)`: dos planes `esencial` del mismo producto no pueden
coexistir.

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
| `precio_base_mensual` | `integer` | **congelado al firmar** · sin IVA (§9.1) |
| `precio_sede_adicional` | `integer` | **congelado al firmar** · sin IVA (§9.1) |
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
`monto_base` `integer` · `iva_pct` `smallint` · `fecha_pago` `date` · `metodo` `text` ·
`referencia` `text` · `cubre_desde` `date` · `cubre_hasta` `date` · `nota` `text` ·
`registrado_en` `timestamptz`

Conceptos: `suscripcion` · `implementacion` · `ajuste` · `otro`

**Los tres campos de plata, en la misma fila** (§9.1): `monto` es el **total recibido**
—lo que efectivamente entró a la cuenta—, `monto_base` es la base gravable y `iva_pct`
la tasa aplicada. Se guardan los tres y no se derivan dos del tercero: la tasa cambia
por decreto, y un pago viejo tiene que seguir explicándose con la tasa que tenía ese
día. Recalcular hacia atrás es exactamente el bug que deja el histórico sin cuadrar.

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

`id` `uuid` pk (= `auth.users.id`, `on delete cascade`) · `email` · `creado_en`

Allowlist. Toda política de RLS del proyecto se apoya en esta tabla, a través de la
función `es_admin()` (ver §8).

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

### El filtro de privacidad de Sentry es allowlist

`src/lib/sentry.ts` no redacta por deny-list. **No es una elección de implementación:
una deny-list no puede resolver el problema.** Un nombre propio es irreconocible por
regex —no existe ni puede existir un detector de nombres propios— y cada columna nueva
del esquema fuga callada hasta que alguien se acuerda de listarla.

El filtro es **allowlist por clave**. El modo de fallo es **opacidad**, nunca fuga: lo
que nadie declaró sale como `[Filtrado:number]`. La redacción es **tipada** a propósito
—se pierde el valor y se conserva la forma— porque eso es lo que la hace vivible: un
filtro que no deja diagnosticar se termina aflojando por presión de uso.

Dos modos, con defaults opuestos y por buena razón:

- **Estricto** (`extra`, `contexts`, `tags`, `user`): allowlist por clave. Acá es casi
  gratis porque los nombres de clave los elegimos nosotros — no adivinamos qué manda un
  tercero, declaramos qué mandamos.
- **Sobre** (mensaje del error, breadcrumbs): prosa, sin claves de las que agarrarse. El
  allowlist no tiene tracción y se redacta por contenido.

El allowlist es **acotado, nunca global sobre el envelope**: aplicarlo a `level`,
`sdk`, `release` o `fingerprint` no perdería diagnóstico, haría que Sentry no pueda
agrupar ni symbolicar el evento. El `stacktrace` pasa entero y es la **única excepción
de subárbol** del diseño.

**Regla operativa:** agregar una tabla o columna al esquema obliga a agregarla a la
tabla del test de privacidad en el mismo commit.

### Deuda aceptada: el módulo está duplicado

G-Vento tiene un módulo con el mismo diseño. Se acepta la duplicación —el monorepo se
descartó con razón (§2) y no se revisa por un archivo— pero **los dos repos no se tocan
entre sí.**

La sincronización es por **traspaso entre hilos**: un cambio de diseño de un lado
produce un reporte que el humano le pasa al hilo del otro repo, que decide y aplica en
su propio contexto. Se transfiere el **diseño** del filtro y el **método** de test;
**no** la lista de columnas ni el allowlist de claves, que cada repo deriva de SU
esquema.

Ese último punto no es burocracia. Derivar la lista del esquema propio fue lo que
destapó que `razon_social`, `nit`, los siete importes y el `jsonb` de
`suscripcion_eventos` estaban fugando: copiar la lista del otro repo los habría dejado
pasar, porque esas columnas allá no existen.

---

## 8. Autenticación

Supabase Auth con email y contraseña, más **TOTP obligatorio**.

Tres cosas que importan más que el método:

1. **Registro público desactivado** en el dashboard. Sin esto, cualquiera se crea una
   cuenta y RLS es la única defensa. Con esto, la puerta no existe.
2. **Deny by default en todas las tablas**, sin excepción, contra la allowlist `admins`.
3. **La service role nunca sale del servidor.** Solo Edge Functions.

### `es_admin()`, no el subquery directo

La forma obvia de escribir la política es `auth.uid() in (select id from admins)`. En
`productos`, `terminos` y `planes` funciona. **En `admins` no:** una política sobre
`admins` que consulta `admins` dispara su propia política para resolver el subquery, y
Postgres corta con `42P17: infinite recursion detected in policy`. El error no aparece
al crear la política sino en la primera lectura real.

Por eso el chequeo vive en `public.es_admin()`, `security definer` — corre como dueño
de la tabla, que no pasa por RLS, así que el subquery interno no vuelve a evaluar
ninguna política.

Tres detalles que no son opcionales:

- **`set search_path = ''`** en la función. Sin eso, alguien que controle el
  `search_path` de su sesión hace que `admins` resuelva a una tabla suya y la función
  devuelve `true`.
- **`revoke execute from public`**, y `grant` explícito a `authenticated` **y a `anon`.**
  `anon` lo necesita aunque nunca pase el chequeo: las políticas son `for all` y se
  evalúan para cualquier rol, así que sin el grant la consulta no devuelve cero filas
  —muere con `permission denied for function es_admin`—. No abre nada: para `anon`,
  `auth.uid()` es null y el `exists` da `false`.
- **Nunca `force row level security`.** El dueño de la tabla debe seguir saltándose RLS:
  es la única puerta para insertar el primer admin desde el SQL Editor.

### Verificación

`supabase/verificar-rls.sql` prueba que la afirmación de arriba es cierta y no solo
declarada: autenticado sin fila en `admins` y anónimo ven **cero filas** en las cuatro
tablas, un intento de auto-insertarse en `admins` es rechazado, y un control positivo
confirma que un admin real sí lee. Todo en transacciones con `rollback`.

Corre `set local role` en cada prueba a propósito: el SQL Editor es `postgres`, dueño
de las tablas, y no pasa por RLS — un `select` suelto ahí muestra todo y no prueba nada.

Sumar esta base al ciclo de backup nocturno ya montado. Los datos son pocos pero
irreemplazables: si se pierde el histórico de pagos, no hay forma de reconstruir quién
debe qué.

---

## 9. Decisiones

### 9.1 IVA — RESUELTA

**El catálogo guarda base gravable; el pago guarda las tres cifras.**

- `planes.precio_mensual` y `planes.precio_sede_adicional`: **base gravable, SIN IVA.**
- `suscripciones.precio_base_mensual` y `suscripciones.precio_sede_adicional`
  (congelados al firmar): **sin IVA**, misma convención que el catálogo.
- `pagos.monto`: **total recibido**, con IVA incluido — lo que entró a la cuenta.
- `pagos.monto_base` `integer` y `pagos.iva_pct` `smallint`: base y tasa de ese pago.

El catálogo razona en base gravable porque es el número del que se negocia y sobre el
que se aplica el descuento por término. El pago razona en total recibido porque es lo
que hay que cuadrar contra el extracto bancario. Mezclar las dos convenciones en una
sola columna es lo que obliga a auditar a mano seis meses después.

`iva_pct` se guarda por pago y no se lee de una constante: la tasa cambia por decreto y
un pago viejo tiene que seguir explicándose con la tasa que tenía ese día.

`descuento_pct` no se ve afectado: es un porcentaje sobre la base, y la base ya está
definida sin IVA.

### 9.2 Pendientes

Bloquean lo que se construya encima, no la migración del catálogo.

1. **Cobro anticipado.** ¿Anual = doce meses cobrados de una con 15% de descuento, o
   descuento con cobro mensual? Cambia el significado de `cubre_hasta`.
2. **Implementación exonerada.** ¿Qué pasa si un anual cancela en el mes 3? Si se cobra,
   `estado_implementacion` necesita distinguir exoneración condicional.
3. **`organizacion_externa_id`.** ¿G-Vento ya tiene tabla de organizaciones con id
   estable, y G-10 y Salchimelo ya son filas ahí? De eso depende si el puente existe o
   hay que construirlo antes.
