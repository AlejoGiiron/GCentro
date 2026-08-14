# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Operadores de cobranza de Giiron.** Varias personas, no una: el panel es el lugar
donde Giiron centraliza los cobros de todos sus productos. Alejandro lo diseñó y lo
construyó, pero **no se puede asumir que quien lo abre conoce el sistema por dentro.**

Dos ritmos de uso confirmados, y son distintos:

- **Vistazo diario.** Sesión corta y repetida. La pregunta es "¿hay algo que necesite
  atención hoy?".
- **Tanda mensual de facturación.** Sesión larga. La pregunta es "¿recorrí todo lo que
  vence sin saltearme ninguno?".

El acceso es allowlist explícita (tabla `admins`) con TOTP obligatorio. Nadie entra por
registrarse.

## Product Purpose

G-Centro administra las suscripciones que los clientes de Giiron pagan por sus productos
—hoy G-Vento (POS), con G-Mura y G-Quota previstos— y **empuja hacia cada producto la
"bandera": el nivel de restricción que ese cliente debe ver**.

Éxito es que Giiron cobre a tiempo sin que la cobranza le rompa la operación al cliente,
y que nunca haya duda sobre si una decisión tomada acá llegó realmente al producto.

## Positioning

No es un producto de mercado: es infraestructura interna de Giiron. Lo que lo define
frente a "una planilla" es una propiedad que una planilla no puede tener: **G-Centro
escribe en la base de producción de los clientes, y todo el diseño existe para que esa
escritura sea segura, auditable y reversible.**

La separación es deliberada y estructural: G-Centro y G-Vento son repos y proyectos de
Supabase distintos, no comparten base, y el puente entre ellos es una sola columna
escrita por una Edge Function con firma HMAC. G-Vento nunca consulta a G-Centro.

## Operating Context

**El otro extremo de este panel es un mostrador.** La bandera que se decide acá aparece
como un banner en la pantalla de venta de un bar o un restaurante, en vivo, mientras hay
clientes esperando. Esa asimetría manda sobre casi todas las decisiones: un falso
positivo acá es un negocio que no puede operar.

- Los productos siguen funcionando aunque G-Centro esté caído (**fail-open**).
- Nunca se bloquea: vender, cobrar, imprimir, facturar a la DIAN, abrir o cerrar turno,
  ni exportar los propios datos.
- La cobranza opera en Colombia, en pesos, sobre negocios chicos que el operador todavía
  puede conocer por el nombre.
- Existe un tenant de laboratorio (LAB, `es_prueba = true`) para ejercitar el circuito
  completo sin tocar a un cliente que paga. Toda prueba en vivo va contra LAB.

## Capabilities and Constraints

**Confirmado:**

- Catálogo (productos, planes, términos), clientes, suscripciones, pagos manuales,
  eventos de suscripción y la cola de banderas.
- Modelo de cambio de plan a mitad de período: la plata pagada conserva su valor, el
  período no se reinicia, nunca se devuelve dinero.
- El puente hacia G-Vento: derivación del nivel, traducción al vocabulario del producto,
  firma HMAC, outbox con reintentos. **Verificado en vivo el 13 y 14/08/2026.**
- Terminología: español de Colombia. **COP en pesos enteros, sin centavos** — un monto
  con decimales sería una precisión que no existe. Fechas de cobro son días de
  calendario, no instantes.
- Los estados comerciales (`activa`/`gracia`/`suspendida`/`cancelada`) y los niveles de
  restricción (`activa`/`por_vencer`/`gracia`/`restringida`/`suspendida`) son **dos
  vocabularios distintos** que es fácil confundir.

**Restricciones duras:**

- Deny-by-default en toda la base: sin fila en `admins` no se lee absolutamente nada.
- El navegador nunca toca el secreto HMAC.
- Ningún dato de cliente sale hacia el reporte de errores: el filtro es allowlist por
  clave y el modo de fallo es opacidad, nunca fuga.
- Fuera de alcance por decisión, no por falta de tiempo: métricas y gráficos, pasarela
  de pagos, facturación electrónica propia, portal del cliente.

**Abierto, sin decidir:**

- **No se registra QUIÉN ejecutó cada acción.** Ninguna tabla tiene actor: ni
  `suscripcion_eventos`, ni `pagos`, ni `banderas_pendientes`. Con un solo operador era
  un detalle; con varios es un hueco — "¿quién suspendió a este cliente?" hoy no tiene
  respuesta.
- **Escala.** El diseño vigente justifica varias decisiones con "son dos clientes y los
  conocés por el nombre". El objetivo confirmado es **50 o más**. Lo que asume conocer a
  cada cliente de memoria hay que revisarlo.
- Reintento en diferido de la cola de banderas: hoy los intentos son en línea y una fila
  que falla espera a que alguien la reintente a mano.
- Los precios de lista de `planes` están sin cargar.

## Brand Commitments

**Confirmado que no hay ninguno.** No existe logo, paleta ni tipografía de Giiron que el
panel deba respetar, y no hay que heredar la identidad de G-Vento. Es una herramienta
interna. No inventar una marca ni atribuirle una a Giiron.

## Evidence on Hand

Real, cargado y verificable:

- Dos clientes que pagan (G-10, Salchimelo) con precios negociados reales, más el tenant
  LAB. Ninguno es un fixture.
- El circuito completo de la bandera corrió contra la `aplicar-estado` real de G-Vento:
  200 a la primera, idempotencia comprobada con el mismo `subscription_updated_at` en dos
  llamadas idénticas.
- `docs/g-centro-diseno-v1.md` es la fuente de verdad del sistema y está sincronizado con
  el código. `CLAUDE.md` lleva las reglas permanentes de trabajo.

Ausencias que no se deben rellenar inventando: no hay logo, ni copy de marketing, ni
clientes de referencia publicables, ni benchmarks, ni precios públicos.

## Product Principles

1. **Nada escala solo.** El sistema calcula y sugiere; una persona confirma. Ninguna
   restricción se aplica a un cliente por el paso del tiempo.
2. **Fail-open, sin excepciones.** Ante duda, ausencia o falla, el producto del cliente
   sigue funcionando. Una restricción solo existe si se escribió explícitamente.
3. **Lo que decidimos acá y lo que el producto confirmó son dos hechos separados**, y se
   muestran separados. Fusionarlos borra la única pregunta que importa cuando algo falla:
   "¿llegó o no llegó?".
4. **El modo de fallo tiene que ser ruidoso.** Entre "aparece algo que no debería" y "no
   aparece y nadie se entera", siempre lo primero.
5. **La cobranza no puede convertirse en el problema legal ni operativo del cliente.**
   Presionar por el pago sí; impedirle vender o facturar, nunca.
