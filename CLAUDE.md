# G-Centro — contexto del proyecto

Panel de control de suscripciones. Repo propio, proyecto de Supabase propio.
No comparte código ni base con G-Vento.

---

## Reglas permanentes

Estas no se renegocian por prompt. Si algo de una tarea puntual las contradice,
avisá antes de proceder.

### 1. El documento manda

**`docs/g-centro-diseno-v1.md` es la fuente de verdad.** Leerlo antes de tocar
esquema, estados o modelo de datos.

Si el código termina contradiciendo el documento, **se actualiza el documento en
el mismo commit** que introduce el cambio. Un documento que quedó atrás del repo
es peor que no tener documento: se sigue leyendo y ya miente.

**Es el ÚNICO `.md` de `docs/` que es fuente de verdad.** Si aparece otro
—planilla de trabajo, borrador, tabla que alguien llenó a mano en una
conversación—, **no** es fuente de verdad: puede tener números viejos, preguntas
sin responder o decisiones que se revirtieron. No derives nada de ahí y no lo
uses para "corregir" el documento de diseño. **Preguntá.**

Pasó una vez: `docs/g-centro-planes-de-cobro.md` tenía precios de lista distintos
a los del esquema y una regla de redondeo que ya se había descartado. Si se
hubiera tomado como fuente, el catálogo salía con los precios equivocados.

Cuando el contenido de una planilla así ya esté fusionado acá, se borra. No se
deja "por las dudas": una segunda copia con números viejos es exactamente el
problema que la regla evita.

### 2. Este hilo NUNCA toca otro repo

**Solo se trabaja sobre G-Centro.** No se abre, no se lee y no se modifica
ningún otro repo — G-Vento incluido, y tampoco para comparar, diagnosticar o
copiar una implementación.

**No hay versión con permiso.** No es una regla sobre riesgo de producción que
un "dale, tocalo" pueda levantar: es una regla sobre el alcance de este hilo.
Si algo de otro repo hace falta, **se pide y el humano lo consigue**.

Si encontrás algo roto allá: **reportás y parás.** El reporte se lo pasa el
humano al hilo de ese repo, que decide y aplica en su propio contexto.

El motivo no es solo la separación: cuando un repo copia de otro a ciegas, se
lleva las decisiones que no le corresponden. Derivar cada lista del esquema
propio es lo que destapa los agujeros — pasó con el filtro de Sentry, donde
copiar la lista de claves habría dejado `razon_social` y `nit` fugando.

### 3. Tipos de Supabase: generados, nunca a mano

`supabase gen types typescript` o nada. Escribirlos a mano produce tipos que
compilan y mienten — en G-Vento eso costó 129 errores de una sola vez cuando la
base y los tipos se desincronizaron.

**Deuda saldada.** El proyecto está linkeado y `src/types/database.types.ts`
sale de `supabase gen types typescript --linked`. Cubre las nueve tablas y las
dos vistas. **Después de cada migración aplicada, regenerarlo** — un tipo que
quedó atrás de la base es la misma clase de mentira que uno escrito a mano.

### 4. No se reporta un bloque como completo sin correr el camino real

Un smoke test con credenciales placeholder **no es verificación**. Que el bundle
transforme y que `tsc` pase no dice nada sobre si el login funciona, si la
policy deniega, o si el trigger dispara.

- `tsc` no prueba el SQL. RLS, triggers y vistas se verifican ejecutando contra
  la base con datos reales.
- Si no se pudo ejecutar el camino real, **el reporte lo dice explícitamente**
  y nombra qué quedó sin verificar. No se redacta como si estuviera probado.

**Testear la unidad equivocada es indistinguible de no testear.** Pasó el
14/08/2026: el documento afirmaba que ninguna entrada inválida escribe en
`banderas_pendientes`, había 416 tests, y era falso. `enviar.test.ts` probaba
que `enviarBandera` falla antes de tocar la red —cierto e irrelevante: el
insert estaba en el handler—. Una afirmación sobre el ORDEN de dos operaciones
solo se puede probar donde ocurren las dos.

Corolario: **lo que no se puede correr en un test no lleva decisiones adentro.**
`supabase/functions/*/index.ts` son adaptadores de Deno; la lógica va en
`_shared/`, que corre en vitest.

**Un componente que nunca se renderiza en un test no está probado.** Pasó el
16/08/2026: la app reventaba al cargar el 100% de las veces —`NavLink` fuera
del `Router`— con 513 tests en verde y typecheck, lint y build limpios.
Ninguno montaba un componente. Hay un humo mínimo en
`src/features/panel/Panel.test.tsx` (`renderToString` sobre `jsdom`); toda
pantalla nueva que dependa de un contexto —router, provider— suma el suyo.

**Y el test tiene que fallar sin el arreglo.** El primer intento de ese mismo
test pasaba con y sin el bug: la regresión se probó introduciéndola a mano.
Si un test no se vio fallar, no se sabe qué prueba.

**Una verificación que no pasa por el CAMINO REAL DEL USUARIO no verifica
el camino real del usuario, por más que toque la base de producción.**

El puente se verificó cinco veces contra la base real, con `curl`. Ninguna
de esas veces pasó por donde pasa un operador, y por eso nadie vio que el
handler no respondía al preflight CORS: **el botón de confirmar la bandera
nunca pudo funcionar desde un navegador**, ni en local ni en producción.
Curl no hace preflight.

En la misma pasada, un paso "verificado" desde el navegador tampoco había
ocurrido: se leyó como resultado un texto que describía un estado. La
tabla de §9.8 anota el MÉTODO de cada verificación justamente por esto —
"contra la base real" y "por el camino del usuario" son dos cosas, y sólo
la segunda prueba que la aplicación funciona.

**Cubrir por COBERTURA en vez de por MODO DE FALLO produce verde falso.** Un
`renderToString` sobre `LoginPage` daría verde sin tocar ninguno de sus modos
de fallo reales —el deadlock de `onAuthStateChange`, los factores TOTP
huérfanos—, porque los dos viven en efectos y `renderToString` no corre
efectos. Ese test no sería neutral: sería peor que no tenerlo, porque deja la
impresión de que la pantalla está probada. Es la misma familia que el test
vacuo del Router.

Antes de escribir un test, nombrar **qué modo de fallo concreto atrapa**. Si
la respuesta es "que exista", no se escribe.

**Impeccable detecta slop visual, NO accesibilidad.** Sus 58 reglas estáticas
buscan gradientes, glows, paletas de IA y jerga de marketing. Contraste,
tamaño de texto y largo de línea existen pero **necesitan el pase de
navegador**, que pide `puppeteer` y, acá, además tropieza con el login + TOTP.

**Un cero de Impeccable no es evidencia de nada.** Comprobado el 16/08/2026:
un archivo de control con `div` clickeable, `img` sin alt, input sin label y
gris sobre gris también dio cero. Si el reporte dice "sin hallazgos", verificar
con un control antes de creerle — y la accesibilidad se audita a mano igual.

### 5. Antes de decir "esto viene heredado de otro repo", verificarlo ahí

Afirmar que un bug, un patrón o una decisión viene de G-Vento (o de G-Quota, o
de donde sea) **exige abrir ese repo y confirmarlo**. Si no se puede, se dice
**"no verificado"** y se sigue.

Esto no es teórico: en el Bloque 1 se reportó un bug como "heredado de G-Vento,
idéntico" cuando en realidad se había introducido al copiar el archivo — el
visor mostraba los bytes NUL como espacios. La afirmación sin verificar mandó
al usuario a pedir un arreglo en producción que no hacía falta.

### 6. El filtro de privacidad es allowlist, y el esquema lo alimenta

**Un filtro de privacidad por deny-list no puede funcionar:** un nombre propio
es irreconocible por regex, y las columnas nuevas fugan calladas. El filtro es
**allowlist por clave**; el modo de fallo es **opacidad** (`[Filtrado:tipo]`),
nunca fuga.

No es una preferencia de implementación, es una propiedad de la categoría de
filtro. No se vuelve a deny-list "para no perder diagnóstico": la redacción
tipada conserva la forma, que es lo que hace vivible al allowlist.

**Agregar una tabla o columna al esquema obliga a agregarla a la tabla del test
de privacidad (`src/lib/sentry.test.ts`), en el mismo commit.** Si no la
agregás, el allowlist igual la redacta —ese es el punto de haberlo invertido—
pero perdés la verificación, que es el único lugar donde queda escrito qué se
consideró al diseñar el filtro.

Lo mismo vale para **las claves que cruzan un límite**: el contrato con G-Vento
va a esa tabla en su propio idioma (`organization_id`, `status`, `message`). El
filtro no sabe de dónde viene una clave.

### 7. Convención Giiron (§2 del documento)

- **Español de Colombia** en UI, dominio y base de datos.
- **COP en pesos enteros**, sin decimales. `$79.000` se guarda como `79000`
  en `integer`.
- **`snake_case`** en tablas y columnas. `PascalCase` en componentes.
  `useCamelCase` en hooks. `camelCase` en variables y funciones.
- Tipos de evento en **MAYÚSCULAS**.
- **`timestamptz` para instantes** (`creado_en`, `registrado_en`).
  **`date` para fechas de calendario** (`fecha_pago`, `cubre_desde`,
  `proximo_cobro`). No mezclarlos: un cobro es un día del calendario
  colombiano, no un instante, y tratarlo como timestamp corre los bordes de mes.
- **UUID v4** para todos los identificadores.
- Rama **`develop`**, y **`main` no existe en este repo**: `develop` es la Production
  Branch de Vercel, así que **pushear es desplegar**. No hay preview ni promoción.
- **Conventional Commits**, commits atómicos.
- **`git add` con rutas explícitas. Nunca `git add -A` ni `git add .`.**
  Un `-A` barre lo que esté sin trackear y sin ignorar, que es un estado en el
  que un repo vivo está todo el tiempo. Pasó el 14/08/2026: `.claude/` y
  `.gemini/` —6.6 MB de skills de terceros— estuvieron a un `-A` de entrar a la
  historia para siempre, y sacarlos después habría pedido reescribirla. Si el
  commit tiene tantos archivos que listarlos molesta, probablemente sean dos
  commits.

---

## Stack

React 18 · TypeScript strict · Vite · Tailwind · lucide-react ·
Zustand · React Query · Zod en los bordes · date-fns ·
Supabase (Postgres + Auth + Edge Functions) · Sentry.

Repo único, `src/` normal. Sin monorepo.

## Comandos

```
pnpm dev          # servidor de desarrollo
pnpm build        # build de producción
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test:unit    # vitest run
```

## Migraciones

Viven en `supabase/migrations/`, con el formato del CLI:
`<YYYYMMDDHHMMSS>_<NNN>_<nombre>.sql`.

El número de tres dígitos se conserva **a propósito**: el documento y el
código las referencian por número («ver `009`», «la 014») más de setenta
veces. Sin él, cada una de esas referencias obligaría a buscar la fecha.

- Cada cambio de esquema va en un **archivo nuevo**.
- **Nunca editar una migración ya aplicada.** Ya no hay excepción: la
  inicial está aplicada desde el 05/08.
- Después de aplicar, **regenerar los tipos** (regla 3).
- Toda migración lleva su **bloque de verificación en transacción**. No es
  ceremonia: el 16/08 la `013` falló al aplicarse y destapó que el motivo
  se derramaba al siguiente cambio de la misma transacción.

`supabase/verificar-rls.sql` **no es una migración** y por eso queda fuera
de `migrations/`: es un script de verificación que se corre a mano después
de cualquier cambio de policies, y prueba que sin fila en `admins` no se
lee nada.

## Duplicación deliberada

`src/lib/sentry.ts` comparte diseño con el módulo equivalente de G-Vento, pero
**los dos repos no se tocan entre sí** (regla 2). La sincronización es por
**traspaso entre hilos**: un cambio de diseño acá produce un reporte que el
humano le pasa al otro hilo, que decide y aplica en su propio repo.

Se transfiere el **diseño** del filtro y el **método** de test.
No se transfiere la lista de columnas ni el allowlist de claves: cada repo los
deriva de SU esquema. Está declarado en el encabezado del propio archivo.

## Estado

**Bloques 1 y 2 cerrados. Bloque 3 (la bandera): código completo, sin desplegar.**

Hecho: scaffold; catálogo y `admins`; RLS deny-by-default vía `es_admin()`;
auth email + TOTP obligatorio; Sentry con filtro allowlist; las cinco tablas de
negocio; modelo de cobro y de cambio de plan (`src/lib/cobro.ts`); LAB y las
vistas `*_cobrables`; el puente hacia G-Vento (`supabase/functions/`) con
derivación del nivel, traducción, firma HMAC, outbox y reintentos.

**El camino real corrió (13/08/2026).** Tres llamadas contra LAB, tres 200,
`intentos:1` en las tres: el HMAC cerró a la primera contra la `aplicar-estado`
real. De ahí salieron `cambio_efectivo` (009) y la propagación de
`subscription_updated_at`.

Pendiente de Alejandro: aplicar `009` y regenerar los tipos.

⚠️ Sin correr en vivo todavía: los **caminos de error** (400 por valor
inválido, 422 por suscripción sin `organizacion_externa_id`). Solo probados
contra el doble.

**Toda prueba en vivo va contra LAB** (`f4fa692d-6cf3-43fb-a17f-18b8b163c918`),
nunca contra G-10 ni Salchimelo: una prueba les pondría un banner de cobranza
en la pantalla de venta, en vivo, en el mostrador.

Sin cargar: los precios de `planes` (falta el número del contador).

Fuera de alcance hasta nuevo aviso: toda la UI. El panel no tiene pantallas
todavía — la bandera se deriva y se envía, pero no hay botón.
