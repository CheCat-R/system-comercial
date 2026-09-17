# Módulo Analytics & Reportes — Arquitectura Funcional y UX

> **Consultar junto con [`ARCHITECTURE.md`](../ARCHITECTURE.md)** (§2 ubica Analytics en la *Capa de
> Decisión & Analítica*) y las specs de todos los módulos que le dan de comer:
> [`MODULO-CRM.md`](MODULO-CRM.md) · [`MODULO-INVENTARIO-ABASTECIMIENTO.md`](MODULO-INVENTARIO-ABASTECIMIENTO.md) ·
> [`MODULO-LOGISTICA-FULFILLMENT.md`](MODULO-LOGISTICA-FULFILLMENT.md) ·
> [`MODULO-FINANZAS-FACTURACION.md`](MODULO-FINANZAS-FACTURACION.md) ·
> [`MODULO-MARKETING.md`](MODULO-MARKETING.md) · [`MODULO-TIENDA-CMS.md`](MODULO-TIENDA-CMS.md).
>
> **Estado (2026-09-08): MÓDULO COMPLETO — Fases 1, 2 y 3 implementadas y verificadas.**
> - **F1 (el diccionario y el motor):** `lib/metrics.js` con **46 métricas**, cada una con contrato
>   completo; `assertContracts()` impide que una métrica incompleta se calcule. `lib/periods.js`
>   (períodos, comparaciones, período parcial, frontera historia/vivo), `lib/dimensions.js` (10
>   dimensiones con su nivel de agrupación), `lib/facts.js` (`buildFacts` une historia y datos vivos
>   con las fórmulas de Finanzas) y `lib/format.js` (devuelve "—" en vez de 0 % cuando no hay
>   denominador). `data/history.mock.js`: **130 clientes en 11 cohortes y 281 pedidos** generados
>   determinísticamente para sep-2025 → jul-2026, con estacionalidad y recompra decreciente.
>   `analyticsApi.query()` y `getSummary()`, con **RBAC en el motor**: a un rol sin permiso las
>   métricas sensibles no se le ocultan, no se le calculan. Pantallas **Resumen ejecutivo** y
>   **Diccionario de métricas**; `MetricCard` con delta, `n` y ⓘ, `MetricInfo` con la ficha del
>   contrato, `PeriodPicker` y `SeriesChart` (SVG propio, con la frontera dibujada).
> - **F2 (explorar y guardar):** pantallas **Explorador** y **Reportes**. El Explorador combina
>   métricas (hasta 4) × dimensión × período × comparación × filtros, con vista de tabla, barras o
>   línea; las dimensiones que no aplican a la métrica quedan **deshabilitadas con el motivo**.
>   `MetricPicker` (muestra la pregunta de cada métrica), `FilterBar` (chips que se pueden quitar),
>   `ResultTable` (orden, comparación, % del total y fila de totales) y `BarChart` (con marca del
>   valor de referencia). **Exportación CSV** con cabecera de contexto: período, filtros, origen de
>   datos y **la fórmula de cada métrica exportada**. 8 reportes de fábrica; guardar, duplicar y
>   eliminar los propios.
> - Verificado en el navegador (lint + build limpios).
>
> - **F3 (cohortes, dashboards y alertas):** pantallas **Cohortes y retención**, **Dashboards**
>   (lista y detalle) y **Objetivos y alertas**. `lib/cohorts.js` con la matriz, la curva ponderada y
>   el repago del CAC; `CohortMatrix` y `WidgetCard`; motor de alertas de umbral agrupadas por
>   período, que alimenta el panel **«Qué mirar»** del Resumen. Ver §12 para los hallazgos.

---

## 1. Objetivo y alcance

Analytics es la capa que **explica qué pasó y por qué**. No opera nada: no crea pedidos, no mueve
stock, no cobra. Lee todo el sistema y devuelve números con nombre y apellido.

### 1.1 La regla que define el módulo

> **Ninguna métrica existe en el panel si antes no declara qué significa, con qué fórmula se calcula,
> de qué módulo sale cada término y qué no incluye.**

En código eso es literal: una métrica es una entrada en `lib/metrics.js` con este contrato, y el
motor **no puede calcular** una métrica que no lo tenga completo:

```js
{
  key: "aov",
  label: "Ticket promedio (AOV)",
  question: "¿Cuánto deja, en promedio, cada pedido que se cobra?",
  formula: "ingresoNeto / pedidosPagados",
  unit: "money",
  source: ["finanzas.getPnlSummary", "pedidos.listOrders"],
  grain: "pedido",
  excludes: ["IVA", "costo de envío", "pedidos devueltos", "pedidos pendientes de pago"],
  caveat: "Con menos de 30 pedidos en el período el promedio es muy sensible a un caso atípico.",
  minSample: 30,
  dimensions: ["tiempo", "categoria", "canal", "cliente", "segmento", "zona"],
  compute: (facts) => facts.revenueNet / facts.paidOrders,
}
```

La UI muestra ese contrato: **toda métrica es clickeable y abre su ficha** con fórmula, origen,
exclusiones y advertencia. Sin eso, un tablero es una máquina de discutir de qué se está hablando.

### 1.2 Qué NO es este módulo

- **No es dueño de ningún dato.** Todo sale de las `api/` de los otros módulos. Si un número no
  coincide con el módulo de origen, el error es de Analytics.
- **No recalcula el P&L.** Márgenes, COGS, comisiones y gastos los calcula **Finanzas**; Analytics los
  lee y los corta por otras dimensiones.
- **No redefine la segmentación.** RFM, tiers y segmentos son del **CRM**.
- **No es web analytics.** No hay sesiones, ni rebote, ni embudo de navegación (§2.8).
- **No predice.** El LTV que se muestra es **realizado** (lo que el cliente ya dejó), no un modelo
  predictivo. Decirle "LTV" a un histórico y usarlo como proyección es el error más común del rubro.

### 1.3 Los dos problemas duros, y qué se hace con cada uno

Antes de definir métricas hay que decir qué **no** da el sistema hoy. Son dos, y ambos cambian el
alcance.

#### Problema 1 — No hay tráfico, entonces no hay "tasa de conversión"

El panel no tiene sesiones, visitas ni origen de visitante. La métrica que todo el mundo pide
—*pedidos ÷ visitas*— **no se puede calcular** y no se va a inventar.

**Qué se hace:** se definen las cuatro conversiones que el sistema **sí** puede medir de punta a
punta, cada una con su nombre completo para que nadie las confunda con la del sitio:

| Conversión | Numerador | Denominador | Origen |
|---|---|---|---|
| **de checkout** | pedidos pagados | pedidos creados | Pedidos (`paymentStatus`, `createdAt`) |
| **de cotización** | cotizaciones convertidas | cotizaciones emitidas | CRM (`getQuotePipeline`) |
| **de campaña** | conversiones atribuidas | envíos entregados | Marketing (`getCampaignMetrics`) |
| **de recuperación** | carritos recuperados | carritos con recuperación enviada | Marketing (`AbandonedCart`) |

La del sitio queda documentada como **no medible**, con la lista exacta de lo que tendría que llegar
para habilitarla (§2.8).

#### Problema 2 — Hay 24 días de historia y 8 pedidos

Los datos vivos del panel son **8 pedidos de 8 cuentas en 24 días**. Con eso:

- una matriz de cohortes tiene **una sola cohorte**;
- la retención mes a mes no tiene un segundo mes;
- la comparación interanual no tiene año anterior;
- cualquier promedio se mueve entero con un pedido.

**Qué se hace:** Analytics mantiene su propia **tabla de hechos histórica** (`SalesFact`), generada
determinísticamente, que cubre **únicamente meses cerrados anteriores al arranque de los datos
vivos** — de septiembre 2025 a julio 2026. **No hay solapamiento**: del 10 de agosto de 2026 en
adelante manda lo que devuelven los módulos.

Eso resuelve tres cosas a la vez:

1. Cohortes, retención y estacionalidad tienen material real que mostrar.
2. **Ningún mes lo calculan dos fuentes distintas**, así que Analytics nunca contradice a Finanzas.
3. La frontera es explícita: toda serie temporal marca dónde termina la historia y empieza lo vivo,
   y la ficha de cada métrica dice qué parte del período consultado es de cada origen.

Además, **toda métrica muestra su `n`** (cuántos pedidos, cuántas cuentas la sostienen) y se atenúa
cuando cae por debajo del `minSample` declarado en su contrato.

### 1.4 Alcance MVP vs. futuro

| Entra ahora | Queda fuera por ahora |
|---|---|
| Diccionario de ~45 métricas con contrato completo | Métricas definidas por el usuario / fórmulas libres |
| Motor de consulta `métrica × dimensión × período × filtros` | SQL libre, drill-down infinito |
| 14 dimensiones y 9 filtros (§3, §5) | Dimensiones derivadas a medida |
| Comparación contra período anterior y contra objetivo | Modelos de atribución multi-touch |
| Cohortes de adquisición y retención mensual | Cohortes por comportamiento (no por fecha) |
| Reportes guardados + exportación CSV | Envío programado por email, PDF |
| Dashboards personalizados por usuario | Dashboards compartidos con permisos por widget |
| Alertas de umbral sobre una métrica | Detección automática de anomalías |
| Serie histórica generada + datos vivos | Ingesta real, ETL, warehouse |

---

## 2. Diccionario de métricas

Formato de cada fila: **qué responde · fórmula exacta · de dónde sale · qué deja afuera.**

### 2.1 Convenciones que valen para todas

- **Ingreso neto** = `subtotal − descuento + envío cobrado`. **Excluye IVA.** Es la base de todos los
  márgenes y de todo lo que se compara con costos. Sale de `finanzas.getOrderPnlList()`.
  > **Corrección respecto de la primera versión de esta spec.** Acá decía "excluye IVA y envío". Al
  > implementar se verificó la fórmula real de Finanzas (`orderPnl`): el **envío cobrado suma al
  > ingreso**, y su costo se descuenta recién en el margen de contribución. Es internamente coherente
  > —el flete que se le cobra al cliente es ingreso— y Finanzas es la autoridad (regla §8.2), así que
  > manda su definición.
- **Ingreso cobrado** = `order.total` (incluye IVA y envío). Sirve para conciliar con caja, no para
  medir rentabilidad. Sale de `pedidos.listOrders()`.
- **Pedido pagado** = `paymentStatus === "Pagado"`. Un pedido **devuelto** se excluye de ingresos y
  de AOV, y se cuenta aparte en la tasa de devolución.
- **Un pedido pertenece al período por su `paidAt`**, no por `createdAt` — salvo la conversión de
  checkout, que por definición mira `createdAt`.
- Todos los porcentajes se muestran con un decimal y coma decimal (es-AR).

### 2.2 Ventas y pedidos

| Métrica | Qué responde | Fórmula | Origen | No incluye |
|---|---|---|---|---|
| **Ingresos netos** | ¿Cuánto vendimos, medido como se mide el margen? | `Σ (subtotal − descuento + envío cobrado)` de pedidos pagados no devueltos | `finanzas.getPnlSummary().revenueNet` | IVA, pedidos devueltos |
| **Ingresos cobrados** | ¿Cuánto entró de plata? | `Σ order.total` | `pedidos.listOrders()` | — (incluye IVA y envío) |
| **Pedidos pagados** | ¿Cuántas ventas cerramos? | `count(paymentStatus = Pagado)` | Pedidos | pendientes, cancelados |
| **Unidades vendidas** | ¿Cuántos artículos salieron? | `Σ item.qty` de pedidos pagados | Pedidos | devoluciones |
| **AOV / Ticket promedio** | ¿Cuánto deja en promedio cada pedido? | `ingresoNeto / pedidosPagados` | Finanzas + Pedidos | IVA, devueltos |
| **Ticket cobrado promedio** | ¿Cuánto paga en promedio el cliente? | `Σ total / pedidosPagados` | Pedidos | — |
| **Unidades por pedido** | ¿Cuántos artículos lleva por compra? | `unidades / pedidosPagados` | Pedidos | — |
| **Precio promedio por unidad** | ¿A qué precio efectivo sale cada artículo? | `ingresoNeto / unidades` | Finanzas + Pedidos | IVA, envío |
| **Tasa de devolución** | ¿Cuánto de lo vendido se vuelve? | `pedidosDevueltos / pedidosPagados` | Pedidos (`returnedAt`) + Finanzas (`returned`) | reembolsos parciales |
| **Descuento otorgado** | ¿Cuánto margen resignamos? | `Σ order.discount` | Pedidos (campo pasivo de Marketing) | puntos de fidelización canjeados |
| **Tasa de descuento** | ¿Qué proporción del precio regalamos? | `descuentoOtorgado / Σ subtotal` | Pedidos | — |
| **Conversión de checkout** | De lo que se empieza a comprar, ¿cuánto se paga? | `pedidosPagados / pedidosCreados` (ambos por `createdAt` del período) | Pedidos | abandonos previos al pedido |

### 2.3 Clientes

| Métrica | Qué responde | Fórmula | Origen | No incluye |
|---|---|---|---|---|
| **Clientes activos** | ¿Cuántos compraron en el período? | `count(cuentas con ≥1 pedido pagado)` | CRM + Pedidos | cuentas sin compra |
| **Clientes nuevos** | ¿A cuántos ganamos? | `count(cuentas con firstOrderAt en el período)` | CRM (`metrics.firstOrderAt`) | leads sin compra |
| **Clientes recurrentes** | ¿Cuántos volvieron? | `activos − nuevos` | CRM + Pedidos | — |
| **% de ingreso recurrente** | ¿Cuánto del negocio depende de los que ya nos conocen? | `ingresoDeRecurrentes / ingresoNeto` | CRM + Finanzas | — |
| **LTV realizado** | ¿Cuánto dejó cada cliente hasta hoy? | `Σ total pagado − Σ reembolsado` por cuenta | CRM (`metrics.ltv`) | proyección futura; **es histórico** |
| **LTV de margen** | ¿Cuánto *ganamos* con cada cliente? | `LTVrealizado × margenContribución%` del período | CRM + Finanzas | gastos operativos |
| **CAC** | ¿Cuánto nos cuesta ganar un cliente? | `(gastosMarketing + costoEnvíosDeCampaña) / clientesNuevos` | Finanzas (`listExpenses` categoría `marketing`) + Marketing (`getCampaignMetrics().cost`) + CRM | costo de equipo comercial, descuentos de captación |
| **LTV / CAC** | ¿El cliente devuelve lo que costó? | `LTVdeMargen / CAC` | derivada | — |
| **Meses de repago del CAC** | ¿En cuánto tiempo se recupera la inversión? | primer `n` donde `LTVacumulado(cohorte, n) ≥ CAC` | derivada de cohortes | — |
| **Tasa de recompra** | ¿Cuántos compran más de una vez? | `cuentas con ≥2 pedidos / cuentas con ≥1` | CRM + Pedidos | ventana temporal (es histórica total) |
| **Retención M+1** | De los que compraron en un mes, ¿cuántos volvieron al siguiente? | `activosEn(M) ∩ activosEn(M+1) / activosEn(M)` | CRM + Pedidos + historia | clientes nuevos de M+1 |
| **Cohorte de adquisición** | ¿Se comportan mejor las camadas nuevas? | matriz `mesDePrimeraCompra × mes+n` con `% que volvió a comprar` | CRM + Pedidos + historia | cohortes por comportamiento |
| **LTV acumulado por cohorte** | ¿Cuánto tarda una camada en devolver su CAC? | `Σ ingresoNeto de la cohorte hasta mes+n / clientesDeLaCohorte` | ídem | — |

> **Sobre el CAC.** Es un **CAC contable agregado**: gasto de marketing del período dividido clientes
> nuevos del período. **No es CAC por canal de adquisición** — el panel no tiene atribución de
> adquisición (§2.8). Se puede desglosar por campaña sólo para las conversiones que Marketing
> atribuye por *last-touch* dentro de su ventana de 14 días, y eso se etiqueta como tal.

### 2.4 Marketing

| Métrica | Qué responde | Fórmula | Origen | No incluye |
|---|---|---|---|---|
| **Ingreso atribuido** | ¿Cuánto vendieron las campañas? | `Σ revenue de conversiones last-touch (ventana 14 días)` | `marketing.getCampaignMetrics()` | ventas sin contacto previo |
| **ROAS** | ¿Cuánto vuelve por peso invertido? | `ingresoAtribuido / costoDeCampaña` | Marketing | gasto de marketing fuera de campañas |
| **Tasa de apertura** | ¿Llega el mensaje? | `abiertos / entregados` | Marketing | — |
| **Tasa de clic** | ¿Interesa el mensaje? | `clics / abiertos` | Marketing | — |
| **Conversión de campaña** | ¿Vende el mensaje? | `conversiones / entregados` | Marketing | — |
| **Recuperación de carrito** | ¿Sirve perseguir el carrito? | `recuperados / conRecuperaciónEnviada` | Marketing (`AbandonedCart`) | carritos sin acción |
| **Canjes de cupón** | ¿Se usan los cupones? | `count(redemptions)` y `Σ amount` | Marketing | promociones automáticas |
| **Ticket con vs. sin cupón** | ¿El cupón sube o baja el ticket? | `AOV(pedidos con couponCode)` vs `AOV(sin)` | Pedidos + Finanzas | — |
| **Puntos en circulación** | ¿Cuánto pasivo de fidelización tenemos? | saldo del ledger | Marketing (`getLoyaltySummary`) | — |

### 2.5 Finanzas — Analytics **lee**, no recalcula

| Métrica | Fórmula (la de Finanzas) | Origen |
|---|---|---|
| **COGS** | `Σ qty × SKU.cost` | `finanzas.getPnlSummary().cogs` |
| **Margen bruto** y **%** | `ingresoNeto − COGS` | `getPnlSummary().grossMargin` |
| **Margen de contribución** y **%** | `bruto − envíoReal − comisiónPasarela − comisiónVendedor + ajustes` | `getPnlSummary().contributionMargin` |
| **Gastos operativos** | `Σ expenses del período` | `getPnlSummary().operatingExpenses` |
| **Resultado neto** | `contribución − gastosOperativos` | `getPnlSummary().netResult` |
| **Brecha de envío** | `costoEnvíoReal − envíoCobrado` | Finanzas + Logística |
| **Comisión de pasarela** | `Σ total × tasa del medio de pago` | Finanzas |

Analytics agrega **el corte por dimensión** sobre estos (`finanzas.getProfitabilityBy`) y la
**serie temporal**, que Finanzas hoy sólo muestra por mes.

### 2.6 Inventario

| Métrica | Qué responde | Fórmula | Origen | Advertencia |
|---|---|---|---|---|
| **Valor de stock** | ¿Cuánta plata está quieta? | `Σ onHand × SKU.cost` | `inventario.getPortfolioSummary()` | a costo, no a precio de venta |
| **Cobertura en días** | ¿Para cuántos días alcanza? | `onHand / (unidadesVendidas / díasDelPeríodo)` | Inventario + Pedidos | sin ventas en el período da ∞ |
| **Rotación** | ¿Cuántas veces se renueva el stock? | `COGS del período / valorStockPromedio` | Finanzas + Inventario | **no anualizar** un período de 24 días |
| **Quiebres** | ¿Qué no podemos vender? | `count(SKU con available = 0)` | Inventario | — |
| **Stock muerto** | ¿Qué está inmovilizado? | `SKU con stock > 0 y 0 unidades vendidas en N días` | Inventario + Pedidos | N configurable (default 90) |
| **Faltante por backorder** | ¿Cuánta venta quedó en espera? | `Σ backorders` | Pedidos + Inventario | — |

### 2.7 Logística

| Métrica | Qué responde | Fórmula | Origen | No incluye |
|---|---|---|---|---|
| **Lead time de despacho** | ¿Cuánto tardamos en sacarlo? | `promedio(dispatchedAt − paidAt)` en horas | Logística (`Shipment`) | pedidos sin despachar |
| **Lead time de entrega** | ¿Cuánto tarda el transportista? | `promedio(deliveredAt − dispatchedAt)` en días | Logística | envíos en tránsito |
| **Tiempo total al cliente** | ¿Cuánto espera quien compra? | `promedio(deliveredAt − paidAt)` | Logística + Pedidos | ídem |
| **Tasa de entrega** | ¿Cuánto llega? | `entregados / despachados` | Logística | en tránsito |
| **Tasa de incidencias** | ¿Cuánto se complica? | `envíosConIncidencia / envíos` | Logística (`listIncidents`) | reclamos fuera del sistema |
| **Costo de envío promedio** | ¿Cuánto nos sale mover cada pedido? | `Σ shipment.cost / envíos` | Logística | envíos sin costo cargado |

### 2.8 Lo que hoy **no se puede medir** (y qué haría falta)

Esta sección es parte del contrato del módulo: si algo no está acá ni en el diccionario, no existe.

| No medible | Por qué | Qué tendría que llegar |
|---|---|---|
| **Tasa de conversión del sitio** | No hay sesiones ni visitas | Una tabla de sesiones con `at`, `origen`, `dispositivo` y si terminó en pedido |
| **CAC por canal de adquisición** | No hay atribución de adquisición | UTM / first-touch por cuenta, y gasto imputado por canal |
| **Rebote, páginas por sesión, tiempo en sitio** | Ídem tráfico | Web analytics del storefront |
| **Embudo de navegación** (vio → agregó → compró) | No hay eventos de producto | Eventos `product_view`, `add_to_cart` con `sessionId` |
| **Carritos abandonados reales** | Marketing los **simula** (ver su §2.2) | El storefront emitiendo `cart_abandoned` |
| **NPS / satisfacción** | No hay encuestas | Módulo de encuestas o integración |
| **Margen por canal de adquisición** | Depende de la atribución que no existe | ídem CAC por canal |
| **Costo de adquisición por producto** | No hay gasto imputado a nivel SKU | Presupuesto de marketing por producto |
| **Comparación interanual** | Hay 11 meses de historia generada + 24 días vivos | Otro año de datos |

---

## 3. Dimensiones

Una dimensión es **por qué se corta** una métrica. Cerradas, como los bloques de Tienda: cada una
declara de dónde sale su valor.

| Dimensión | Valores | Origen | Nota |
|---|---|---|---|
| **Tiempo** | día · semana · mes | `paidAt` | El grano se ajusta solo al largo del período |
| **Producto (SKU)** | los 14 del catálogo | `productos.catalogApi` | |
| **Categoría** | Calzado · Indumentaria · Accesorios | Catálogo | |
| **Marca** | Aureo · Nord · Vertex · Kaia | Catálogo | |
| **Cliente** | las 8 cuentas | CRM | |
| **Segmento RFM** | los 8 segmentos smart | CRM (`segmentKey`) | Analytics no los redefine |
| **Tier** | vip · frecuente · activo · en_riesgo · durmiente · lead | CRM (`metrics.tier`) | |
| **Canal de venta** | Tienda web · Mayorista B2B | Finanzas (`channelOf`) | ⚠ Es un **proxy**: se deriva de `account.type === "company"`. **No es canal de adquisición** |
| **Zona** | CABA · GBA · Interior | Logística (`zones`, por keyword de la dirección) | Única geografía disponible |
| **Sucursal / Depósito** | 3 sucursales, 4 depósitos | Inventario | |
| **Medio de pago** | los del pedido | Pedidos (`paymentMethod`) | |
| **Transportista** | Andreani · OCA · … | Logística | |
| **Campaña / Cupón / Promoción** | las de Marketing | Marketing | Sólo sobre ingreso atribuido |
| **Vendedor** | los de comisiones | Finanzas | Sólo métricas con comisión |

**Regla:** no toda métrica admite toda dimensión. El contrato de cada métrica declara
`dimensions: [...]`, y el explorador **deshabilita** las que no aplican —con el motivo a la vista— en
vez de devolver un número sin sentido (p. ej. "lead time de entrega" no se corta por cupón).

---

## 4. Períodos y comparaciones

**Fecha de referencia:** `TODAY = 2026-09-03`, la misma de todos los módulos.

**Períodos:** Hoy · Ayer · Últimos 7 / 14 / 30 / 90 días · Este mes · Mes pasado · Este trimestre ·
Este año · Personalizado.

**Comparaciones** (una por vez, no acumulables):

1. **Período anterior de igual largo** — el default. 30 días contra los 30 previos.
2. **Mismo período del mes anterior** — para estacionalidad de calendario.
3. **Contra objetivo** — un valor fijo cargado por métrica.
4. **Sin comparación**.

La comparación interanual **no se ofrece**: no hay dos años de datos (§2.8). Un selector que siempre
devuelve "sin datos" es peor que no tenerlo.

**Cómo se muestra un delta:** valor actual, variación absoluta, variación porcentual y el valor de
referencia, siempre juntos. Un "+24 %" solo no dice si fue de 4 a 5 o de 400 a 496 — y con este
volumen de datos, esa diferencia es todo.

**Regla de período incompleto:** si el período incluye el día de hoy, se marca como **parcial** y la
comparación se hace **contra el mismo tramo** del período anterior (día 1-3 contra día 1-3), no
contra el mes entero.

---

## 5. Filtros

Se aplican **antes** de calcular y se combinan con Y lógico. Cada filtro deja rastro visible en un
chip que se puede quitar.

| Filtro | Valores |
|---|---|
| Estado de pago | Pagado · Pendiente · Reembolsado |
| Estado de fulfillment | Sin despachar · Despachado · Entregado · Devuelto |
| Categoría / Marca / SKU | del catálogo |
| Segmento / Tier / Etiqueta de cliente | del CRM |
| Canal de venta | Tienda web · Mayorista B2B |
| Zona | CABA · GBA · Interior |
| Sucursal / Depósito | de Inventario |
| Con descuento | sí · no · con cupón · con promoción |
| Rango de ticket | mínimo y máximo |

---

## 6. Modelo de dominio

| Entidad | Descripción | Dueño |
|---|---|---|
| **Métrica** (`Metric`) | El contrato de §1.1: `key`, `label`, `question`, `formula`, `unit`, `source[]`, `grain`, `excludes[]`, `caveat`, `dimensions[]`, `minSample`, `compute()`. **Declarativa, no configurable desde la UI.** | Analytics |
| **Hecho de venta** (`SalesFact`) | Fila desnormalizada de un pedido pagado: fecha, cuenta, SKU, cantidad, ingreso neto, COGS, descuento, canal, zona, sucursal, medio de pago. Es lo que consume el motor. | Analytics |
| **Consulta** (`Query`) | `{ metrics[], dimension, period, compare, filters }`. Serializable → es lo que guarda un Reporte y lo que lleva un widget. | Analytics |
| **Reporte** (`Report`) | Una consulta guardada con nombre, descripción y forma de visualización (`table` \| `line` \| `bar` \| `matrix`). | Analytics |
| **Dashboard** (`Dashboard`) | Grilla de widgets del usuario. `name`, `widgets[]`, `isDefault`. | Analytics |
| **Widget** (`Widget`) | `{ type: kpi \| line \| bar \| table \| cohort, query, size, position }`. Un widget **es una consulta con forma**. | Analytics |
| **Objetivo** (`Target`) | Valor esperado de una métrica por período. Habilita la comparación "contra objetivo". | Analytics |
| **Alerta** (`MetricAlert`) | `{ metricKey, operator, threshold, period }` → aparece en el Resumen cuando se cumple. | Analytics |

### 6.1 Por qué una tabla de hechos y no consultar los módulos en cada corte

Cortar 45 métricas por 14 dimensiones recorriendo pedidos, cuentas, envíos y P&L en cada click es
lento y, peor, **inconsistente**: dos métricas pueden terminar leyendo el catálogo en momentos
distintos. La tabla de hechos se arma **una vez por consulta** (`buildFacts(period, filters)`) y
todas las métricas de esa pantalla se calculan sobre la misma foto.

```
buildFacts(period, filters)
  ├── historia (SalesFact generados)      → meses cerrados: sep 2025 → jul 2026
  └── vivo (pedidos + finanzas + CRM + …) → desde el 10 de ago 2026
        ↓
   un solo array de SalesFact + agregados de contexto (clientes, envíos, campañas, stock)
        ↓
   metric.compute(facts) para cada métrica pedida
```

---

## 7. Mapa de orígenes — qué lee Analytics de cada módulo

Todo por import directo a la `api/` del módulo, **sólo lectura**, unidireccional:

```
analyticsApi → pedidosApi · clientsApi · financeApi · marketingApi
             · inventoryApi · logisticaApi · catalogApi · billingApi
             ↑ ninguno importa analyticsApi
```

| Módulo | Qué le pide Analytics |
|---|---|
| **Pedidos** | `listOrders()` — la fila base: ítems, subtotal, descuento, total, fechas, medio de pago, depósito |
| **Finanzas** | `getOrderPnlList()`, `getPnlSummary()`, `getProfitabilityBy()`, `listExpenses({category:"marketing"})`, `getAvailableMonths()` — **toda la verdad de márgenes y costos** |
| **Clientes (CRM)** | `listAccounts()` con `metrics` (ltv, aov, firstOrderAt, recencyDays, tier, segmentKey), `getPortfolioSummary()`, `getQuotePipeline()` |
| **Marketing** | `listCampaigns()` con `metrics`, `getCampaignMetrics()`, `listCoupons()` con redenciones, `listAbandonedCarts()`, `getLoyaltySummary()` |
| **Inventario** | `getPortfolioSummary()`, `getStockGroupedBySku()`, `listBranches()` |
| **Logística** | `listShipments()`, `listIncidents()`, `listZones()`, `listCarriers()` |
| **Catálogo** | `listProducts()`, `listCategories()`, `listBrands()` — nombres y taxonomía de las dimensiones |
| **Facturación** | `listDocuments()` — sólo para conciliar facturado contra vendido |

**Analytics no escribe en ningún módulo.** Es el único del panel con esa propiedad.

---

## 8. Reglas de negocio

1. Una métrica **sin contrato completo no se calcula**: el motor lanza en desarrollo y la oculta en
   producción. No hay números anónimos.
2. **Finanzas es la autoridad de márgenes y costos.** Si Analytics muestra un margen distinto al de
   Finanzas para el mismo mes, es un bug de Analytics.
3. **El CRM es la autoridad de segmentos y LTV.** Analytics agrega, no redefine.
4. Un pedido entra al período por `paidAt`; los devueltos se excluyen de ingreso y AOV y se cuentan
   en la tasa de devolución.
5. **Historia y datos vivos no se solapan nunca.** La frontera (10 de agosto de 2026) es una
   constante única y se dibuja en toda serie temporal.
6. Toda métrica muestra su `n`. Por debajo de `minSample` se muestra atenuada y con la advertencia.
7. **No se ofrece comparación interanual** mientras no haya dos años de datos.
8. Un período que incluye hoy es **parcial** y se compara contra el mismo tramo del anterior.
9. Los porcentajes con denominador 0 muestran "—", nunca 0 % ni ∞.
10. La exportación CSV incluye **una cabecera con la consulta completa** (métrica, período, filtros,
    fecha de extracción): un CSV sin contexto es un número suelto esperando ser mal citado.
11. Sólo **Admin** y **Dirección** ven márgenes, costos y CAC. **Marketing** ve ingresos, campañas y
    clientes, no costos (§10).

---

## 9. UX — pantallas

### 9.1 Resumen ejecutivo (`/analytics`)

Lo que se mira todos los días, en un scroll:

- **Fila de KPIs** (6): Ingresos netos · Pedidos · AOV · Margen de contribución % · Clientes nuevos ·
  Tasa de devolución. Cada uno con delta contra el período anterior y su `n`.
- **Serie principal**: ingresos por día/semana/mes, con la línea de comparación punteada y la
  **frontera historia/vivo** marcada.
- **Tres cortes rápidos**: top productos, top categorías, ingreso por canal.
- **Panel "Qué mirar"**: las alertas de métrica que se dispararon (margen por debajo del objetivo,
  quiebre de stock en un top seller, tasa de devolución en alza).
- Selector de período y comparación fijo arriba, común a toda la pantalla.

### 9.2 Explorador (`/analytics/explorador`)

La pantalla que responde preguntas nuevas. Tres controles y un resultado:

```
┌───────────────────────────────────────────────────────────────────────┐
│  Métrica ▾  ·  Cortada por ▾  ·  Período ▾  ·  Comparar ▾   [Guardar] │
│  Filtros: [Categoría: Calzado ×] [Canal: Tienda web ×]  + Agregar     │
├───────────────────────────────────────────────────────────────────────┤
│  ▁▃▅▇▅▃  gráfico (línea si el corte es tiempo, barras si no)          │
├───────────────────────────────────────────────────────────────────────┤
│  Tabla: dimensión · métrica · comparación · Δ · % del total           │
│  (ordenable, con fila de totales, exportable a CSV)                   │
└───────────────────────────────────────────────────────────────────────┘
```

- El selector de métrica muestra **la pregunta** de cada una, no sólo el nombre.
- Al elegir métrica, las dimensiones que no aplican quedan deshabilitadas **con el motivo**.
- Ícono **ⓘ** junto a la métrica → abre la ficha: fórmula, origen, exclusiones, advertencia, `n`.
- "Guardar" convierte la consulta en un **Reporte**.

### 9.3 Cohortes y retención (`/analytics/cohortes`)

- **Matriz de cohortes**: filas = mes de primera compra, columnas = mes+0…mes+n, celdas = % que
  volvió a comprar, con escala de color. Conmutable a **LTV acumulado** por cohorte.
- **Curva de retención** agregada, y por tier del CRM.
- **Tarjeta LTV / CAC**: LTV de margen, CAC, ratio y **meses hasta recuperar el CAC**, cada número
  con su ⓘ. Es la pantalla donde más se nota si alguien no leyó las definiciones, así que las
  fórmulas van a la vista, no escondidas en un tooltip.
- Aviso fijo arriba: qué parte del rango es historia generada y qué parte es dato vivo.

### 9.4 Reportes (`/analytics/reportes`)

Lista de consultas guardadas: nombre, métrica, período, quién lo creó, última ejecución. Acciones:
abrir en el Explorador · duplicar · exportar CSV · fijar en un dashboard · eliminar.

Se incluyen **8 reportes de fábrica** para que la pantalla no arranque vacía: Top productos por
margen · Clientes en riesgo con LTV alto · Rentabilidad por canal · Efectividad de cupones · Envíos
fuera de plazo · Stock muerto · Embudo de checkout · Cohortes del último trimestre.

### 9.5 Dashboards (`/analytics/dashboards`, `/analytics/dashboards/:id`)

- Grilla de widgets; cada widget **es una consulta guardada con forma** (KPI, línea, barra, tabla,
  cohorte).
- Editar = agregar widget (desde un reporte o creando la consulta), reordenar, redimensionar (1/2/3
  columnas), renombrar, quitar.
- Un dashboard por defecto por usuario; los demás se eligen desde un selector.
- Sin drag & drop libre: mover con ↑ ↓ ← →, como el outline del Store Builder. Predecible y
  accesible con teclado.

### 9.6 Diccionario de métricas (`/analytics/metricas`)

La documentación **dentro del producto**: las ~45 métricas agrupadas por área, cada una con su
pregunta, fórmula, origen, exclusiones, advertencia y dimensiones admitidas. Con buscador. Es la
pantalla que se le manda a alguien cuando discute un número.

---

## 10. Rutas y permisos

| Ruta | Pantalla |
|---|---|
| `/analytics` | Resumen ejecutivo |
| `/analytics/explorador` | Explorador |
| `/analytics/cohortes` | Cohortes y retención |
| `/analytics/reportes` | Reportes guardados |
| `/analytics/dashboards` · `/:id` | Dashboards personalizados |
| `/analytics/objetivos` | Objetivos y alertas |
| `/analytics/metricas` | Diccionario de métricas |

Sidebar: sección nueva **ANÁLISIS**, ítem `Analytics` con esos siete hijos.

| Acción | Admin | Dirección | Marketing | Ventas | Otros |
|---|---|---|---|---|---|
| Ver ingresos, pedidos, clientes | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver **márgenes, COGS, CAC, gastos** | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver cohortes y LTV | ✅ | ✅ | ✅ | ❌ | ❌ |
| Crear reportes y dashboards | ✅ | ✅ | ✅ | ✅ | ❌ |
| Definir objetivos y alertas | ✅ | ✅ | ❌ | ❌ | ❌ |
| Exportar CSV | ✅ | ✅ | ✅ | ❌ | ❌ |

Las métricas de costo no se ocultan con CSS: el motor **no las calcula** si el rol no las puede ver.

---

## 11. Arquitectura de archivos

```
src/modules/analytics/
├── data/
│   ├── history.mock.js        # ⭐ SalesFact generados, sep 2025 → jul 2026 (meses cerrados)
│   ├── reports.mock.js        # 8 reportes de fábrica
│   ├── dashboards.mock.js     # 1 dashboard por defecto
│   └── targets.mock.js        # objetivos por métrica
├── lib/
│   ├── metrics.js             # ⭐ el diccionario: ~45 contratos con compute()
│   ├── dimensions.js          # las 14 dimensiones y de dónde sale cada valor
│   ├── periods.js             # períodos, comparaciones, período parcial, frontera historia/vivo
│   ├── facts.js               # buildFacts(period, filters) → SalesFact[]
│   ├── cohorts.js             # matriz de cohortes y retención
│   └── format.js              # money / percent / delta / "—" con denominador 0
├── api/
│   └── analyticsApi.js        # query() · getSummary() · reportes · dashboards · alertas
├── components/
│   ├── MetricCard.jsx         # KPI con delta, n y ⓘ
│   ├── MetricInfo.jsx         # ⭐ la ficha del contrato
│   ├── MetricPicker.jsx       # selector que muestra la pregunta
│   ├── PeriodPicker.jsx       # período + comparación
│   ├── FilterBar.jsx          # chips de filtro
│   ├── SeriesChart.jsx        # línea con comparación y frontera (SVG propio)
│   ├── BarChart.jsx
│   ├── CohortMatrix.jsx       # matriz con escala de color
│   ├── ResultTable.jsx        # tabla con totales y % del total
│   └── WidgetCard.jsx
├── Resumen.jsx · Explorador.jsx · Cohortes.jsx
├── Reportes.jsx · Dashboards.jsx · DashboardDetalle.jsx · Metricas.jsx
└── Analytics.css
```

**Sin librería de gráficos**, igual que el resto del panel: línea y barras en SVG propio, matriz de
cohortes en CSS grid.

---

## 12. Plan por fases

### F1 — El diccionario y el motor ✅ *(implementada)*
- `lib/metrics.js` con **46 contratos**, `lib/dimensions.js` (10 dimensiones), `lib/periods.js`,
  `lib/facts.js`, `lib/format.js`.
- `data/history.mock.js`: generador determinístico — 130 clientes en 11 cohortes, 281 pedidos,
  sep-2025 → jul-2026, con estacionalidad y recompra decreciente.
- `analyticsApi.query()` y `getSummary()`.
- Pantallas **Resumen ejecutivo** y **Diccionario de métricas**.
- `MetricCard` + `MetricInfo` + `PeriodPicker` + `SeriesChart`.

**Decisiones y hallazgos al implementar:**
1. **El ingreso neto de Finanzas incluye el envío cobrado.** La primera versión de esta spec decía lo
   contrario; se corrigió contra el código (§2.1). Es la clase de error que la regla del módulo existe
   para evitar: la fórmula se verifica contra la fuente, no contra la intuición.
2. **Faltaba el costo de 9 de los 14 productos del catálogo**, así que sin agregarlo no había COGS ni
   margen para la historia. Se sumó `cost` a `catalog.mock.js`, con los cinco originales **idénticos**
   a `inventario/data/skus.mock.js` para no crear una segunda verdad.
3. **El RBAC vive en el motor, no en la UI.** `query()` devuelve `{ restricted: true }` para una
   métrica sensible si el rol no corresponde: el número no se calcula, no se calcula-y-se-tapa.
4. **La historia usa su propio padrón de clientes** (`H-CLI-*`), separado del CRM. Las 8 cuentas
   reales son la cohorte de agosto/septiembre 2026; las 130 generadas, las once anteriores. No hay
   colisión de ids ni cuentas fantasma en el CRM.
5. **`resolvePeriod(value, null)` rompía**: un valor por defecto de parámetro sólo cubre `undefined`,
   no `null`. Corregido con `options || {}`.

### F2 — Explorar y guardar ✅ *(implementada)*
- **Explorador** completo: métrica × dimensión × período × comparación × filtros, con tabla, barras y
  línea, y deshabilitado explicado de las dimensiones que no aplican.
- `MetricPicker`, `FilterBar`, `ResultTable`, `BarChart`.
- **Reportes**: guardar, listar, duplicar, eliminar, 8 de fábrica.
- **Exportación CSV** con cabecera de contexto.

**Hallazgo importante al implementar — el ingreso se reparte por línea:**

La primera versión sumaba `order.revenueNet` sobre los pedidos del grupo. Cortando por producto eso
daba *el ingreso de los pedidos que contienen ese producto*, no el del producto: la Mochila Trekking
figuraba con $2.822.010 cuando el total del período era $9.960.166, y la suma de los 14 productos
superaba largamente al total.

**Solución:** cada línea lleva su parte proporcional del pedido (`lineRevenueNet`, `lineRevenueGross`,
`lineDiscount` en `lib/facts.js`), repartida según el precio de lista de la línea. El descuento y el
envío son del pedido, así que se prorratean; el COGS ya era exacto por línea. `revenue_net`,
`revenue_gross`, `discount_given`, `cogs`, `gross_margin` y `avg_unit_price` pasaron a calcularse
sobre líneas.

Verificado: **la suma por producto y la suma por categoría dan exactamente el total** (desvío
0,000 %), y filtrar por Calzado devuelve el mismo número que la fila Calzado del corte por categoría.
El caveat de las métricas afectadas lo dice: al cortar por producto, categoría o marca, el descuento y
el envío se reparten en proporción al precio de lista.

**Otras decisiones de F2:**
1. **El `% del total` sólo se muestra para métricas sumables** (dinero y conteos). Un "% del total"
   sobre un promedio o sobre un porcentaje no significa nada, así que no se dibuja.
2. **La fila Total no es la suma de las filas**: se calcula sobre todo el período. Está dicho en un
   tooltip, porque para un AOV o un margen % la suma de las filas sería un número inventado.
3. **El CSV lleva la fórmula de cada métrica exportada**, no sólo los valores: es la única forma de
   que el archivo siga siendo interpretable cuando se abre fuera del panel.
4. La vista de **línea sólo se ofrece cortando por tiempo**; en cualquier otro corte no hay eje
   continuo que justifique unir los puntos.

### F3 — Cohortes, dashboards, objetivos y alertas ✅

**Implementado (2026-09-08).**

- **Cohortes y retención** (`/analytics/cohortes`): `lib/cohorts.js` (`buildCohorts`,
  `retentionCurve`, `ltvCurve`, `paybackMonths`), componente `CohortMatrix` en CSS grid, tarjeta
  LTV / CAC con las cinco métricas y su ⓘ, y el bloque **Repago del CAC**.
- **Dashboards** (`/analytics/dashboards` · `/:id`): `data/dashboards.mock.js` con dos de fábrica,
  CRUD completo, `addWidget` / `addWidgetFromReport` / `moveWidget` / `updateWidget` /
  `removeWidget`, `runWidget` y el componente `WidgetCard`. Grilla de 3 columnas, ancho 1/2/3 por
  widget, orden con flechas.
- **Objetivos y alertas** (`/analytics/objetivos`): objetivos editables (`setTarget`) y motor de
  alertas (`data/alerts.mock.js`, `saveAlert`, `toggleAlert`, `deleteAlert`, `evaluateAlerts`), con
  el panel **"Qué mirar"** del Resumen alimentado por él.

#### Decisiones y hallazgos al implementar F3

1. **⭐ Una celda que todavía no ocurrió no vale 0, vale nada.** La cohorte de junio no tiene mes+6
   porque junio+6 está en el futuro. Rellenar eso con cero es la forma más común de dibujar una caída
   de retención inexistente. El triángulo inferior derecho de la matriz queda **vacío a propósito**,
   rayado y con su tooltip. Verificado: 55 celdas futuras (0+1+…+10), **ninguna con dato**.

2. **⭐ La matriz sólo usa meses completos, y por eso termina en julio de 2026.** Septiembre tiene
   tres días y agosto arranca el 10 — la frontera con los datos vivos — así que el mes de la frontera
   tiene un hueco del 1 al 9 en el que no hay ni historia ni dato vivo. Un mes recortado en una matriz
   de retención se lee como un derrumbe. `lastCompleteMonth()` lo **deriva de `LIVE_START`** en vez de
   escribirlo a mano, para que siga siendo cierto si la frontera se mueve. Consecuencia asumida: la
   pantalla de cohortes es enteramente histórica; las 8 cuentas vivas no forman cohorte todavía.

3. **⭐ La matriz no usa el selector de período**, y se dice en pantalla. Una cohorte se sigue por
   meses desde su alta; recortarla a "los últimos 30 días" no significa nada.

4. **⭐ Hallazgo: el mes 0 no siempre da 100 %.** Se esperaba que sí, por definición. Da 90,9 % en
   oct-25, 91,7 % en nov-25, 92,3 % en abr-26 y 92,9 % en may-26. Medido, no supuesto: son
   exactamente **4 cuentas cuya primera compra terminó devuelta** (`primeraCompraDevuelta: 4`, y las
   cuatro cohortes afectadas coinciden una a una). La causa es coherente, no un bug: `firstOrderAt`
   cuenta el alta con el pedido devuelto incluido —igual que la métrica `customers_new`— y la celda
   sólo cuenta ventas no devueltas. Se dejó así para **no contradecir a `customers_new`**, y el pie de
   la matriz lo explica en vez de esconderlo.

5. **La curva de retención se pondera por tamaño de cohorte** (`Σ activos / Σ miembros`), no es el
   promedio de los porcentajes: una camada de 3 clientes no puede pesar lo mismo que una de 20. La
   diferencia es real y medible — mes 1: **33,3 % ponderada contra 34,6 % de promedio simple**. Cada
   punto muestra además **cuántas cohortes maduras lo sostienen**, y las que tienen menos de 3 se
   marcan: al mes 10 queda una sola camada, y eso no es una tendencia.

6. **El repago del CAC se compara contra el margen acumulado, no contra el ingreso.** El CAC se paga
   con lo que queda después del costo de la mercadería. Cuando la curva no llega al CAC dentro del
   horizonte devuelve `null` **con el motivo**, que es un resultado y no un error.

7. **El "ingreso acumulado por cliente" de la matriz no es el "LTV promedio" de la tarjeta**, y el
   aviso lo dice: la matriz suma ingreso neto (sin IVA) dentro de la ventana, y el LTV del CRM suma
   `order.total` —con IVA y envío— de toda la historia. Dos preguntas distintas, no un número que no
   cierra.

8. **Un widget es una consulta con forma.** No guarda números: guarda el mismo objeto
   `{ metrics, dimension, period, compare, filters }` que un reporte y pasa por el **mismo `query()`**
   que el Explorador, así que no puede mostrar otro número. Verificado en el dashboard de fábrica:
   total $9.960.165 y Calzado $3.450.545, idénticos al Explorador.

9. **Se mueve con flechas, no arrastrando** (igual que el outline del Store Builder): predecible y
   accesible con teclado. Editar es un **modo**, no una pantalla aparte — la grilla sigue mostrando
   datos reales mientras se acomoda.

10. **Las alertas se agrupan por período antes de evaluarse**: cinco alertas sobre "últimos 30 días"
    son una sola consulta, no cinco tablas de hechos.

11. **Una alerta sobre una métrica que el rol no puede ver no se dispara ni se calcula**: devuelve
    `restricted` y la fila lo dice. Filtrar el resultado después sería seguir calculando lo que no
    corresponde. Verificado con rol Ventas: `contribution_margin_pct` y `ltv_cac_ratio` vuelven
    restringidas.

12. **El panel "Qué mirar" no repite el mismo problema dos veces**: una métrica que ya disparó alerta
    no vuelve a aparecer por objetivo incumplido. Y las alertas se llaman **"Alerta"**, los objetivos
    **"Aviso"** y el resto **"Nota"** — si todo se llama igual, nadie lo lee.

13. **No hay detección automática de anomalías** (§1.4). Con este volumen de datos, "anomalía" es
    indistinguible de "martes". Una alerta es una regla que alguien escribió, con una nota que dice
    por qué importa.

14. **Un objetivo se puede borrar, y es una opción de verdad**: un objetivo inventado alimenta "Qué
    mirar" con avisos que nadie decidió. Los porcentajes se cargan en la unidad que se habla (8, no
    0,08) y se convierten al guardar.

15. **RBAC de cohortes**: Admin, Dirección y Marketing ven la matriz y el LTV; Ventas no ve la
    pantalla. A Marketing el motor **no le calcula** CAC ni repago (`{ restricted: true }`), no se los
    tapa. Definir objetivos y alertas es sólo de Admin y Dirección; para el resto la pantalla es de
    lectura, porque saber qué reglas rigen sigue siendo útil.

#### Verificación de F3

```
suma de la matriz de cohortes : $33.976.584
mismo total pedido al motor   : $33.976.585   desvío 0,000 % (1 peso de redondeo en 281 pedidos)
cohortes                      : 11 · clientes: 130
celdas futuras con dato       : 0 de 55
curva mes 1 ponderada         : 33,3 %  (promedio simple: 34,6 %)
rol Ventas → cohortes         : RESTRINGIDO
rol Marketing → CAC / repago  : sin acceso (el motor no los calcula)
```

Lint y build limpios; ambos temas verificados (el tinte de la matriz se redefine por tema).
