# Módulo Integraciones — Arquitectura

> **Consultar junto con [`ARCHITECTURE.md`](../ARCHITECTURE.md)** (§2 ubica Integraciones en la
> *Capa de Infraestructura y Transversal*, junto a Automatizaciones) y
> [`MODULO-AUTOMATIZACIONES.md`](MODULO-AUTOMATIZACIONES.md), con el que comparte el bus de eventos.
>
> **Estado (2026-09-09): MÓDULO COMPLETO — F1 (el marco), F2 (conexión y ciclo de vida) y
> F3 (tráfico, reintentos y entrantes) implementadas y verificadas.**
>
> **No hay ninguna integración concreta, y no debe haberla hasta que se pida.** Lo implementado es
> el *marco* completo: 25 puertos en 8 categorías con su contrato, el registro (hoja sin
> dependencias), la taxonomía de errores, los estados de salud, la redacción de logs, el asistente de
> conexión, la **consola de tráfico** con reintentos e idempotencia y los **entrantes** traducidos a
> eventos de dominio — más **tres puertos ya cableados al núcleo** (`payments.fee`,
> `invoicing.issue`, `shipping.track`).
> Lo único que hay en `providers/` es un **doble de prueba** (`_demo.js`), que no habla con ningún
> servicio. Conectar uno real es escribir **un adaptador y su contrato**, sin tocar ningún módulo.

---

## 1. Objetivo y alcance

Integraciones es la capa que **conecta el panel con servicios externos sin que el núcleo los
conozca**. No es dueña de ningún dato de negocio: traduce entre el modelo del panel y el de afuera,
y se hace cargo de todo lo feo que eso implica — credenciales, reintentos, timeouts, formatos ajenos,
fallas que no controlamos.

### 1.1 ⭐ La regla que define el módulo

> **Integraciones no agrega capacidades: reemplaza el proveedor de una capacidad que el panel ya
> tiene.**

Cada capacidad conectable existe hoy como una **simulación local dentro del módulo dueño**. Emitir
una factura, cobrar, despachar, mandar un email: el panel ya hace las cinco cosas, simuladas. Un
puerto no inventa una función nueva, **le cambia el fondo** a una que ya funciona.

Tres consecuencias que se aplican en todo el módulo:

1. **Desconectar una integración nunca rompe el panel.** Al desconectar, la capacidad vuelve a su
   implementación local. Si desconectar rompiera algo, el acoplamiento existiría igual y sólo lo
   estaríamos escondiendo.
2. **Conectar una integración no cambia el modelo de dominio.** Una factura sigue siendo un
   `Document` del módulo Facturación, con o sin AFIP real detrás. Lo externo entra traducido, nunca
   crudo.
3. **El núcleo no nombra proveedores.** Ningún `api/` menciona "MercadoPago" ni "Andreani". Cuando lo
   hace, es un bug de acoplamiento — y hoy hay uno, ver §1.2.

Es el mismo criterio que ordenó Automatizaciones ("una automatización no puede hacer nada que un
usuario no pueda hacer a mano") aplicado a la frontera del sistema.

### 1.2 ⭐ El problema real: hoy lo externo está simulado *adentro* del núcleo

No partimos de cero. El panel ya tiene cinco puntos donde un servicio externo está simulado dentro
del módulo que lo usa. Esos puntos **son** los primeros puertos, y hay que sacarlos de ahí sin
cambiar cómo se comporta el panel:

| Categoría | Qué está simulado hoy | Dónde exactamente |
|---|---|---|
| **Facturación** | El CAE se genera localmente con un hash del número + fecha | `facturacion/lib/fiscal.js` → `simulateCae()` |
| **Pagos** | No hay cobro: el pago se confirma a mano, y la comisión de pasarela se calcula con una tabla local | `pedidosApi.confirmPayment` · `financeApi.gatewayRateFor` |
| **Logística** | El código de seguimiento se arma como `{prefijo}-{8 dígitos}` al despachar; los eventos de tracking se cargan a mano | `logisticaApi.dispatchShipment` · `carriers.mock.js` (`trackingPrefix`) |
| **Comunicación** | Los envíos se materializan solos, con un costo simulado por mensaje | `marketingApi.ensureSends` · `marketing/lib/marketing.js` (`CHANNELS`) |
| **Analytics** | Nada externo — y por eso **faltan** el tráfico y las sesiones | `MODULO-ANALYTICS.md` §2.8 |

> **⭐ El acoplamiento que ya existe, para que se vea concreto.**
> `finanzas/data/commissions.mock.js` guarda `{ kind: "pasarela", key: "mercadopago", percent: 0.0499 }`
> y `financeApi.gatewayRateFor()` lo resuelve **matcheando por substring contra
> `order.paymentMethod`**, que es texto libre (`"MercadoPago (Visa •••• 4242)"`).
> O sea: el núcleo financiero conoce el nombre comercial de una pasarela y lo busca dentro de una
> cadena. Funciona, pero es exactamente lo que un puerto elimina: Finanzas debería preguntar *"¿qué
> comisión cobró el cobro de este pedido?"*, no *"¿el texto dice mercadopago?"*.
> **Esto no se toca en la definición; se anota como deuda que la F1 salda.**

### 1.3 ⭐ Puerto ≠ proveedor

La distinción que sostiene todo lo demás:

| | **Puerto** (`Port`) | **Proveedor** (`Provider`) |
|---|---|---|
| Qué es | Una **capacidad** que el núcleo necesita | **Quién** la cumple |
| Quién lo define | El panel | El servicio externo |
| Ejemplo | `invoicing.issue` — "emitir un comprobante fiscal" | AFIP · Facturante · TusFacturasAPP |
| Estabilidad | Cambia poco: es lenguaje de negocio | Cambia todo el tiempo |
| Quién lo nombra en el código | Los módulos | **Nadie fuera de Integraciones** |

El núcleo llama al **puerto**. Qué proveedor lo atiende es una decisión de configuración, no de
código. Cambiar de pasarela de pago tiene que ser cambiar una conexión, no editar Finanzas.

### 1.4 ⭐ Cómo se evita el acoplamiento, en las dos direcciones

El panel tiene una regla dura: **los `api/` se importan en una sola dirección, sin ciclos**. Y este
módulo, como Automatizaciones, necesita las dos direcciones. La solución es la misma que ya funcionó,
y se reutiliza a propósito en vez de inventar una segunda.

**Salida — el núcleo necesita algo de afuera:**

```
   financeApi · billingApi · logisticaApi · marketingApi
                      │
                      │  port("invoicing.issue", { fallback: simulateCae })(payload)
                      ▼
        integraciones/lib/ports.js   ← HOJA, no importa nada
                      ▲
                      │  register("invoicing.issue", adaptador)
        integracionesApi ────────────────────────────────┘
```

`ports.js` no importa nada, así que los módulos que lo importan no pueden entrar en un ciclo.

**⭐ Y el `fallback` lo pasa el módulo, no Integraciones.** Es el detalle que hace que la regla §1.1
sea estructural y no una promesa: la implementación local vive donde siempre vivió, y el registro
sólo la *sustituye* cuando hay un proveedor conectado. **Si el módulo Integraciones no existiera, el
panel funcionaría igual.**

**Entrada — afuera nos avisa algo:**

```
  webhook / polling  →  adaptador  →  traducción  →  evento de dominio  →  bus de Automatizaciones
   (payload ajeno)      (valida)     (al modelo)      (pago.acreditado)      (ya existe)
```

El núcleo **nunca ve un payload externo**. Ve un evento de dominio, del mismo catálogo que ya
escucha. **No se crea un segundo bus**: se publica en el de Automatizaciones, que ya es una hoja sin
dependencias.

### 1.5 Qué NO hace

| Sí | No (y por qué) |
|---|---|
| Puertos declarados por el panel | **Ser un iPaaS.** No hay mapeo arbitrario de campos entre sistemas cualesquiera; los puertos son cerrados |
| Adaptadores escritos como código del repo | **Ejecutar código de terceros** ni plugins cargados en runtime |
| Traducción externo ↔ dominio | **Extender el modelo de dominio.** Si un proveedor manda un campo que el panel no tiene, se descarta o se guarda en el log, no se inventa una entidad |
| Reintentos, idempotencia, backoff | **Cola distribuida real.** No hay backend: la cola vive en memoria y se documenta como tal (§2.8) |
| Declarar credenciales | **Guardar secretos.** El panel nunca persiste una clave (§2.5) |
| Webhooks entrantes traducidos | **Exponer una API pública del panel.** Integraciones consume, no publica endpoints |
| Decidir **con quién** se cumple una acción | **Decidir cuándo.** Eso es Automatizaciones (§6) |

---

## 2. El modelo

### 2.1 Puerto

```js
{
  key: "invoicing.issue",
  label: "Emitir comprobante fiscal",
  category: "facturacion",
  owner: "facturacion",              // qué módulo lo consume
  input:  { /* schema del payload de dominio */ },
  output: { /* schema de lo que el núcleo espera de vuelta */ },
  fallbackDescription: "CAE simulado localmente (facturacion/lib/fiscal.js)",
  cardinality: "one",                // un proveedor activo por vez
  sensitivity: "alta",               // toca plata / obligaciones fiscales
}
```

**`input` y `output` son del panel, no del proveedor.** Un adaptador traduce en los dos sentidos; si
un proveedor no puede cumplir el `output`, **no puede implementar ese puerto** — antes que devolver
un objeto a medias, no se conecta.

### 2.2 ⭐ El contrato de un proveedor

Los siete puntos pedidos son, literalmente, el contrato. **Un proveedor que no los declara no se
puede conectar**, y `assertProviderContracts()` lo hace cumplir al cargar el módulo — el mismo
mecanismo que `assertContracts()` en Analytics y `assertEventContracts()` en Automatizaciones.

| # | Campo | Qué declara |
|---|---|---|
| 1 | **`input`** | Qué información entra: qué campos del dominio necesita, cuáles son obligatorios y cuáles ignora |
| 2 | **`output`** | Qué información sale: qué devuelve al núcleo, ya traducido al modelo del panel |
| 3 | **`events`** | Qué eventos publica (salientes: `integracion.*`) y qué eventos de dominio produce al recibir un webhook |
| 4 | **`config`** | Schema de configuración: campos, tipos, cuáles son `secret`, cuáles tienen default, qué se puede editar sin reconectar |
| 5 | **`state`** | Cómo se sabe si está sano: qué hace su `healthCheck()` y con qué frecuencia |
| 6 | **`errors`** | Mapa de errores del proveedor → taxonomía del panel (§2.7), con su política de reintento |
| 7 | **`logs`** | Qué se registra de cada llamada y **qué campos se redactan** antes de guardarlos |

Más los descriptivos: `key`, `label`, `port`, `category`, `docsUrl`, `modes` (cuáles soporta),
`limits` (rate limit conocido).

### 2.3 Conexión

Una **Conexión** (`Connection`) es lo que se crea desde la UI: *este puerto, con este proveedor, con
esta configuración, en este modo, en este estado*.

```js
{
  id: "CX-01",
  port: "invoicing.issue",
  provider: "afip",
  mode: "simulado",                  // simulado | sandbox | produccion
  state: "no_configurada",
  config: { /* según el schema del proveedor, sin secretos */ },
  secretsRef: null,                  // referencia, nunca el valor (§2.5)
  health: { lastCheckAt: null, ok: null, latencyMs: null, message: null },
  enabled: false,
  createdBy, createdAt, updatedAt,
}
```

### 2.4 Modos de operación

| Modo | Qué hace | Para qué |
|---|---|---|
| **Simulado** | Usa el `fallback` del módulo. Es el estado inicial de **todos** los puertos | Es como funciona el panel hoy |
| **Sandbox** | Habla con el entorno de pruebas del proveedor | Probar de verdad sin consecuencias |
| **Producción** | Habla con el entorno real | Operar |

Más **dry-run** transversal: ejecuta la traducción y arma el request, **sin enviarlo**, y muestra
exactamente qué se mandaría. Es el equivalente del simulador de Automatizaciones, y por la misma
razón: sobre una frontera que no controlamos, poder mirar antes de apretar vale más que cualquier
otra pantalla.

### 2.5 ⭐ Credenciales: el panel no guarda secretos

**Decisión dura: ningún campo marcado `secret: true` se persiste en el panel.** Ni en memoria de
sesión, ni en `localStorage`, ni en un mock que "después se cambia".

- El schema **declara** que la conexión necesita una clave, y la UI muestra el campo.
- Lo que se guarda es una **referencia** (`secretsRef`) y, como mucho, los últimos 4 caracteres para
  que una persona reconozca cuál cargó.
- En el estado actual del proyecto —front-end sin backend— eso significa que **el modo producción no
  se puede completar desde el panel**, y la UI lo dice con todas las letras en vez de fingir.

Esto no es purismo. Un panel de demo que guarda una API key en el front es un patrón que después se
copia a producción; y el módulo entero existe para poner la frontera en su lugar, no para agujerearla
en el primer campo de texto.

### 2.6 Estado y salud

```
no_configurada → configurada → conectada ⇄ degradada → caída
                                   ↑                      │
                                   └──────────────────────┘
                              (cualquiera) → deshabilitada
```

| Estado | Qué significa |
|---|---|
| **No configurada** | El puerto existe, no hay proveedor elegido. **Corre el fallback local** |
| **Configurada** | Hay proveedor y config, falta validar |
| **Conectada** | El último `healthCheck` dio bien |
| **Degradada** | Responde, pero con errores o lentitud por encima del umbral |
| **Caída** | El `healthCheck` falla o hay N fallas seguidas |
| **Deshabilitada** | Apagada a mano. **Vuelve al fallback local**, no rompe |

**Degradada y caída son estados operativos, no errores de una llamada.** Una llamada puede fallar sin
que la integración esté caída; una integración caída no debería dejar al panel sin operar — por eso
existe §2.7.

### 2.7 ⭐ Errores: taxonomía y política

Mezclar "la red se cayó" con "la tarjeta fue rechazada" es el error clásico de esta capa: lleva a
reintentar lo que nunca va a funcionar y a no reintentar lo que sí.

| Tipo | Ejemplo | ¿Reintenta? | Qué hace el panel |
|---|---|---|---|
| **`config`** | Falta el CUIT del emisor | No | Marca la conexión *configurada* y pide completar |
| **`auth`** | Token vencido o revocado | No | Pasa a **caída** y avisa: requiere intervención humana |
| **`validacion`** | Mandamos un campo que el proveedor rechaza | No | Es **bug nuestro**: queda en el log con el payload redactado |
| **`transporte`** | Timeout, DNS, 5xx | **Sí**, con backoff | Reintenta; si persiste → *degradada* |
| **`remoto`** | El proveedor devuelve 500 propio | **Sí**, acotado | Igual que transporte, pero cuenta para *degradada* |
| **`negocio`** | Tarjeta rechazada, CUIT inexistente | No | **No es una falla de la integración**: es una respuesta válida que el dominio tiene que procesar |
| **`limite`** | 429 rate limit | Sí, respetando `Retry-After` | Encola y espera |

**⭐ La distinción que más importa es `negocio` vs. el resto.** Una tarjeta rechazada no es un error
de integración: es información de negocio y tiene que llegar al módulo dueño como resultado, no como
excepción. Si se trata como falla, el panel reintenta un cobro que el banco ya contestó.

**Política por defecto ante fallo, cuando el puerto tiene fallback:** se registra el error y **se cae
al fallback local**, con la conexión marcada. Salvo en puertos de sensibilidad alta (`payments`,
`invoicing`), donde caer al simulador sería inventar un cobro o un CAE: ahí **la operación falla y se
lo dice al usuario**.

### 2.8 ⭐ Idempotencia

Todo `execute` saliente lleva una **clave de idempotencia** derivada del hecho de dominio
(`pedido:10253:charge`), no del intento. Reintentar sin eso es cobrar dos veces — y como el reintento
es automático (§2.7), sin clave el módulo sería peligroso por diseño.

Consecuencias:
- Un reintento con la misma clave **no repite el efecto**: devuelve el resultado del primero.
- El adaptador declara si el proveedor soporta idempotencia nativa; si no, Integraciones la simula
  guardando el resultado por clave y **lo declara como garantía más débil** en la ficha, sin
  esconderlo.

### 2.9 Logs

Una entrada por intento:

```js
{
  id, connectionId, port, provider, mode,
  direction: "saliente" | "entrante",
  operation, idempotencyKey, attempt,
  request:  { /* redactado según el contrato */ },
  response: { /* redactado */ },
  status: "ok" | "error", errorType, errorMessage,
  httpStatus, durationMs, at,
  correlationId,        // ata los reintentos de un mismo hecho
  subject,              // { type, id } del dominio, para poder ir del pedido al log
}
```

**La redacción la declara el proveedor, no la decide la UI** (`logs.redact: ["card.number", "cvv"]`).
Un log que guarda de más es una filtración esperando; uno que guarda de menos no sirve para
diagnosticar. Que lo declare el contrato lo vuelve revisable.

Retención acotada en memoria, igual que la traza del bus, y **exportable a CSV** con la misma
cabecera de contexto que usa Analytics.

---

## 3. Catálogo de puertos por categoría

Para cada categoría: los puertos, y los siete puntos pedidos. **Ningún proveedor concreto está
definido**; los nombres que aparecen son ejemplos de qué *podría* implementar cada puerto.

### 3.1 Pagos

| | |
|---|---|
| **Puertos** | `payments.charge` · `payments.refund` · `payments.status` · `payments.payout` |
| **Entra** | Pedido (id, total, moneda), medio elegido, cuenta del CRM, clave de idempotencia |
| **Sale** | `{ paymentId, status, capturado, comisión, medio normalizado, últimos4 }` — **la comisión sale del proveedor**, y ahí muere la tabla local de §1.2 |
| **Eventos** | Salientes: `integracion.llamada.ok/error`. De dominio (entrantes): `pago.acreditado` · `pago.rechazado` · `pago.reembolsado` · `contracargo.abierto` |
| **Configuración** | Cuenta/comercio, moneda, medios habilitados, política de captura (inmediata/diferida), URL de webhook, **clave (secreta)** |
| **Estado** | `healthCheck` = consultar un pago conocido. Degradada si la latencia o los timeouts pasan el umbral |
| **Errores** | Rechazo de tarjeta → **`negocio`**, no reintenta y vuelve al dominio. Timeout al cobrar → `transporte`, reintenta **con la misma clave** |
| **Logs** | Redactar SIEMPRE: PAN, CVV, token de tarjeta. Se guardan los últimos 4 y la marca |
| **Reemplaza hoy** | El pago confirmado a mano y `financeApi.gatewayRateFor` |

> ⚠ **Sensibilidad alta.** Sin proveedor, `payments.charge` **no cae al fallback**: no existe cobrar
> simulado. El pedido queda pendiente y se cobra a mano, como hoy.

### 3.2 Facturación

| | |
|---|---|
| **Puertos** | `invoicing.issue` · `invoicing.void` · `invoicing.status` · `invoicing.taxpayer` |
| **Entra** | Comprobante armado por el módulo Facturación: tipo, letra, punto de venta, líneas con IVA, receptor con su condición |
| **Sale** | `{ cae, vencimientoCae, numeroAsignado, url }` |
| **Eventos** | `comprobante.autorizado` · `comprobante.rechazado` · `comprobante.anulado` |
| **Configuración** | CUIT del emisor, puntos de venta habilitados, certificado (**secreto**), entorno homologación/producción |
| **Estado** | `healthCheck` = consultar el último número autorizado del punto de venta |
| **Errores** | Datos fiscales inválidos → `validacion` (bug nuestro). Padrón caído → `transporte`. **CUIT inexistente → `negocio`**: el comprobante sale como Consumidor Final |
| **Logs** | Redactar el certificado y el token de sesión fiscal. El CAE **no** se redacta: es el comprobante |
| **Reemplaza hoy** | `simulateCae()` |

> ⚠ **Sensibilidad alta.** Un CAE simulado presentado como real es un problema legal: si el proveedor
> falla, la emisión falla.

### 3.3 Logística

| | |
|---|---|
| **Puertos** | `shipping.rate` · `shipping.label` · `shipping.track` · `shipping.pickup` |
| **Entra** | Envío: origen (depósito), destino, peso/volumen estimado, valor declarado, servicio |
| **Sale** | `{ trackingCode, etiquetaUrl, costo, etaEstimada, estadoNormalizado }` |
| **Eventos** | `envio.en_transito` · `envio.en_reparto` · `envio.entregado` · `envio.incidencia_abierta` — **los tres primeros ya existen** en Automatizaciones y hoy se cargan a mano |
| **Configuración** | Cuenta, contratos/servicios por zona, origen por defecto, formato de etiqueta, webhook |
| **Estado** | `healthCheck` = cotizar una ruta fija conocida |
| **Errores** | Dirección incompleta → `negocio` (abre incidencia en Logística). Cotizador caído → `transporte`, **cae al fallback**: la tarifa local de Logística |
| **Logs** | Redactar poco: dirección completa sólo si la política de datos lo permite |
| **Reemplaza hoy** | `{trackingPrefix}-{8 dígitos}` y los eventos de tracking manuales |

### 3.4 Marketing

| | |
|---|---|
| **Puertos** | `marketing.audience.sync` · `marketing.catalog.feed` · `marketing.conversion` |
| **Entra** | Audiencia resuelta por el CRM (ids + atributos), catálogo publicado, conversión con su valor |
| **Sale** | `{ audienciaExternaId, sincronizados, rechazados[] }` |
| **Eventos** | `audiencia.sincronizada` · `catalogo.publicado` · `conversion.enviada` |
| **Configuración** | Cuenta publicitaria, mapeo de campos del catálogo, consentimiento requerido |
| **Estado** | `healthCheck` = leer la audiencia sincronizada y comparar tamaños |
| **Errores** | Contacto sin consentimiento → `negocio`: **se excluye, no se fuerza**. Cuota excedida → `limite` |
| **Logs** | ⚠ **Nunca** el email en claro: se registra el hash y el conteo |
| **Reemplaza hoy** | Nada — capacidad nueva. Las audiencias hoy no salen del panel |

> **Respeta las bajas de canal.** Marketing ya valida `isBlocked` antes de contactar; una audiencia
> que se sincroniza afuera tiene que aplicar el mismo filtro **antes** de salir, o la baja deja de
> valer en cuanto el dato cruza la frontera.

### 3.5 Analytics

| | |
|---|---|
| **Puertos** | `analytics.track` (sale) · `analytics.import` (entra) |
| **Entra** (al panel) | Sesiones, visitas, origen de tráfico, embudo del sitio |
| **Sale** | Eventos de negocio server-side: compra, alta, valor |
| **Eventos** | `metricas.importadas` con su ventana y su grano |
| **Configuración** | Property/stream id, ventana de importación, zona horaria, mapeo de canales |
| **Estado** | `healthCheck` = pedir una métrica conocida de ayer |
| **Errores** | Ventana sin datos → `negocio` (no es falla). Muestreo del proveedor → se registra y **se propaga como advertencia a la métrica** |
| **Logs** | Sin datos personales: son agregados |
| **Reemplaza hoy** | Nada — **y es el más interesante de los ocho** |

> ⭐ **Este puerto es el que desbloquea lo que Analytics documentó como imposible.**
> `MODULO-ANALYTICS.md` §2.8 dice que la **conversión del sitio**, el CAC por canal, el rebote y el
> embudo **no se pueden calcular porque no hay tráfico ni sesiones**. `analytics.import` es
> exactamente la pieza que faltaba. Cuando se implemente, hay que **volver a esa sección y actualizar
> la lista de lo no medible** — si no, el panel seguirá diciendo que no puede medir algo que ya mide.

### 3.6 Comunicación

| | |
|---|---|
| **Puertos** | `messaging.send` · `messaging.status` · `messaging.optout` (entrante) |
| **Entra** | Destinatario, canal (email/SMS/WhatsApp/push), plantilla + variables, id de campaña |
| **Sale** | `{ messageId, estado, costoReal }` — **el costo real** reemplaza el simulado de `CHANNELS` |
| **Eventos** | `mensaje.entregado` · `mensaje.rebotado` · `mensaje.abierto` · `mensaje.baja` |
| **Configuración** | Remitente verificado, dominio, plantillas aprobadas (WhatsApp), tope diario |
| **Estado** | `healthCheck` = consultar la reputación del remitente / cuota restante |
| **Errores** | Rebote duro → **`negocio`**: marca el contacto en el CRM, no reintenta. Rebote blando → `transporte`, reintenta acotado |
| **Logs** | Redactar el cuerpo si lleva datos personales; guardar plantilla + variables, no el render |
| **Reemplaza hoy** | `ensureSends` y el costo por mensaje de `CHANNELS` |

> **`messaging.optout` es el ejemplo canónico de entrada.** Una baja llega por webhook → se traduce →
> escribe en las suscripciones de Marketing por su `api/`. El núcleo nunca ve el payload del
> proveedor, y la baja vale en todo el panel de inmediato.

### 3.7 ERP

| | |
|---|---|
| **Puertos** | `erp.product.sync` · `erp.stock.sync` · `erp.order.push` · `erp.customer.sync` |
| **Entra** | Maestros y saldos desde el ERP |
| **Sale** | Pedidos y clientes hacia el ERP |
| **Eventos** | `erp.sincronizacion.iniciada/terminada` · `erp.conflicto.detectado` |
| **Configuración** | ⭐ **Dirección y dueño del dato por entidad**: quién manda en precio, en stock, en el alta de producto. Más el mapeo de códigos y la frecuencia |
| **Estado** | `healthCheck` = leer un maestro chico y comparar el timestamp |
| **Errores** | Código inexistente → `negocio`, va a una cola de conflictos. Sincronización parcial → `remoto`, retoma desde el cursor |
| **Logs** | Por lote: cuántos entraron, cuántos se rechazaron y **por qué**, con muestra acotada |
| **Reemplaza hoy** | Nada — capacidad nueva |

> ⭐ **La única decisión difícil del ERP no es técnica: es quién manda.** Si el ERP y el panel pueden
> los dos escribir el stock, hay dos verdades y ninguna gana. La configuración obliga a elegir
> **dueño por entidad**, y lo que no es dueño queda de **sólo lectura en la UI**, visiblemente. Sin
> eso, la integración se convierte en un generador de conflictos silenciosos.

### 3.8 APIs externas (genérico)

| | |
|---|---|
| **Puertos** | `custom.request` |
| **Entra** | Método, ruta relativa, cuerpo armado desde un template acotado |
| **Sale** | Respuesta cruda, disponible **sólo para el log y para una automatización explícita** |
| **Eventos** | `integracion.llamada.ok` · `integracion.llamada.error` |
| **Configuración** | Base URL, tipo de auth, cabeceras fijas, allow-list de rutas, timeout |
| **Estado** | `healthCheck` = una ruta declarada como ping |
| **Errores** | Taxonomía genérica por código HTTP |
| **Logs** | Todo, con la redacción que declare la conexión |

> **Es la válvula de escape, y por eso es la más restringida**: allow-list de rutas obligatoria, sin
> plantillas de código, y **su salida no entra al dominio** — no puede crear ni modificar entidades.
> Una integración genérica que puede escribir en el dominio es un agujero por el que se cuela todo lo
> que las otras siete categorías intentan ordenar.

---

## 4. Eventos del módulo

Salen al **bus de Automatizaciones**, con contrato completo, para que se puedan automatizar como
cualquier otro:

| Evento | Sujeto | Cuándo |
|---|---|---|
| `integracion.conectada` | connection | Un `healthCheck` pasa por primera vez |
| `integracion.degradada` | connection | Errores o latencia sobre el umbral |
| `integracion.caida` | connection | N fallas seguidas o `auth` inválido |
| `integracion.llamada.error` | connection | Una llamada falla tras agotar reintentos |
| `integracion.webhook.recibido` | connection | Entró un webhook (antes de traducir) |
| `integracion.webhook.descartado` | connection | Firma inválida, duplicado o tipo desconocido |

Con esto, *"si la facturación electrónica se cae, abrime una tarea y avisá en el panel"* es una
automatización más — sin código nuevo.

---

## 5. Entrada: de webhook a evento de dominio

```
1. Recepción      firma verificada · id de evento del proveedor
2. Deduplicación  ¿ya lo procesamos? (los proveedores reenvían)
3. Traducción     payload externo → evento de dominio del catálogo
4. Publicación    al bus de Automatizaciones
5. Efecto         el módulo dueño escribe, por su api/
```

Cuatro reglas:

1. **Un webhook que no se puede traducir a un evento del catálogo se descarta y se registra.** No se
   inventa un evento nuevo para acomodar a un proveedor.
2. **Se deduplica por id del proveedor.** Reenviar es normal; procesar dos veces, no.
3. **El efecto lo hace el módulo dueño, no Integraciones.** Un `pago.acreditado` termina llamando a
   `pedidosApi.confirmPayment`, con sus validaciones intactas.
4. **Sin backend no hay endpoint público.** En el estado actual, los webhooks se **simulan**: la
   consola tiene un inyector para pegar un payload de ejemplo y ver todo el recorrido. Es la misma
   honestidad que el reloj simulado de Automatizaciones — decir qué es simulado y hacerlo
   demostrable.

---

## 6. Relación con Automatizaciones

Se dividen limpio, y conviene decirlo porque es la confusión esperable:

| | Automatizaciones | Integraciones |
|---|---|---|
| Responde | **¿Cuándo** hay que actuar? | **¿Con quién** se cumple? |
| Unidad | Regla (evento → condición → acción) | Conexión (puerto + proveedor) |
| Ejemplo | "Carrito abandonado a las 2 h → enviar recuperación" | "Los envíos de email salen por *este* proveedor" |

Una acción de contacto de Automatizaciones llama a Marketing; Marketing llama al puerto
`messaging.send`; el puerto resuelve al proveedor conectado **o al envío simulado de siempre**.
Ninguno de los tres sabe de los otros dos más de lo que necesita.

Y comparten infraestructura a propósito: **el mismo bus**, la misma idea de contrato declarado, el
mismo criterio de que el permiso se aplica en el `api/`.

---

## 7. Modelo de dominio

| Entidad | Descripción | Dueño |
|---|---|---|
| **Puerto** (`Port`) | Capacidad que el núcleo necesita, con su `input`/`output` | Integraciones |
| **Proveedor** (`Provider`) | Implementación de uno o más puertos + su contrato (§2.2) | Integraciones |
| **Conexión** (`Connection`) | Puerto + proveedor + config + modo + estado | Integraciones |
| **Credencial** (`SecretRef`) | **Referencia**, nunca el valor | Integraciones |
| **Llamada** (`Call`) | Un intento saliente: request, response, error, duración | Integraciones |
| **Webhook** (`InboundEvent`) | Payload entrante, su verificación y a qué evento tradujo | Integraciones |
| **Salud** (`Health`) | Resultado del último chequeo y la serie corta | Integraciones |

---

## 8. Reglas del módulo

1. **Integraciones no agrega capacidades, reemplaza proveedores** (§1.1).
2. **El `fallback` lo pasa el módulo dueño**: sin Integraciones, el panel funciona igual (§1.4).
3. **Ningún `api/` del núcleo nombra un proveedor.**
4. **Lo externo entra traducido**: el núcleo nunca ve un payload ajeno (§5).
5. **No se crea un segundo bus**: se publica en el de Automatizaciones.
6. **El panel no guarda secretos** (§2.5).
7. **`negocio` no es una falla de integración** y no se reintenta (§2.7).
8. **Todo saliente lleva clave de idempotencia** derivada del hecho, no del intento (§2.8).
9. **La redacción de logs la declara el proveedor**, no la UI (§2.9).
10. **En puertos de sensibilidad alta no hay caída al fallback**: antes falla la operación que
    inventar un cobro o un CAE.
11. **Un proveedor sin contrato completo no se puede conectar** (`assertProviderContracts`).
12. **`custom.request` no escribe en el dominio** (§3.8).

---

## 9. UX

### 9.1 Catálogo (`/integraciones`)

Agrupado por las ocho categorías. Una tarjeta por **puerto**, no por proveedor: lo que importa
primero es *qué capacidad está conectada y a qué*.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Integraciones                       [Consola de tráfico]  [+ Conectar]│
│  ─────────────────────────────────────────────────────────────────── │
│  FACTURACIÓN                                                          │
│  ● Emitir comprobante fiscal    Simulado (CAE local)      Configurar →│
│  PAGOS                                                                │
│  ● Cobrar un pedido             Simulado · sin cobro real  Configurar →│
│  LOGÍSTICA                                                            │
│  ● Cotizar y despachar          Simulado (tarifa local)    Configurar →│
└──────────────────────────────────────────────────────────────────────┘
```

Cada fila dice **qué está corriendo hoy** — y al arrancar, todas dicen "Simulado", que es la verdad.

### 9.2 Detalle de una conexión (`/integraciones/:port`)

Cinco bloques que son, otra vez, los siete puntos del pedido:

1. **Qué hace** — el puerto, quién lo consume, qué corre hoy.
2. **Entra / Sale** — el contrato, en castellano, con un ejemplo de payload de dominio.
3. **Configuración** — formulario generado del schema (`ParamField`, como en Automatizaciones), con
   los campos secretos marcados y explicados.
4. **Estado y salud** — estado actual, último chequeo, latencia, serie corta de las últimas llamadas.
5. **Errores y logs** — los últimos fallos agrupados **por tipo**, con acceso al detalle.

Más los botones que importan: **Probar conexión**, **Dry-run**, **Deshabilitar**.

### 9.3 Asistente de conexión

Cuatro pasos, y el orden no es decorativo: **probar antes de habilitar**.

```
Elegir proveedor → Configurar → Probar (healthCheck + dry-run) → Habilitar
```

No se puede habilitar en producción sin una prueba exitosa. Es la misma idea que "una regla en
borrador nunca ejecuta".

### 9.4 Consola de tráfico (`/integraciones/trafico`)

Todas las llamadas, entrantes y salientes, filtrables por conexión, tipo de error y período. Cada
fila abre el detalle con request/response **redactados**, el intento, la clave de idempotencia y el
sujeto de dominio — para poder ir del pedido a la llamada y de la llamada al pedido. Con **reintento
manual** cuando el tipo de error lo admite.

### 9.5 Webhooks (`/integraciones/webhooks`)

Lo entrante: qué llegó, si la firma validó, si era duplicado, a qué evento de dominio tradujo y qué
reglas despertó. Con el **inyector de payload** para probar el recorrido completo sin un proveedor
real.

### 9.6 Salud

Una tira arriba del catálogo: conexiones caídas o degradadas primero. En el caso normal, vacía.

---

## 10. Rutas y permisos

| Ruta | Pantalla |
|---|---|
| `/integraciones` | Catálogo por categoría |
| `/integraciones/:port` | Detalle y configuración |
| `/integraciones/trafico` | Consola de llamadas |
| `/integraciones/webhooks` | Entrantes |

Sidebar: sección **SISTEMA**, junto a Ajustes.

| Acción | Admin | Dirección | Otros |
|---|---|---|---|
| Ver el catálogo y el estado | ✅ | ✅ | ✅ |
| Ver la consola de tráfico | ✅ | ✅ | ❌ |
| Configurar y probar | ✅ | ❌ | ❌ |
| Habilitar / deshabilitar | ✅ | ❌ | ❌ |
| Reintentar una llamada | ✅ | ❌ | ❌ |

Aplicado en el `api/`, no escondiendo botones — igual que Analytics y Automatizaciones.

---

## 11. Arquitectura de archivos

```
src/modules/integraciones/
├── lib/
│   ├── ports.js          # ⭐ HOJA sin dependencias: register / resolve / port()
│   ├── catalog.js        # ⭐ los puertos de §3, con input/output y owner
│   ├── contracts.js      # el contrato de proveedor + assertProviderContracts()
│   ├── errors.js         # taxonomía §2.7 y política de reintento
│   ├── retry.js          # backoff + idempotencia (§2.8)
│   ├── redact.js         # redacción declarada por el contrato
│   ├── health.js         # estados §2.6 y healthCheck
│   └── inbound.js        # webhook → verificación → dedupe → evento de dominio
├── providers/
│   └── (vacío a propósito — un archivo por adaptador, cuando se pida)
├── data/
│   ├── connections.mock.js
│   └── calls.mock.js
├── api/
│   └── integrationsApi.js
├── components/
│   ├── PortCard.jsx · ConnectionWizard.jsx · ContractPanel.jsx
│   ├── HealthStrip.jsx · CallDetail.jsx · WebhookInjector.jsx
├── Integraciones.jsx · ConexionDetalle.jsx · Trafico.jsx · Webhooks.jsx
└── Integraciones.css
```

**`providers/` arranca vacío y es lo correcto.** El módulo se puede terminar, probar y usar sin un
solo proveedor real: se ve el catálogo, se ve que todo corre simulado, se prueban los dry-runs y se
inyectan webhooks.

---

## 12. Fases

### F1 — El marco ✅

**Implementado (2026-09-08). Sin ninguna integración concreta, como corresponde.**

- `lib/ports.js` — **la hoja sin dependencias**: `port()` · `register` · `unregister` · contadores ·
  traza.
- `lib/catalog.js` — **25 puertos en las 8 categorías**, cada uno con `input`/`output` en el modelo
  del panel, `owner`, `fallback`, `wiredAt`, `syncOnly` y `sensitivity`.
- `lib/contracts.js` — el contrato de proveedor con los 7 puntos y `assertProviderContracts()`.
- `lib/errors.js` — la taxonomía, la política de reintento, el backoff y la clave de idempotencia.
- `lib/health.js` — los seis estados, derivados de la salud observada.
- `lib/redact.js` — redacción declarada por el contrato, más una red de seguridad por nombre.
- `api/integrationsApi.js`, pantallas **Catálogo** y **Detalle**, sección **SISTEMA** en el Sidebar.
- **Tres puertos cableados al núcleo**: `payments.fee` (Finanzas) · `invoicing.issue` (Facturación) ·
  `shipping.track` (Logística).

#### Decisiones y hallazgos al implementar F1

1. **⭐ La deuda de §1.2, saldada.** `financeApi` ya no matchea `"mercadopago"` por substring contra
   `order.paymentMethod`: pregunta al puerto `payments.fee`. La tabla local de tarifas **sigue
   existiendo, pero como implementación local del puerto**, no como criterio del módulo. Verificado:
   los seis pedidos dan **exactamente** la misma comisión que antes y el total sigue siendo $16.186.

2. **⭐ `syncOnly` — el hallazgo que apareció al cablear.** Todo el panel es síncrono; un proveedor
   real es asíncrono. Los puertos que el núcleo consulta **para renderizar** (el P&L pidiendo la
   comisión de cada pedido) no pueden esperar una llamada de red: un P&L que necesita internet para
   dibujarse está roto.
   Y eso **no es una limitación del mock**: dice algo verdadero. La comisión de una pasarela no se
   consulta al pintar un reporte — es un **dato que produjo el cobro** y tiene que quedar guardado en
   el pedido. Mientras no lo esté, el puerto sólo puede resolverse local.
   `validateProvider()` lo hace cumplir: **un proveedor asíncrono sobre un puerto `syncOnly` se
   rechaza**, con el motivo. Queda como la próxima deuda a saldar (guardar `gatewayFee` en el pedido
   al cobrar), y `payments.fee`, `invoicing.issue`, `shipping.track` y `shipping.rate` quedan
   marcados.

3. **⭐ Sólo se registran las llamadas que cruzan la frontera.** Si no hay proveedor no hay frontera,
   y anotar cada cálculo local convertiría el log en ruido: `orderPnl` sola pide la comisión una vez
   por pedido, y Analytics arma su tabla de hechos muchas veces por pantalla — en la verificación se
   contaron **72 resoluciones locales contra 12 de proveedor**. Los contadores sí se llevan siempre,
   así que la pantalla puede decir cuánto se usa un puerto sin inflar la traza.

4. **La redacción se aplica al leer, no al guardar.** Si se guardara ya redactado no se podría
   reintentar la llamada con el payload original. Además de la lista que declara el contrato, hay una
   **red de seguridad por nombre** (`token`, `cvv`, `apiKey`…) a cualquier profundidad: si el
   contrato se olvidó de uno, igual no sale.

5. **Un secreto no puede tener valor por defecto**, y el validador lo rechaza: un default en el
   schema sería un secreto versionado en el repo.

6. **El `output` del proveedor tiene que cubrir el del puerto.** Si no puede devolver todo lo que el
   núcleo espera, no implementa ese puerto: antes que un objeto a medias, no se conecta.

7. **`connections.mock.js` está vacío a propósito.** Sembrar una conexión falsa mostraría "conectado
   a MercadoPago" en una pantalla donde nada está conectado — justo la mentira que el módulo existe
   para evitar. La UI arma una fila por puerto igual, así que no arranca vacía: arranca diciendo la
   verdad.

8. **El breadcrumb capitalizaba las claves de puerto** (`payments.fee` → "Payments.fee"). Son
   identificadores, no palabras: ahora caen en "Detalle" como cualquier otro id.

#### Verificación de F1

Lo que había que probar no era que la pantalla dibuje, sino que **el puerto sustituya de verdad y que
desconectar no rompa nada**:

```
sin proveedor (fallback local)   : comisiones = $16.186 · las 6 iguales una por una
con un proveedor de prueba       : comisiones = $10.144   ← el proveedor manda
tras desconectarlo               : comisiones = $16.186   ← vuelve EXACTO al local
contadores del puerto            : 72 locales · 12 de proveedor · 0 errores
traza                            : sólo las 12 del proveedor
redacción                        : paymentMethod → "•••aria"
contrato incompleto              : rechazado (falta events, config, state)
proveedor asíncrono en syncOnly  : rechazado, con el motivo
catálogo                         : 25 puertos · 8 categorías · 3 consumidos · 0 proveedores
```

El proveedor de prueba se definió en la consola y **no quedó en `providers/`**: sigue vacío.

Lint y build limpios; consola sin errores.

### F2 — Conexión y ciclo de vida ✅

**Implementado (2026-09-08). Sigue sin haber ninguna integración concreta.**

- **Asistente de 4 pasos** (`ConnectionWizard`): elegir proveedor → configurar → probar → habilitar.
- **Formulario generado del schema** (`ConfigForm`): text · number · select · switch · url · secret.
- **Prueba de conexión** (`testConnection`) usando el `healthCheck` que declara el contrato.
- **⭐ Dry-run** (`dryRun`): arma el payload y muestra qué se mandaría, **sin mandarlo**.
- **Modos** simulado / sandbox / producción, con producción bloqueada y explicada.
- **Habilitar / deshabilitar**, con vuelta al fallback local.
- **⭐ Secretos por referencia** (`lib/secrets.js`): el valor no se persiste en ningún lado.
- **RBAC** (`lib/rbac.js`) aplicado en el `api/`.
- `providers/_demo.js` — **un doble de prueba, no una integración** (ver abajo).

#### Sobre el doble de prueba

`providers/_demo.js` **no es una integración**: no habla con ningún servicio, no tiene nombre de
marca, no manda una request a ningún lado. Existe para poder recorrer el asistente, la prueba de
conexión y el dry-run sin traer un proveedor real — que es justo lo que este módulo tiene prohibido
hasta que se pida.

Es el mismo recurso que el *"emitir un evento a mano"* de Automatizaciones o el *"simular disparo"*
de Marketing: una herramienta para probar, no una función del producto. El archivo arranca con `_`,
el contrato lleva `demo: true`, la UI lo dice en el selector y en el detalle, y el resumen del
catálogo cuenta **"0 proveedores"** aparte de los dobles. Se puede borrar en cualquier momento.

Además hizo falta una regla nueva: **un proveedor universal (`port: "*"`) sólo se admite si declara
ser un doble de prueba.** Un adaptador real implementa un puerto concreto; si dice servir a todos, o
está mal declarado o es una herramienta.

#### Decisiones y hallazgos al implementar F2

1. **⭐ El orden del asistente no es decorativo: no se puede habilitar sin una prueba exitosa.**
   `enableConnection` lo rechaza en el `api/`, no sólo deshabilitando el botón. Poner a correr sobre
   datos reales algo que no sabemos si responde es la forma más rápida de romper una operación — es
   la misma idea que "una regla en borrador nunca ejecuta".

2. **⭐ El dry-run usa datos reales cuando los hay.** Para los puertos que ya consume el núcleo, el
   ejemplo sale del dominio: `payments.fee` se simula sobre un pedido de verdad. Un dry-run sobre un
   objeto inventado prueba que el código corre; uno sobre un pedido real prueba que la traducción
   sirve, que es la pregunta. Y **no pasa por el registro de puertos**: no cuenta como llamada y el
   núcleo no se entera.

3. **⭐ El secreto no queda en ninguna parte.** Verificado buscando el valor cargado en la conexión
   serializada y en `localStorage`: no aparece. Lo que queda es
   `claveDemo: env:CLAVEDEMO · termina en •••1234`. Y **producción está bloqueada con el motivo a la
   vista** en vez de un botón gris: sin backend que custodie la credencial, nunca llegaría al
   proveedor.

4. **⭐ Bug encontrado y corregido: los valores por defecto del schema no se guardaban.** El
   formulario los mostraba (`values[key] ?? spec.default`) pero nunca los escribía, así que una
   conexión creada sin tocar un campo quedaba **sin configuración** y el proveedor recibía `{}` en
   lugar de los defaults que su propio contrato declara. Ahora se aplican en `configureConnection`,
   que es donde vive el contrato — no en el formulario.

5. **⭐ Bug encontrado y corregido: «nunca se habilitó» y «se apagó a mano» no son lo mismo.**
   `deriveState` miraba `enabled === false`, así que una conexión recién configurada aparecía como
   *deshabilitada* y los estados *degradada* y *caída* **no se veían nunca** — que es justo para lo
   que existen. Ahora sólo `disableConnection` marca `disabledAt`.

6. **⭐ Y el mismo tropiezo que ya había aparecido en Analytics**: `deriveState(connection, health)`
   recibía `health` en `null` (proveedor configurado, todavía sin probar) y **un valor por defecto de
   parámetro sólo cubre `undefined`**. Configurar sin probar y recargar rompía la pantalla. Es
   textualmente el bug de `resolvePeriod(v, null)`; queda anotado en la memoria de tropiezos del
   proyecto.

7. **Cambiar de modo desactiva la conexión.** Sandbox y producción no son el mismo sistema: arrastrar
   una prueba exitosa de uno al otro sería mentir sobre lo que se probó.

#### Verificación de F2

El asistente completo, conducido desde la UI, y después el efecto sobre el núcleo:

```
asistente          : 4 pasos · "Guardar y seguir" avisa que el secreto NO se persistió
secreto            : no aparece en la conexión serializada ni en localStorage
                     queda "claveDemo: env:CLAVEDEMO · termina en •••1234"
configuración      : etiqueta: demo · latenciaMs: 0 · comportamiento: ok · verboso: false
                     (los defaults del schema, tras el arreglo)
dry-run            : "Datos reales · Pedido 10254 de Juan Pérez" con su payload y su respuesta
habilitar          : Finanzas pasa a mostrar comisiones de −$74.070
deshabilitar       : vuelve a −$16.186, exacto        ← la regla del módulo, otra vez
estados            : sin probar → configurada · ok → conectada · lento → degradada
                     auth → caída · apagada a mano → deshabilitada · reset → no configurada
taxonomía          : `negocio` vuelve como RESULTADO (status "rechazado"), no como excepción
RBAC               : "Analista Frontend" ve pero no configura ni habilita (rechazado en el api/)
                     admin sin probar → "Probá la conexión primero"
producción         : rechazada con el motivo, no con un botón gris
```

Lint y build limpios; consola sin errores.

### F3 — Tráfico ✅

**Implementado (2026-09-09). Sigue sin haber ninguna integración concreta.**

- **Consola de tráfico** (`/integraciones/trafico`): una fila **por intento**, con su sujeto de
  dominio, su clave de idempotencia y su correlación; filtros por capacidad, resultado y tipo de
  error; detalle con request/response redactados y la cadena completa de intentos; export a CSV.
- **⭐ Política de llamada** (`lib/pipeline.js`): idempotencia → llamada → respuesta de negocio →
  **caída al fallback** → cola. El registro de puertos no la implementa: la enchufa el módulo.
- **Cola de reintentos** (`lib/retries.js`) con el backoff de `lib/errors.js` (1s × 3, hasta 4
  intentos), reintento manual y cancelación.
- **Idempotencia** (`lib/idempotency.js`): sólo para los puertos que declaran la clave; el resultado
  del primer intento se devuelve sin volver a llamar, y la garantía **se declara** (nativa o simulada).
- **Entrantes** (`/integraciones/webhooks`): las cinco etapas de §5 con su inyector de payloads.
- **Los seis eventos `integracion.*`** en el catálogo de Automatizaciones, con el sujeto
  `connection`, su loader y cuatro condiciones propias: se eligen en el builder como cualquier otro.
- **Métricas por conexión** en el detalle: intentos, errores, resueltas local, repetidas, latencia
  promedio y p95.

#### Decisiones y hallazgos al implementar F3

1. **⭐ El registro de puertos no decide política; la enchufa.** Reintentos, traza rica, idempotencia y
   caída al fallback necesitan el catálogo, la taxonomía y el bus — o sea, imports —, y `lib/ports.js`
   **no puede importar nada**. Así que expone `setPipeline()`, del mismo modo que el bus expone
   `subscribe()` y no sabe qué es una automatización. Sin pipeline instalada, el registro se comporta
   como en F2.

2. **⭐ La sensibilidad del puerto decide si se cae al fallback, y se ve.** Con el proveedor fallando,
   `payments.fee` (media) se resolvió con la tabla local —el P&L nunca se rompió— e `invoicing.issue`
   (alta) **falló**: un CAE inventado es un problema legal. En la consola son dos resultados distintos,
   *Resuelta local* y *Error*, no dos errores iguales.

3. **⭐ No se reintenta lo que ya se resolvió local.** Si el puerto cayó al fallback, la operación
   *está hecha*: encolarla sería reintentar algo que nadie espera. La cola existe para lo que **quedó
   sin hacer**. Cuando algo no se encola, la consola dice el motivo — un reintento que no ocurre y no
   se explica es indistinguible de un bug.

4. **⭐ La clave de idempotencia la declara el contrato del puerto, no la infiere el panel.** Sólo
   `payments.charge` y `payments.refund` la traen en su `input`, porque son **hechos**; la comisión de
   un pedido es una **consulta**, y guardarle el resultado para siempre haría que el panel mostrara un
   número viejo con cara de nuevo. La ficha explica cuál de los dos casos es.

5. **⭐ El hallazgo del webhook: traducir y además publicar duplica el evento.** §5 dice "publicar al
   bus" y después "el módulo dueño escribe"; hechas las dos cosas literalmente, `confirmPayment` emite
   `pedido.pagado` **y** el puente también, y el motor despierta dos veces por el mismo hecho. La regla
   queda más filosa: **el que publica el evento de dominio es el módulo dueño**. El puente sólo emite
   cuando el `api/` del dueño no emite (`emits: false`), y la ficha dice cuál de las dos cosas pasó.

6. **⭐ Fallar el chequeo de salud no alcanza para probar la cola.** Como el asistente **no deja
   habilitar sin una prueba exitosa**, un proveedor que falla el `healthCheck` nunca llega a hacer una
   llamada. El doble de prueba ganó un comportamiento *"el chequeo pasa pero las llamadas fallan"* —
   que además es el caso más común de la vida real: el proveedor contesta el ping y se le caen las
   operaciones.

7. **⭐ Bug encontrado y corregido: reconfigurar no desconectaba.** `configureConnection` dejaba la
   conexión como "hay que probarla de nuevo" mientras el registro seguía mandando las llamadas al
   proveedor viejo. Es el peor estado posible: la pantalla y lo que pasa de verdad dejan de coincidir.

8. **⭐ Bug encontrado y corregido: el ejemplo real de facturación nunca se encontraba.** El payload de
   `invoicing.issue` buscaba `d.type === "factura"`, pero Facturación llama `docType` a eso —y
   `customerTaxCondition` a lo que el puerto llama `condition`. **Esa traducción es exactamente el
   trabajo del adaptador**, y el dry-run caía siempre al ejemplo sintético: decía la verdad ("ejemplo
   sintético") por el motivo equivocado.

9. **El P&L pide la comisión ~8 veces por pedido al pintarse.** Al conectar `payments.fee` se vieron
   **48 llamadas para 6 pedidos** en una sola apertura de Rentabilidad. No es un bug del contador: es
   la medida exacta de por qué ese puerto está marcado `syncOnly` y por qué la deuda de guardar la
   comisión en el pedido al cobrar es real y no teórica.

#### Verificación de F3

Todo conducido desde la UI, sobre el doble de prueba:

```
error → cola → backoff : invoicing.issue (alta) falla 2 llamadas, las dos se encolan,
                         el tick las reintenta a 1 s y quedan "Resuelto" (intento 2 → OK)
fallback               : payments.fee (media) falla y da "Resuelta local" sobre el pedido 10252;
                         el P&L sigue pintándose y NO se encola nada
idempotencia           : payments.charge → CALL-0057 OK · CALL-0058 "Repetida —
                         ya se ejecutó (CALL-0057). No se volvió a llamar."
                         y la ficha aclara: "Idempotencia simulada por el panel"
sin clave              : payments.fee → "no lleva clave, y no hace falta: es una consulta"
entrantes              : 4 recibidos / 1 traducido / 3 descartados
                         · payment.approved → pedido.pagado → pedidosApi.confirmPayment
                           → el pedido #10253 quedó **Pagado** de verdad
                         · el mismo payload otra vez → Duplicado
                         · firma forzada inválida → Firma inválida (antes de deduplicar)
                         · dispute.opened → Sin traducción, con el motivo
bus                    : integracion.conectada ×2 · integracion.llamada.error ×2 ·
                         integracion.webhook.recibido ×4 · integracion.webhook.descartado ×3
                         y pedido.pagado / pedido.backorder emitidos por **Pedidos**, no por el puente
builder                : "Una integración se cae" aparece en el grupo Integraciones con su
                         emittedAt y su payload; el sujeto es Conexión y las condiciones que no
                         aplican salen **deshabilitadas con el motivo**
```

Lint y build limpios; consola sin errores.

#### Deuda que F3 deja anotada

- **Un puerto de sensibilidad alta que falla rompe la pantalla que lo llamó.** Es la consecuencia
  correcta —la operación falla en vez de inventar un CAE— pero Facturación todavía no traduce ese
  error a un mensaje. Peor: la emisión ocurre dentro de una **lectura** (`listDocuments` materializa
  los comprobantes que faltan), así que un proveedor caído puede tumbar un listado. Lo que hay que
  arreglar no es el puerto: es que una lectura no debería emitir.
- **`payments.fee` sigue siendo `syncOnly`** por la misma razón de siempre, ahora medida (punto 9).

### Después — integraciones concretas, sólo si se piden
Cada una es **un archivo en `providers/` con su contrato**, más su entrada en el catálogo. Ningún
módulo del núcleo se toca. Si conectar un proveedor obliga a editar un `api/` del núcleo, es que el
puerto está mal definido y **se arregla el puerto, no el módulo**.
