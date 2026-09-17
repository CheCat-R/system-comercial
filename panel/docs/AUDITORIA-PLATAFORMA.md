# Auditoría de plataforma — CheCAT Panel

> Auditoría transversal de UX, UI, funcional, arquitectura y experiencia premium.
> **Fecha: 2026-09-09.** Alcance: `panel-dashboard/` (62.777 líneas · 204 `.jsx` · 145 `.js` · 82 `.css`
> · 19 módulos · 79 rutas). No incluye `backend/` ni `sitio-web/`.
>
> Consultar junto con [`ARCHITECTURE.md`](../ARCHITECTURE.md) y los `docs/MODULO-*.md`.
>
> **Estado: Fases A, B y C ejecutadas y verificadas (2026-09-09 / 2026-09-10).** Las mediciones del
> §10 son las del diagnóstico original; §11, §12 y §13 registran el después. Falta la Fase D.

---

## 0. Método

Todo lo que sigue está **medido sobre el código y verificado en el navegador**, no inferido. Cuando
digo "18 botones sin acción" es porque un script recorrió los 371 `<Button>` del panel resolviendo el
tag de apertura con anidamiento de llaves. Cuando digo "el Dashboard no importa ningún `api/`" es
porque su lista de imports tiene 26 líneas y ninguna apunta a una capa de datos.

Los números están para que la próxima auditoría pueda compararse contra ésta.

**Criterio para las propuestas:** el pedido fue *no agregar funcionalidades arbitrariamente*. Cada
propuesta de este informe es una de tres cosas, y está etiquetada:

| Tag | Significa |
|---|---|
| **[CONECTAR]** | La capacidad ya existe en el panel y no está enchufada |
| **[UNIFICAR]** | Lo mismo está resuelto N veces; hay que dejar una |
| **[CUMPLIR]** | El producto ya promete esto en pantalla y no lo entrega |

No hay ninguna propuesta que invente una capacidad nueva. **La mayor parte de lo que le falta al
panel para sentirse premium ya está construido y sin conectar** — y ése, más que cualquier detalle
visual, es el hallazgo central.

---

## 1. Veredicto

**El motor es de nivel SaaS premium. La carrocería, a tramos, es una plantilla de admin.**

La distancia entre las dos cosas es el problema, y es un problema de *coherencia*, no de capacidad:

- Debajo hay diez módulos completos con capas de datos reales, contratos declarados que fallan al
  cargar si están incompletos, un bus de eventos, un registro de puertos de integración, una
  auditoría inmutable y un portón de acciones sensibles. **Cero violaciones de frontera** en 62 mil
  líneas.
- Arriba, la primera pantalla que ve cualquiera —el "Centro de comando"— tiene **todos sus números
  escritos a mano**, y uno de ellos es una métrica que el propio módulo de Analytics documenta como
  **imposible de medir**.

Un evaluador que entre por la portada concluye "otro admin de Bootstrap". Un evaluador que entre por
`/seguridad/aprobaciones` o `/integraciones/trafico` concluye otra cosa completamente distinta. Hoy
el producto **no se presenta a la altura de lo que es**.

### Puntaje por dimensión

| Dimensión | Estado | Nota |
|---|---|---|
| Arquitectura | 🟢 **Muy sólida** | Capas respetadas sin excepción; contratos que fallan al cargar |
| Funcional (flujos, permisos, eventos) | 🟢 **Sólida** en el núcleo, 🔴 en la superficie | La lógica está; la UI no la refleja |
| UX (consistencia, navegación, feedback) | 🟡 **Despareja** | Excelente en los módulos nuevos, plantilla en los viejos |
| UI (tokens, tipografía, espaciado) | 🟡 **Buena base, disciplina floja** | 67 % del espaciado esquiva la escala |
| Accesibilidad | 🔴 **Insuficiente** | Sin `aria-current`, sin skip link, sin `prefers-reduced-motion` |
| Experiencia premium | 🔴 **Prometida y no entregada** | ⌘K decorativo, sin ordenar tablas, sin loading |

---

## 2. Lo que está sólido (para calibrar el resto)

Antes de la lista de problemas, lo que **no** hay que tocar, porque es lo que sostiene todo:

1. **La frontera de capas se respeta al 100 %.** Cero archivos `.jsx` importan `data/` — ni propio ni
   ajeno. Los 9 imports cruzados de UI entre módulos van todos a un `api/`. Esto es rarísimo de ver
   en una base de 62 mil líneas y es lo que hace que migrar a backend sea reescribir `api/` y nada
   más.
2. **Los contratos fallan al cargar.** `assertContracts` (Analytics, 46 métricas),
   `assertEventContracts` (Automatizaciones), `assertProviderContracts` (Integraciones),
   `assertPermissions` + `assertRoles` (Seguridad). Una métrica sin fórmula o un permiso sin punto de
   aplicación **no se puede usar**.
3. **Las tres hojas sin dependencias** (`bus.js`, `ports.js`, `audit.js`) mantienen el grafo acíclico
   con tres módulos transversales encima.
4. **Namespacing de CSS impecable:** cero colisiones de clase entre los 82 archivos (`an-`, `inv-`,
   `st-`, `au-`, `in-`, `sec-`, `aba-`…).
5. **Una sola tabla.** 52 pantallas usan `DataTable`; **cero** usan `<Table>` de MUI a mano. La
   Fase 2 del rediseño se sostuvo.
6. **El modo claro está bien resuelto.** Verificado en pantalla: sidebar legible, tablas correctas,
   sin restos de valores pensados para oscuro.
7. **El centro de notificaciones es real**, alimentado por las automatizaciones. No es decorado.

---

## 3. UX

### 3.1 Consistencia — 🟡

**Dos encabezados de pantalla, y uno no es un componente.**
`PageHeader` se usa en 70 de 82 pantallas (85 %). Las 12 restantes son **todas pantallas de detalle** y
usan la clase `entity-header` de `globals.css`. No es deriva: es un **segundo patrón coherente y no
documentado**. Hoy funciona porque hay una sola definición CSS; el día que alguien quiera agregarle
un breadcrumb o un menú de acciones a los detalles, hay que tocarlo en 12 archivos.

> **[UNIFICAR]** Convertir `entity-header` en `EntityHeader` (título, subtítulo, volver, badges,
> acciones). Mismo esfuerzo que `PageHeader`, y las dos primitivas quedan hermanas en vez de
> primas lejanas.

**Seis tablas de líneas hechas a mano.**
Además de `DataTable`, hay `aba-lines-table`, `rep-table`, `inv-transfer-lines-table`,
`inv-count-table`, `inv-breakdown-table` y `an-table` — **60 reglas CSS haciendo lo mismo**: la
sub-tabla de líneas que va dentro de una pantalla de detalle (ítems de una OC, líneas de una
transferencia, desglose por depósito). `DataTable` no sirve ahí porque trae paginación, toolbar y
selección.

> **[UNIFICAR]** Extraer `LineTable` (o `DataTable density="compact" bare`), que es el caso que ya
> apareció seis veces por su cuenta.

**Dos componentes compartidos que nadie usa.**
`SearchBar` (34 líneas) y `FileUploader` (131 líneas) tienen **cero imports**. Mientras tanto
`ProductoDetalle` dibuja su propia zona de arrastre con un botón "Explorar archivos" que no hace
nada.

> **[CONECTAR]** o borrar. Las dos opciones son mejores que la actual.

### 3.2 Navegación — 🟡

**34 segmentos de ruta no tienen etiqueta de breadcrumb.**
`AppBreadcrumbs` tiene un mapa `routeNames` con ~48 entradas que cubre los primeros módulos
construidos. Los ocho siguientes nunca se agregaron, y el *fallback* es capitalizar el segmento. En
pantalla eso significa:

```
Marketing  >  Campanas        ← sin ñ
Marketing  >  Fidelizacion    ← sin acento
Tienda     >  Paginas         ← sin acento
Seguridad  >  Aprobaciones    ← funciona por casualidad
```

Es el mismo error de clase que el módulo resolvió en todos lados: **una lista paralela que se
desactualiza en silencio**. Analytics, Automatizaciones, Integraciones y Seguridad fallan al cargar
si les falta un contrato; la navegación no.

> **[CUMPLIR]** Aplicar el patrón que el panel ya usa cinco veces: un `assertRoutes()` que compare las
> rutas declaradas contra el mapa de etiquetas y reporte en consola las que faltan, igual que
> `assertPermissions()`. El bug deja de ser invisible.

**El detalle de una entidad se llama "Detalle".**
`labelFor` detecta IDs y devuelve la palabra `Detalle`. Es mejor que mostrar `1` (que era el estado
anterior), pero un panel premium pone el nombre: `Pedidos > #10253`, `Productos > Zapatillas
Running X`.

> **[CONECTAR]** Las pantallas de detalle ya tienen la entidad cargada. Un contexto ligero
> (`useBreadcrumbLabel(order.id)`) o un `<Outlet context>` alcanza; no hace falta pedirle nada al
> `api/`.

**"Ajustes" apunta a una ruta que no existe.** `/configuracion` está deshabilitado en el sidebar. Es
honesto, y está documentado en la spec de Seguridad §4.7, pero es un ítem muerto a la vista
permanente.

### 3.3 Jerarquía — 🟢 en el detalle, 🟡 en la portada

Las pantallas construidas con los módulos reales tienen jerarquía correcta: resumen → filtros →
tabla → detalle embebido. El problema es la portada (§7.1).

En el Dashboard, las cuatro KPI cards, el gráfico y los cuatro widgets tienen **el mismo peso
visual**. Nada dice qué mirar primero. Es notable porque el módulo de Analytics **ya tiene una
pantalla que resuelve exactamente eso** ("Qué mirar", alimentada por objetivos y alertas de umbral).

### 3.4 Estados — 🔴

**No existe vocabulario de carga.** Cero `Skeleton` en toda la app. `DataTable` acepta `loading` y se
le pasa en **2 de 52 usos**. Hoy todo es síncrono en memoria, así que no se nota — y ése es
exactamente el riesgo: **el día que haya backend, 52 tablas van a saltar de vacío a lleno sin nada en
el medio**, y ese trabajo va a haber que hacerlo 52 veces bajo presión.

> **[CUMPLIR]** No es funcionalidad nueva: `DataTable` **ya tiene el parámetro**. Pintar el estado de
> carga como skeleton de filas (no como barra) y pasarlo desde los `api/` cuando exista latencia. Se
> hace una vez, en el componente.

**Vacíos genéricos.** 6 `DataTable` no reciben `emptyMessage` y caen en "No se encontraron
registros". Y el vacío es **sólo texto**: sin icono, sin acción. Compará con el que sí está bien
escrito, en Aprobaciones:

> *"No hay nada esperando firma. Las solicitudes aparecen solas cuando alguien intenta una operación
> de grado con aprobación: cambiar permisos, aprobar un reembolso, anular un comprobante…"*

Eso enseña a usar el producto. "No se encontraron registros" no enseña nada.

> **[UNIFICAR]** Darle a `DataTable` un vacío con forma: icono, frase que explique *por qué* está
> vacío y, si corresponde, el botón que lo llena. El texto ya lo escriben bien 46 pantallas; falta el
> contenedor.

**Sin `ErrorBoundary`. En toda la aplicación: cero.** Un error de render en cualquier componente deja
la pantalla en blanco, sin recuperación y sin mensaje. Es el único hallazgo de este informe que
califica como riesgo, no como pulido.

> **[CUMPLIR]** Un `ErrorBoundary` por ruta dentro de `MainLayout`, con el mismo tono del resto:
> qué pasó, qué se puede hacer, y un enlace para volver.

**404 silencioso.** `<Route path="*" element={<Navigate to="/" replace />} />`. Escribir mal una URL
te deposita en el Dashboard sin explicación. Un producto premium dice *"esa dirección no existe"* y
ofrece la búsqueda.

### 3.5 Feedback — 🟡

**373 `showToast` en 76 archivos, y un solo slot.**
`ToastContext` guarda `useState({ open, message, severity })`: **un toast a la vez**. El segundo
sobrescribe al primero. Hay flujos que producen dos mensajes seguidos —confirmar un pago que además
deja backorder— y uno se pierde. Tampoco hay cola, ni acción ("Deshacer"), ni historial.

Y hay un problema de fondo: **el toast es casi el único canal de feedback**. Todo confirma igual —
guardar un gasto y aprobar un reembolso de $24.000 producen el mismo rectángulo abajo a la derecha
durante cuatro segundos. En un ERP, el peso de la confirmación debería seguir al peso de la acción.

> **[UNIFICAR]** Cola de toasts (2–3 visibles, apilados) y un `showToast(msg, tone, { action })` para
> el caso "Deshacer". El resto ya existe: las operaciones sensibles **ya dejan asiento en la
> auditoría**, así que la confirmación fuerte puede ser inline (el `ChangeLog` de la entidad se
> actualiza solo) en vez de un toast más.

**Se avisa después, no antes.** Ver §5.3 — es el hallazgo funcional más importante.

### 3.6 Errores — 🟡

Bien: los mensajes de error del dominio son excelentes y explican la causa (*"Es el último
administrador activo: el panel no puede quedarse sin uno"*, *"Probá la conexión primero: no se
habilita algo que no sabemos si responde"*). Esto es de nivel premium y hay que preservarlo.

Mal: 33 `catch` en la UI y **todos terminan en el mismo toast de 4 segundos**. Un error de validación
de formulario, uno de permisos y uno de estado inconsistente se ven idénticos y desaparecen solos.
Los errores que exigen decisión deberían quedarse en pantalla, junto al campo o a la acción que los
produjo — como ya lo hace `ReasonDialog`, que muestra el error dentro del diálogo.

---

## 4. UI

### 4.1 Design tokens — 🟡

| Medición | Valor |
|---|---|
| Tokens definidos en `variables.css` | 192 |
| Tokens efectivamente consumidos | 112 |
| **Tokens muertos** | **87 (45 %)** |
| Tokens usados sin definir | 1 real (`--accent-border`, con *fallback*) |

Los 87 muertos incluyen **la paleta cyberpunk entera** que el rediseño vino a eliminar:
`--color-neon-cyan`, `--color-neon-pink`, `--color-neon-purple`, `--color-neon-amber`,
`--color-neon-emerald`, la rampa completa `--color-slate-50…900`, `--color-primary-50…900`,
`--bg-app`, `--bg-sidebar`, `--bg-navbar`, `--color-error-500/600`, `--color-info-bg`…

No rompen nada —nadie los usa— pero son una trampa: **el próximo que abra `variables.css` va a ver
dos sistemas de color y elegir el equivocado.** La Fase 1 del plan de rediseño decía "los nombres
viejos se eliminan"; se dejaron los alias y nunca se limpiaron.

> **[UNIFICAR]** Borrar los 87. Es una operación segura y verificable (`comm` entre definidos y
> usados), y deja el archivo diciendo una sola cosa.

**Gradientes y glow:** sólo 8 apariciones fuera de `variables.css`, en `Analytics.css` y
`Tienda.css`. En Tienda es legítimo (son bloques del storefront que el usuario diseña). En Analytics
habría que mirarlo.

### 4.2 Tipografía — 🟡

| Medición | Valor |
|---|---|
| `font-size: var(--text-*)` | 485 |
| `font-size` con px/rem crudo en CSS | 57 |
| Valores crudos distintos | **18** (`0.6rem`, `0.85rem`, `9px`, `10px`, `22px`, `34px`, `40px`…) |
| `fontSize:` dentro de `sx={{}}` | 166, con 8 valores numéricos distintos (`15`, `17`…) |

Disciplina del 89 % en CSS. El problema real es el `sx`: `fontSize: 15` y `fontSize: 17` no están en
ninguna escala y viven en JSX, donde ningún token los alcanza. Una parte es dimensionado de iconos
(legítimo en MUI), pero no toda.

### 4.3 Espaciado — 🔴 (el punto más flojo del sistema)

| Medición | Valor |
|---|---|
| Tokens `--space-*` definidos | 9 |
| Usos de `var(--space-*)` | 319 |
| **`padding`/`margin`/`gap` con px crudo** | **646** |
| Valores distintos usados sólo en `gap` | **21** — `1px 2px 3px 4px 5px 6px 7px 8px 9px 10px 12px 14px 16px 18px 20px 22px 24px 26px 28px 36px 56px` |

**El 67 % del espaciado esquiva la escala.** Una escala de 9 pasos con 21 valores de `gap` distintos
no es una escala: es una sugerencia. Esto es lo que produce la sensación de "casi alineado" que
separa un producto premium de uno correcto, y es invisible en cada archivo por separado.

> **[UNIFICAR]** Redondear los 646 valores al paso más cercano de la escala. Es mecánico, se puede
> hacer módulo por módulo, y no cambia ninguna funcionalidad.

**673 `sx={{}}` en 146 archivos.** Es la fuga principal: decisiones de espaciado y tipografía viviendo
en JSX. No hay que eliminarlas todas (MUI las necesita para layout puntual), pero las que fijan
`p`, `gap`, `fontSize` o colores deberían ser clases.

### 4.4 Componentes — 🟢

Adopción real de las primitivas compartidas:

```
Button 114 · StatusBadge 85 · Toast 76 · PageHeader 70 · Modal 61 · DataTable 52
Cards 23 · Toolbar 6 · Form 6 · Breadcrumbs 1 · CommandPalette 1 · NotificationCenter 1
SearchBar 0 · FileUploader 0        ← código muerto (165 líneas)
```

Sana. Los problemas ya están dichos: falta `EntityHeader`, falta `LineTable`, sobran dos componentes.

**`DataTable`, lo que le falta** (ver §7.3): ordenamiento por columna, densidad, barra de acciones
masivas, slot de acciones por fila.

### 4.5 Responsive — 🟡

**18 de 82 archivos CSS tienen `@media`** (36 breakpoints en total). Muchos son componentes que
heredan el layout del contenedor, así que el número crudo exagera el problema — pero verificado en
pantalla a 375 px:

- **El shell funciona.** Drawer con hamburguesa, navbar colapsada, sin scroll horizontal del body.
- **Las KPI cards apilan una por fila** y miden ~250 px de alto cada una: los cuatro indicadores
  ocupan ~1.000 px de scroll. Con 2×2 entran en una pantalla.
- **Las tablas scrollean horizontalmente** (correcto, el contenedor tiene su propio scroll) pero en
  Pedidos a 375 px se ven **sólo la casilla de selección, el número y la fecha**. Estado, cliente y
  total quedan fuera. La casilla —que en Pedidos no dispara ninguna acción masiva— se lleva el
  espacio más valioso.
- Las pestañas de la tabla se cortan a mitad de palabra ("Para de…").

> **[CUMPLIR]** `DataTable` ya conoce sus columnas. Marcar cuáles son *primarias* y renderizar filas
> como tarjetas por debajo de 768 px es un cambio en un componente, no en 52 pantallas.

### 4.6 Accesibilidad — 🔴

| Medición | Valor |
|---|---|
| `aria-label` | 101 ✅ |
| `<img>` sin `alt` | 0 ✅ |
| `<div>`/`<span>` clicables sin rol ni teclado | 0 ✅ (los 10 `role="button"` traen `tabIndex` y `onKeyDown`) |
| **`aria-current` en navegación** | **0** ❌ |
| **Skip link** | **0** ❌ |
| **`prefers-reduced-motion`** | **1 archivo** ❌ |
| `:focus-visible` | 7 de 82 CSS |
| `outline: none` | 4 apariciones |

Las bases están mejor de lo esperado. Lo que falta es concreto y acotado:

1. **`aria-current="page"` en el ítem activo del sidebar.** Hoy el estado activo es sólo color: un
   lector de pantalla no sabe dónde está parado.
2. **Skip link** ("Saltar al contenido") — 79 rutas con un sidebar de ~40 ítems por delante.
3. **`prefers-reduced-motion`** aplicado globalmente, no en un archivo suelto.
4. **`:focus-visible` consistente.** El token `--focus-ring` existe y está en la lista de tokens
   muertos: se declaró el anillo de foco y no se usa.

Nota: los toasts sí se anuncian (el `Alert` de MUI trae `role="alert"` por defecto), así que ese
canal no está mudo — pero al sobrescribirse (§3.5) el mensaje anterior se pierde también para quien
lo escucha.

---

## 5. Funcional

### 5.1 Flujos — 🟢

Los flujos de negocio están completos y correctamente encadenados, y esto es lo mejor del producto:

```
cotización → pedido → pago → reserva de stock → factura → envío → entrega
                                    ↓                          ↓
                              backorder                   incidencia → devolución
                                                                ↓
                                            reembolso solicitado → aprobado (2 firmas) → NC
```

Verificado extremo a extremo en fases anteriores. La reserva de stock, la generación perezosa de
comprobantes y el gate de reembolso en dos pasos funcionan.

### 5.2 Estados — 🟢

Las máquinas de estado están bien modeladas y **los estados imposibles están cerrados** (no se puede
cancelar un pedido pagado, no se puede habilitar una integración sin prueba exitosa, no se puede
anular una factura con nota asociada). Los mensajes explican el porqué.

### 5.3 Permisos — 🔴 (el hallazgo funcional principal)

**El RBAC es correcto y está en el lugar correcto** (`api/`, nunca en el botón). Pero:

| Módulo | ¿La UI consulta permisos? |
|---|---|
| Seguridad, Integraciones, Automatizaciones | ✅ sí |
| **Pedidos, Inventario, Finanzas, Facturación, Productos, Clientes, Marketing, Tienda, Logística, Abastecimiento, Analytics** | ❌ **no** |

**Una sola pantalla de 82 usa `check()`.** En los once módulos de negocio, alguien sin permiso ve el
botón habilitado, hace clic, y recién ahí aparece un toast rojo. La regla que el propio módulo de
Seguridad escribió —*"ningún botón desaparece por permisos; se muestra deshabilitado **con el
motivo**"*— se cumple en Seguridad, Integraciones y Automatizaciones, y en ningún otro lado.

No es un agujero de seguridad (el `api/` frena igual). Es un agujero de **experiencia**: el producto
te deja intentar y después te reta. Y es lo que más lo hace sentir un CRUD: en un CRUD genérico,
todos los botones están siempre encendidos.

> **[CONECTAR]** `useAuth()` ya expone `check(permiso)` y devuelve `{ allowed, reason }`. Envolver los
> ~27 botones destructivos/sensibles de los módulos de negocio en el patrón que ya usa
> `Usuarios.jsx`: `disabled` + `Tooltip` con el motivo. No hay que escribir lógica nueva: hay que
> leer la que ya está.

### 5.4 Dependencias — 🟢

Grafo de dependencias entre `api/` (medido):

```
finanzas      → automatizaciones clientes facturacion integraciones inventario logistica pedidos seguridad
tienda        → automatizaciones clientes inventario marketing productos seguridad
facturacion   → automatizaciones clientes integraciones inventario pedidos seguridad
logistica     → automatizaciones integraciones inventario pedidos seguridad
marketing     → automatizaciones clientes inventario pedidos
analytics     → inventario logistica productos seguridad
pedidos       → automatizaciones inventario seguridad
seguridad     → automatizaciones          (sólo el bus, que es hoja)
automatizaciones → seguridad              (sólo audit/gate, que son hojas)
```

La dirección es la correcta: los agregadores (Finanzas, Analytics, Tienda) dependen de muchos; los
transversales dependen de casi nada.

**Una fragilidad, sin gravedad hoy:** a nivel *módulo* hay un ciclo `seguridad ↔ automatizaciones`.
No es un ciclo real de imports porque los dos puntos de entrada son hojas sin dependencias
(`bus.js` ↔ `audit.js`/`gate.js`/`approvals.js`), y está explicado en los comentarios de los cuatro
archivos. Pero **el invariante no está verificado en ninguna parte**: un import descuidado dentro de
cualquiera de esas hojas rompe el arranque de la aplicación entera con un módulo a medio inicializar
—el peor tipo de bug, intermitente y dependiente del orden de carga.

> **[CUMPLIR]** El panel ya falla al cargar cuando un contrato de datos está incompleto. Falta el
> mismo mecanismo para el contrato *arquitectónico*: un chequeo en build (o un test) que verifique
> que los archivos declarados como hoja no tienen ni un `import`.

### 5.5 Eventos — 🟢

Eventos de dominio emitidos por módulo: `pedidos 7 · logistica 4 · finanzas 3 · abastecimiento 2 ·
inventario 2 · seguridad 2 · tienda 2 · facturacion 1 · marketing 1 · automatizaciones 1`.

43 eventos en el catálogo, todos con contrato completo (clave, sujeto tipado, punto exacto de
emisión, payload y ejemplo). El bus valida al cargar. **Es la parte mejor construida del sistema.**

Detectado y corregido durante esta auditoría de fases previas: `bus.record()` pisaba el id generado
con el `id: null` que le pasa el escáner, dejando **todos los eventos observados sin identificador**.

---

## 6. Arquitectura

### 6.1 Reutilización — 🟡

Alta en primitivas (`Button` 114, `StatusBadge` 85, `DataTable` 52), baja en dos patrones que
aparecieron seis y doce veces respectivamente sin convertirse en componente (`LineTable`,
`EntityHeader`). Dos componentes con cero uso.

### 6.2 Modularidad — 🟢

`data/ → lib/ → api/ → UI` respetado sin una sola excepción medible. El módulo es la unidad de
despliegue mental: se puede leer uno entero sin abrir otro.

### 6.3 Acoplamiento — 🟢

Bajo y direccionado. El patrón "hoja sin dependencias" resolvió tres veces el mismo problema
(eventos, puertos, auditoría) con la misma forma, y el patrón de "enchufe" (`setPipeline`,
`setStepUpCheck`, `setAlertSink`, `setPrincipalResolver`) permite que una hoja reciba capacidades sin
importarlas. Es una solución madura.

### 6.4 Consistencia entre módulos — 🟡

Los módulos construidos después de Analytics comparten vocabulario y estructura. Los tres más
antiguos (`dashboard`, `productos`, `ventas`) más `proyectos` **no siguen el patrón**: no tienen
`api/`, no tienen `data/`, y guardan sus datos en constantes dentro del `.jsx`. Ver §7.1.

### 6.5 Escalabilidad — 🟡

La estructura escala bien (agregar un módulo es copiar la forma). Lo que no escala:

- **`variables.css` con dos sistemas de color** — el próximo módulo puede elegir el muerto.
- **El mapa de breadcrumbs manual** — ya se quedó atrás 34 veces.
- **Un `DataTable` sin ordenamiento** — cada pantalla nueva hereda la carencia.
- **El bundle: 1.896 KB** (523 KB gzip) en un solo chunk, sin *code splitting*. Con 19 módulos y 79
  rutas, `React.lazy` por ruta es el cambio de mayor impacto por menor esfuerzo.

---

## 7. Experiencia premium

### 7.1 ⭐ La portada es una demo montada sobre un ERP real

**Éste es el hallazgo número uno del informe.**

`Dashboard.jsx` (242 líneas) **no importa ningún `api/`**. Sus 26 imports son MUI, iconos y tres
componentes. Todos los datos son literales:

```js
const kpis = [
  { title: "Ingresos totales",   value: "$2.450.000", delta: { value: "15%",  direction: "up" } },
  { title: "Pedidos netos",      value: "124",        delta: { value: "8%",   direction: "up" } },
  { title: "Ticket promedio",    value: "$19.758",    delta: { value: "2%",   direction: "down" } },
  { title: "Tasa de conversión", value: "3,2%",       delta: { value: "0,5%", direction: "up" } },
];
const alerts = [
  { title: "Quiebre de stock (3)",       desc: "Remera Nike y 2 más sin stock." },
  { title: "Pendientes de despacho (12)" },
  { title: "Devoluciones abiertas (2)" },
];
```

Tres problemas, en orden de gravedad:

1. **⭐ Publica un número que el producto declara imposible de conocer.**
   `docs/MODULO-ANALYTICS.md §2.8` dice, textual: *"Tasa de conversión del sitio — **No medible** — No
   hay sesiones ni visitas"*. La portada la muestra igual, **con una variación contra el período
   anterior**. Un panel que inventa una métrica que su propia documentación declara inexistente pierde
   la credibilidad de todas las demás.

2. **Contradice el catálogo.** "Remera Nike" no existe en el catálogo del panel (las marcas son Aureo,
   etc.). El gráfico dice, en el título, *"Placeholder — se conecta a la API de analítica"* — y la API
   de analítica **existe, está terminada y tiene 46 métricas con contrato**.

3. **Compite con lo que sí funciona.** El panel ya tiene:

   | El Dashboard inventa | Lo que ya existe y podría alimentarlo |
   |---|---|
   | Ingresos totales | `financeApi.getPnlSummary()` |
   | Pedidos netos, ticket promedio | `analyticsApi.query()` (46 métricas con fórmula declarada) |
   | Tasa de conversión | **nada — y está bien: no es medible** |
   | Quiebre de stock (3) | `inventoryApi.getPortfolioSummary().outOfStock` |
   | Pendientes de despacho (12) | `logisticaApi.getPortfolioSummary()` |
   | Devoluciones abiertas (2) | `financeApi.listRefunds({ status: "solicitado" })` |
   | Top variantes | `analyticsApi` corte por producto |
   | Actividad reciente | `securityApi.getAuditLog()` — **ya existe y es real** |

> **[CONECTAR]** Reescribir el Dashboard sobre los `api/` que ya están. **Y quitar la tasa de
> conversión**, poniendo en su lugar una métrica que el panel sí puede calcular (margen de
> contribución, por ejemplo). El bloque "Urgencias operativas" pasa a ser lo que el módulo de
> Analytics ya llama *"Qué mirar"*: objetivos y alertas de umbral reales.
>
> Es el cambio de mayor impacto de todo este informe: **una pantalla, cero capacidades nuevas, y el
> producto deja de mentirle a quien lo abre.**

**Las otras cinco pantallas scaffold** (1.320 líneas en total, todas sin `api/`):

| Pantalla | Líneas | Qué muestra | Qué existe al lado |
|---|---|---|---|
| `/` Dashboard | 242 | Literales | Todo lo de arriba |
| `/productos` | 234 | `mockProducts`: **5 productos** | `catalogApi.listProducts()`: **14 reales** |
| `/productos/:id` | 247 | Formulario que no persiste, "Zapatillas Running X" fijo | `catalogApi.getProduct()` |
| `/ventas` | 161 | `mockCotizaciones`, `mockVendedores` | `clientsApi` (cotizaciones), `financeApi` (comisiones) |
| `/proyectos` | 236 | Resto de la plantilla original | — no pertenece a un ERP de e-commerce |
| `/info-sistema` | 200 | Estático (aceptable) | — |

Que `/productos` muestre 5 productos inventados mientras `/productos/precios` muestra los 14 reales
—con costo, margen y control de cambio de precio— es la incoherencia más visible del panel.

### 7.2 ⭐ El Command Palette promete y no cumple

79 líneas. **El input no está conectado a nada**: no tiene `value`, ni `onChange`, ni estado. Escribir
no hace nada. Debajo hay tres enlaces fijos, y uno dice literalmente *"Buscar Cliente
(Próximamente)"* y está deshabilitado.

El placeholder promete: *"Busca productos, clientes, pedidos o herramientas…"*.

⌘K es **la** interacción firma de un SaaS premium. Que esté presente, prominente (tiene su propio
botón en la navbar con el atajo escrito) y sea decorativa es peor que no tenerla: es la señal más
clara de que el producto aparenta más de lo que hace.

Y no falta nada para que funcione: hay 79 rutas con nombre, y `pedidosApi`, `clientsApi`,
`catalogApi`, `inventoryApi` exponen lecturas.

> **[CUMPLIR]** Conectar el input a un buscador sobre dos fuentes que ya existen:
> **(a)** las rutas del panel —navegación por teclado a cualquiera de las 79— y
> **(b)** las entidades, vía los `api/` de lectura ya publicados (pedido por número, cliente por
> nombre, producto por SKU).
> Es la misma búsqueda global de §7.3, con un solo punto de entrada.

### 7.3 Búsqueda global — 🔴 no existe

El botón "Buscar… Ctrl K" de la navbar abre el Command Palette, que no busca. **No hay búsqueda global
en el panel.** Cada pantalla tiene su propio filtro local de texto (27 estados `search` distintos), y
ninguno cruza módulos.

Para un ERP con 19 módulos, "¿dónde estaba el pedido de María López?" no tiene respuesta salvo saber
de antemano en qué pantalla mirar. Es el rasgo de CRUD genérico más caro en uso diario.

### 7.4 Velocidad percibida — 🟡

Todo es síncrono en memoria: la navegación es instantánea, lo cual está muy bien. Pero:

- **No hay vocabulario de carga** (§3.4): el día que haya red, no hay dónde ponerlo.
- **Bundle único de 1.896 KB** (523 KB gzip). La primera carga trae los 19 módulos.
- **`prefers-reduced-motion` en un solo archivo**: quien pidió menos animación igual las recibe.

### 7.5 Microinteracciones, animaciones y transiciones — 🔴

| Medición | Valor |
|---|---|
| `@keyframes` en toda la app | **1** (`checat-fade-in`) |
| Archivos CSS con `transition` | 19 de 82 |
| Tokens de duración declarados | 3 (`--transition-fast/normal/slow`) |
| **Duraciones escritas a mano** | **11**, con valores fuera de escala (`0.15s`, `0.18s`) |

Hay **una** animación en el producto: el fade de entrada de página. No hay transición al abrir un
detalle, ni al aparecer una fila, ni al cambiar un estado, ni al actualizarse un número. Los cambios
de estado —que en este panel son el corazón del producto— ocurren de golpe.

Y el sistema de movimiento se declara en tres velocidades pero se usa en cinco.

> **[UNIFICAR]** Pasar las 11 duraciones a los tokens. **[CUMPLIR]** Y elegir **dos** momentos, no
> quince: (1) la fila que cambia de estado en una tabla, y (2) el asiento nuevo que aparece en un
> `ChangeLog`. Son los dos lugares donde el producto tiene algo que decir y hoy no lo dice.

### 7.6 Atajos — 🔴

Atajos de teclado en toda la aplicación: **dos**.

```
Ctrl/⌘ + K   → abre el Command Palette (que no busca)
Ctrl/⌘ + S   → guardar, sólo dentro del editor de Tienda
Ctrl/⌘ + Z   → deshacer, sólo dentro del editor de Tienda
```

No hay `/` para buscar, ni `g` + inicial para navegar, ni `Esc` consistente, ni navegación por
teclado en las tablas. El editor de Tienda muestra que el patrón se sabe implementar; no se
generalizó.

### 7.7 Acciones masivas — 🟡

`selectable` está activo en 12 pantallas. De ésas:

- **2 tienen acción masiva real y buena**: Clientes (seleccionar cuentas → **entregarlas a Marketing
  como audiencia**) y Stock (seleccionar filas → ajuste). Son exactamente lo que debe ser una acción
  masiva: un puente entre módulos.
- **6 son "borrar seleccionados"** en los submódulos de Productos y Proyectos — el genérico de
  plantilla.
- **4 tienen casillas que no disparan nada**, incluida **Pedidos**, donde además se comen la primera
  columna en mobile.

> **[UNIFICAR]** Barra de acciones masivas en `DataTable` (aparece al seleccionar, dice cuántos y qué
> se puede hacer), y **quitar `selectable` de las tablas donde no hay nada que hacer con la
> selección**. Una casilla que no lleva a ninguna acción es ruido.

### 7.8 Vistas guardadas — 🟡

**Existen. En un solo módulo.** `clientsApi` guarda vistas del CRM en `localStorage`
(`checat_crm_views`). El mecanismo está resuelto, probado y funcionando.

Las otras 81 pantallas tienen filtros que se pierden al navegar: 27 estados locales de búsqueda y
filtro, y sólo 7 pantallas ponen algo en la URL (`useSearchParams`).

> **[UNIFICAR]** Subir el mecanismo del CRM a un hook compartido (`useSavedViews(scope)`) y **poner los
> filtros en la URL**, que además hace los estados de pantalla compartibles por link — algo que un
> ERP usa todo el día ("miralo vos, te paso el link").

### 7.9 Estados vacíos y manejo de errores

Ya cubiertos en §3.4 y §3.6. Resumen: los textos de los módulos nuevos son excelentes; el contenedor
que los muestra es pobre; y no hay red de contención (`ErrorBoundary`, 404).

---

## 8. ⭐ Qué hace que parezca un CRUD administrativo genérico

Seis cosas, ordenadas por cuánto daño hacen. Ninguna requiere inventar una capacidad.

| # | Síntoma | Evidencia | Propuesta |
|---|---|---|---|
| **1** | **La portada es una demo.** Todos los números escritos a mano, incluida una métrica que el producto documenta como no medible | `Dashboard.jsx`: 0 imports de `api/`, 4 KPI literales | **[CONECTAR]** Reescribirlo sobre `financeApi`, `analyticsApi`, `inventoryApi`, `logisticaApi` y `securityApi`. **Quitar la tasa de conversión.** |
| **2** | **⌘K no busca.** El input no está conectado; un ítem dice "(Próximamente)" | `CommandPalette.jsx`, 79 líneas sin estado | **[CUMPLIR]** Conectarlo a las 79 rutas + los `api/` de lectura. Es la búsqueda global de un saque |
| **3** | **Ninguna tabla se puede ordenar.** 52 tablas, cero ordenamiento por columna | `DataTable.jsx`: 0 apariciones de `sort` | **[CUMPLIR]** Ordenamiento en el componente. Una vez, 52 pantallas |
| **4** | **Te enterás de que no podés al hacer clic.** 11 de 14 módulos no consultan permisos en la UI | 1 de 82 pantallas usa `check()` | **[CONECTAR]** `useAuth().check()` ya devuelve `{allowed, reason}`. Aplicar el patrón de `Usuarios.jsx` |
| **5** | **Seis pantallas con datos inventados** y 18 botones que no hacen nada | 1.320 líneas sin `api/`; 18 de 371 `<Button>` sin acción | **[CONECTAR]** `/productos` a `catalogApi`; **[CUMPLIR]** cablear o quitar los 18 botones; borrar `/proyectos` |
| **6** | **Todo confirma igual.** Un toast de 4 s para guardar un gasto y para reembolsar $24.000 | 373 `showToast`, un solo slot | **[UNIFICAR]** Cola de toasts + confirmación inline donde ya hay `ChangeLog` |

**El patrón común:** el panel construyó capacidades premium (auditoría con actor, portón de acciones
sensibles, motor de reglas, consola de tráfico de integraciones, 46 métricas con contrato) y las dejó
detrás de una capa de presentación heredada de una plantilla. **No le falta producto: le falta
conectar el producto que ya tiene con la cara que muestra.**

---

## 9. Plan propuesto

Ordenado por impacto sobre esfuerzo. Nada de esto agrega capacidades: conecta, unifica o cumple.

### Fase A — Dejar de aparentar ✅ (ejecutada 2026-09-09)

1. ✅ **Dashboard sobre datos reales** y sin la métrica no medible. *(§7.1)*
2. ✅ **`/productos` y `/productos/:id` sobre `catalogApi`.** *(§7.1)*
3. ✅ **Command Palette funcional** = búsqueda global. *(§7.2, §7.3)*
4. ✅ **Ordenamiento por columna en `DataTable`.** *(§7 #3)*
5. ✅ **`ErrorBoundary` + pantalla 404.** *(§3.4)*
6. ✅ **Botones muertos cableados o deshabilitados con su motivo**; `/proyectos` borrado. *(§7.1)*
7. ✅ *(no estaba en el plan, apareció al ejecutarlo)* **`/ventas` sobre CRM + Finanzas**: era la
   misma mentira que `/productos` y dejarla habría sido incoherente.

Ver el detalle en §11.

### Fase B — Coherencia del sistema ✅ (ejecutada 2026-09-10)

7. ✅ **Tokens y espaciado.** *(§4.1, §4.3)* — y apareció algo más grande: había **dos fuentes de
   color**. Ver §12.1.
8. 🟡 **Primitivas.** `EntityHeader` creado y estrenado en una pantalla; `FileUploader` borrado.
   **`LineTable` no se hizo** y `SearchBar` **no era código muerto**: ver §12.5.
9. ✅ **Permisos visibles** en los 11 módulos de negocio. *(§5.3)*
10. ✅ **Vacíos con forma**, cero `DataTable` sin vacío propio. *(§3.4)*
11. ✅ **Breadcrumbs desde el menú** + nombre de la entidad + aviso de segmentos sin nombre. *(§3.2)*

Ver el detalle en §12.

### Fase C — Premium de verdad ✅ (ejecutada 2026-09-10)

12. ✅ **Filtros en la URL** con `useVistaGuardada`, estrenado en Productos y Pedidos. *(§7.8)*
13. ✅ **Cola de toasts + "Deshacer"** en tres operaciones reversibles. *(§3.5)*
14. ✅ **Movimiento con intención**: cero duraciones a mano, dos microinteracciones. *(§7.5)*
15. ✅ **Accesibilidad**: `aria-current` y `aria-live` (el skip link, `prefers-reduced-motion` y
    `--focus-ring` ya se hicieron en A y B). *(§4.6)*
16. ✅ **Tablas como tarjetas en mobile** y KPIs 2×2. *(§4.5)*
17. ✅ **`React.lazy` por ruta**: el bundle de entrada bajó **84 %**. *(§6.5)*

Ver el detalle en §13.

### Fase D — Verificación arquitectónica

18. **Chequeo de que las hojas no importan nada** (el contrato arquitectónico, hoy sólo comentado).
    *(§5.4)*

---

## 9 bis. Deriva de documentación (hallazgo menor, corrección barata)

Dos afirmaciones de `ARCHITECTURE.md` quedaron atrás del código:

1. **§1.4 dice** *"no hay un bus de eventos real"* y describe el acoplamiento como materialización
   perezosa. Eso era cierto antes de Automatizaciones: hoy **hay un bus real**
   (`automatizaciones/lib/bus.js`, hoja sin dependencias) con 43 eventos contratados. La materialización perezosa **sigue existiendo y también
   es correcta**, pero ahora conviven dos mecanismos y el documento sólo nombra uno.
2. La ficha del módulo de Seguridad decía **"definido, sin implementar"** con las tres fases
   terminadas. *(Corregido al publicar esta auditoría.)*

Es el mismo patrón que el mapa de breadcrumbs (§3.2) y los tokens muertos (§4.1): **listas paralelas
que nada obliga a mantener sincronizadas.** El panel resolvió ese problema cinco veces para los datos
(contratos que fallan al cargar) y ninguna para su propia documentación.

---

## 10. Resumen de mediciones

```
ESTRUCTURA        19 módulos · 79 rutas · 62.777 líneas · 204 jsx · 145 js · 82 css
ARQUITECTURA      0 violaciones de frontera · 0 colisiones de clase CSS · 5 contratos que fallan al cargar
                  1 ciclo a nivel módulo, seguro por convención, NO verificado
COMPONENTES       Button 114 · StatusBadge 85 · Toast 76 · PageHeader 70 · Modal 61 · DataTable 52
                  2 componentes muertos (165 líneas) · 2 patrones sin extraer (6 y 12 apariciones)
TOKENS            192 definidos / 112 usados → 87 muertos (45 %)
TIPOGRAFÍA        485 por token / 57 crudos (18 valores distintos) + 166 fontSize en sx
ESPACIADO         319 por token / 646 crudos (67 %) · 21 valores distintos sólo en gap
MOVIMIENTO        1 @keyframes · 3 tokens de duración · 11 duraciones a mano
ESTADOS           0 Skeleton · loading pasado 2/52 · 0 ErrorBoundary · 404 → redirect silencioso
FEEDBACK          373 toasts en 76 archivos · 1 solo slot · sin cola ni deshacer
PERMISOS          RBAC correcto en api/ · 1 de 82 pantallas lo consulta en la UI
EVENTOS           43 con contrato · 25 emisiones · validados al cargar
DATOS             6 pantallas sin api/ (1.320 líneas) · 18 de 371 botones sin acción
PREMIUM           ⌘K decorativo · sin búsqueda global · 0 tablas ordenables
                  vistas guardadas en 1 de 19 módulos · 2 atajos de teclado
A11Y              101 aria-label · 0 aria-current · 0 skip link · 1 prefers-reduced-motion
RESPONSIVE        18 de 82 css con @media · shell OK · tablas ilegibles a 375 px
BUNDLE            1.896 KB (523 KB gzip), un solo chunk
```


---

## 11. Fase A — lo que efectivamente se hizo (2026-09-09)

### 11.1 La portada dejó de inventar

`Dashboard.jsx` pasó de **0 imports de `api/`** a leer cinco módulos:
`analyticsApi.getSummary()` (KPIs con delta, serie e "attention"), `inventoryApi` y `logisticaApi`
(urgencias), `financeApi` (reembolsos por resolver), `securityApi` (firmas pendientes y actividad
reciente).

⭐ **La tasa de conversión ya no está.** En su lugar va el **margen de contribución**, que el panel sí
puede calcular. Verificado en pantalla: *$894.000 · 6 pedidos pagados · $149.000 de ticket · 36,8 % de
margen*, con las urgencias reales (*quiebre de stock (2), pendientes de preparación (1), reembolsos
por resolver (1)*) y el top de productos del catálogo verdadero — se terminó la "Remera Nike".

Tres decisiones que valen más que el cableado:
- **Las urgencias en cero no se muestran.** Un tablero que dice "0 quiebres" con la misma tarjeta roja
  que usa para 3 enseña a ignorar el color.
- **La flecha del delta dice hacia dónde se movió; el color dice si eso es bueno.** `StatCard` acepta
  `delta.good`, alimentado por `higherIsBetter` del diccionario de métricas: una devolución que sube
  es flecha arriba y mala noticia.
- **Un KPI restringido se dice.** Si el rol no puede ver márgenes, la tarjeta explica que *el motor
  directamente no lo calcula*, en vez de mostrar un guion.

### 11.2 El catálogo dejó de contradecirse

`/productos` mostraba 5 productos inventados; ahora muestra los **14 reales** con marca, margen y
stock vivo de Inventario. `/productos/:id` era un formulario que no guardaba nada: ahora es una ficha
de lectura con el historial de precios al lado.

⭐ **Lo que no existe, se dice.** `catalogApi` tiene una sola escritura (`setPrice`), así que "Nuevo
producto" quedó **deshabilitado con el motivo en el tooltip**. Es el mismo criterio con el que el
panel ya trataba `/configuracion` y los permisos declarados sin cablear.

### 11.3 ⌘K busca

Para que buscara hubo que resolver antes la causa: **la navegación estaba declarada dentro de
`Sidebar.jsx`**. Se movió a `app/navigation.jsx`, que ahora alimenta al menú y al buscador — dos
consumidores, una sola lista. (Los breadcrumbs siguen con su mapa propio; se unifican en la Fase B.)

`searchSources.js` busca sobre **72 destinos** y sobre pedidos, clientes y productos por sus `api/`.
Detalles que hacen la diferencia:
- **Se consulta al escribir**, no contra un índice armado de antemano que se desactualiza en cuanto
  alguien crea un pedido.
- **Sin acentos**: buscar `campanas` encuentra *Campañas*. Verificado.
- **Prefijo pesa más que "contiene"**, para que escribir `pe` no ponga *Reposición* arriba de *Pedidos*.
- **La lista es plana para el teclado** aunque se vea agrupada.
- Una fuente que falla devuelve nada y las demás siguen.

Verificado: `10253` → *#10253 · María López · Pendiente · $41.555*.

### 11.4 Todas las tablas ordenan

⭐ **Sin tocar las 52 pantallas.** `DataTable` deduce qué columna es ordenable mirando el **valor
crudo** de la fila, no lo que pinta `renderCell`: así una columna de Estado que dibuja un badge ordena
por su valor y una de acciones no ofrece ordenarse. `sortValue` y `sortable: false` cubren el resto.

Dos decisiones:
- **Lo vacío va siempre al final**, se ordene como se ordene. Un "—" arriba de todo al invertir es
  ruido.
- **Si la paginación es externa, no se ordena.** Ordenar la página que llegó daría un orden mentiroso:
  parece global y es de 10 filas.

Además el vacío ahora tiene forma (icono, explicación y acción) y la carga tiene **esqueleto de filas**
en vez de una barra: una barra dice *esperá*; el esqueleto dice *esperá, y va a venir una tabla de este
tamaño*.

### 11.5 La red de contención

`ErrorBoundary` **dentro** del layout, envolviendo el `<Outlet>`: si envolviera la aplicación entera,
un error se llevaría puestos el menú y la navbar y no quedaría adónde ir. Se remonta al cambiar de ruta.

Verificado rompiendo `Number.prototype.toLocaleString` a propósito: la pantalla mostró *"Esta pantalla
se rompió"* con el mensaje real y el stack plegado, **el shell siguió funcionando**, y al navegar a otra
ruta se recuperó sola.

El 404 dejó de ser `<Navigate to="/" />`. Un redirect silencioso convierte un error del sistema en una
duda de la persona; ahora dice qué dirección no existe y ofrece tres salidas, con el menú a la vista.

Se agregó también el **skip link** ("Saltar al contenido"), que estaba en la Fase C pero cuesta cuatro
líneas y evita recorrer 40 ítems de menú con el teclado en cada pantalla. Y `prefers-reduced-motion`
pasó a apagar **animaciones**, no sólo transiciones: antes cualquier `@keyframes` seguía corriendo.

### 11.6 Ventas, que no estaba en el plan

Al terminar `/productos` quedó a la vista que dejar `/ventas` con `mockCotizaciones` era incoherente.
Ahora lee el embudo real del CRM y el devengado real de Finanzas.

⭐ **No hay barra de cumplimiento de objetivos**, porque no hay objetivos de venta cargados en el
sistema. Dibujarla contra un número imaginario es exactamente lo que la pantalla hacía antes.

Se agregó `clientsApi.listQuotes()`: el CRM ya tenía las cotizaciones pero sólo las exponía **por
cuenta**. Es la misma lectura, mirada desde el otro lado.

### 11.7 Los botones muertos

**De 18 a 0.** Los que tenían una operación detrás se cablearon (exportar CSV en Pedidos, Clientes y
Productos, con el mismo BOM que ya usaban Auditoría y Analytics). Los que no —alta de producto, alta de
cliente, alta manual de pedido, nueva cotización, notas del pedido— quedaron **deshabilitados con un
tooltip que explica por qué y adónde ir en su lugar**.

Se borró `/proyectos` (236 líneas de la plantilla original, ajeno a un ERP de e-commerce) y el botón
"Filtros avanzados" de Pedidos, que no abría nada, se reemplazó por un contador de lo que se está
viendo.

### 11.8 Hallazgos nuevos, encontrados al ejecutar

1. ⭐ **Sobrevivía un `createdBy = "Vos"` con otro nombre.** `clientsApi` escribía
   `actor: { kind: "user", id: "me", name: "CheCAT Admin" }` **en tres lugares** — un actor escrito a
   mano, exactamente lo que la F2 de Seguridad eliminó de todo `src/`. Ahora sale de `currentActor()`.
2. **El menú ofrece `/seguridad/usuarios` dos veces** (como «Usuarios» y dentro de Seguridad). En un
   menú está bien: son dos caminos al mismo lugar. En un buscador es un resultado repetido y dos
   elementos de React con la misma clave. Se deduplica en `NAV_DESTINATIONS`.
3. **El dev server de Vite servía una versión vieja de un archivo** pese a estar cambiado en disco: el
   watcher no detectó escrituras hechas por herramientas externas en Windows. No es un bug del panel,
   pero conviene saberlo: si un cambio "no aparece", tocar el archivo antes de buscar la causa en el código.

### 11.9 Estado después de la Fase A

```
                              antes        después
pantallas sin api/              6            1  (SystemInfo, y es estático a propósito)
botones sin acción           18/371        0/375  (7 deshabilitados con motivo)
tablas ordenables             0/52         52/52
búsqueda global               no            sí — 72 destinos + 3 fuentes de entidades
ErrorBoundary                  0            1 (por ruta, dentro del layout)
404                        redirect        pantalla con tres salidas
skip link                      0            1
prefers-reduced-motion    sólo transiciones  animaciones + transiciones
listas de navegación           3            2  (menú+buscador unificados; breadcrumbs en Fase B)
```

Lint y build limpios (siguen los 4 errores preexistentes de `react-refresh`). El bundle creció de
1.896 KB a 1.932 KB — el `React.lazy` por ruta sigue pendiente en la Fase C.


---

## 12. Fase B — lo que efectivamente se hizo (2026-09-10)

### 12.1 ⭐ El hallazgo que no estaba en la auditoría: dos fuentes de color

Al ir a borrar los 87 tokens muertos apareció algo más caro. `theme/palette.js` tenía dos objetos
—`lightTokens` y `darkTokens`— con los mismos colores que `variables.css`, y arriba un comentario:

> *"Debe mantenerse alineada con src/assets/styles/variables.css"*

Un comentario que le pide a una persona que haga de compilador. **No funcionó: cinco de los ocho
colores de estado habían divergido.** En modo oscuro, un `StatusBadge` (que sale del CSS) y un
`Alert` de MUI (que sale del JS) pintaban verdes, ámbares, rojos y azules distintos. Nadie lo había
notado porque la divergencia sólo se ve poniendo los dos componentes uno al lado del otro.

**Ahora hay una sola fuente: el CSS.** `palette.js` lo lee del documento con `getComputedStyle`, que
es lo mismo que hace el navegador para pintar. Si el color cambia en `variables.css`, MUI se entera
sin que nadie copie nada. Verificado en pantalla: los cinco colores coinciden exactamente.

Dos consecuencias del cambio:

- **El tema se escribe en el `<html>` antes del primer render**, no en un efecto. Un efecto corre
  después de pintar: arrancar en oscuro significaba un cuadro con los colores claros — y, desde que
  MUI lee del documento, además significaba construir la paleta con el tema equivocado.
- **`assertPalette()`**, el mismo mecanismo que los otros cinco contratos del panel: un token que no
  existe se dice en voz alta en vez de taparse con un valor de emergencia.

### 12.2 Tokens: de 87 muertos a 28, y los 28 son escala

| | antes | después |
|---|---|---|
| definidos | 192 | 135 |
| muertos | **87 (45 %)** | **28 (21 %)** |

Lo que se borró y por qué:

- **La paleta "cyberpunk" completa** (`--color-neon-*`, `--color-slate-*`, `--color-primary-*`,
  `--color-error/success/warning/info-*`, `--glow-*`) más los alias viejos (`--bg-app`,
  `--bg-sidebar`, `--bg-navbar`, `--shadow-card`): **47 tokens** en un bloque rotulado
  "COMPATIBILIDAD" que ya no compatibilizaba con nada. Un segundo sistema de color, muerto pero
  visible, y una trampa para el próximo que abriera el archivo.
- **`--input-*` (9)**: el dueño de los inputs es el tema de MUI. Tener tokens CSS que nadie leía era
  prometer un punto de control inexistente.
- **`--z-*` (4)**: el apilamiento lo gobierna MUI con su propia escala. Un token de capa que compite
  con el `z-index` de un `Dialog` es una trampa, no un sistema.

⭐ **Los 28 que quedan son tonos de rampa a propósito.** Una escala con huecos deja de ser una escala,
y el tono que falta es justo el que el próximo estado va a necesitar. Está dicho en el archivo.

### 12.3 Espaciado: de 33 % a 73 % de disciplina

Se llevaron **492 valores** a la escala, y **sin cambiar un píxel**: sólo se reemplazó lo que coincidía
*exactamente* con un paso. Redondear "casi" habría ajustado la apariencia de 646 lugares a ciegas, y
un ajuste visual que nadie miró es peor que un valor crudo.

⭐ **Y en el camino la escala reconoció lo que el diseño ya hacía.** Los medios pasos —6 px y 10 px—
no existían y aparecían **191 veces** escritos a mano, más que varios pasos que sí existían. Una
escala que el diseño esquiva 191 veces no está describiendo el diseño: se agregaron `--space-1-5` y
`--space-2-5`.

Quedan 305 valores crudos, dominados por `2px` (65), `1px` (33) y `3px` (28) — que casi siempre son
ajustes ópticos de un borde, no espaciado de layout. Están contados y a la vista para decidirlos con
una pantalla delante, no a ciegas.

### 12.4 ⭐ Los permisos se ven antes de hacer clic

Era el hallazgo funcional principal de la auditoría: **1 de 82 pantallas** consultaba permisos desde
la UI. Ahora son **19**, y los once módulos de negocio tienen cubiertas sus operaciones sensibles.

La pieza es `<Permitido permiso="…">`, que envuelve un botón y lo apaga con el motivo en el tooltip.
Dos decisiones:

- **Deshabilitar, no esconder.** Un botón que no está no se puede preguntar por qué no está, y quien
  lo necesita termina pidiéndole a otro que "entre con su usuario".
- ⭐ **Cuando sí se puede, el tooltip tampoco queda mudo:** adelanta lo que la operación va a pedir
  (*"Ajustar stock: pide un motivo escrito antes de ejecutarse"*). Enterarse de que hace falta un
  motivo **después** de hacer clic es la mitad del problema que esto vino a resolver.

Verificado en pantalla con dos usuarios:

```
Estudio Contable (Sólo lectura) → «Guardar ajuste» apagado
                                   tooltip: «Ajustar stock» no está incluido en el rol Sólo lectura.
Camila Ferreyra (Administrador) → «Guardar ajuste» activo
                                   tooltip: Ajustar stock: pide un motivo escrito antes de ejecutarse.
```

De yapa: el tooltip queda como `aria-label` del envoltorio, así que también se anuncia a un lector de
pantalla.

### 12.5 Los breadcrumbs dejaron de ser una lista paralela

Los 34 segmentos sin etiqueta («Campanas», «Fidelizacion», «Paginas») se resolvieron sacando la
etiqueta **del menú** — la misma fuente que ya usan el sidebar y la búsqueda global desde la Fase A.
Quedaron **dos** sin nombre, y los dijo el propio panel:

```
[rutas] «trafico» no tiene etiqueta ni en el menú (app/navigation.jsx) ni en
        routeLabels.js, así que la miga lo muestra capitalizando el slug.
```

⭐ **El aviso suena al navegar, no al arrancar.** La idea era un `assertRoutes()` al cargar, como
`assertPermissions()`. Pero las rutas se declaran en JSX (`<Route path="…">`), no como datos: para
listarlas al arranque habría que mantener **otra** lista paralela — justo el problema a resolver. Así
que el chequeo vive en la miga y suena en la pantalla que lo tiene mal, con el nombre exacto de lo que
falta agregar.

Además, **el detalle de una entidad se llama por su nombre**: `Pedidos › #10253`,
`Productos › Zapatillas Running X`. La pantalla ya tiene la entidad cargada y la registra en un
contexto; la miga la lee. Sin pedirle nada a ningún `api/` y sin poner el nombre en la URL.

Y de paso apareció que `/integraciones/trafico` y `/integraciones/webhooks` **no están en el menú**:
son pantallas reales a las que sólo se llega desde dentro del módulo.

### 12.6 Hallazgos y errores propios

1. ⭐ **Borré un componente que sí se usaba.** La auditoría marcó `SearchBar` como código muerto
   ("cero imports") y estaba **mal**: la medición buscó `components/SearchBar`, y `Toolbar` lo importa
   con ruta relativa entre hermanos (`../SearchBar/SearchBar`). Lo borré, el build lo cantó al
   instante y hubo que restaurarlo. **Lección medible: contar imports por prefijo de ruta subestima
   el uso de cualquier componente que sólo consuman sus hermanos.** `FileUploader` sí estaba muerto.
2. ⭐ **Un contexto que avisaba y no avisaba.** El contexto del nombre de entidad hacía `bump` al
   registrar, pero su `useMemo` dependía sólo de funciones estables: **entregaba el mismo objeto**, así
   que ningún consumidor se enteraba. Funcionaba al navegar dentro de la app (la miga re-renderiza
   igual, por el cambio de ruta) y fallaba al entrar directo por la URL — el tipo de bug que sólo
   aparece si se prueban las dos formas de llegar.
3. **El menú indexado por segmento mentía**: el submenú de Marketing tiene un hijo «Resumen» que
   apunta a `/marketing`, así que la miga decía «Inicio › Resumen › Campañas». La ruta acumulada no
   tiene esa ambigüedad, y la raíz de un módulo se llama como el módulo.
4. **`prefers-reduced-motion` y `--focus-ring`**: el anillo de foco estaba declarado y **no se usaba
   en ningún lado** — siete archivos repetían `outline: 2px solid var(--accent)` a mano. Ahora hay un
   `:focus-visible` global.

### 12.7 Lo que quedó sin hacer, y por qué

- **`LineTable` no se creó.** Las seis tablas de líneas hechas a mano (§3.1) siguen ahí. Extraer la
  primitiva es fácil; migrar seis pantallas de detalle y verificarlas no, y la prioridad de esta fase
  eran los permisos.
- **`EntityHeader` se estrenó en una sola pantalla** (`ProductoDetalle`). Las otras ocho siguen con
  la clase suelta `entity-header`, que sigue existiendo y funcionando. Se creó con un consumidor real
  a propósito: una primitiva sin usar es exactamente el código muerto que esta fase vino a borrar.
- **305 valores de espaciado siguen crudos**, casi todos ajustes ópticos de 1 a 3 px.

### 12.8 Estado después de la Fase B

```
                                antes(auditoría)   después A      después B
fuentes de color                      2                2              1
tokens muertos                     87 / 192         87 / 192       28 / 135
disciplina de espaciado              33 %             33 %           73 %
pantallas con permisos en la UI      1 / 82          1 / 82         19 / 82
DataTable sin vacío propio             6                1              0
segmentos de ruta sin nombre          34               34              0
listas de navegación paralelas         3                2              1
componentes compartidos muertos        2                2              0
:focus-visible global                 no               no             sí
```

Lint y build limpios: 5 errores, todos `react-refresh/only-export-components` en contextos —los 4
preexistentes más `EntityLabelContext`, que sigue el mismo patrón que los otros cuatro.


---

## 13. Fase C — lo que efectivamente se hizo (2026-09-10)

### 13.1 ⭐ El bundle de entrada bajó 84 %

```
antes    1 archivo de 1.936 KB   ← abrir el login descargaba Analytics,
                                   el Store Builder y el motor de reglas enteros
después  entrada de 306 KB (94 KB gzip) + 258 chunks por demanda
```

86 pantallas diferidas con `React.lazy`, agrupadas por módulo.

⭐ **Lo que NO se difiere está declarado**: el shell (layout, auth) y las dos pantallas que alguien ve
seguro en su primer segundo —login y dashboard—. Diferirlas cambiaría un bundle grande por un salto
en blanco justo al abrir, que es peor.

Y el `fallback` del `Suspense` **no es un spinner a pantalla completa**: el menú y la navbar ya están
montados y no se van a ningún lado. Lo único que falta es el contenido, así que se reserva su altura.
Un spinner centrado haría parpadear un panel que en realidad sigue ahí.

### 13.2 Los avisos dejaron de pisarse, y algunos se pueden deshacer

El `ToastContext` tenía **un solo slot**: el segundo aviso borraba al primero, y hay flujos que
producen dos seguidos. Ahora es una cola de hasta tres, apilados, cada uno con su propio reloj — y
**los de error duran el doble**, porque hay que leerlos.

⭐ **Y el aviso puede llevar una acción.** Tres operaciones reversibles la usan: pausar/activar una
promoción, pausar/activar un cupón y quitar el descuento de un pedido.

> **Por qué "Deshacer" y no "¿Estás seguro?"**
> Un diálogo de confirmación interrumpe **siempre**, incluidas las 99 veces que la persona sí quería
> hacerlo. Deshacer no interrumpe nunca y arregla la vez que no. Y donde el panel ya tiene un gate de
> verdad —motivo obligatorio, firma de otra persona— no hace falta ninguno de los dos: ese control ya
> ocurrió.

Verificado en pantalla: pausar una promoción muestra *«Promoción pausada · Deshacer»*, el clic la
devuelve a Activa, y tres avisos seguidos **conviven** en vez de pisarse.

### 13.3 Los filtros viven en la URL

`useVistaGuardada(scope, inicial)` sube a hook compartido lo que el CRM ya hacía solo, y le agrega la
mitad que faltaba: **el estado de la pantalla se puede pasar por link**. En un ERP, *"miralo vos, te
paso el link"* ocurre todo el día, y hasta ahora ese link llevaba a la pantalla sin filtrar.

Verificado: entrar directo a `/productos?search=zapa&estado=Activo` deja el buscador cargado y la
tabla en 3 filas; escribir en el buscador actualiza la URL.

Dos detalles que evitan efectos molestos: **lo vacío no va a la URL** (un `?search=&estado=` no dice
nada más que `/productos`) y los cambios usan `replace`, para que veinte teclas en el buscador no
sean veinte pasos atrás en el historial.

### 13.4 ⭐ La tabla se vuelve una lista de tarjetas en mobile

A 375 px, la tabla de Pedidos mostraba **la casilla, el número y la fecha**: estado, cliente y total
quedaban fuera de pantalla. Scrollear una tabla de izquierda a derecha para leer una fila es lo que
hace que un panel se sienta "el escritorio metido en el teléfono".

Ahora cada fila es una tarjeta con todos sus datos y cada dato dice de qué columna es. **Sin tocar
ninguna de las 52 pantallas**: el nombre de la columna viaja con la celda en un `data-label`, y el
resto es una media query. Es la misma tabla, mirada distinto.

De paso se quitaron las casillas de Pedidos: la selección no disparaba ninguna acción masiva
(§7.7) y en mobile se llevaba la primera línea de cada tarjeta.

Bug encontrado y arreglado: MUI le pone `flex-direction: row-reverse` a las celdas con
`align="right"`, lo que en la tarjeta invertía la etiqueta y su valor («$86.990 … TOTAL»).

### 13.5 Movimiento: dos, no quince

**Cero duraciones escritas a mano** (eran 11, con valores fuera de escala como `0.15s` y `0.18s`).

Y **dos** microinteracciones, elegidas por dónde el producto tiene algo que decir:

1. **El estado se mueve, no salta.** Cuando un pedido pasa de Pendiente a Pagado, el `StatusBadge`
   cambia de color con una transición corta. Era el único momento en que esa tabla tenía algo que
   comunicar y lo hacía de golpe.
2. **El asiento nuevo entra.** En el `ChangeLog`, sólo el primero de la lista y sólo cuando React lo
   monta — o sea, cuando acaba de ocurrir. Al abrir la pantalla anima uno solo.

Quince animaciones no son quince veces mejor que dos: son ruido, y son exactamente lo que hace que un
diseño se sienta generado.

### 13.6 Accesibilidad

- **`aria-current="page"`** en el ítem activo del menú y en el del submenú: hasta ahora el estado
  activo era **sólo color**, y un lector de pantalla no sabía dónde estaba parado.
- **`aria-live="polite"`** en el contenedor de avisos, una vez. Si estuviera en cada aviso, el lector
  anunciaría la región entera cada vez que la lista cambia.
- El skip link, `prefers-reduced-motion` global y el `--focus-ring` aplicado ya se habían hecho en
  las Fases A y B.

### 13.7 Estado después de la Fase C

```
                                auditoría   post-A    post-B    post-C
bundle de entrada                1.936 KB  1.932 KB  1.936 KB   306 KB
chunks                                1         1         1       259
toasts simultáneos                    1         1         1         3
operaciones con "Deshacer"            0         0         0         3
pantallas con filtros en la URL       7         7         7         9
duraciones de transición a mano      11        11        11         0
@keyframes                            1         2         3         5
aria-current / aria-live            0 / 0     0 / 0     0 / 0     2 / 2
tablas legibles a 375 px             no        no        no        sí
```

Lint y build limpios: los mismos 5 errores de `react-refresh` en contextos.

### 13.8 Lo que sigue pendiente

De la Fase B: **`LineTable`** (las seis tablas de líneas a mano) y **`EntityHeader` en 8 de 9**
pantallas de detalle. De la C: `useVistaGuardada` se estrenó en dos pantallas de las ~30 que tienen
filtros — el hook existe y está probado, extenderlo es mecánico. Y queda entera la **Fase D**: el
chequeo de que las hojas sin dependencias no importan nada, que hoy es una convención documentada en
comentarios y nada la verifica.

---

## 14. Fase D y cierre de los pendientes de B y C (2026-09-10)

La Fase D era la única del plan que no tocaba una pantalla: hacer que el contrato de arquitectura
—hasta ahora un comentario en la cabecera de siete archivos— **falle solo** cuando alguien lo rompe.
Junto con ella se cerró lo que las Fases B y C habían dejado a medio camino.

### 14.1 El contrato deja de ser un comentario

`scripts/verificar-arquitectura.mjs` verifica tres reglas sobre el grafo real de imports:

| # | Regla | Qué mide hoy |
|---|---|---|
| 1 | Las hojas no importan nada | 7 archivos marcados `@sin-dependencias`, 0 imports entre todos |
| 2 | La UI no importa `data/` | 208 archivos `.jsx`, ninguno toca `data/` |
| 3 | Sin ciclos de import | 356 archivos, 1.447 imports internos, 0 ciclos |

Las siete hojas llevan ahora la marca explícita en su cabecera:

```
@sin-dependencias  Verificado por scripts/verificar-arquitectura.mjs:
                   este archivo NO puede tener ni un `import`.
```

`bus.js` · `ports.js` · `actors.js` · `approvals.js` · `audit.js` · `diff.js` · `permissions.js`.

El chequeo está encadenado al build:

```json
"check:arch": "node scripts/verificar-arquitectura.mjs",
"build": "npm run check:arch && vite build"
```

**Se probó que falla, no sólo que pasa.** Agregarle un solo `import` a `seguridad/lib/audit.js`
—el más tentador, porque «total, audit.js sólo necesita el catálogo»— produjo 4 violaciones y
**3 caminos de ciclo concretos**, con salida distinta de cero. Ése es el punto: la hoja no está
suelta por prolijidad, está suelta porque **es la única forma de que el módulo de seguridad pueda
auditar a los módulos que lo usan sin cerrar el círculo**. Un comentario no podía demostrar eso;
un script sí, y cada vez.

### 14.2 Pendiente de la Fase B: `.line-table` y `EntityHeader` en las nueve

- **`.line-table`** vive una sola vez en `globals.css`. Las cinco pantallas que tenían su propia
  tabla de líneas (OC, reposición, conteo físico, transferencia, stock) pasaron de **40 reglas CSS
  repartidas en cinco archivos a 12 reglas en uno**. La tabla de líneas siempre fue la misma tabla:
  descripción a la izquierda, números a la derecha, totales abajo.
- **`EntityHeader` está en las 9 pantallas de detalle.** Queda **cero** `className="entity-header"`
  escrito a mano: la única aparición de esa clase en todo `src/` está dentro del propio componente.
- Para lograrlo el componente ganó una prop `below`, porque cuatro de esas pantallas muestran un
  **pipeline de estados** bajo el título (`Borrador | Enviada | Recibida | Cerrada`). Sin `below`, la
  migración habría sido «casi todas menos las que importan».

**Lo que se dejó afuera a propósito:** `an-table` (Analytics, ~20 reglas) **no** se plegó a
`.line-table`. No es una tabla de líneas de un documento: es una tabla de resultados con orden,
comparación y deltas. Unificarlas por parecido visual habría metido en la primitiva compartida
requisitos que sólo tiene una pantalla.

### 14.3 Pendiente de la Fase C: los filtros en la URL

`useVistaGuardada` se había estrenado en dos pantallas. Ahora está en **ocho**:

| Pantalla | `scope` | Filtros en la URL |
|---|---|---|
| Pedidos | `pedidos` | (Fase C) |
| Productos | `productos` | (Fase C) |
| Ventas | `ventas` | `tab` · `search` |
| Órdenes de compra | `ordenes-compra` | `tab` · `search` |
| Inventario / Stock | `stock` | `search` · `tab` |
| Usuarios | `usuarios` | `search` · `rol` · `estado` |
| Tráfico (Integraciones) | `trafico` | `capacidad` · `resultado` · `error` · `search` |
| Páginas (Tienda) | `paginas` | `tab` · `search` |

La conversión se hizo con **reemplazos exactos archivo por archivo**, no con una regex genérica:
cada pantalla nombra sus estados distinto (`tab`, `statusTab`, `status`, `roleKey`…) y adivinar es
exactamente cómo se rompen once pantallas de una sola pasada. Los nombres de los parámetros de URL
se eligieron **en castellano y del dominio** (`?rol=admin&estado=activo`), no con el nombre interno
de la variable: la URL la lee una persona cuando la pega en un chat.

Verificado en el navegador, ida y vuelta, en las seis pantallas nuevas:

- `/seguridad/usuarios?rol=admin` → dos filas, las dos administradoras.
- Escribir «sofia» en el buscador → la URL pasa sola a `?rol=admin&search=sofia`.
- `/ventas?tab=1&search=lucia`, `/abastecimiento/ordenes-compra?tab=2`, `/inventario?search=CAT&tab=1`,
  `/tienda/paginas?tab=1&search=a`, `/integraciones/trafico?resultado=error` → todas abren con la
  pestaña y el filtro ya aplicados.

### 14.4 Estado al cierre

```
                                    auditoría   post-C    post-D
reglas de arquitectura verificadas         0         0         3
hojas marcadas y verificadas               0         0         7
ciclos de import                           ?         ?         0
pantallas con useVistaGuardada             0         2         8
entity-header escritos a mano              9         8         0
reglas CSS de tabla de líneas             40        40        12
```

Build y lint limpios: siguen los mismos **5 errores de `react-refresh`** en contextos, que son la
consecuencia conocida de exportar el hook junto al provider.

### 14.5 Lo que queda abierto

- `useVistaGuardada` cubre las ocho pantallas con más filtros; quedan pantallas menores con un solo
  filtro donde el hook sería más ceremonia que beneficio. Extenderlo es mecánico y está probado.
- `an-table` sigue con sus propias reglas, por la razón del §14.2.
- Las vistas guardadas (`localStorage`) están implementadas en el hook pero **todavía no tienen UI
  propia** en las seis pantallas nuevas: se guardan y se aplican por URL. Ponerles el selector es
  trabajo de pantalla, no de hook.
