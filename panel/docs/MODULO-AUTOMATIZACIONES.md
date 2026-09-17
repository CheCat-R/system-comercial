# Módulo Automatizaciones — Motor, Builder y UX

> **Consultar junto con [`ARCHITECTURE.md`](../ARCHITECTURE.md)** (§2 ubica Automatizaciones en la
> *Capa de Infraestructura y Transversal*) y las specs de los módulos que le dan eventos y sobre los
> que actúa: [`MODULO-CRM.md`](MODULO-CRM.md) ·
> [`MODULO-INVENTARIO-ABASTECIMIENTO.md`](MODULO-INVENTARIO-ABASTECIMIENTO.md) ·
> [`MODULO-LOGISTICA-FULFILLMENT.md`](MODULO-LOGISTICA-FULFILLMENT.md) ·
> [`MODULO-FINANZAS-FACTURACION.md`](MODULO-FINANZAS-FACTURACION.md) ·
> [`MODULO-MARKETING.md`](MODULO-MARKETING.md) · [`MODULO-TIENDA-CMS.md`](MODULO-TIENDA-CMS.md) ·
> [`MODULO-ANALYTICS.md`](MODULO-ANALYTICS.md).
>
> **Estado (2026-09-08): MÓDULO COMPLETO — Fases 1, 2 y 3 implementadas y verificadas.**
>
> El motor corre de punta a punta: bus, 35 eventos con contrato, escáner por flanco, evaluador de
> condiciones, los tres niveles de acción, los cuatro modos de ejecución con reloj simulado y las
> cuatro salvaguardas, con emisión real en 9 módulos. Se crean y publican automatizaciones desde la
> UI, con inspector generado del schema, tipado por sujeto y **simulador**. Las acciones sensibles
> pasan por una **bandeja de aprobación que revalida antes de ejecutar**, y el RBAC se aplica en el
> `api/`. Pantallas **Reglas** · **Builder** · **Historial** · **Bandeja de eventos** ·
> **Aprobaciones**.
>
> Tres specs anteriores ya lo dejaron reservado y **no lo implementaron a propósito**:
> Marketing §4.4 ("Marketing *define* los disparadores, no los ejecuta"),
> Logística §5.5 ("las notificaciones al cliente son responsabilidad exclusiva de un futuro módulo de
> Automatizaciones") y CRM §5 ("entró a «En riesgo» → email de recuperación").
> Este documento es ese módulo.

---

## 1. Objetivo y alcance

Automatizaciones es la capa que **conecta lo que pasa con lo que hay que hacer**. No es dueña de
ningún dato: no calcula precios, no mueve stock, no cobra. Escucha al resto de la plataforma, evalúa
reglas y **llama a las mismas `api/` que llamaría una persona desde la UI**.

### 1.1 ⭐ La regla que define el módulo

> **Una automatización no puede hacer nada que un usuario no pueda hacer a mano, por el mismo camino.**

Toda acción es una llamada a una función que ya existe en el `api/` del módulo dueño. Si una acción
necesitara escribir directo en un `data/*.mock.js`, o saltear una validación, o inventar una
transición de estado que el módulo no admite, **esa acción no existe**.

Tres consecuencias que se aplican en todo el módulo:

1. **El módulo dueño sigue mandando.** Si Logística prohíbe despachar un envío sin picking completo,
   una automatización tampoco puede. El error del módulo se propaga y la ejecución queda fallida
   **con el mensaje original**, no con uno genérico.
2. **Nada es silencioso.** Cada ejecución deja una traza con qué evento la disparó, qué condiciones
   se evaluaron, qué devolvió cada acción y cuánto tardó. Una automatización que no se puede auditar
   es una fuente de bugs que nadie encuentra.
3. **Lo que toca plata o llega al cliente no se ejecuta solo** — ver §5.3.

Es el mismo criterio que hizo funcionar a Analytics ("ninguna métrica existe sin declarar su
fórmula y su origen") aplicado a la escritura en vez de a la lectura.

### 1.2 ⭐ El problema arquitectónico: ser transversal sin romper el grafo de dependencias

El panel tiene una regla dura: **los `api/` se importan en una sola dirección, sin ciclos**. Y
Automatizaciones necesita las dos cosas a la vez:

- **escuchar** a Pedidos, Inventario, Logística, Finanzas, Marketing, CRM, Tienda;
- **actuar** sobre Pedidos, Inventario, Logística, Finanzas, Marketing, CRM, Tienda.

Si `pedidosApi` importara `automationsApi` para avisar, y `automationsApi` importara `pedidosApi`
para actuar, tendríamos un ciclo — y Vite lo resolvería con un módulo a medio inicializar, que es la
peor clase de bug: intermitente y dependiente del orden de carga.

**La solución es que el bus sea una hoja sin dependencias.**

```
              src/modules/automatizaciones/lib/bus.js
                    (NO IMPORTA NADA — es una hoja)
                    ▲                          │
           emit()   │                          │  subscribe()
                    │                          ▼
   pedidosApi · inventoryApi ·          automationsApi
   logisticaApi · marketingApi ·                │
   clientsApi · financeApi ·                    │ actúa llamando a…
   billingApi · supplyApi · tiendaApi   ────────┘
```

Los módulos importan **sólo `bus.js`**, que no importa nada, así que no pueden participar de un
ciclo. `automationsApi` importa el bus y todos los `api/`, en una sola dirección. El grafo sigue
siendo acíclico y ningún módulo aprende qué es una automatización: sólo anuncia lo que le pasó.

> Esto ya existe a medias: `clientsApi.js` tiene un `emitEvent()` local (líneas 35-46) que guarda los
> últimos 100 eventos en un array y los loguea en dev. Emite `Segmento_Cambiado`, `Tier_Cambiado`,
> `Pedido_Creado`, `Cotizacion_Convertida` y `Audiencia_Enviada_A_Marketing`. **F1 lo generaliza**:
> el stub del CRM pasa a delegar en el bus compartido, y `getEventLog()` sigue funcionando igual.

### 1.3 Qué NO hace

| Sí | No (y por qué) |
|---|---|
| Reglas de un paso: evento → condiciones → N acciones | **Journeys multi-paso con ramas y esperas entre pasos.** Un flujo con ramas es otro producto; se puede encadenar reglas, con el límite de profundidad de §2.6 |
| Ejecución inmediata, con retraso, programada y recurrente | **Cron real corriendo con el panel cerrado.** No hay backend: el reloj se simula (§2.5) |
| Acciones que llaman a los `api/` existentes | **Integraciones externas** (webhooks, Zapier, WhatsApp API). El envío de email ya es simulado en Marketing y sigue igual |
| Condiciones sobre el sujeto, su cuenta y su contexto | **Condiciones sobre métricas agregadas de Analytics.** Analytics ya tiene alertas de umbral (F3) y ése es su lugar; acá se disparan sobre entidades, no sobre KPIs |
| Simulador de "qué hubiera hecho" | Machine learning, sugerencia automática de reglas |
| Plantillas de fábrica | Marketplace de automatizaciones |

---

## 2. El motor conceptual

### 2.1 Las tres piezas y la Regla que las une

```
   Evento              Condición                 Acción
"algo pasó"      "¿corresponde actuar?"     "hacer esto"
      │                    │                      │
      └────────────────────┴──────────────────────┘
                           │
                        Regla
        (con su modo de ejecución y su estado)
```

Una **Regla** (`AutomationRule`) es la unidad que se crea, se publica, se pausa y se audita:

```js
{
  id: "AU-03",
  name: "Avisar cuando un SKU cae bajo el mínimo",
  description: "Le abre una tarea a Abastecimiento y etiqueta el SKU.",
  state: "publicada",            // borrador | publicada | pausada
  trigger: {
    kind: "state",               // event | state | schedule
    key: "stock.bajo_minimo",
    params: { statuses: ["bajo_minimo", "critico"] },
  },
  conditions: {
    match: "all",                // all | any
    rules: [
      { field: "sku.cost", op: "gte", value: 5000 },
      { field: "warehouse.id", op: "in", value: ["WH-1", "WH-2"] },
    ],
  },
  actions: [
    { key: "task.create", params: { title: "Reponer {{sku.name}}", assignee: "Abastecimiento" } },
    { key: "notify.panel", params: { level: "warning", message: "…" } },
  ],
  execution: { mode: "immediate" },
  guards: { dedupeWindowHours: 24, maxRunsPerTick: 20 },
  system: true,
}
```

**El sujeto es lo que ata todo.** Cada evento trae un **sujeto** — la entidad sobre la que se actúa:

```js
subject: { type: "order" | "account" | "sku" | "shipment" | "cart" | "purchaseOrder" | "document", id: "PED-1042" }
```

Las condiciones y las acciones **declaran sobre qué tipos de sujeto aplican**. Una acción
"reservar stock" no se puede colgar de una regla cuyo sujeto es una cuenta, y el builder la muestra
**deshabilitada con el motivo a la vista** — exactamente el mismo patrón que
`dimensionRejection()` en Analytics y que el catálogo cerrado de bloques en Tienda. Una regla
imposible no se puede ni construir.

### 2.2 El contrato de un evento

Igual que una métrica de Analytics no existe sin fórmula ni origen, **un evento no existe sin
contrato**:

| Campo | Qué declara |
|---|---|
| `key` | identificador estable, `modulo.hecho` (`pedido.pagado`) |
| `label` | cómo se llama en el builder |
| `module` | quién lo emite |
| `subjectType` | qué entidad viaja como sujeto |
| `emittedAt` | **el punto exacto del código** donde se emite (`pedidosApi.confirmPayment`) |
| `payload` | qué campos trae, con tipo |
| `kind` | `event` (algo cambió) o `state` (algo es cierto ahora) |
| `sample` | un payload de ejemplo, para el simulador y la documentación |

`assertEventContracts()` corre al cargar el módulo y **un evento sin contrato completo no se puede
elegir en el builder**. Mismo mecanismo que `assertContracts()` en Analytics.

### 2.3 ⭐ Las dos formas de que algo "pase"

Ésta es la distinción que ordena todo el catálogo, y **los seis ejemplos del pedido se reparten
exactamente 3 y 3** entre las dos familias — lo cual es una buena señal de que la distinción es real
y no una excusa de implementación:

| | **Evento** (`kind: "event"`) | **Condición observada** (`kind: "state"`) |
|---|---|---|
| Qué es | Algo **cambió** | Algo **es cierto ahora** |
| De dónde sale | El bus, en el momento de la mutación | Un **escáner** que evalúa un predicado sobre el estado actual en cada tick |
| Cuándo corre | Inmediato | En cada `tick()` |
| Ejemplos del pedido | Pedido creado · Pago rechazado · Pedido entregado | Stock bajo · Cliente VIP · Carrito abandonado |

**⭐ El escáner dispara por flanco, no por nivel.** "Stock bajo" no es un evento: es un estado que
puede durar semanas. Si la regla se ejecutara en cada tick mientras la condición es verdadera,
mandaría cuarenta avisos por el mismo SKU. El escáner mantiene una **marca de agua** de los sujetos
que ya están dentro de la condición, dispara **sólo cuando un sujeto entra**, y limpia la marca
cuando sale:

```
stock del SKU-2 →  ok  ok  bajo  bajo  bajo  ok  bajo
dispara         →   ·   ·   ▲     ·     ·    ·   ▲
```

Es el error más común en los motores de automatización reales y la razón por la que la gente
desconfía de ellos. Queda como **regla del módulo**, no como detalle.

> **Cuando un módulo ya emite el evento, se prefiere el evento.** "Cliente VIP" podría observarse
> mirando `account.tier === "vip"`, pero el CRM ya emite `Tier_Cambiado` en `setTierOverride` y en
> la re-derivación de segmentos: se usa ése, que trae el `from` y el `to` y no necesita marca de
> agua. El escáner es para lo que nadie anuncia.

### 2.4 Ejecución: los cuatro modos

| Modo | Qué significa | Cómo se resuelve |
|---|---|---|
| **Inmediata** | Se ejecuta en cuanto el evento entra al bus | Síncrono, en el mismo tick |
| **Con retraso** | Espera N minutos/horas/días desde el evento | Se materializa un `ScheduledJob` con `dueAt = evento + N`, y el tick lo drena cuando vence |
| **Programada** | A una hora fija del día (o de un día del mes) | El escáner corre y encola los matches con el `dueAt` de la próxima ocurrencia |
| **Recurrente** | Cada N horas/días, indefinidamente | Igual que programada, pero al ejecutarse **reencola la siguiente ocurrencia** |

**⭐ Las cuatro se reducen a una sola primitiva:** una cola de `ScheduledJob` con `dueAt`, y un
`tick(now)` que drena lo vencido. "Inmediata" es un job con `dueAt = now`. Un solo camino de código
para los cuatro modos significa un solo lugar donde puede fallar, y que el historial de ejecuciones
se ve igual para todos.

**Revalidación al vencer.** Un job que espera 24 horas se creó con un mundo que ya no existe: el
pedido pudo cancelarse, el stock pudo reponerse. Al drenarlo, **las condiciones se vuelven a
evaluar** contra el estado del momento de ejecución, y si ya no dan, la ejecución queda registrada
como `descartada` con el motivo. Un recordatorio de "tu pedido sigue sin pagarse" enviado sobre un
pedido ya pagado es peor que no mandar nada.

### 2.5 ⭐ El reloj: cómo se simulan los tiempos sin backend

**El panel no ejecuta nada mientras está cerrado.** No hay backend, no hay service worker, y el
estado en memoria se resetea con un reload completo, igual que en todos los módulos. Decirlo de
frente es parte de la spec: cualquier otra cosa sería mentirle al usuario sobre qué está mirando.

Sobre esa base:

- `TODAY = 2026-09-03`, la misma fecha de referencia de todos los módulos.
- El motor tiene un **reloj virtual** (`lib/clock.js`) que arranca en `TODAY` y sólo avanza cuando
  se lo pide.
- `tick(now)` corre: al entrar al módulo, al emitirse un evento, y a demanda.
- La UI ofrece **avanzar el reloj**: +1 h · +1 día · *hasta el próximo job*. Se ve la cola vaciarse
  y las ejecuciones aparecer en el historial.

Esto no es un parche: **es la única forma de que un retraso de 24 horas sea demostrable y testeable**
en una sesión de dos minutos. Y es el mismo patrón de materialización perezosa que el panel ya usa en
`ensureShipment`, `ensureDocsForOrder`, `ensurePointsLedger` y `ensureScheduledPublish`.

### 2.6 ⭐ Las cuatro salvaguardas

Un motor que escucha lo que él mismo provoca es un bucle infinito esperando a ocurrir: la regla A
cambia un pedido → se emite un evento → dispara la regla B → mueve stock → dispara la regla A. En una
app sin backend eso es una pestaña congelada. Hacen falta las cuatro, porque cada una tapa un agujero
distinto:

| # | Salvaguarda | Qué evita | Default |
|---|---|---|---|
| 1 | **Profundidad de cadena** — un evento emitido *por* una acción hereda `depth + 1`; pasado el límite se descarta y se registra el motivo | Cascadas A→B→A | `maxDepth: 3` |
| 2 | **Clave de idempotencia** — `ruleId + subjectId + eventKey` dentro de una ventana | Que la misma regla se ejecute dos veces sobre el mismo sujeto por lo mismo | ventana `24 h` |
| 3 | **Presupuesto por tick** — tope de ejecuciones por regla y por tick | Que un escáner que matchea 300 SKUs mande 300 acciones | `maxRunsPerTick: 20` |
| 4 | **Una regla no se dispara a sí misma**, ni directa ni transitivamente dentro de la misma cadena | El auto-disparo, que las otras tres no ven | siempre activo |

Cuando una salvaguarda corta algo, **queda en el historial como ejecución `bloqueada` con el motivo**.
Un tope que actúa en silencio es indistinguible de un motor roto.

---

## 3. Eventos — el catálogo por módulo

Todos los puntos de emisión son funciones que **ya existen**. La columna "Emite en" es el lugar
exacto donde F1 agrega la llamada al bus.

### 3.1 Pedidos

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `pedido.creado` | order | `clientsApi.convertQuoteToOrder` | `orderId, accountId, amount, source` |
| `pedido.pagado` | order | `pedidosApi.confirmPayment` | `orderId, accountId, total, paymentMethod, backorders[]` |
| `pedido.backorder` | order | `pedidosApi.confirmPayment` (si `backorders.length`) | `orderId, lines[]` |
| `pedido.cancelado` | order | `pedidosApi.cancelOrder` | `orderId, accountId` |
| `pedido.reembolsado` | order | `pedidosApi.refundOrder` | `orderId, amount` |
| `pedido.descuento_aplicado` | order | `pedidosApi.applyDiscountToOrder` | `orderId, discount, couponCode` |
| `pedido.pendiente_vencido` ⏱ | order | escáner | `orderId, days` |

### 3.2 Logística — dueña del ciclo físico posterior al pago

> `markDispatched` / `markDelivered` / `markReturnRequested` viven en `pedidosApi` pero **los llama
> `logisticaApi`** (Logística §4.8). El evento lo emite **el dueño de la transición**, no quien
> guarda el campo: si no, cada despacho emitiría dos eventos y toda regla se ejecutaría dos veces.

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `envio.despachado` | shipment | `logisticaApi.dispatchShipment` | `shipmentId, orderId, carrierId, trackingCode, eta` |
| `envio.entregado` | shipment | `logisticaApi.markShipmentDelivered` | `shipmentId, orderId, deliveredAt, leadTimeHours` |
| `envio.en_transito` | shipment | `logisticaApi.addTrackingEvent` | `shipmentId, status` |
| `envio.incidencia_abierta` | shipment | `logisticaApi.openIncident` | `shipmentId, kind, note` |
| `envio.incidencia_resuelta` | shipment | `logisticaApi.resolveIncident` | `shipmentId, resolution` |
| `envio.diferencia_stock` | shipment | `logisticaApi.reportStockDifference` | `shipmentId, skuId, expected, found` |
| `envio.demorado` ⏱ | shipment | escáner | `shipmentId, hoursSinceDispatch` |
| `envio.sin_preparar` ⏱ | shipment | escáner | `shipmentId, hoursWaiting` |

> El umbral de 48 h de "sin preparar" ya está en Logística §5.5, marcado en su día como *"el mismo
> umbral que en el futuro dispararía Automatizaciones"*. Es literalmente este evento.

### 3.3 Inventario y Abastecimiento

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `stock.bajo_minimo` ⏱ | sku | escáner sobre `getStockGroupedBySku()` | `skuId, warehouseId, available, minStock, status` |
| `stock.agotado` ⏱ | sku | escáner (`status === "agotado"`) | `skuId, warehouseId` |
| `stock.repuesto` | sku | `inventoryApi.receiveGoods` | `skuId, qty, warehouseId` |
| `stock.ajustado` | sku | `inventoryApi.createAdjustment` | `skuId, delta, reason` |
| `transferencia.recibida` | — | `inventoryApi.receiveTransfer` | `transferId, lines[]` |
| `compra.enviada` | purchaseOrder | `supplyApi.sendPurchaseOrder` | `poId, supplierId, total` |
| `compra.recibida` | purchaseOrder | `supplyApi.receivePurchaseOrder` | `poId, supplierId, lines[]` |
| `compra.demorada` ⏱ | purchaseOrder | escáner | `poId, daysLate` |

Los cuatro estados de stock (`ok` · `bajo_minimo` · `critico` · `agotado`) salen tal cual de
`inventario/lib/stock.js`: **Automatizaciones no define su propio umbral**, usa el `minStock` /
`safetyStock` que ya configura Inventario por SKU y depósito.

### 3.4 Clientes / CRM

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `cliente.segmento_cambiado` | account | `clientsApi` (ya emite `Segmento_Cambiado`) | `accountId, from, to` |
| `cliente.tier_cambiado` | account | `clientsApi` (ya emite `Tier_Cambiado`) | `accountId, from, to, manual` |
| `cliente.cotizacion_convertida` | account | `clientsApi.convertQuoteToOrder` | `accountId, quoteId, orderId, amount` |
| `cliente.etiquetado` | account | `clientsApi.saveTags` | `accountId, added[], removed[]` |
| `cliente.inactivo` ⏱ | account | escáner sobre `recencyDays` | `accountId, recencyDays, segment` |

Los nueve segmentos (`lead` … `perdido`) y los seis tiers (`vip` · `frecuente` · `activo` ·
`en_riesgo` · `durmiente` · `lead`) son los de `clientes/lib/segments.js`. **"Cliente VIP" es
`tier === "vip"`, que el CRM deriva de `segmentKey === "campeon"`** — Automatizaciones no inventa una
segunda definición de VIP, que es justo lo que haría que dos pantallas del panel se contradigan.

### 3.5 Marketing

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `carrito.abandonado` ⏱ | cart | escáner sobre `listAbandonedCarts({ status: "abierto" })` | `cartId, accountId, subtotal, hoursIdle` |
| `carrito.recuperado` | cart | `marketingApi` (cierre del carrito) | `cartId, accountId, orderId` |
| `cupon.canjeado` | account | `marketingApi.getCouponRedemptions` / alta de pedido | `couponCode, accountId, orderId, discount` |
| `campania.lanzada` | — | `marketingApi.launchCampaign` | `campaignId, audienceSize` |
| `puntos.acreditados` | account | ledger de fidelización | `accountId, points, balance` |
| `puntos.por_vencer` ⏱ | account | escáner | `accountId, points, daysToExpiry` |

### 3.6 Finanzas y Facturación

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `reembolso.solicitado` | order | `pedidosApi.markReturnRequested` | `orderId, amount, reason` |
| `reembolso.aprobado` | order | `financeApi.approveRefund` | `orderId, amount` |
| `reembolso.rechazado` | order | `financeApi.rejectRefund` | `orderId, reason` |
| `gasto.creado` | — | `financeApi.createExpense` | `expenseId, category, amount` |
| `comprobante.emitido` | document | `billingApi` (emisión) | `documentId, orderId, type, total` |
| `nota.emitida` | document | `billingApi.emitNote` | `documentId, invoiceId, type, total` |

### 3.7 Tienda / CMS

| Evento | Sujeto | Emite en | Payload |
|---|---|---|---|
| `pagina.publicada` | — | `tiendaApi.publishPage` | `pageId, type, slug` |
| `pagina.programada_vencida` ⏱ | — | `tiendaApi.ensureScheduledPublish` | `pageId, scheduledAt` |
| `newsletter.suscripcion` | account | `tiendaApi.subscribeFromStore` | `email, accountId` |

⏱ = condición observada por el escáner (§2.3), no evento emitido.

### 3.8 ⭐ Lo que hoy no se puede disparar

Igual que Analytics documenta lo que no se puede medir, acá hay que decir lo que no se puede
escuchar. Encontrado leyendo el código, no supuesto:

1. **"Pago rechazado" no existe en el modelo.** `paymentStatus` sólo admite `Pendiente` · `Pagado` ·
   `Cancelado` · `Reembolsado` · `Reembolso pendiente`. No hay estado de rechazo porque no hay
   pasarela real. Lo más cercano hoy es `pedido.pendiente_vencido` (pendiente hace más de N días),
   que es una condición observada.
   **Recomendación:** agregar a `pedidosApi` un `rejectPayment(id)` que lleve el pedido de
   `Pendiente` a `Rechazado`. Es contenido y barato — no hay reserva que liberar, porque la reserva
   se hace recién al confirmar el pago — y convierte uno de los seis ejemplos pedidos en un evento
   real en vez de un sucedáneo. **Toca `pedidos/`, así que es una decisión a tomar, no algo que dé
   por hecho.**
2. **"Pedido creado" tiene un solo origen real.** `pedidosApi` no exporta ningún `createOrder`: los
   pedidos vienen del seed o de `clientsApi.convertQuoteToOrder`. El evento existe, pero hoy sólo se
   dispara desde el CRM. No es un problema del motor; es el alcance actual de Pedidos.
3. **No hay eventos de sesión ni de navegación** (visitó la tienda, vio un producto). Es la misma
   ausencia de tráfico que hace imposible la conversión de sitio en Analytics §2.8. Un "abandono de
   navegación" no se puede disparar.
4. **No hay eventos de usuario del panel** (login, cambio de permisos): el módulo de Usuarios todavía
   es de scaffold.

---

## 4. Condiciones

### 4.1 El contrato

```js
{
  key: "order.total",
  label: "Total del pedido",
  subjectTypes: ["order"],          // sobre qué sujetos aplica
  type: "money",                    // money | number | text | enum | date | boolean | list
  source: "pedidosApi.getOrder().total",
  options: null,                    // para enum: valores cerrados del módulo dueño
  ops: ["gte", "lte", "eq", "between"],
}
```

Igual que con los eventos: **una condición declara de dónde sale su valor**. Los `enum` no se
escriben a mano, se leen del módulo dueño (los segmentos del CRM, los estados de stock de
Inventario, los estados de envío de Logística), así que no pueden quedar desincronizados.

### 4.2 Operadores

`eq` · `ne` · `gt` · `gte` · `lt` · `lte` · `in` · `not_in` · `between` · `contains` ·
`is_empty` · `changed_to` (sólo sobre eventos que traen `from`/`to`).

### 4.3 Catálogo por ámbito

| Ámbito | Condiciones |
|---|---|
| **Pedido** | total · subtotal · descuento · tiene cupón · medio de pago · estado de pago · estado de fulfillment · depósito · cantidad de líneas · unidades · antigüedad en días · contiene SKU / categoría / marca |
| **Cliente** | segmento · tier · tipo de cuenta (persona/empresa) · LTV · cantidad de pedidos · días desde la última compra · etiquetas · zona · tiene email suscripto · saldo de puntos |
| **SKU / stock** | estado de stock · disponible · onHand · reservado · mínimo · costo · categoría · marca · depósito · días de cobertura |
| **Envío** | estado · transportista · zona · método · horas desde el despacho · tiene incidencia · ETA vencida |
| **Carrito** | subtotal · horas inactivo · cantidad de ítems · ya recibió recuperación |
| **Compra (OC)** | proveedor · total · días de demora · estado |
| **Contexto** | día de la semana · hora del día · es día hábil |

### 4.4 Combinación

Un grupo con `match: "all" | "any"` y una lista de condiciones. **Un solo nivel de anidamiento**: se
permite un grupo `any` dentro de un `all` (y viceversa), no más. Con la profundidad ilimitada llega
el árbol booleano que nadie sabe leer seis meses después; con un nivel se cubre el 95 % de los casos
reales y la regla se sigue leyendo como una oración.

---

## 5. Acciones

### 5.1 El contrato

```js
{
  key: "order.tag",
  label: "Etiquetar el pedido",
  subjectTypes: ["order"],
  tier: "safe",                       // safe | contact | sensitive
  calls: "pedidosApi.applyDiscountToOrder",   // ⭐ la función real
  params: [ /* schema, se renderiza solo */ ],
  preview: (subject, params) => "Le pone la etiqueta «urgente» a PED-1042",
  run: (subject, params) => { /* llama al api y devuelve el resultado */ },
}
```

`preview()` es lo que hace posible el simulador (§9.3): **describir la acción sin ejecutarla**.

### 5.2 Catálogo por módulo

| Módulo | Acciones | Llama a |
|---|---|---|
| **Panel** | Crear tarea · Notificar en el panel · Anotar en el timeline del cliente | interno · `clientsApi.addActivity` |
| **CRM** | Etiquetar cuenta · Cambiar tier (override) · Agregar a segmento manual · Enviar a campaña | `saveTags` · `setTierOverride` · `toggleAccountInSegment` · `sendToCampaign` |
| **Marketing** | Enviar recuperación de carrito · Lanzar campaña one-shot · Emitir cupón nominal · Acreditar puntos | `sendCartRecovery` · `createCampaign`+`launchCampaign` · `createCoupon` |
| **Inventario** | Ajustar stock · Sugerir reposición · Fijar umbrales | `createAdjustment` · `getReplenishmentSuggestions` · `setThresholds` |
| **Abastecimiento** | Crear orden de compra en borrador | `createPurchaseOrder` |
| **Logística** | Abrir incidencia · Agregar evento de tracking | `openIncident` · `addTrackingEvent` |
| **Pedidos** | Aplicar descuento · Cancelar · Reembolsar | `applyDiscountToOrder` · `cancelOrder` · `refundOrder` |
| **Finanzas** | Registrar gasto · Aprobar reembolso | `createExpense` · `approveRefund` |
| **Facturación** | Emitir nota de crédito | `emitNote` |

### 5.3 ⭐ Los tres niveles de acción, y por qué el tercero no se ejecuta solo

| Nivel | Qué toca | Cómo se ejecuta |
|---|---|---|
| **Segura** (`safe`) | Sólo estado interno del panel: tareas, etiquetas, notas, notificaciones | Directo |
| **De contacto** (`contact`) | Sale hacia el cliente: emails, campañas, cupones nominales | Directo, **pero** sólo si la regla está publicada, y **respetando las bajas de canal** (`isBlocked`) que ya valida Marketing |
| **Sensible** (`sensitive`) | Plata o estados irreversibles: reembolsar, cancelar, emitir nota de crédito, crear OC | **No se ejecuta sola.** Deja una **propuesta** en la bandeja de aprobación con todo el contexto, y una persona confirma o descarta |

El gate de aprobación no es una idea nueva: es exactamente el que Finanzas ya usa para los reembolsos
(`markReturnRequested` → `approveRefund`). Automatizaciones lo reutiliza en vez de abrir un segundo
camino por el que la plata se puede mover sin que nadie firme.

**Y las bajas de canal se respetan siempre.** `sendCartRecovery` ya tira error si la cuenta se dio de
baja de email. Una automatización que atropelle eso convierte una funcionalidad en un problema legal.

---

## 6. Modelo de dominio

| Entidad | Descripción | Dueño |
|---|---|---|
| **Evento** (`Event`) | `{ key, subject, payload, at, depth, origin }`. `origin` dice si vino del bus, del escáner o de una acción | Automatizaciones |
| **Regla** (`AutomationRule`) | Disparador + condiciones + acciones + modo de ejecución + estado | Automatizaciones |
| **Disparador** (`Trigger`) | `{ kind: event\|state\|schedule, key, params }` | Automatizaciones |
| **Ejecución** (`Run`) | Una corrida de una regla sobre un sujeto: `{ ruleId, subject, event, status, steps[], startedAt, ms }` | Automatizaciones |
| **Paso** (`RunStep`) | Una acción dentro de una ejecución, con su resultado o su error textual | Automatizaciones |
| **Trabajo programado** (`ScheduledJob`) | `{ ruleId, subject, dueAt, kind }` — la cola de §2.4 | Automatizaciones |
| **Propuesta** (`PendingAction`) | Acción sensible esperando aprobación (§5.3) | Automatizaciones |
| **Marca de agua** (`Watermark`) | Sujetos que ya están dentro de una condición observada (§2.3) | Automatizaciones |

**Estados de una ejecución:** `ok` · `parcial` (alguna acción falló) · `fallida` · `descartada`
(las condiciones dejaron de dar al vencer el job) · `bloqueada` (cortó una salvaguarda) ·
`simulada` (dry-run) · `pendiente_aprobacion`.

---

## 7. Mapa de integración

```
                         ┌──────────────┐
   módulos ──emit()────► │   bus.js     │ ◄──subscribe()── engine
   (sin saber de         │  (sin deps)  │
    automatizaciones)    └──────────────┘
                                                  engine ──► scanner ──► lee todos los api/
                                                         └─► actions ──► escribe vía los api/
```

- **Escribe en:** Pedidos · CRM · Inventario · Abastecimiento · Logística · Marketing · Finanzas ·
  Facturación — **siempre por sus `api/`**, nunca en sus datos.
- **Lee de:** los mismos, más Productos y Tienda.
- **Nadie importa `automationsApi`.** Los módulos sólo conocen `bus.js`.
- **Analytics no participa.** Es de sólo lectura y no debe disparar escrituras; sus alertas de
  umbral (Analytics F3) resuelven el caso de "avisar por un KPI" y no se duplica acá.

---

## 8. Reglas del módulo

1. Una automatización **no puede hacer lo que un usuario no puede** (§1.1).
2. El **error del módulo dueño se propaga textual**, nunca se traduce a "algo salió mal".
3. El escáner **dispara por flanco**, no por nivel (§2.3).
4. Un job diferido **revalida sus condiciones al vencer** (§2.4).
5. Las **cuatro salvaguardas** están siempre activas, y cuando cortan **lo dicen** (§2.6).
6. Las acciones **sensibles pasan por aprobación**; las de contacto **respetan las bajas de canal**
   (§5.3).
7. Una regla en **borrador nunca ejecuta**: sólo simula.
8. Todo lo que ejecuta **queda en el historial**, incluidas las simulaciones y los bloqueos.
9. Las **opciones cerradas se leen del módulo dueño** (segmentos, estados de stock, estados de
   envío): Automatizaciones no mantiene una segunda copia de ninguna taxonomía.
10. El **sujeto tipa la regla**: condiciones y acciones incompatibles se muestran deshabilitadas con
    el motivo, nunca ocultas.

---

## 9. UX — el Automation Builder

### 9.1 Lista (`/automatizaciones`)

Una fila por regla, y lo que importa a la vista: **cuándo se disparó por última vez y cómo le fue.**
Una automatización sin esa columna es un acto de fe.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Automatizaciones                        [Simular reloj ▾]  [+ Nueva regla]  │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ● Stock bajo → tarea a Abastecimiento    stock.bajo_minimo   ⏱ inmediata    │
│    Publicada · última: hace 2 h · 14 ejecuciones · 0 fallidas                 │
│  ● Pedido entregado → pedir reseña        envio.entregado     ⏱ +3 días      │
│    Publicada · última: ayer · 6 ejecuciones · 1 pendiente                     │
│  ○ Carrito abandonado → recuperación      carrito.abandonado  ⏱ +2 h         │
│    Pausada · última: hace 4 días                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

Filtros por módulo, estado y modo de ejecución. Las de fábrica se pueden pausar y duplicar, no
borrar — mismo criterio que los reportes de Analytics y las páginas de Tienda.

### 9.2 ⭐ El Builder (`/automatizaciones/:id`)

**La regla se lee como una oración, y el inspector se genera solo.** Es el mismo patrón que probó
funcionar en el Store Builder (outline a la izquierda + inspector autogenerado por schema a la
derecha), aplicado a `Cuando → Si → Entonces` en vez de `Página → Sección → Bloque`:

```
┌───────────────────────────────┬──────────────────────────────────┐
│  CUANDO                       │  Inspector del paso seleccionado │
│  ▸ un envío se marca entregado│                                  │
│                               │  Retraso                         │
│  SI  (se cumplen todas)       │  [ 3 ] [ días ▾ ]                │
│  ▸ total del pedido ≥ $80.000 │                                  │
│  ▸ el cliente no es «lead»    │  Revalidar al vencer   [✓]       │
│  + Agregar condición          │                                  │
│                               │  ⓘ Si a los 3 días el pedido     │
│  ENTONCES                     │    fue devuelto, no se envía.    │
│  ▸ enviar campaña «Reseña»    │                                  │
│  ▸ acreditar 50 puntos        │                                  │
│  + Agregar acción             │                                  │
├───────────────────────────────┴──────────────────────────────────┤
│  Sujeto: Envío · 3 pasos · [Simular]  [Guardar borrador] [Publicar]│
└──────────────────────────────────────────────────────────────────┘
```

Cuatro decisiones de UX:

1. **La columna izquierda es la regla en castellano.** Se lee de arriba abajo y se entiende sin
   abrir nada. El detalle vive en el inspector.
2. **Elegir el disparador fija el tipo de sujeto**, y a partir de ahí las condiciones y acciones que
   no aplican aparecen **deshabilitadas con el motivo**, no escondidas. Ver una opción en gris con
   "no aplica: el sujeto de esta regla es un envío, no una cuenta" enseña el modelo; que desaparezca,
   no.
3. **El inspector se genera del schema del paso** (`ParamField`), igual que `SchemaField` en Tienda.
   Se escribe una vez y sirve para las ~35 condiciones y ~20 acciones.
   > Se hace uno propio en vez de reutilizar el de Tienda: aquél resuelve referencias vía `tiendaApi`
   > (colecciones, banners, medios), y compartirlo metería una dependencia de Automatizaciones a
   > Tienda que no corresponde. Se comparte **el patrón**, no el archivo.
4. **Borrador y publicada, como una página de Tienda.** Una regla en borrador se puede simular pero
   nunca ejecuta. Publicar es un acto deliberado.

### 9.3 ⭐ Simulador (dry-run)

El botón más importante de la pantalla. Corre la regla contra el estado actual —o contra los últimos
N eventos del bus— **sin ejecutar nada**, y devuelve:

- **cuántos sujetos matchean hoy**, y cuáles;
- para cada uno, **qué haría cada acción**, en texto (`preview()`);
- **qué salvaguarda cortaría** y a cuántos (dedup, presupuesto, profundidad);
- las condiciones que **más descartan**, para entender por qué una regla no dispara.

Sobre un dataset mock, sin esto no hay forma de confiar en una regla antes de publicarla. Queda
registrado en el historial como ejecución `simulada`.

### 9.4 Historial (`/automatizaciones/historial`)

Todas las ejecuciones, filtrables por regla, estado y fecha. Cada fila abre el detalle: el evento con
su payload, cada condición con su resultado, cada acción con lo que devolvió o el error textual del
módulo, y el tiempo. Los bloqueos y descartes **aparecen acá**, con el motivo — es donde se responde
"¿por qué no se ejecutó?", que es la pregunta que la gente hace siempre.

### 9.5 Bandeja de eventos (`/automatizaciones/eventos`)

El bus en vivo: los últimos eventos con su clave, sujeto, payload, origen (`bus` · `escáner` ·
`acción`), profundidad y qué reglas despertó. Es la herramienta de diagnóstico del módulo y, de paso,
la mejor documentación de qué emite cada módulo. Incluye un **emisor manual** para probar una regla
disparando un evento a mano.

### 9.6 Aprobaciones (`/automatizaciones/aprobaciones`)

La cola de acciones sensibles (§5.3): qué regla la propuso, sobre qué sujeto, qué haría exactamente y
cuánta plata mueve. Aprobar ejecuta; descartar la cierra con motivo. Vacía en el caso normal.

### 9.7 Plantillas

Seis de fábrica, que son **los seis ejemplos del pedido** y cubren las dos familias de disparador y
los tres niveles de acción:

| Plantilla | Disparador | Familia | Acción |
|---|---|---|---|
| Stock bajo → reponer | `stock.bajo_minimo` | observada | tarea + notificación *(segura)* |
| Pedido creado → confirmar | `pedido.creado` | evento | email de confirmación *(contacto)* |
| Pago rechazado → recuperar | `pedido.pago_rechazado`* | evento | email + tarea *(contacto)* |
| Cliente VIP → trato preferencial | `cliente.tier_cambiado` → `vip` | evento | etiqueta + cupón nominal *(contacto)* |
| Carrito abandonado → recuperación | `carrito.abandonado` | observada | `sendCartRecovery` a las 2 h *(contacto)* |
| Pedido entregado → reseña + puntos | `envio.entregado` | evento | campaña + puntos, a los 3 días *(contacto)* |

\* depende de la decisión de §3.8.1.

---

## 10. Rutas y permisos

| Ruta | Pantalla |
|---|---|
| `/automatizaciones` | Lista de reglas |
| `/automatizaciones/nueva` · `/:id` | Automation Builder |
| `/automatizaciones/historial` | Historial de ejecuciones |
| `/automatizaciones/eventos` | Bandeja de eventos (bus) |
| `/automatizaciones/aprobaciones` | Acciones sensibles pendientes |

Sidebar: sección nueva **AUTOMATIZACIÓN**, arriba de ANÁLISIS.

| Acción | Admin | Dirección | Marketing | Ventas | Otros |
|---|---|---|---|---|---|
| Ver reglas e historial | ✅ | ✅ | ✅ | ✅ | ❌ |
| Crear y editar reglas | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicar / pausar | ✅ | ✅ | ❌ | ❌ | ❌ |
| Usar acciones **sensibles** | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aprobar la cola de acciones | ✅ | ✅ | ❌ | ❌ | ❌ |
| Avanzar el reloj simulado | ✅ | ✅ | ❌ | ❌ | ❌ |

**El permiso se aplica en el motor, no en la UI** — igual que el RBAC de Analytics: una acción
sensible propuesta por alguien sin permiso ni siquiera se encola.

---

## 11. Arquitectura de archivos

```
src/modules/automatizaciones/
├── lib/
│   ├── bus.js              # ⭐ hoja sin dependencias: emit / subscribe / log
│   ├── events.js           # ⭐ catálogo de eventos con contrato + assertEventContracts()
│   ├── conditions.js       # catálogo de condiciones, operadores y evaluador
│   ├── actions.js          # catálogo de acciones: preview() + run(), con su nivel
│   ├── scanner.js          # ⭐ condiciones observadas, con marca de agua por flanco
│   ├── engine.js           # ⭐ match → evaluar → ejecutar, con las 4 salvaguardas
│   ├── clock.js            # reloj virtual + cola de ScheduledJob + tick()
│   └── describe.js         # la regla en castellano (lista, historial y previews)
├── data/
│   ├── rules.mock.js       # reglas de fábrica (las 6 plantillas)
│   └── runs.mock.js        # historial sembrado, para que la pantalla no arranque vacía
├── api/
│   └── automationsApi.js   # única puerta: CRUD de reglas · simular · tick · aprobaciones
├── components/
│   ├── RuleOutline.jsx     # la regla como oración (patrón SectionOutline)
│   ├── ParamField.jsx      # inspector autogenerado por schema
│   ├── TriggerPicker.jsx   # eventos por módulo, con su contrato a la vista
│   ├── StepPicker.jsx      # condiciones/acciones, deshabilitadas con motivo
│   ├── RunDetail.jsx       # traza de una ejecución
│   └── ClockBar.jsx        # avanzar el reloj y ver la cola
├── Automatizaciones.jsx · Builder.jsx · Historial.jsx
├── Eventos.jsx · Aprobaciones.jsx
└── Automatizaciones.css
```

Más los **puntos de emisión** en los `api/` de los otros módulos: una línea `emit(...)` por
transición, sin otra lógica. Es el único cambio que F1 hace fuera de `automatizaciones/`, y es
deliberadamente trivial de revisar.

---

## 12. Fases

### F1 — El motor ✅

**Implementado (2026-09-08).**

- `lib/bus.js` — la hoja sin dependencias. `emit` (anuncia) · `record` (sólo deja rastro) ·
  `subscribe` · `withContext` (hereda profundidad y origen).
- `lib/events.js` — **35 eventos con contrato** + `assertEventContracts()`.
- `lib/conditions.js` — 38 condiciones con su origen declarado, 15 operadores y el evaluador que
  devuelve **el valor que vio** cada condición.
- `lib/actions.js` — acciones con `preview()` + `run()` y su nivel (`safe` / `contact` / `sensitive`),
  más las bandejas internas de tareas y notificaciones.
- `lib/scanner.js` — condiciones observadas **por flanco**, con marca de agua.
- `lib/engine.js` — el ciclo completo y las **cuatro salvaguardas**.
- `lib/clock.js` — reloj virtual y cola de trabajos (la primitiva única de §2.4).
- `lib/subjects.js` · `lib/describe.js` — carga del sujeto e interpolación; la regla en castellano.
- `api/automationsApi.js`, `data/rules.mock.js` (las 7 de fábrica), pantallas **Reglas**,
  **Historial** y **Bandeja de eventos**, sección **AUTOMATIZACIÓN** en el Sidebar.
- **Emisión real en 9 módulos**: Pedidos · Logística · Inventario · Abastecimiento · CRM ·
  Marketing · Finanzas · Facturación · Tienda.

#### Decisiones y hallazgos al implementar F1

1. **`rejectPayment` agregado a Pedidos** (decisión tomada con el usuario, §3.8.1). `paymentStatus`
   gana el estado `Rechazado`; se sumaron `retryPayment` (si no, el rechazo sería un callejón sin
   salida) y la posibilidad de cancelar desde `Rechazado`. No hay reserva que liberar: la reserva se
   hace recién al confirmar el pago. La UI de Pedidos tiene los botones **Rechazar pago** y
   **Reintentar pago**.

2. **⭐ El motor tiene que arrancar con la app, no con su pantalla.** Encontrado probando: rechazar
   un pago desde Pedidos **no disparaba nada** si antes no habías entrado a `/automatizaciones`,
   porque el suscriptor recién se registraba ahí. Una automatización que sólo funciona cuando estás
   mirando la pantalla de automatizaciones no es una automatización. `start()` se llama ahora en
   `App.jsx`, y es idempotente.

3. **⭐ El escáner de stock recorre filas SKU × depósito, no el SKU consolidado.**
   `getStockGroupedBySku()` **suma las cantidades** de todos los depósitos pero **propaga el peor
   estado** (`worstStatusKey`). Escaneando el consolidado, *Zapatillas Running X* aparecía "bajo
   mínimo" con **123 unidades disponibles** —porque uno de sus cuatro depósitos estaba corto— y la
   tarea decía *"quedan 123"*, que es exactamente el número que no hay que mirar. Ahora el aviso
   nombra el depósito: *"Reponer Zapatillas Running X en Depósito Central — quedan 24 (mínimo 30)"*.
   El sujeto sigue siendo el SKU, para que las condiciones `sku.*` funcionen.

4. **⭐ La idempotencia usa la misma granularidad que la marca de agua.** Consecuencia directa de lo
   anterior: si la marca de agua distingue `SKU-5@DEP-01` de `SKU-5@DEP-04` pero la clave de dedupe
   sólo mira el SKU, el segundo depósito queda bloqueado 24 h y **el aviso nunca llega**. Dos
   mecanismos contando cosas distintas es peor que no tener ninguno. El evento puede traer su propio
   `dedupeId`.

5. **⭐ `emit` anuncia, `record` sólo deja rastro.** Los eventos del escáner son sintéticos y su
   regla ya tiene el trabajo encolado; si además se emitieran, el suscriptor los encolaría **una
   segunda vez** y todo se ejecutaría doble. Pero si no quedaran en la traza, la Bandeja de eventos
   mostraría la mitad de lo que pasa — y un evento que no se puede ver es justo lo que hace que
   nadie confíe en el motor. De ahí las dos funciones.

6. **El evento lo emite el dueño de la transición, no quien guarda el campo.**
   `markDispatched`/`markDelivered` viven en `pedidosApi` pero los llama `logisticaApi`
   (Logística §4.8): `envio.despachado` y `envio.entregado` los emite Logística. Si los emitieran
   los dos, cada despacho dispararía toda regla dos veces.

7. **El stub de eventos del CRM se generalizó en vez de duplicarse.** `clientsApi.emitEvent()` ahora
   delega en el bus compartido con una tabla de traducción de nombres viejos a claves del catálogo;
   `getEventLog()` sigue funcionando igual. `Audiencia_Enviada_A_Marketing` queda **sin mapear a
   propósito**: es un handoff interno CRM↔Marketing, no un hecho sobre el que tenga sentido
   automatizar.

8. **La oración de la regla sólo baja la primera letra.** Bajar la cadena entera rompía los nombres
   propios y, peor, los placeholders: `{{order.customerName}}` se convertía en
   `{{order.customername}}`, que además deja de resolver.

9. **Las acciones sensibles ya no se ejecutan en F1**, aunque la pantalla para aprobarlas llegue en
   F3: el motor las deja en `pendiente_aprobacion` con su `preview()`. La propiedad de seguridad
   rige desde el día uno; la UI viene después.

10. **`ParamField` propio, no el `SchemaField` de Tienda.** Aquél resuelve referencias vía
    `tiendaApi` (colecciones, banners, medios) y compartirlo metería una dependencia de
    Automatizaciones a Tienda que no corresponde. Se comparte el patrón, no el archivo. (El
    componente se escribe en F2, con el Builder.)

#### Verificación de F1

Todo medido en el navegador, sobre el app corriendo:

```
escáner, primer ciclo          : 3 ejecuciones (SKU-5@DEP-01, SKU-5@DEP-04, SKU-1@DEP-04)
ciclos 2, 3 y 4                : 0, 0, 0 · 0 bloqueadas   ← el flanco funciona
evento real desde la UI        : «Rechazar pago» en /pedidos/10253 → AU-03 ejecutada 3/3
                                 (tarea creada · etiqueta «pago-rechazado» en el CRM · notificación)
herencia de profundidad        : account.tag → saveTags → `cliente.etiquetado`
                                 origen "accion", profundidad 1
idempotencia                   : dos emisiones repetidas → ambas BLOQUEADAS, con el motivo y la
                                 clave compuesta a la vista
acción sensible (AU-07)        : paso en `pendiente_aprobacion` y **el pedido NO se canceló**
contratos de evento            : 0 incompletos · 35 en el catálogo
```

Lint y build limpios.

### F2 — El Automation Builder ✅

**Implementado (2026-09-08).**

- `Builder.jsx` en `/automatizaciones/nueva` y `/automatizaciones/:id`: la regla como oración a la
  izquierda (`CUANDO / SI / ENTONCES`) e **inspector generado del schema** a la derecha.
- `components/ParamField.jsx` — el inspector autogenerado (text · textarea · number · money ·
  select · multiselect · switch).
- `components/ConditionEditor.jsx` — campo · operador · valor, **con los operadores y el control
  derivados del `type` de la condición**.
- `components/StepPicker.jsx` — disparadores, condiciones y acciones, agrupados, con lo que no
  aplica **deshabilitado y su motivo**.
- `components/TemplatePicker.jsx` — arrancar de cero o de una de las 7 plantillas.
- `components/SimulatorPanel.jsx` — el dry-run.
- `analyticsApi`: `simulateRule()` acepta un **borrador sin guardar**, devuelve `topBlockers`;
  `listTemplates()` y `draftFromTemplate()`.

#### Decisiones y hallazgos al implementar F2

1. **⭐ Cambiar el disparador no borra nada en silencio.** Si el sujeto cambia y algún paso deja de
   aplicar, el paso se marca en rojo, un banner dice cuáles son y **se bloquea la publicación** hasta
   resolverlo, con un botón para quitarlos de una. Borrar el trabajo de alguien sin avisar es peor
   que un error: verificado cambiando «Se entrega un envío» → «Un SKU cae bajo el mínimo» con una
   condición sobre el total del pedido puesta.

2. **⭐ El simulador acepta el borrador en pantalla, no lo último guardado.** Si simulara la versión
   guardada, contestaría sobre una regla distinta de la que estás editando — que es justo cuando uno
   simula. Por eso `simulateRule()` recibe el objeto, no sólo un id.

3. **⭐ Hallazgo del propio simulador: los placeholders que no resuelven.** `interpolate` deja
   intacto lo que no encuentra (inventar un valor sería peor), pero en la vista previa se lee como
   texto y pasa desapercibido. La primera prueba real mostró una regla sobre SKUs que habría creado
   tres tareas tituladas *«Pedir reseña a `{{order.customerName}}` por `{{order.id}}`»*, literal.
   Ahora cada paso simulado avisa **«N campo(s) sin resolver»** y el tooltip dice cuáles y por qué.

4. **⭐ Las acciones sobre el pedido resuelven el id desde el contexto, no desde el sujeto.**
   Encontrado revisando el picker: las condiciones `order.*` sí aplican a un envío (leen
   `ctx.order`) pero las acciones no, porque usaban `ctx.subject.id`. Era una asimetría confusa y sin
   razón. Ahora `order.cancel` y `order.refund` aceptan sujeto `order` **o** `shipment`, así
   *«cuando se entrega un envío y pasó X, reembolsar el pedido»* se puede expresar.

5. **Las plantillas son las reglas de fábrica**, no un segundo catálogo que mantener sincronizado:
   empezar de una plantilla es duplicarla. Entre las siete se ejercitan las dos familias de
   disparador y los tres niveles de acción, así que también documentan lo que el motor sabe hacer.

6. **Al cambiar de operador se limpia el valor si cambia de forma.** Pasar de «es alguno de» (lista)
   a «es igual a» (escalar) dejaba un array donde se espera un valor suelto.

7. **El botón Simular vive al lado de Publicar**, no en un menú: es lo que hay que mirar antes de
   publicar, no una función avanzada.

8. **`Row` se declara fuera del componente.** Declarada adentro, React la trata como un tipo nuevo en
   cada render y le reinicia el estado — y el linter del proyecto lo marca como error, no warning.

#### Verificación de F2

Armada una regla entera desde el navegador, sin tocar código:

```
selector de disparadores      : 35 eventos en 7 grupos, con su punto de emisión
tipado por sujeto (Envío)     : 6 acciones habilitadas · 3 deshabilitadas con motivo
operadores de una condición   : sólo los 7 numéricos para «Total del pedido» (money)
cambio de disparador          : 1 paso marcado, banner, publicación bloqueada
simulador (evento sin datos)  : 0 candidatos + por qué, y qué hacer al respecto
simulador (condición)         : 3 candidatos · 3 dispararían · vista previa por sujeto
simulador (umbral alto)       : 3 descartados · «Qué está frenando la regla: Costo del SKU (3)»
publicar                      : AU-08 creada, publicada y ejecutada en el ciclo siguiente
```

Lint y build limpios; consola sin errores.

### F3 — Tiempo y aprobaciones ✅

**Implementado (2026-09-08). Con esto el módulo queda completo.**

- **Los cuatro modos de ejecución**, resueltos en un solo lugar (`clock.delayForExecution`):
  inmediata · con retraso · programada (hora fija) · recurrente.
- **Reloj simulado** (`components/ClockBar.jsx`): +1 h · +6 h · +1 día · *hasta el próximo trabajo*,
  con la cola de trabajos a la vista y su vencimiento.
- **Bandeja de aprobación** (`lib/approvals.js`, `Aprobaciones.jsx`): las acciones sensibles quedan
  como propuesta y **aprobar revalida antes de ejecutar**.
- **RBAC completo** (`lib/rbac.js`): ver · crear/editar · publicar/pausar · usar acciones sensibles ·
  aprobar · avanzar el reloj. Aplicado en el `api/`, no escondiendo botones.
- **Métricas** por regla en el Historial, con *qué regla falla* arriba.
- **Notificaciones reales en el panel**: el `NotificationCenter` del shell dejó de mostrar dos avisos
  escritos a mano y muestra los que publican las automatizaciones.

#### Decisiones y hallazgos al implementar F3

1. **⭐ Aprobar no es reproducir una decisión vieja.** Entre que el motor propone y alguien aprueba
   pasa tiempo. `approve()` **vuelve a cargar el sujeto y a evaluar las condiciones de la regla**
   antes de llamar al módulo; si el mundo cambió, la propuesta queda `obsoleta` con el motivo y no se
   ejecuta nada. Verificado de punta a punta: se propuso cancelar el pedido 10253 mientras estaba
   pendiente, se **confirmó el pago desde la UI de Pedidos**, y al aprobar el motor respondió
   *«Las condiciones ya no se cumplen: Estado de pago.»* — el pedido no se canceló.

2. **⭐ Una recurrencia no puede chocar con su propia idempotencia.** "Recordar cada 2 días" con una
   ventana de dedupe de 72 h no se ejecutaría **nunca**, y el usuario vería una recurrencia muda. En
   un trabajo recurrente **el intervalo es el límite de frecuencia**, así que la ventana no se
   aplica.

3. **⭐ Cambiar el disparador o el modo de ejecución borra la marca de agua y la cola de esa regla.**
   Encontrado probando: al pasar una regla de *inmediata* a *recurrente*, los sujetos que ya estaban
   dentro de la condición seguían en la marca de agua, el escáner no creaba ningún trabajo y **la
   recurrencia no arrancaba nunca**. Es razonable en general: lo que se disparó bajo la definición
   vieja no dice nada sobre la nueva.

4. **⭐ La recurrencia frena por marca, no por sujeto — y el bug volvió por tercera vez.** La primera
   versión preguntaba *"¿este SKU sigue en la condición?"*, y como el escáner trabaja por
   **SKU × depósito**, el depósito ya repuesto seguía recibiendo recordatorios porque **otro**
   depósito del mismo SKU seguía corto. Es la misma lección de granularidad que ya había aparecido
   en la idempotencia (F1): donde el escáner usa marca compuesta, **todo** el resto tiene que usarla.
   Verificado reponiendo stock de verdad desde Inventario: la cola bajó de 3 a 2 y siguieron sólo los
   dos depósitos que seguían cortos.

5. **El texto de la UI tenía que ser verdad.** El builder dice *"se repite mientras el sujeto siga en
   la condición"*; la primera implementación sólo miraba las condiciones de la regla, no el escaneo.
   Un aviso que sigue llegando cuando el problema ya se resolvió es exactamente lo que hace que la
   gente apague las automatizaciones.

6. **El permiso se aplica en el `api/`, no en la UI.** Esconder un botón no es un permiso si la
   función se puede llamar igual — mismo criterio que el RBAC de Analytics. La pantalla de
   aprobaciones se ve igual sin permiso: cambia que los botones están deshabilitados **y** que el
   motor rechaza la llamada.

7. **`relativeTo` decía "en 1 min" para algo que acababa de pasar**: con el reloj detenido la
   diferencia es 0 y el redondeo hacia arriba anunciaba el pasado como futuro. Ahora dice "recién".

8. **El texto del modo de ejecución vive en `clock.js`**, junto al cálculo del retraso.
   `describe.js` lo reexporta. Dos versiones de esa frase es la forma más fácil de que la lista diga
   una cosa y el motor haga otra.

9. **El `NotificationCenter` del shell pasó a leer del módulo.** Es una dependencia de un componente
   compartido hacia un `api/`, pero es la lectura honesta de "notificaciones en el panel": la acción
   *Notificar en el panel* es lo único del sistema que genera avisos para una persona, y la
   alternativa era dejar dos notificaciones falsas para siempre.

#### Verificación de F3

Todo conducido desde la UI, en una sola carga de página:

```
retraso            : 3 trabajos encolados a las 16:00 ("en 6 h") · +1 h no vence ninguno
                     · "hasta el próximo" salta a 16:00 y ejecuta los 3
recurrente         : cada hora, 3 ejecuciones · 11:00 → 3 · 12:00 → 6 · 13:00 → 9 ejecuciones
                     (prueba, de paso, que la idempotencia no la bloquea)
recurrencia frena  : ajuste real de +40 en Depósito Palermo → la cola pasa de 3 a 2
aprobación         : propuesta creada, "Aprobaciones (1)", aprobar → "10253 cancelado"
revalidación       : propuesta vieja + pago confirmado → "Las condiciones ya no se cumplen:
                     Estado de pago." · queda Obsoleta · el pedido NO se canceló
notificaciones     : el centro del panel muestra los avisos reales, con su sujeto y su antigüedad
```

Lint y build limpios; consola sin errores.

---

## 13. La inversión del registro (2026-09-10)

Cambio de arquitectura del módulo, **sin cambios de comportamiento**: el motor
hace exactamente lo mismo que antes, pero ya no conoce el dominio.

### 13.1 El problema, medido

Automatizaciones es transversal por definición: para que una regla diga «cuando
un pedido queda impago 3 días, avisale al vendedor», el motor tiene que saber
qué es un pedido, cómo se lo carga y qué se le puede hacer.

Eso estaba escrito como **imports directos** en cinco archivos:

```
lib/subjects.js    → pedidos, clientes, inventario, logistica,
                      marketing, abastecimiento, integraciones, seguridad
lib/scanner.js     → pedidos, clientes, inventario, logistica, marketing
lib/actions.js     → clientes, marketing, pedidos, logistica
lib/conditions.js  → clientes, inventario, logistica, integraciones, seguridad
lib/engine.js      → seguridad
```

El efecto, medido sobre el grafo **entre módulos**: un nudo de diez. Llevarse
un solo módulo a otro proyecto arrastraba los otros nueve.

```
                    antes    después
automatizaciones     +10        0     ← no arrastra nada
seguridad            +10       +1
inventario           +10       +4
abastecimiento       +10       +4
productos            +11       +4
```

**Por qué `check:arch` no lo veía:** verificaba ciclos entre **archivos** y no
había ninguno, porque `bus.js` es hoja. El ciclo estaba un nivel más arriba,
entre **módulos**: `seguridad → automatizaciones` (el bus) y
`automatizaciones → seguridad` (el actor) existían los dos, sin que ningún
archivo cerrara un círculo. Ahora hay una **regla 4** que mira ese nivel.

### 13.2 La inversión

```
antes   automatizaciones ──importa──▶ pedidos, clientes, inventario, …
después pedidos, clientes, inventario, … ──se registran──▶ automatizaciones
```

Es el mismo patrón que ya usaban `integraciones/lib/ports.js` (`setPipeline`) y
`seguridad/lib/gate.js` (`setStepUpCheck`): **la hoja declara el enchufe y el
módulo dueño lo llena.** Acá la hoja es `lib/registry.js` — cero imports,
verificada por la regla 1.

Cada módulo dueño tiene ahora un archivo `automatizaciones.js` que se presenta:

| Módulo | Sujeto | Escáneres | Acciones | Condiciones |
|---|---|---|---|---|
| `pedidos` | `order` | `pedido.pendiente_vencido` | cancelar, reembolsar | 12 |
| `clientes` | `account` | `cliente.inactivo` | nota, etiqueta, audiencia | 7 |
| `inventario` | `sku` | `stock.bajo_minimo`, `stock.agotado` | — | 5 |
| `logistica` | `shipment` | `envio.sin_preparar`, `envio.demorado` | incidencia | 5 |
| `marketing` | `cart` | `carrito.abandonado` | recuperación | 4 |
| `abastecimiento` | `purchaseOrder` | — | — | 2 |
| `integraciones` | `connection` | — | — | 4 |
| `seguridad` | `approval` | — | — | 2 |

Y `app/registrarDominio.js` es la **única lista de módulos activos** del panel.
Borrar una línea de ahí es sacar un módulo del proyecto.

### 13.3 ⭐ Un módulo enriquece el sujeto de otro

El caso que obligó a una pieza más: el contexto de un pedido incluye **su
cuenta**, para que se puedan escribir reglas como «si el cliente es VIP y el
pedido supera X».

Pero *«el pedido tiene una cuenta»* es una idea del CRM, no de Pedidos — es el
CRM el que sabe que la cuenta se busca por `customerName`. Si Pedidos importara
al CRM para armar su contexto, se habría cambiado un acoplamiento por otro.

Por eso el CRM **extiende el sujeto ajeno**:

```js
extenderSujeto("order", ({ order }, { safe }) => ({ account: porNombre(order?.customerName, safe) }));
```

Y el efecto correcto sale gratis: **un panel sin CRM no tiene `ctx.account` ni
las condiciones `account.*`.** Las dos cosas desaparecen juntas porque las
declara el mismo archivo.

### 13.4 Seguridad tampoco se importa: se enchufa

El motor necesita tres cosas de Seguridad —correr con un actor, saber cuál es el
actor de una automatización, y preguntar si un rol puede algo— y era el último
ciclo entre módulos.

Ahora `seguridad/automatizaciones.js` llama a `enchufarSeguridad({ conActor,
actorAutomatizacion, puede, actorActual })`. La dirección quedó una sola:
**Seguridad conoce al motor; el motor no conoce a Seguridad.**

⭐ Los valores por omisión del enchufe **niegan**. Un panel que se lleve el motor
sin ese archivo no ejecuta automatizaciones por descuido: tiene que enchufar su
propio control o decir explícitamente que no hay ninguno.

### 13.5 Verificación

**El chequeo:** se agregó la **regla 4** a `scripts/verificar-arquitectura.mjs`
(«el motor no conoce el dominio»), que mira el grafo por **módulo**. Se probó que
falla: un solo `import` de `pedidosApi` agregado a `describe.js` la rompe con
exit 1 — **mientras la regla 3 sigue diciendo 0 ciclos**, que es exactamente el
hueco que la 4 tapa.

**El comportamiento**, verificado en el navegador de punta a punta:

1. `Correr un ciclo` → 3 ejecuciones, 0 fallidas. Los escáneres registrados por
   Inventario disparan y la marca de agua funciona («Nada nuevo entrando en
   condición» en el segundo ciclo).
2. Rechazar el pago del pedido #10253 → la regla «Pago rechazado → recuperar la
   venta» se ejecuta **3/3**, con el sujeto descripto como `10253 · María López`
   (el `describir` que registró Pedidos).
3. ⭐ La etiqueta `pago-rechazado` **aparece en la ficha de María López**: la
   acción es del CRM sobre un sujeto de Pedidos, así que sólo puede funcionar si
   la extensión del sujeto ajeno anduvo.
4. **Con `logistica` y `marketing` comentados** en `registrarDominio.js`: build
   verde, las cuatro reglas se cumplen, el ciclo corre igual (3 ejecuciones) y la
   consola queda **sin un solo error**.

El punto 4 es la razón de todo esto.

### 13.6 Lo que sigue atado (dicho, no tapado)

Este cambio desató **un** nudo. Queda otro, de otra causa: siete módulos de
negocio (`pedidos`, `clientes`, `facturacion`, `finanzas`, `integraciones`,
`logistica`, `marketing`) siguen arrastrándose entre sí porque se **escriben**
unos a otros por import directo. `ARCHITECTURE.md` §1.4 dice que esas escrituras
son unidireccionales («nadie vuelve»); la medición dice que no: `pedidos →
logistica` y `logistica → pedidos` existen las dos, igual que `pedidos ↔
facturacion`. Es un problema distinto —no se arregla con un registro— y merece
su propio análisis.
