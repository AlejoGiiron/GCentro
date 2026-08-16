# G-Centro · Diseño v1

Panel de control de suscripciones. Producto nuevo, repo nuevo, proyecto de Supabase aparte.
No comparte nada con G-Vento salvo una columna.

Estado del documento, al **14/08/2026**: **Bloques 1, 2 y 3 cerrados. Bloque 4 (la UI)
empezado.**

Aplicado: catálogo, `admins`, RLS y auth (`schema-inicial.sql`); tablas de negocio,
precios de lista, los dos clientes reales, el modelo de cobro, el monto de implementación
y el tenant de pruebas (`002`–`007`); la URL del puente (`008`) y `cambio_efectivo`
(`009`). Pendiente de aplicar: el actor y el trigger de cambio de estado (`010`).

**El puente corrió en vivo contra LAB** los días 13 y 14/08: firma HMAC, idempotencia
verificada con el mismo `subscription_updated_at` en dos llamadas idénticas, y los
caminos de error 400 y 422 sin escribir en la cola.

Resueltas: IVA (§9.1), cobro anticipado (§9.2), implementación exonerada (§9.3),
`organizacion_externa_id` (§9.4), el contrato del puente (§9.5), el camino real (§9.6).

Falta: lo listado en §9.7 —barrido en diferido, desactivar admins en vez de borrarlos, el
`motivo` de un cambio de estado, `RESTRINGIDA` en el enum de eventos—, el **backup**
(§8, que no está montado), los precios de `planes` sin cargar, y las pantallas 2 a 4.

---

## 1. Alcance

**Entra en v1**

- Lista de clientes con producto, plan, término, estado y próximo cobro.
- Registro manual de pagos (monto, fecha, método, nota).
- Cambio de estado de suscripción.
- Escritura de la bandera `estado_suscripcion` en la base del producto.

**No entra**

Pasarela de pago, facturación electrónica propia, métricas. Eso espera a que el modelo
esté probado con uso real.

### El cliente NUNCA entra a G-Centro

> ⚠️ **Esto no es una función postergada: es el modelo.** "Sin portal del cliente" se
> venía leyendo como algo que llegaría más adelante, y no es así.

El circuito real es:

```
cliente  →  comprobante por WhatsApp a las líneas de Giiron
         →  un operador lo mira y decide si es válido
         →  lo registra a mano en G-Centro
         →  (si corresponde) confirma la bandera
G-Centro →  banner en el POS   ← ÚNICO canal hacia el cliente
```

**El único canal desde G-Centro hacia el cliente es el banner del POS** (§6). No hay
portal, no hay autoservicio, no hay login de cliente, y no hay notificación por correo.

Tres consecuencias que se siguen de esto y no se renegocian:

- **La deny-by-default sobre `admins` (§8) se queda como está.** No hay un segundo tipo
  de usuario para el que haya que diseñar policies. Cada fila de `admins` es un empleado
  de Giiron.
- **La validación del pago es humana, y ese es el control.** Nadie se autoacredita un
  pago: alguien mira el comprobante en el chat y decide. Por eso el registro manual no es
  una carencia del v1 sino el punto de control del modelo.
- **Por eso el mensaje del banner pesa tanto** (§6): es literalmente lo único que el
  cliente lee de este sistema.

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

Tres capas separadas: el **catálogo** (qué se vende), el **contrato** (qué se acordó con
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
`contacto_email` · `contacto_telefono` · `notas` · `es_prueba` `boolean` · `creado_en`

La entidad comercial. G-10 y Salchimelo existen una sola vez aunque mañana compren
tres productos.

#### `es_prueba` y el tenant de laboratorio

**LAB no es un cliente: es el laboratorio.** Existe como fila real, con su
`organizacion_externa_id` de verdad, para poder ejercitar el circuito completo de la
bandera (§5) sin tocar a un cliente que paga. Probar el camino entero contra una
organización real es lo único que verifica que el puente funciona; simularlo no.

`es_prueba` es `not null default false`, y el default no es un detalle: con la columna
nullable o con default `true`, un cliente nuevo podría **nacer invisible para la
cobranza** por un olvido en un INSERT. El modo de fallo tiene que ser "aparece aunque no
debería", nunca "no aparece y nadie lo nota".

**La exclusión va por VISTAS, no por convención.** `clientes_cobrables` y
`suscripciones_cobrables` filtran los tenants de prueba y son el camino por default;
para INCLUIR a LAB hay que ir explícitamente a la tabla base. Si la exclusión fuera un
`WHERE` que cada consulta tiene que acordarse de escribir, falla la primera vez que
alguien copia un SELECT sin él — y falla hacia el lado silencioso, inflando un total de
cobranza con datos de prueba.

Las dos vistas llevan `security_invoker = true`. Sin eso correrían con los permisos de
su dueño y se saltearían RLS: serían un agujero por donde `anon` leería `clientes`
entero, esquivando toda la política de §8.

### planes

`id` · `producto_id` fk · `codigo` (`esencial`, `profesional`) · `nombre` ·
`precio_mensual` `integer` · `precio_sede_adicional` `integer` · `incluye_dian`
`boolean` · `vigente_desde` `date` · `activo` `boolean`

Precio de **lista**, no de contrato. Cuando suban los precios, las suscripciones vigentes
no deben cambiar solas.

`precio_mensual` y `precio_sede_adicional` son **base gravable, SIN IVA** (ver §9.1).
Único en `(producto_id, codigo)`: dos planes `esencial` del mismo producto no pueden
coexistir.

#### Precios de lista vigentes

Base mensual, sin IVA. Cargados en `004-seed-planes.sql`.

| Plan | Mensual | Sede adicional | DIAN |
|---|---|---|---|
| Esencial | 80.000 | 60.000 | no |
| Profesional | 130.000 | 90.000 | sí |

**Los precios con descuento NO se guardan: se derivan del término.** Duplicar un precio
es cómo se termina con dos números distintos para lo mismo.

| | Mensual (0%) | Semestral (10%) | Anual (30%) |
|---|---|---|---|
| Esencial | 80.000 | 72.000 | 56.000 |
| Profesional | 130.000 | 117.000 | 91.000 |
| Sede Esencial | 60.000 | 54.000 | 42.000 |
| Sede Profesional | 90.000 | 81.000 | 63.000 |

**Las bases están elegidas para que los doce derivados den enteros exactos.** Por eso no
hay regla de redondeo en ningún lado: no hace falta. Está verificado en
`cobro.test.ts` ("el catálogo NO necesita regla de redondeo"), que recorre las cuatro
bases por los tres términos. Si un precio de lista futuro rompe esa propiedad, el test
falla antes de que aparezca un peso de diferencia en una factura.

**Invariante al mover precios: la escalera de valor no se puede invertir.** El plan con
DIAN en su término más barato tiene que seguir por encima del plan sin DIAN en su
término más caro — hoy 91.000 contra 80.000. Un descuento anual demasiado agresivo lo
da vuelta: con 40%, Profesional anual caía a 78.000 y quedaba por debajo de Esencial
mensual, o sea DIAN incluida más barata que no tenerla. Fue el motivo de bajar el anual
del 40% al 30%.

#### Cargos de única vez

**Implementación: 250.000.** Se congela en `suscripciones.monto_implementacion` al
firmar, igual que los otros precios del contrato. Su estado lo lleva
`estado_implementacion` (§9.3): con plan anual arranca exonerada condicional.

**Las sedes adicionales no pagan implementación.** El cliente las autogestiona con
onboarding y videos. Si pide soporte de montaje, se cobra aparte y no es parte del plan.

### terminos

`codigo` pk (`mensual`, `semestral`, `anual`) · `meses` `smallint` ·
`descuento_pct` `smallint`

Valores vigentes: mensual 0% · semestral 10% · anual 30%. Tabla y no enum, porque el
descuento es dato y ya cambió una vez: el trimestral se eliminó y el anual pasó de 15%
a 30% (`002-terminos-corregidos.sql`).

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
| `monto_implementacion` | `integer` | **congelado al firmar** · cargo de única vez, ver §3 |
| `fecha_inicio` | `date` | |
| `periodo_actual_inicio` | `date` | |
| `periodo_actual_fin` | `date` | |
| `proximo_cobro` | `date` | derivado del último `cubre_hasta` |
| `estado_implementacion` | `text` | `pendiente` · `cobrada` · `exonerada_condicional` · `exonerada` — ver §9.3 |
| `organizacion_externa_id` | `uuid` | id de la organización en la base del producto |
| `creado_en` | `timestamptz` | |

**Restricción única sobre `(producto_id, organizacion_externa_id)`.** Una organización,
una suscripción. No sobre `(cliente_id, producto_id)`: un cliente puede terminar con dos
negocios distintos.

`organizacion_externa_id` es el único puente entre los dos sistemas. Nullable hasta que
la organización exista del otro lado.

**Un precio especial es un acuerdo, no un descuento por término.** G-10 y Salchimelo
pagan 75.000 donde la lista dice 80.000: eso se carga como `precio_base_mensual = 75.000`
con `descuento_pct = 0`, y **no** como un 6,25% de descuento sobre 80.000. Si mañana se
renegocia, el número no queda confundido con la escalera de términos — que es la que
sube automáticamente si el cliente pasa a semestral o anual. Mezclarlos daría un
descuento encima de otro que nadie pactó.

**Sede adicional = cantidad, no línea aparte.** El precio es uniforme y no hay metadata
por sede. Lo que se pierde es saber cuándo se agregó cada una; eso lo cubre
`suscripcion_eventos`. Si algún día una sede necesita plan propio, ese día nace
`suscripcion_items` y se migran dos filas.

### suscripcion_eventos

Bitácora. `id` · `suscripcion_id` fk · `tipo` · `estado_anterior` · `estado_nuevo` ·
`datos` `jsonb` · `efectivo_desde` `date` · `motivo` `text` · `admin_id` fk nullable ·
`creado_en` `timestamptz`

Tipos: `CREADA` · `CAMBIO_PLAN` · `CAMBIO_TERMINO` · `SEDES_MODIFICADAS` ·
`A_GRACIA` · `RESTRINGIDA` · `SUSPENDIDA` · `REACTIVADA` · `CANCELADA`

**Esto no es event sourcing.** La fila de `suscripciones` es estado mutable; esta tabla
es auditoría. Derivar el estado en cada lectura no compra nada acá y cuesta bastante.

`efectivo_desde` en el futuro representa un cambio agendado (ver §4).

`RESTRINGIDA` **pertenece al otro vocabulario** y por eso el trigger nunca lo emite:
`suscripciones.estado` tiene cuatro valores comerciales y `restringida` es un nivel de
gating (§4). Hoy sólo puede escribirse a mano. Está anotado en §9.7.

#### El cambio de estado lo escribe un TRIGGER, no la UI

`suscripciones_cambio_de_estado` dispara `after update ... when (old.estado is distinct
from new.estado)` e inserta el evento. Antes esto dependía de que la UI se acordara: o
sea que no era una garantía, era una intención — la misma clase de error que el 14/08,
una propiedad afirmada que el código no sostenía. Ahora da igual si el cambio vino del
panel, del SQL Editor o de un script.

**Lo que el trigger NO puede saber es el `motivo`.** Un trigger ve el antes y el después,
nunca el por qué; queda en `NULL`. Capturarlo exige que el cambio pase por una función
que lo reciba como parámetro. Está en §9.7. No se inventa un motivo genérico: parecería
información y no lo sería.

### pagos

`id` · `cliente_id` fk · `suscripcion_id` fk nullable · `concepto` · `monto` `integer` ·
`monto_base` `integer` · `iva_pct` `smallint` · `fecha_pago` `date` · `metodo` `text` ·
`referencia` `text` · `cubre_desde` `date` · `cubre_hasta` `date` · `nota` `text` ·
`admin_id` fk nullable · `registrado_en` `timestamptz`

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
se calcula. Cuando entre la pasarela va a hacer falta el ledger, pero para ese día el
comportamiento del modelo ya va a estar entendido.

### banderas_pendientes

Cola de escritura hacia los productos. Ver §5.

`id` · `suscripcion_id` fk · `valor_deseado` `text` · `intentos` `smallint` ·
`ultimo_error` `text` · `bandera_error_codigo` `text` · `cambio_efectivo` `boolean`
nullable · `confirmado_en` `timestamptz` nullable · `admin_id` fk nullable · `creado_en`

`cambio_efectivo` es el `changed` de la respuesta, guardado de este lado y en español
porque es columna nuestra (§2). **El null significa algo:** `confirmado_en` lleno con
`cambio_efectivo` en null es un 200 con cuerpo ilegible — el estado se aplicó y el detalle
se perdió. Un `DEFAULT FALSE` diría "no cambió nada" donde lo cierto es "no sabemos".

`ultimo_error` es el texto crudo y **no viaja a Sentry**: es texto libre y ya se comprobó
que ahí termina cayendo un nombre propio. Para diagnóstico externo va
`bandera_error_codigo`, un enum derivado (`HMAC_INVALIDO` · `TIMEOUT` · `HTTP_4XX` ·
`HTTP_5XX` · `ORG_NO_ENCONTRADA` · `RED` · `DESCONOCIDO`) que responde la única pregunta
que importa cuando falla la sincronización: ¿es el secreto, la red, o el otro lado?

**El enum no tiene categoría para "dato inválido de este lado", y no la necesita.** Se
diseñó para fallas de SINCRONIZACIÓN, y una entrada inválida ya no llega al insert (§5):
si no hay fila, no hay código que ponerle. Durante un tiempo esa categoría sí ocurría y se
guardaba como `DESCONOCIDO`, que mentía — no era un error sin clasificar, era una
validación nuestra corriendo tarde. Agregar un valor al enum habría sido tratar el
síntoma. Hoy `DESCONOCIDO` es literal: no sabemos qué pasó, porque no debería estar
pasando.

### admins

`id` `uuid` pk (= `auth.users.id`, `on delete cascade`) · `email` · `creado_en`

Allowlist. Toda política de RLS del proyecto se apoya en esta tabla, a través de la
función `es_admin()` (ver §8).

### El actor: `admin_id` en las tres tablas que registran una acción

`suscripcion_eventos`, `pagos` y `banderas_pendientes` llevan `admin_id`, con
`default public.admin_actual()` y FK a `admins`.

Hasta el 14/08/2026 el panel se diseñó para **un** operador, y con uno solo "quién lo
hizo" tenía respuesta trivial. La entrevista de producto cambió ese supuesto: el panel es
donde Giiron centraliza los cobros y lo van a usar varias personas. Con varias, *"¿quién
suspendió a este cliente?"* es la pregunta que aparece cuando un cliente llama enojado — y
este panel escribe en la base de producción del cliente, así que **una acción sin autor es
una acción sin responsable**.

**`admin_actual()` y no `auth.uid()` pelado.** `auth.uid()` devuelve el uid del JWT exista
o no en `admins`; con la FK puesta, un uid que no esté haría *fallar* el INSERT y rompería
una emergencia desde el SQL Editor, que es justo el camino que tiene que seguir
funcionando cuando algo ya se rompió. `admin_actual()` devuelve el uid sólo si es admin de
verdad, y `NULL` en cualquier otro caso. El default nunca puede tumbar una escritura.

**Nullable, y el `NULL` significa algo.** Tres orígenes: fila anterior a esta migración,
escritura desde el SQL Editor sin sesión, o sesión cuyo uid no está en `admins`.

> ⚠️ **El autor de todo lo anterior al 14/08/2026 no es recuperable.** Las filas ya
> escritas quedan en `NULL` para siempre. No se rellenan: inventar un autor plausible es
> peor que admitir que no se sabe, porque el histórico dejaría de poder distinguir lo
> registrado de lo supuesto.

**`on delete set null`, no `restrict`**, y es la parte incómoda: **borrar a un admin borra
su autoría del histórico**. Se eligió igual porque revocar un acceso no puede quedar
bloqueado por el registro de auditoría — en una emergencia se revoca primero y se discute
después. La salida correcta es no borrar admins sino desactivarlos, y para eso falta una
columna que hoy no existe. Anotado en §9.7.

`admin_id` va **filtrado** en el reporte de errores: identifica a una persona. No se
confunde con `Sentry.setUser({ id })` (§7), que manda el uuid de quien *reporta* el error;
este es el de quien *firmó una acción*, posiblemente meses antes y desde otra sesión.

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
| `gracia` | **vencido más de 7 días** | `restringida` |
| `suspendida` | — | `suspendida` |
| `cancelada` | — | `suspendida` |

**El panel calcula el nivel sugerido y una persona confirma. Nada escala solo.**

### Por qué nada escala solo

> La versión anterior de esta sección lo justificaba con *"son dos clientes y los conocés
> por el nombre"*. Ese argumento **está muerto**: el objetivo confirmado es 50 o más, y
> revisar 50 a mano todos los días no es "la automatización espera", es trabajo repetitivo
> que se termina haciendo mal. La conclusión sobrevive; el argumento es otro.

**El argumento es la asimetría de consecuencias, y no depende del tamaño:**

| Error | Quién lo paga |
|---|---|
| Restringir a quien pagó | Un bar con un banner de cobranza en la pantalla de venta, delante de sus clientes |
| No restringir a quien debe | Giiron, un día de una suscripción |

Nunca van a ser simétricos. Y con más clientes la asimetría **empeora**, no mejora: los
pagos llegan por transferencia y se registran a mano, así que `pagos` va detrás de la
realidad por horas o días. **Una automatización actuaría sobre lo registrado, no sobre lo
que pasó**, y ese hueco es exactamente donde viven los falsos positivos. Más clientes son
más transferencias en tránsito.

#### La invariante, y el mecanismo que la sostiene a escala

Lo que hay que preservar no es "un botón por cliente" —eso no escala— sino:

> **Ningún estado llega al producto de un cliente sin que una persona lo haya visto.**

Eso se cumple igual revisando y aprobando **una tanda**. El mecanismo cambia; la
invariante no.

#### Dónde está la línea: donde algo empieza a bloquear

| Nivel | Qué bloquea |
|---|---|
| `activa` · `por_vencer` · `gracia` | **Nada.** Aviso o banner |
| `restringida` · `suspendida` | Módulos administrativos |

Hasta `gracia` inclusive, la escalada puede automatizarse. De `restringida` para arriba,
nunca.

⚠️ **El criterio NO es que `gracia` sea inocuo.** `gracia` pone un banner persistente en
la pantalla de venta: el cliente **lo ve**, y eso es visible y molesto a propósito. El
criterio es que **es reversible y no impide operar**: si se aplicó por error, se quita y no
quedó nada roto — no hubo una venta que no se pudo cobrar ni un turno que no se pudo
abrir.

Esa distinción importa porque "es casi inocuo" es exactamente la frase que alguien cita
dentro de un año para automatizar un escalón más arriba. `restringida` no es un poco más
molesto que `gracia`: es la primera vez que el cliente **pierde una capacidad**.

#### Desescalar es automático e inmediato, siempre

La regla anterior vale para **subir**. Bajar no se aprueba: un cliente que pagó no puede
esperar a que alguien confirme su vuelta a `activa`. Es la misma asimetría leída al revés,
y es lo que §5 llama fail-open.

Implementado en `src/lib/bandera.ts` como función pura —`hoy` entra por parámetro, igual
que en `cobro.ts`—. Que la derivación no tenga ningún camino por el que escribir es lo que
mantiene *verificable* la promesa de que nada escala solo.

#### Dos huecos que la tabla tenía

La versión anterior decía "vencido 8–15 días → `restringida`" y **no decía qué pasa el día
16**. Tampoco qué pasa con una suscripción en `gracia` cuya fecha todavía no llegó.

- **Vencido más de 15 días: se queda en `restringida`. No escala a `suspendida`.**
  Suspender es una decisión **comercial**: se toma cambiando `suscripciones.estado`, no
  dejando correr un contador. Si el día 16 la derivación empezara a sugerir `suspendida`
  sola, "nada escala solo" sería falso en la práctica — la sugerencia es lo que se aprieta.
  El único camino a `suspendida` pasa por una persona. Está fijado como propiedad en un
  test: desde `activa` o `gracia`, ningún número de días produce `suspendida`.
- **`gracia` con la fecha por delante → `gracia`.** Es un dato inconsistente: alguien puso
  el estado a mano, o se movió `proximo_cobro` después. Manda el estado comercial, que es
  lo que un humano escribió a propósito, y `gracia` es su piso — banner, sin bloquear nada.

Y uno que la tabla sí cubría aunque no lo pareciera: **`activa` con la fecha ya pasada**
cae en "faltan 7 días o menos" y sugiere `por_vencer`. Es lo correcto por §5: una
suscripción que nadie movió a `gracia` no se restringe por aritmética.

### Cambio de plan a mitad de período

**El período NO se reinicia.** El principio del que sale todo lo demás:

> **La plata pagada conserva su valor.**

Lo que el cliente ya pagó y todavía no consumió no se pierde, no se recalcula desde
cero y no se devuelve: se convierte.

**UPGRADE — se paga la diferencia, la fecha no se mueve.**

El cliente ya pagó ese tiempo; lo que compra es más nivel por el mismo tiempo.

> Esencial anual (56.000/mes), mes 5, quedan 7 meses. Sube a Profesional anual
> (91.000/mes). Se cobra la diferencia por lo que queda; el vencimiento no cambia.

**DOWNGRADE — el saldo se convierte, la fecha se extiende.**

> Profesional anual (91.000/mes), mes 5, quedan 7 meses. Baja a Esencial anual
> (56.000/mes). El saldo compra más días del plan barato y el vencimiento se corre.

**Nunca se devuelve plata.** Un downgrade compra tiempo, no un reembolso.

#### Por qué el período no se reinicia

La versión anterior de esta política era "el período se reinicia y se cobra la
diferencia". Con el upgrade funcionaba; con el downgrade abría un agujero:

> Profesional anual, mes 11, se pasa a Esencial anual. La diferencia es negativa, así
> que no se cobra nada. Y el período se reinicia: **doce meses de Esencial gratis.**

Cualquier cliente anual podía renovar sin pagar bajando de plan cerca del vencimiento.
Con dos clientes conocidos uno por uno no iba a pasar; con cincuenta, sí — y a esa escala
nadie lo nota mirando.

Convertir el saldo lo cierra por construcción: el downgrade no regala tiempo, compra
tiempo con plata que ya estaba paga. No hay nada que explotar porque no hay nada gratis.

#### Reglas de cálculo

- Se usa el precio **congelado** de la suscripción (`precio_base_mensual`), nunca el de
  lista. G-10 y Salchimelo tienen precio especial, y leer del catálogo les subiría el
  precio en silencio justo cuando cambian de plan.
- **El precio del plan nuevo es una decisión, no una consulta.** Un cliente con precio
  especial que sube de plan no hereda automáticamente el precio de lista del plan
  destino: quién fija ese número es quien ejecuta el cambio.
- Con sedes adicionales, el saldo se calcula sobre el **total mensual** (plan + sedes), y
  el precio nuevo también. El descuento por término se aplica sobre ese total.
- **El cálculo se hace EN DÍAS, no en meses**, para que la fecha caiga exacta. Una cuenta
  en meses obliga a decidir qué es "medio mes" y arrastra el error hasta el vencimiento.
- El período es **cerrado en ambos extremos**: `periodo_actual_fin` es el último día
  cubierto. Un cambio el último día todavía tiene un día de saldo, no cero.
- Cada cambio deja un `suscripcion_evento` con el saldo, la fecha vieja y la nueva.
  Dentro de seis meses, "por qué esta suscripción vence el 12 de marzo" tiene que poder
  responderse sin rehacer la cuenta.

Implementado como funciones puras en `src/lib/cobro.ts`, con los casos borde cubiertos en
`src/lib/cobro.test.ts`. **No hay UI todavía**: es modelo y lógica.

Una consecuencia contraintuitiva que conviene tener presente: la extensión de un
downgrade depende del **ratio** entre el precio viejo y el nuevo, no del saldo absoluto.
Sumar sedes a ambos lados sube el saldo pero acerca el ratio a 1, así que extiende
**menos**. Está fijado en un test.

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

#### El contrato, ya implementado

`POST` a `productos.url_aplicar_estado` (cargada en la migración `008`), cuerpo
`{organization_id, status, message}`, headers `x-gcentro-timestamp` (epoch en **segundos**)
y `x-gcentro-signature` (HMAC-SHA256 en hex). Ventana de **300s en ambas direcciones**.

- **Se firma `${timestamp}.${cuerpo_crudo}`, sobre el body TAL CUAL viaja.** Por eso
  `construirCuerpo` devuelve un `string` y no un objeto: si devolviera un objeto habría
  dos serializaciones posibles —la que se firma y la que se manda— y basta con que
  difieran en el orden de una clave para recibir un 401 intermitente e indiagnosticable.
- **No se manda `Authorization` ni `apikey`.** `aplicar-estado` tiene verify-JWT
  desactivado y su única autenticación es el HMAC; mandar un token de G-Centro hacia el
  proyecto de G-Vento sería filtrar una credencial nuestra a los logs de otro sistema.
- **Cada reintento se re-firma con su propio timestamp.** Reusar la firma haría que un
  reintento tardío diera 401 y el diagnóstico apuntara al secreto.

`sincronizar-bandera` **no usa service role**, ni de G-Centro ni de G-Vento: todo el
acceso a la base va con el JWT de quien llamó, así que no puede hacer nada que ese admin
no pudiera hacer solo desde el panel. El chequeo de "¿es admin?" es *pedirle una fila a
`admins`*: bajo RLS eso solo funciona si lo es, así que la comprobación y la política de
§8 son la misma cosa. Lo único que la función agrega al poder del que llama es firmar.

### El outbox

Nunca asumir que la escritura funcionó. Primero se guarda la intención en
`banderas_pendientes`, después se intenta. Si falla, se reintenta.

La lista de clientes muestra **dos cosas distintas**: el estado en G-Centro y si la
bandera está confirmada en el producto. La mayoría de los bugs feos de sistemas cruzados
son "creí que había escrito y no".

Esto es duplicación de estado deliberada. Es el precio de que el POS sobreviva a la
caída de G-Centro.

**`confirmado_en` solo se llena con un 200.** Es la columna que separa "yo lo decidí" de
"el producto lo sabe". Un `changed:false` **también confirma**: significa que el producto
ya estaba en ese estado, que es exactamente lo que la columna afirma. La idempotencia no
es un fallo.

#### La cola crece por LLAMADA, no por cambio de estado

Cada invocación deja su fila, aplique o no aplique algo. **Es una propiedad, no un
accidente:** es el registro de auditoría que §6 pide de este lado, y es lo que permite
contestar "¿cuántas veces se intentó y cuándo?" — que es justo lo que se pregunta cuando
algo no cuadra entre los dos sistemas.

La consecuencia es que la tabla crece con cada clic. Por eso existe `cambio_efectivo`
(§3): sin ella, dos filas consecutivas con el mismo `valor_deseado` son indistinguibles
salvo por la hora, y no hay forma de saber cuál movió algo del otro lado. Cuando la cola
tenga pantalla, lo que se muestra por defecto es lo **no confirmado**; el historial
completo es otra vista.

#### La primera llamada del día tarda ~2s

Medido en la prueba en vivo: `creado_en` → `confirmado_en` dio **1.99s** en la primera
llamada y **~0.5s** en las siguientes. La diferencia es arranque en frío de las Edge
Functions, y hay dos en el camino.

Con 10s de timeout por intento sobra margen, así que no es un problema de corrección.
**Es un requisito de UI:** el botón de confirmar necesita estado de carga visible desde el
primer clic. Dos segundos sin respuesta es exactamente el intervalo en el que alguien
aprieta de nuevo — y acá apretar de nuevo escribe otra fila en la cola.

#### Qué se reintenta y qué no, dentro de la llamada

Tres intentos, y **solo lo transitorio**: `TIMEOUT`, `RED`, `HTTP_5XX`.

No se reintenta `HMAC_INVALIDO` —un secreto mal configurado o un reloj corrido no se
arreglan en 1.5 segundos; serían tres 401 idénticos y treinta segundos de espera—, ni
`HTTP_4XX` ni `ORG_NO_ENCONTRADA`, que son datos que el otro lado rechaza y va a seguir
rechazando. Tampoco `DESCONOCIDO`: un error que no se pudo clasificar, reintentado tres
veces, son tres errores que no se pudieron clasificar. La fila queda sin confirmar, que
es justo la señal que el outbox existe para dar.

#### El reintento en diferido: obligatorio en una dirección, opcional en la otra

> La versión anterior decía que el reintento manual alcanzaba *"mientras sean dos clientes
> y el panel muestre la cola sin confirmar"*. **Esa conclusión era incorrecta**, y no solo
> por la escala: le faltaba mirar la dirección del cambio.

**Fail-open protege subiendo, no bajando.** Es la mitad de la garantía que se suele leer
como si fuera entera:

- **Bandera de escalada que falla** (queríamos `gracia`, quedó `activa`). El cliente
  sigue operando normal. Cuesta cobranza demorada, no daño. **Fail-open cubre este caso.**
- **Bandera de desescalada que falla** (el cliente pagó, queríamos `activa`, quedó
  `restringida`). **Un cliente al día sigue con el banner puesto y con los módulos
  bloqueados.** Fail-open no cubre nada acá: el estado viejo ya está escrito del otro lado
  y no expira solo — por diseño, porque §5 prohíbe los vencimientos automáticos.

El segundo caso es **daño real y silencioso**: real porque el cliente cumplió y lo está
pagando igual, y silencioso porque de este lado todo se ve bien salvo una fila sin
confirmar en una cola que nadie está obligado a mirar. Con dos clientes se nota en una
hora. Con cincuenta no se nota.

> **La regla: el reintento automático es OBLIGATORIO cuando la bandera pendiente es MENOS
> restrictiva que lo aplicado.** En esa dirección deja de ser una optimización y pasa a ser
> corrección. En la dirección contraria puede seguir siendo manual.

Es la misma asimetría de §4 —perjudicar a quien pagó pesa más que no cobrarle a quien
debe— aplicada al transporte en vez de a la decisión. Que las dos secciones salgan del
mismo principio no es casualidad: es la señal de que el principio es el correcto.

#### El mismo daño por otra puerta: registrar un pago no reactiva

**Registrar un pago y cambiar el estado son dos acciones separadas.** Con un solo operador
el que registraba reactivaba. Con varios, alguien registra y no reactiva — y el cliente
queda al día con el banner puesto.

Es peor que la bandera sin confirmar en un sentido: **no deja rastro**. Una bandera que
falla deja su fila en la cola; esto no deja nada, porque de este lado todo se ve bien —
el pago SÍ está registrado. El único que se entera es el cliente, en el mostrador.

Se ataca en dos lugares, con el **mismo predicado** (`src/lib/cobertura.ts`), y que sea
el mismo está fijado en un test — si divergieran, la pantalla podría no ofrecer reactivar
y la lista marcar la anomalía acto seguido:

- **En el momento.** Al registrar un pago cuyo `cubre_hasta` alcanza hasta hoy o más
  allá, y con la suscripción en `gracia` o `suspendida`, la pantalla 2 ofrece reactivar
  **marcado por default y desmarcable**. Nunca automático: §4 exige que una persona vea
  cada estado que llega al producto, y eso incluye los amables.
- **Como red.** Si alguien la desmarcó, la lista lo muestra como `PAGO_SIN_REACTIVAR`,
  **la primera categoría de atención** — antes incluso que una bandera regresiva, porque
  la evidencia es nuestra y no admite duda: el pago está en nuestra base.

`cancelada` queda afuera a propósito: un contrato cancelado con cobertura vigente es
§9.3 —el cliente se fue antes de consumir lo que pagó— y reactivarlo de paso sería
revivir un contrato que alguien terminó a propósito.

#### Lo inválido no entra a la cola

**Una fila en la cola significa "esto hay que aplicarlo y se va a reintentar hasta
lograrlo".** Un dato inválido no es eso: no se arregla reintentando. Por eso todo lo que
pueda rechazarse mirando la entrada se rechaza **antes** del insert — nivel desconocido,
mensaje de más de 280 caracteres o del tipo equivocado, `suscripcion_id` que no es UUID,
suscripción sin `organizacion_externa_id`, producto sin puente, secreto sin configurar.

El único caso que escribe fila y falla es el que **llegó a la red**, que es exactamente lo
que el outbox modela.

Esto no es higiene: `confirmado_en is null` tiene que poder leerse como "falta aplicar".
Cuando exista el barrido en diferido (§9.7), una fila imposible de completar se
reintentaría para siempre.

> ### ⚠️ Cómo se descubrió que esto era falso
>
> Este párrafo estuvo escrito acá desde el 12/08 y **el código no lo cumplía**. La
> validación del largo del mensaje vivía dentro de `construirCuerpo`, o sea *después* del
> insert: un mensaje de 281 caracteres devolvía 400 y dejaba una fila muerta en la cola,
> con `bandera_error_codigo = 'DESCONOCIDO'` —que además mentía— y `confirmado_en` en null.
> Lo encontró una prueba en vivo el 14/08/2026, no un test.
>
> **Había 416 tests y ninguno lo veía.** `enviar.test.ts` probaba que `enviarBandera` tira
> antes de tocar la red, lo cual era cierto y era irrelevante: **el insert no estaba en
> `enviarBandera`, estaba en el handler** — y el handler no tenía tests, porque vivía en
> `index.ts` junto a los globales de Deno y no se podía correr en vitest.
>
> Las tres lecciones, en orden de importancia:
>
> 1. **Testear la unidad equivocada es indistinguible de no testear.** Una afirmación
>    sobre el ORDEN de dos operaciones solo se puede probar donde las dos ocurren.
> 2. **Lo que no se puede correr en un test no lleva decisiones adentro.** `index.ts` es
>    ahora un adaptador de Deno y nada más; la orquestación vive en
>    `_shared/sincronizar.ts`, que sí corre en vitest.
> 3. **Una propiedad escrita en el documento no es una propiedad verificada.** El párrafo
>    sonaba a descripción y era una intención.
>
> La auditoría posterior encontró otras dos del mismo lado equivocado de la línea, las dos
> inalcanzables hoy pero por accidente: el chequeo de `organizacion_externa_id` era "tiene
> algo" mientras el contrato exige forma de UUID, y un secreto sin configurar fallaba
> dentro de `enviarBandera`. Las tres están fijadas en `sincronizar.test.ts`.

### Fail-open, sin excepciones

Si la bandera está ausente, vieja o corrupta, G-Vento asume `activa`.

Ninguna degradación por timeout. Ningún `vigente_hasta` que expire solo. Una bandera
solo restringe cuando se escribió explícitamente que restrinja.

Poner un vencimiento como red de seguridad es tentador y es exactamente el diseño que un
domingo a las diez de la noche deja a un bar sin poder cobrar.

---

## 6. El lado del producto

Lo que sigue lo decidió e implementó el equipo del producto. Se documenta acá porque
define el contrato del puente, no porque se controle desde este repo.

### Los nombres cruzan el límite: la traducción vive de este lado

**El producto nombró sus columnas en inglés.** Nosotros usamos español por la convención
Giiron (§2). No se les pide que cambien: es su repo y su convención, y una convención
ajena no es un bug.

| Concepto | Allá (`organizaciones`) | Acá |
|---|---|---|
| Nivel de gating | `subscription_status` (default `'active'`) | `banderas_pendientes.valor_deseado` |
| Mensaje del banner | `subscription_message` | mensaje del panel |
| Cuándo cambió | `subscription_updated_at` | — (se deriva) |

**La traducción vive en UN SOLO LUGAR: el cliente de la Edge Function, de nuestro lado.**
Ni en la base, ni en los hooks, ni en la UI. Adentro del panel todo es español; el inglés
existe únicamente en el borde que habla con el producto.

Un mapeo de nombres esparcido en varios archivos es cómo se termina con dos traducciones
que discrepan, y el síntoma aparece del otro lado —en la base de un cliente— donde no se
puede depurar.

#### Los cinco valores — CONFIRMADOS

`subscription_status` es `text` con CHECK, **no un enum de Postgres**. Acepta exactamente
estos cinco:

| Nuestro nivel (§4) | `subscription_status` |
|---|---|
| `activa` | `active` |
| `por_vencer` | `expiring` |
| `gracia` | `grace` |
| `restringida` | `restricted` |
| `suspendida` | `suspended` |

**El contrato es el inglés.** La correspondencia es uno a uno y la traducción vive en
`supabase/functions/_shared/contrato.ts`, escrita como `Record<Nivel, EstadoProducto>`:
si mañana se agrega un sexto nivel a §4, eso deja de compilar hasta que alguien decida su
traducción. No hay forma de agregar un nivel y olvidarse del borde.

> ⚠️ **Un valor desconocido se rechaza de NUESTRO lado, antes de la llamada.**
>
> El otro lado responde 400 y lista los válidos, pero **no se depende de ese 400**. Con
> fail-open (§5), un valor que ellos no reconozcan probablemente se lea como `activa`: una
> suspensión se convertiría en silencio en "todo bien" —el sistema no fallaría, solo
> dejaría de cobrar— y nadie se enteraría hasta notar que un moroso sigue operando normal.
>
> Un error del que depende la corrección tiene que ser nuestro. Su 400 es la segunda red.
>
> Que sea un CHECK y no un enum tiene una consecuencia: la lista puede cambiar del otro
> lado sin que ningún `ALTER TYPE` nos avise. Por eso los cinco valores están fijados en
> un test que los compara contra la lista escrita a mano del contrato, no derivada del
> código.

### Las tres columnas

- `subscription_status` `text` not null default `'active'`
- `subscription_message` `text` nullable — texto que se escribe desde el panel
- `subscription_updated_at` `timestamptz`

**`subscription_updated_at` significa "cuándo CAMBIÓ el estado", no "cuándo se llamó".**
Re-aplicar el mismo estado no mueve el timestamp. Eso es lo que permite contar desde
cuándo corre la gracia: si cada reintento del outbox lo pisara, el contador se
reiniciaría solo y nunca se sabría hace cuánto que un cliente está vencido.

Si hiciera falta registrar cada llamada —para auditar reintentos— eso va en
`banderas_pendientes`, de este lado, que ya existe y para eso está.

**`subscription_updated_at` se DEVUELVE pero no se GUARDA**, y las dos mitades son
deliberadas:

- **No se guarda** porque los días de gracia se cuentan contra nuestro `proximo_cobro`
  (§4), que es el dato del contrato. Duplicar el reloj del otro sistema sería estado que
  hay que mantener sincronizado sin que nadie lo consulte.
- **Se devuelve** porque sin él la idempotencia solo se puede creer, no comprobar.
  `changed:false` es un booleano que calcula el otro lado; dos llamadas con el **mismo
  timestamp** son la evidencia de que efectivamente no se movió nada. Salió de la prueba
  en vivo del 13/08/2026, donde no devolverlo dejó ese paso sin verificar: las dos
  llamadas idénticas dieron `changed:true` y `changed:false` como se esperaba, pero el
  timestamp no era observable desde este lado.

#### El largo del mensaje lo pone G-Centro: 280 caracteres

`subscription_message` es `text` sin límite y **G-Vento no lo valida**. Que no haya límite
técnico no significa que cualquier largo sirva: el campo se renderiza en un banner encima
de la pantalla de venta, en una tablet apaisada detrás de un mostrador.

- Es el techo natural de **dos frases**. Más que eso ya no es un aviso de cobranza, es una
  carta — y un banner persistente que nadie termina de leer deja de comunicar y pasa a ser
  ruido que se aprende a ignorar. Justo cuando §6 dice que el mensaje es *la palanca real*.
- Entra en dos o tres renglones sin empujar la venta hacia abajo. Un banner que tapa el
  flujo de trabajo se vuelve un problema del cliente, no presión de cobranza.
- **El límite tiene que existir de este lado porque del otro no existe.** Un `text` sin
  límite escrito desde un panel es donde alguien termina pegando un hilo de correo entero,
  y el que lo ve es el cajero del bar.

Es un número de producto y se puede mover. Lo que no se puede es no tenerlo. Vive en
`MENSAJE_MAX`, y `''` y `null` colapsan los dos a `null`: un string vacío del otro lado
renderiza un banner en blanco, un rectángulo de color sin texto, que es peor que nada.

**RLS:** legible por los miembros de la organización. Escribible por nadie. Solo la Edge
Function `aplicar-estado`, con service role, puede tocarla. Los usuarios del cliente no
deben poder actualizar su propio estado — es exactamente la clase de escalada de
privilegios que ya se cerró allá.

### La escalera

| Nivel | Comportamiento del POS |
|---|---|
| `activa` | Nada. |
| `por_vencer` | Aviso descartable. |
| `gracia` | Banner persistente arriba. Todo funciona. |
| `restringida` | Banner + se bloquean módulos administrativos: reportes, configuración, gestión de usuarios. |
| `suspendida` | Banner permanente + los mismos bloqueos administrativos. |

**Nunca se bloquea, en ningún nivel:** vender, cobrar, imprimir, facturar a la DIAN,
abrir o cerrar un turno, y exportar.

La facturación electrónica es una obligación legal del cliente. Meterse en el medio de
eso la convierte en un problema legal de Giiron.

#### Por qué `suspendida` ya no bloquea la apertura de turnos

Era el diseño original y estaba mal, por dos razones que solo se ven conociendo el flujo
del POS:

- **Vender exige turno abierto.** Bloquear la apertura ES bloquear la venta — con el
  agravante de que el golpe llega con un día de retraso y cae a la mañana, con el local
  abriendo y clientes esperando. Es exactamente el escenario que §5 (fail-open) existe
  para evitar, entrando por otra puerta.
- **Agregar ítems a una mesa NO requiere turno.** Un bar suspendido seguiría acumulando
  consumos que después no puede cobrar, porque cobrar sí necesita turno. La restricción
  no cobra: genera consumo incobrable.

#### Por qué el export no se bloquea nunca

En el POS es **un solo botón** que es a la vez "exportación masiva" y "exportar los
propios datos". Separarlos exigiría un criterio arbitrario sobre cuántas filas son
"masivas", y equivocarse hacia el lado restrictivo significa impedirle a un cliente
sacar sus propios datos — que es justo lo que la lista de nunca-bloquear protege.

#### Consecuencia: la escalera tiene menos escalones de los que se diseñó

Con estos ajustes, **`restringida` y `suspendida` quedan casi idénticas en efecto real**:
las dos muestran banner y bloquean lo administrativo. La diferencia práctica es el tono
del mensaje, no la capacidad.

No se disimula ni se inventa un bloqueo nuevo para diferenciarlas. La palanca real de
cobranza en los niveles altos **es el mensaje del banner**, y conviene tratarlo como tal:
es el campo que hay que poder escribir bien desde el panel, no un adorno de la fila.

Si en algún momento hace falta un escalón que muerda de verdad, se diseña con el mismo
criterio de esta sección —qué deja de funcionar y a quién le llega el golpe— y no
agregando un bloqueo porque la tabla tenga un renglón vacío.

#### A escala, las plantillas del mensaje dejan de ser una comodidad

Si el mensaje del banner es la palanca de cobranza, escribirlo a mano es el cuello de
botella de la cobranza entera. Con dos clientes se redacta cada uno; **con cincuenta no se
redacta ninguno**, y lo que pasa entonces no es que se escriban mensajes apurados: es que
se deja de cambiar el nivel para no tener que escribirlo, y la palanca se apaga sola.

Por eso las plantillas por nivel son **requisito, no adorno**, y por eso el editor tiene
que dejar personalizar sobre la plantilla en vez de obligar a elegir entre plantilla y
texto propio. El caso que hay que soportar es "la de siempre, más una frase para este
cliente" — que es como se escribe una cobranza de verdad.

### Gating solo en la UI

No en RLS, no en triggers.

El bien protegido acá es la cobranza, no los datos. Un falso positivo en una política de
base de datos es un bar que no puede vender a las tres de la mañana, sin nadie de
Giiron despierto para destrabarlo. Un cliente moroso que abre
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
- Tailwind, con **tokens semánticos propios** (`tailwind.config.js` + `src/lib/tokens.ts`).
- lucide para íconos.
- Zustand · React Query · Zod en los bordes · date-fns.
- Supabase: Postgres + Auth + Edge Functions.
- Repo único, `src/` normal. Sin monorepo.

### Diseño de instrumento, no ausencia de diseño

> **Esta sección decía "sin design system propio" y "se puede recortar sin culpa:
> responsive, estados de carga, animaciones. Tablas y formularios."** Se escribió cuando
> el supuesto era **un solo usuario técnico, el que construyó el sistema**. Ese supuesto
> cambió: son varios operadores, no se puede asumir que conocen el sistema por dentro, y
> alguien va a abrir esta pantalla todos los días.

Un tablero de avión es denso, sin animaciones y feo para un turista — y está diseñadísimo.
Ese es el objetivo. **Que abrirla todos los días no sea un castigo.**

#### Innegociable

Lo que sigue no se relaja, y una sugerencia de diseño que lo contradiga se rechaza sin
discutir el mérito estético:

1. **Densidad sobre respiro.** Es una herramienta de trabajo, no un tablero de métricas.
   **Si un cambio hace que quepan menos filas en pantalla, no se hace.** Es la prueba
   concreta, no una intención: la migración a tokens se midió y pasó de 23 a 24 filas
   visibles en 1080p.
2. **Sin animaciones decorativas.** Transiciones sólo donde eviten un salto que confunda.
3. **El agrupamiento de tres bloques** (contrato · G-Centro · G-Vento) y los **tres
   estados de bandera** nombrados distinto. Son §5 hecho pantalla.
4. **Nada que priorice verse bien sobre leerse rápido.**
5. **Solo escritorio.** Se usa sentado, con teclado y monitor. Los blancos táctiles
   chicos son una decisión, no un defecto.

#### Las dos reglas de color

1. **Un solo color por fila**, en la columna «Atención». Si el estado y la bandera también
   se tiñeran, la fila sería un semáforo y nada saltaría.
2. **`activa` no lleva color.** Lo normal es la ausencia de color. Pintar lo que está bien
   obliga al ojo a leer todas las filas para descartarlas.

Si algo presiona contra estas dos, ganan ellas.

#### Los tokens son semánticos y están medidos

`senal-critico`, no `red-400`. Un nombre de color sobrevive a un cambio de paleta
**convirtiéndose en mentira**: `text-red-400` en una fila que ya no es crítica sigue
compilando.

**Todo token de texto pasa 4.5:1 contra los cuatro fondos**, verificado por cálculo y no
a ojo. No existe la categoría "solo decorativo": esa fue exactamente la causa del defecto
del 16/08, cuando la nota al pie que explicaba el concepto central de §5 quedó a 2.66:1.
Si un token existe, se puede escribir texto con él; lo decorativo vive en `lienzo`, y usar
un color de lienzo para texto se ve mal en el código, que es el punto.

**El peso de "son dos sistemas" está en el divisor de 2px** (3.52:1, cumple WCAG 1.4.11
como elemento no textual portador de significado) **y en el encabezado del grupo**. La
diferencia de fondo entre bloques es 1.03:1 — imperceptible a propósito: es refuerzo, y
puede desaparecer en un monitor mal calibrado sin que se pierda nada.

#### Lo que sigue siendo recortable sin culpa

Responsive más allá de que no se rompa. Ilustración, ornamento, microinteracciones,
pantallas de bienvenida, tours. Cualquier cosa cuyo beneficio sea que se vea moderna.

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

**Y también las claves que cruzan un límite.** El filtro no distingue de dónde viene una
clave, así que el contrato con G-Vento (§6) entra a la misma tabla en su propio idioma:
`organization_id` sobrevive por forma de UUID —igual que `organizacion_externa_id`, del
que es el mismo dato— y `message` va filtrado en los dos idiomas, porque es prosa que un
admin escribe sobre un cliente concreto. Un error de sincronización es justo el momento
en que más tienta loguear el objeto entero.

La firma HMAC y el secreto están además en la **deny-list**, que bajo allowlist es
redundante. Se paga esa redundancia porque son lo único acá cuyo escape no sería un
problema de privacidad sino de seguridad, y porque ataja el día que alguien agregue
`x-gcentro-signature` al allowlist "para ver por qué da 401".

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

> ### ⚠️ PENDIENTE — el backup NO está montado
>
> Esto es una **acción sin hacer**, no una descripción de lo que hay. Estuvo redactado en
> presente —"sumar esta base al ciclo de backup nocturno"— y se leía como si ya existiera;
> un documento que describe una intención con la misma voz que un hecho es exactamente lo
> que lleva a descubrir el problema el día que hace falta el respaldo.
>
> **Falta: sumar esta base al ciclo de backup nocturno ya montado, y verificar una
> restauración.** Un backup que nunca se restauró no se sabe si es un backup.
>
> El volumen no es el argumento: los datos son pocos y van a seguir siendo pocos aun con
> cincuenta clientes. El argumento es que son **irreemplazables**. Si se pierde el
> histórico de pagos no hay forma de reconstruir quién debe qué — no está en ningún otro
> lado, ni siquiera en G-Vento, que no sabe nada de plata.

---

## 9. Decisiones

### 9.1 IVA — RESUELTA

**El catálogo guarda base gravable; el pago guarda las tres cifras.**

- `planes.precio_mensual` y `planes.precio_sede_adicional`: **base gravable, SIN IVA.**
- `suscripciones.precio_base_mensual` y `suscripciones.precio_sede_adicional`
  (congelados al firmar): **sin IVA**, misma convención que el catálogo.
- `pagos.monto`: **total recibido** — lo que entró a la cuenta.
- `pagos.monto_base` `integer` y `pagos.iva_pct` `smallint`: base y tasa de ese pago.

**HOY NO HAY IVA. Giiron no es responsable de IVA**, así que en toda fila:

```
iva_pct    = 0
monto_base = monto
```

Las dos columnas **se quedan igual**, y no es indecisión: el día que se cruce el umbral
de responsabilidad, los pagos viejos tienen que seguir explicándose con la tasa que
tenían —que es 0— y los nuevos con la suya. Por eso la tasa va por fila y no en una
constante de la aplicación. Agregar las columnas ese día obligaría a decidir qué poner
en el histórico, y la respuesta correcta ya está guardada desde ahora.

El catálogo razona en base gravable porque es el número del que se negocia y sobre el
que se aplica el descuento por término. El pago razona en total recibido porque es lo
que hay que cuadrar contra el extracto bancario. Hoy los dos números coinciden; la
distinción se mantiene porque el día que dejen de coincidir no se puede reconstruir
hacia atrás.

`descuento_pct` no se ve afectado: es un porcentaje sobre la base, y la base ya está
definida sin IVA.

### 9.2 Cobro anticipado — RESUELTA

**Anual = doce meses cobrados por adelantado**, con el descuento del término aplicado.
`cubre_hasta` es entonces el último día del año pagado, y el período de la suscripción
abarca los doce meses completos.

De ahí sale la regla de la implementación (§9.3) y la de cambio de plan (§4): si los
doce meses ya entraron a la cuenta, lo que queda por consumir es un saldo real, no una
promesa de pago.

### 9.3 Implementación exonerada — RESUELTA

`estado_implementacion` tiene **cuatro** valores, no tres:

`pendiente` · `cobrada` · `exonerada_condicional` · `exonerada`

La implementación se regala a cambio de permanencia, y hasta que la permanencia se
cumpla el regalo no está confirmado:

| Situación | Estado |
|---|---|
| Firma con plan anual | `exonerada_condicional` |
| Completa doce meses de servicio anual | `exonerada` — firme, ya no se reclama |
| Cambia a un término menor antes del año | `pendiente` — se vuelve exigible |
| **Cancela** | **sin cambio — NO se vuelve exigible** |

**Cancelar no la hace exigible** y esa es la parte que más se discute: los doce meses ya
se pagaron por adelantado. El cliente cumplió su parte y se va antes de consumirla;
cobrarle la implementación ahí sería cobrarle dos veces por irse.

Implementado en `transicionImplementacion()` (`src/lib/cobro.ts`), con los estados
terminales (`cobrada`, `exonerada`) blindados contra cualquier evento.

### 9.4 `organizacion_externa_id` — RESUELTA

El producto tiene tabla de organizaciones con ids estables, y las tres organizaciones
(G-10, Salchimelo y LAB) ya son filas ahí. Cargados en `007`.

Son estables porque nada en esa app reescribe la tabla, el onboarding reutiliza el id si
el nombre ya existe, y le están agregando un unique al nombre.

**Se guarda SIEMPRE el UUID, nunca el nombre.** El nombre es texto editable: guardarlo
convertiría un renombre cosmético del otro lado en una suscripción huérfana de este.

### 9.5 El contrato del puente — RESUELTA

Llegó completo: URL, los cinco valores de `subscription_status`, el esquema de firma y
los códigos de respuesta. Documentado en §5 y §6, implementado en
`supabase/functions/`, cargado en la migración `008`.

El secreto HMAC va por variable de entorno de la Edge Function (`GVENTO_HMAC_SECRETO`),
nunca en el repo ni en el bundle.

### 9.6 El camino real — CORRIDO (13/08/2026)

El circuito se ejercitó contra LAB de punta a punta. Tres llamadas, tres 200, `intentos:1`
en las tres: el HMAC cerró a la primera contra la `aplicar-estado` real, no contra el
doble. `changed` dio `true` / `false` / `true` como se esperaba, y las tres filas quedaron
con `confirmado_en` lleno y `bandera_error_codigo` en null.

De ahí salieron `cambio_efectivo` (009), la propagación de `subscription_updated_at`, y
las dos observaciones de §5 sobre el arranque en frío y el crecimiento de la cola.

**Todavía sin correr en vivo:** los caminos de error (400 por valor inválido, 422 por
suscripción sin `organizacion_externa_id`). Están probados contra el doble.

### 9.8 El comprobante no se guarda — DECISIÓN, no olvido

**El respaldo del pago vive en WhatsApp y en el extracto bancario.** En G-Centro quedan
`referencia` y `nota`, texto, y nada más. **No se agrega Storage.**

No es una función postergada:

- **Los dos respaldos que importan ya existen y son mejores.** El extracto bancario es
  prueba ante terceros; una imagen subida a nuestro Storage no lo es. Y el chat de
  WhatsApp tiene el contexto completo —quién mandó qué y cuándo— que un archivo suelto
  pierde.
- **Guardar comprobantes cambia la clase de dato que maneja el panel.** Una captura de
  transferencia trae nombre, banco, número de cuenta y a veces cédula. Hoy toda la PII
  del sistema está en columnas conocidas y el filtro de §7 las cubre por clave; un blob
  no se puede allowlistear.
- **La referencia alcanza para conciliar.** Que es la única pregunta que este panel
  necesita contestar sobre un pago.

Si algún día hace falta —una disputa, una auditoría—, lo que se agrega es un enlace al
mensaje, no una copia del archivo.

### 9.7 Pendientes

1. **El barrido en diferido.** Hoy los tres intentos son en línea, dentro de la llamada
   del panel. Una fila que queda sin `confirmado_en` porque G-Vento estaba caído no se
   vuelve a intentar sola. Según §5 eso **ya no es aceptable en la dirección de
   desescalada**: una bandera menos restrictiva que lo aplicado tiene que reintentarse
   sola, porque mientras no llegue hay un cliente al día pagando el banner. Falta el
   barrido periódico; el índice parcial de `banderas_pendientes` ya está para eso.
2. **La UI.** El nivel se deriva y se envía, y la lista existe, pero el botón de confirmar
   —con estado de carga, ver §5—, la cola de pendientes y el editor del mensaje del banner
   —que según §6 es la palanca real de cobranza— siguen pendientes.
3. **Desactivar admins en vez de borrarlos.** Hoy revocar un acceso es borrar la fila, y
   con `on delete set null` eso borra la autoría de todo lo que esa persona hizo (§3).
   Falta un `desactivado_en` en `admins` y que `es_admin()` lo exija en null. Toca la
   función que sostiene toda la RLS, así que no se hizo de paso.
4. ~~El `motivo` de un cambio de estado.~~ **RESUELTO en `013`**:
   `cambiar_estado_suscripcion(id, estado, motivo)` lo pasa por un GUC de transacción que
   el trigger lee. El trigger sigue siendo la garantía — un UPDATE directo escribe el
   evento igual, con `motivo` en NULL, y la emergencia sigue funcionando.
5. **`RESTRINGIDA` en el enum de `suscripcion_eventos`** pertenece al vocabulario de
   gating, no al comercial, así que el trigger nunca lo emite. Decidir si se registra
   cuando se aplica una bandera o si sale del enum.
