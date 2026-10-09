# Notas técnicas del sistema (archivo de consulta interna)

> **Para quién es:** para el equipo que desarrolla el sistema (CheCAT). **No es para clientes** y no se muestra en la aplicación.
>
> **Qué es:** el contenido completo que tenía la sección "Info de sistema" hasta el 2026-10-09, cuando esa sección se reescribió como guía de uso para el cliente. Se conserva acá porque explica **por qué** las cosas son como son (decisiones, trampas, lecciones) y cómo se resolvió cada caso.
>
> **Cómo leerlo:** el código es la fuente de verdad. Este texto se escribió entre julio y septiembre de 2026 y **algunas partes ya no describen el sistema actual**. Lo desactualizado más importante:
>
> - Habla de `crm-api` (NestJS + PostgreSQL), de `crm-dashboard`, de migraciones numeradas `00xx`, de `crm-api/src/…` y de `sitio-web/` (Next.js): el backend actual es Laravel (`api/`) con MySQL, y el sitio web y el módulo Web **no existen en este repositorio** (el módulo está apagado: `webHabilitado = false`, y las rutas `/web/*` y `/tienda/*` no existen en la API).
> - Dice en varios lugares que "la API no valida quién llama / no hay sesiones con token": hoy sí hay sesiones con token (Sanctum) y la API valida permisos, plan y licencia.
> - Menciona datos de un cliente concreto (nombres de sucursales, proveedores y personas): eran del primer cliente y no aplican al producto.
> - La lectura de renglones por modelo de visión (sección "Pendientes") y los candados descriptos con `crm-api` están como se pensaron entonces; el candado actual está en `Cache::lock` y `DB::transaction` dentro de los servicios de Laravel.
> - Después de este texto se agregaron, y **no figuran acá**: varios clientes en una instalación (`api/deploy/CLIENTES.md`), copias externas a Google Drive (`api/deploy/COPIAS_EXTERNAS.md`), licencias (`api/deploy/LICENCIAS.md`), precios del servidor / "el cartel manda", cola offline del POS, un solo CAE por venta, baja de proveedores.
>
> Se generó automáticamente desde `panel/src/modules/manual/content/manual.js` (versión del commit `3e33d65`). Los números `<!--N-->` son el índice de cada bloque dentro de su tema.

---

# SECCIÓN arquitectura — Arquitectura
_Cómo está partido el sistema y por qué._



## TEMA piezas — Las tres piezas  (2026-09-22)


<!--0--> MySQL → api (Laravel) → panel (React)

<!--1-->
| Pieza | Qué hace | Dónde vive |
|---|---|---|
| MySQL | La verdad. Todo lo demás es una vista de esto. | local hoy, hosting compartido después |
| api | Reglas de negocio y cálculo. Nada se calcula dos veces. | carpeta api |
| panel | La pantalla. Replica algunos cálculos para responder en vivo. | carpeta panel |

<!--2--> > **WARN:** Hay cálculos DUPLICADOS a propósito entre API y pantalla (precios y costos). La pantalla necesita recalcular con cada tecla y pedirle el número a la API en cada pulsación sería inusable. El precio de esa decisión: **si se toca la fórmula, se toca en los dos lados o el formulario miente**.

<!--3--> > **INFO:** El sistema arrancó como `crm-api` (NestJS + Drizzle + PostgreSQL). Esa versión quedó como referencia de contrato — la lógica de negocio se auditó y se portó entera a Laravel/MySQL — y ya no se usa en producción. `panel` (antes `crm-dashboard`) no cambió: la pantalla es la misma, solo cambió quién responde sus pedidos.


## TEMA identidad — Identidad visual  (2026-09-22)


<!--0--> Un solo acento con rol fijo: **índigo**. Navegación activa, botones primarios, foco, selección, badges y pestañas — siempre con letra blanca encima sobre superficie sólida. No hay un segundo color de marca: `accent-2` es una variación tonal del mismo índigo (un escalón más claro), no un color nuevo — se usa donde algo necesita distinguirse sin salirse de la familia, como el indicador de las pestañas o el detalle del logo.

<!--1-->
| Si es… | Va en… |
|---|---|
| Una superficie o una acción principal | Índigo con blanco |
| Un detalle que tiene que distinguirse sin salir de la familia | accent-2 (variación tonal del índigo) |
| Todo lo demás | Claro y neutro, sin tinte de marca |

<!--2--> > **WARN:** Los colores viven en **un solo lugar**: `src/styles/tokens.css` (variables `--crm-*`) con su espejo MUI en `core/theme/palette.js`. Nunca un hex crudo en un módulo — cambiar la marca entera es tocar esos dos archivos, y así tiene que seguir. Hay tema claro (por defecto) y oscuro con la misma identidad.


## TEMA paginacion — Tablas y paginación  (2026-07-30)


<!--0--> Todos los listados de datos (productos, proveedores, clientes, movimientos, comprobantes, existencias, consultas Alt+F5/F3, etc.) se paginan **de a 20 filas por defecto**. Al pie de cada tabla está el paginador: navegación por páginas y el selector "Filas por página" (10 / 20 / 50 / 100).

<!--1-->
- El tamaño elegido se **recuerda por tabla** (queda en el navegador): si en Productos elegís 50, Productos vuelve a abrir en 50 y las demás tablas siguen en lo suyo.
- Cambiar un filtro o la búsqueda vuelve a la página 1; si el filtro achica el listado, la página se ajusta sola.
- El paginador no aparece cuando el listado entra en una pantalla (10 filas o menos): no hay nada que pasar de página.
- La paginación es **en memoria** sobre lo ya cargado: pinta solo la página visible, que es lo que mantiene liviana la pantalla con miles de filas.

<!--2--> > **OK:** Para el que programa: `usePaginado(items, clave, firmaDeFiltros)` + prop `pag` de `Table`, en `productos/components/ui.jsx`. Una sola implementación para todo el sistema.


## TEMA modulos — Módulos  (2026-08-06 18:53)


<!--0--> Cada módulo se declara a sí mismo en un manifiesto y el menú y las rutas se generan a partir de esa lista. Agregar un módulo es agregarlo al registro; no hay que tocar el núcleo.

<!--1-->
| Módulo | Contiene |
|---|---|
| Dashboard | La pantalla que abre el sistema: el **resumen del inventario** — valor disponible, productos, stock bajo y comprometido, el stock por sucursal y los últimos movimientos. Cada tarjeta tiene su "Ver todo →" que cae en la sección exacta de Compras o Almacén. Era una pestaña adentro de Compras; se mudó acá el 18/8/2026 |
| Compras | Productos, proveedores, comprobantes, catálogos, precios |
| Almacén | Existencias, transferencias, incidencias, fraccionamiento |
| Ventas | Punto de venta, clientes, cobranzas, caja, formato de venta, ofertas, cambios de precio |
| Consultas | Las dos consultas globales de teclado (Alt+F5 y Alt+F3). No aparece en el menú: se monta en el layout |
| Info de sistema | Esta documentación |
| Gerencia | Usuarios y roles, y **Rentabilidad** (19/8/2026): el margen real del período —con el IVA absorbido por la mercadería sin factura a la vista—, la posición fiscal y el control por proveedor. Las demás secciones siguen en agenda |

<!--2--> Compras y Almacén comparten el mismo motor de inventario (un store único). Ventas tiene el suyo propio, porque nadie fuera de Ventas necesita ese estado y al salir del módulo se libera solo.


# SECCIÓN formato-compra — Formato de Compra
_Cómo ENTRA el producto y de dónde sale su costo._



## TEMA que-es — Qué es un formato de compra  (2026-07-30)


<!--0--> Una forma de comprar el producto: **proveedor + cantidad por bulto + costo**. Un producto puede tener varios, incluso del mismo proveedor (caja x12 y caja x24), y **uno solo fija el precio**.

<!--1--> 📍 Compras › Productos › (abrir un producto) › Formato de Compra

<!--2--> > **INFO:** La cantidad por bulto es lo que hace **comparables** dos proveedores que venden en presentaciones distintas: el costo unitario los pone en la misma escala.

<!--3--> > **OK:** La relación con el primer proveedor puede nacer **en el alta del producto** (campo "Con quién llega", con su costo de lista opcional): así el producto ya aparece en el buscador de la factura de ese proveedor desde el primer día. Los siguientes proveedores se suman acá, en el Formato de Compra.


## TEMA importar-catalogo — Importar el catálogo de un proveedor  (2026-08-07 10:30)


<!--0--> Para dar de alta cientos de productos de una vez: se cargan los tres listados que exporta el sistema de gestión anterior (**productos**, **formatos de compra** y **formatos de venta**) tal como salen, y el sistema los traduce a su modelo. Se reconocen **por sus columnas**, así que el orden en que se eligen no importa.

<!--1--> 📍 Compras › Productos › Importar catálogo

<!--2--> Archivos → Proveedor y listas → VISTA PREVIA → Se escribe todo junto

<!--3-->
- **Los paquetes fraccionados NO entran como productos.** El archivo trae "x100g / x250g / x1kg" como si fueran productos aparte, pero son **presentaciones** de su producto madre: se atan solas por el nombre, con su código de barras y su propio formato de venta. Importarlos como productos habría dejado decenas de fantasmas que nadie le compra a nadie.
- **El costo sale del formato de compra, no del maestro**: lista − descuentos en cascada + flete ÷ bulto. El costo del maestro del sistema viejo viene **con IVA adentro** y acá los costos se guardan netos — tomarlo de ahí metía un 21% de error en toda la góndola.
- **El markup por paquete entra TAL CUAL.** En el sistema viejo cada paquete tiene su markup (el kilo al 48%, el de 250 g al 66%), y desde la 0053 acá también: cada paquete tiene formato de venta propio. Hasta el 10/8/2026 eso se traducía a un  sobre la madre — una cuenta que ya no hace falta.
- **El rubro se deduce del nombre** (el archivo trae los rubros como números sin nombre), y **"GRANEL" o "VARIOS" no se toman como marca**: describen la modalidad, no al fabricante.
- **No se puede importar sin ver la vista previa.** Ahí está lo que importa: cuántos productos y presentaciones entran, qué rubros se asignaron, y sobre todo **qué precios se mueven**.

<!--4--> > **WARN:** La vista previa separa los precios que cambian en dos, y la diferencia es importante: hasta **15%** es el costo que se actualizó y el precio que venía atrasado (normal, es el trabajo del sistema). **Más de 15% casi siempre significa que en el archivo el costo del producto y el de su paquete no coinciden** — uno de los dos está mal. Esos quedan con el costo real pero conviene mirarlos con la factura del proveedor a mano antes de vender.

<!--5--> > **OK:** Se escribe **todo junto o nada**: si algo falla, no queda medio catálogo cargado. Y es **repetible**: lo que ya existe con el mismo código interno no se toca y se informa al final, así que reimportar el mismo archivo no duplica nada. Actualizar costos de productos que ya están es trabajo de la factura, no de la importación.

<!--6--> > **INFO:** El **stock arranca en cero**: entra con la primera factura de compra. Los archivos no traen existencias, y inventarlas sería peor que no tenerlas.


## TEMA facturas-por-procesar — Facturas por procesar (subir el papel y cargarlo después)  (2026-08-07 19:40)


<!--0--> Separa dos cosas que hasta ahora eran una sola y no tienen por qué serlo: **recibir el papel** y **cargar la factura**. La mercadería llega el martes a la mañana con el camión; el admin carga las facturas el viernes. Entre esos dos momentos el papel se moja, se pierde o se queda en un cajón. Ahora la cajera **saca la foto cuando llega el camión** y ahí termina su trabajo: la factura queda en la bandeja, con el papel guardado, esperando que alguien la cargue.

<!--1--> Ese desacople es la mayor parte del ahorro de tiempo, y no depende de ninguna magia. Lo que sí ahorra tipeo es el **QR de la factura**: toda factura electrónica argentina lo trae (RG 4892) y **es un JSON**, no una imagen para interpretar. De ahí salen CUIT del emisor, tipo, letra, punto de venta, número, fecha, **total** y CAE. Leer un QR es determinístico: o lo lee o no lo lee, no existe "lo leyó mal".

<!--2-->
- **El proveedor se reconoce por el CUIT del papel**, no por parecido de nombre. Para que funcione, cada proveedor tiene que tener su CUIT cargado en su ficha — sin eso la factura llega a la bandeja sin proveedor y hay que elegirlo a mano (una sola vez: la próxima ya se reconoce).
- **Lo que el papel NO dice, se pregunta.** Sobre todo **en qué sucursal entró la mercadería**: eso lo sabe quien la recibió y no está escrito en ninguna parte de la factura. Se propone la sucursal del que subió la foto, pero es editable.
- **El detalle de renglones se carga a mano.** Argentina no tiene intercambio de factura estructurada (no hay nada como el CFDI mexicano): los ítems solo existen en el PDF del proveedor. Esa parte es la etapa que sigue.
- **Del PDF no se lee el QR**, solo de las fotos: su encabezado se carga a mano. Igual se guarda el archivo.
- **Una factura de varias hojas es UNA sola factura** con varias páginas: se sube la primera y las demás se agregan desde su detalle con "+ Agregar página".

<!--3--> La bandeja pinta cada factura con un **semáforo**. **Rojo frena la carga** y son siempre decisiones que el sistema no puede tomar solo: falta el proveedor, falta el número, falta la sucursal, o **la factura ya está cargada**. **Amarillo avisa** sin frenar (no se pudo leer el QR, la factura no está en pesos, falta el total del papel). Verde no se muestra: la regla es que los rojos sean pocos y verdaderos — si la bandeja pregunta quince cosas por factura, el admin tipea más rápido a mano.

<!--4--> > **OK:** El dato más útil que trae el QR es **el total**. Al cargar los renglones, el pie compara contra ese número: si la suma de los ítems, menos la bonificación, más el IVA, más las percepciones da el total del papel, la carga está **demostrada** — no "parece bien", cierra. Y cuando falta algo, dice cuánto: probado con una factura real de Bavosi, con la bonificación cargada y sin la percepción el pie avisaba "faltan $35.128,56", que es exactamente la percepción que traía el papel.

<!--5--> > **WARN:** Ese control mira **la plata, no las cantidades**. `1 × $12.000` y `12 × $1.000` cierran idéntico, y el segundo mete el stock **doce veces mal en silencio**. Es la falla más peligrosa de todas justamente porque la factura cuadra igual, así que **el número de bultos hay que mirarlo aparte** — la tabla de impacto en precios ayuda: si el costo unitario salta por el factor del bulto, no es un aumento, es una caja cargada como unidad.

<!--6-->
- **"Procesar"** guarda las correcciones del encabezado y abre el alta del comprobante con todo puesto (proveedor bloqueado, tipo, número, fecha, CAE) y con un link **"Ver el papel"** visible en los tres pasos: es lo que se mira mientras se tipean los renglones.
- **Al confirmar, la bandeja se cierra sola** y el papel queda pegado al comprobante: se ve desde su detalle. Es lo que se busca cuando seis meses después el total no cuadra.
- **Si la factura ya estaba cargada a mano**, la salida útil no es descartar el papel sino **engancharlo al comprobante que ya existe** — la bandeja ofrece el botón con el número del comprobante.
- **Descartar no borra el papel**: la factura queda en la pestaña "Descartadas" y se puede recuperar.
- **Se borra la página, no la factura**: si una de las hojas salió mal se quita esa; si no sirve ninguna, se descarta la factura entera.

<!--7--> > **OK:** De paso quedaron tapados dos agujeros que ya existían. **(1)** `comprobantes` no tenía el índice único de número que Ventas y Cobranzas sí tenían: con carga manual no molestaba porque el que cargaba se acordaba, pero con papeles entrando desde el celular el duplicado era cuestión de tiempo — y entraba dos veces al stock y a la deuda. **(2)** El punto de venta ahora se **normaliza a cuatro dígitos** en las dos puertas: el papel imprime "00115", el QR trae "115" y antes eran dos puntos de venta distintos, así que el control de duplicados no los cruzaba.

<!--8--> 📍 Compras › Por procesar · el permiso es `compras.lecturas` (subir el papel lo puede hacer cualquiera con la sección; confirmar la factura sigue siendo del admin)


## TEMA carga-factura — Cargar la factura: asistente en tres pasos  (2026-08-07 19:40)


<!--0--> El alta del comprobante es un **asistente de tres pasos**: **1) Datos del comprobante** (tipo, proveedor, letra/punto de venta/número, fechas, sucursal de recepción), **2) Ítems** (los renglones y el impacto en precios) y **3) Pago y confirmación** (cómo se paga, vencimiento, observaciones). Se avanza con "Continuar" y se puede volver atrás sin perder nada, con los botones o clickeando un paso ya recorrido en el indicador de arriba.

<!--1--> El **proveedor se elige en el paso 1 y queda fijo al avanzar**: para cuando se cargan productos, ya es un hecho de la factura. Si el alta se abre desde la ficha de un proveedor (pestaña Operaciones, botones "+ Factura", "+ Remito"…), el campo viene **bloqueado con ese proveedor** — se abrió desde ahí porque el comprobante es de él. Y si en el paso 1 se cambia el proveedor con renglones ya cargados, **los renglones se vacían**: eran productos y costos del padrón anterior, dejarlos sería colar mercadería de un proveedor en la factura de otro.

<!--2--> En el paso de ítems, el buscador ofrece **solo los productos relacionados con el proveedor de la factura** — los que tienen formato de compra con él, sin importar quién esté activo. Que el activo sea otro no significa que este no entregue más: cada resultado muestra su **proveedor activo actual**, y el cambio de activo se decide abajo, en "Impacto en precios", viendo el precio de góndola que va a quedar.

<!--3-->
- **El renglón es un buscador**: nombre, código interno o código de barras (el escáner funciona). El costo que precarga es el de ESTE proveedor — no el del activo — así la variación que muestra la tabla de impacto compara la factura contra su propia lista.
- **Se carga EN BULTOS, como habla la factura**: llegaron 2 bolsas de 25 kg → Cantidad 2, y el sistema ingresa los 50 kg solo. El renglón muestra la cuenta en vivo: "50 kg · $2.000/kg".
- **Si un producto ENTERO vino suelto** (unidades que no llegan a completar el bulto — 25/8), el selector debajo de la cantidad cambia el renglón a **"u. sueltas"**: la cantidad y el costo pasan a ser **por unidad**, y el costo se convierte solo al cambiar de modo ($/bulto ↔ $/u, mismo $/u real). La columna "Por bulto" muestra un guion: una entrega suelta **no toca el tamaño del bulto** que el proveedor tiene declarado en su formato de compra. **El granel no tiene este selector**: ahí el bulto es la bolsa y su tamaño ya se corrige por entrega en el propio renglón. Y debajo de la cantidad, en negrita, está **la cuenta ya hecha: "= 36 u."** — lo que entra al stock, en los dos modos la misma regla; el que carga no multiplica de memoria ni adivina si "1 · bultos · 12" son 1, 12 o 13.
- **El tamaño del bulto es INFO, no un casillero** (25/8): sale del **Formato de compra** del producto y en el renglón solo se muestra ("25 kg/bulto", "8 u./bulto"). Si el proveedor cambió la bolsa o la caja, se corrige en el Formato de compra — no en la factura. Antes era editable por renglón y invitaba a "corregir" el bulto al pasar: ese número, junto con el costo, define el $/u del catálogo, y tipearlo distinto en una factura dejaba la góndola colgada de un dato de paso.
- **Buscar en lote**: como el Shift+Ins de la caja pero para compras — texto, marca y categoría sobre los productos del proveedor, se tildan los que vinieron y entran todos juntos con su costo precargado. Lo ya cargado aparece deshabilitado ("ya en la factura").
- **El renglón nace vacío** y un ítem sin producto no viaja: se acabó el primer producto del catálogo preseleccionado por accidente.
- **Si el proveedor tiene pagos a cuenta** (los que la cajera hizo desde la sucursal), el paso 1 avisa cuánto hay esperando y el paso 3 ofrece **solo los de la sucursal de recepción** de esta factura. Tomar un pago es una decisión: se **tilda** el que esta factura explica (el importe se sugiere y se puede corregir) — si la factura se pagó por otro lado (transferencia, etc.), no se tilda nada y se usa "Se paga ahora". Tomar no mueve plata: el egreso ya quedó en el arqueo de la caja que pagó.

<!--4--> > **OK:** La tabla de impacto compara **por kg (o por unidad), nunca por bulto**: $50.000 la bolsa de 25 contra $42.000 la de 20 parece una baja, pero es $2.000/kg contra $2.100/kg — una suba del 5%. Y al tildar "actualizar costo", el precio del bulto y su tamaño viajan **juntos** al Formato de Compra: son un solo hecho ("la bolsa de 20 kg sale $40.000"), y por separado el $/kg que fija la góndola quedaría mintiendo.

<!--5--> > **WARN:** La compra ingresa SIEMPRE el producto base: el granel en kg, el entero en unidades. Las presentaciones (lenteja 500g, 1kg) son **producción propia** — nacen del fraccionamiento, que descuenta granel y crea presentación. Si algún día un proveedor vende un empaquetado que NO se fracciona acá, eso es un producto ENTERO nuevo, no una presentación del granel: esa es la línea que separa compra de producción.

<!--6--> **El pie de la factura** (abajo del paso 2) replica el papel en su orden, para poder cuadrar de reojo: **subtotal de los ítems → bonificación → neto gravado → IVA → percepciones → TOTAL**. Si el total del sistema coincide con el de la factura, la carga está bien; si no, algo falta. El pie muestra **solo lo que esta factura trajo**: la bonificación y las percepciones se agregan con los botones **"+ Bonificación"** y **"+ Percepciones"**, porque la mayoría de las facturas no traen ninguna de las dos y no tienen por qué ocupar el formulario.

<!--7-->
- **La bonificación es el descuento GENERAL del pie** ("Bonif. 21,38 %"), aparte de los `Desc%` de cada renglón. Se carga en su botón: se escribe el porcentaje, el importe se calcula solo y se puede corregir — el proveedor redondea a su manera y el que manda es el papel. Una vez cargada, el pie la muestra con un "cambiar" al lado y el botón pasa a decir "Editar bonificación".
- **El IVA se calcula sobre el neto YA bonificado**, y renglón por renglón: con dos alícuotas distintas en la misma factura (21% y 10,5%), prorratear el IVA total daría un número que no cierra con el libro.
- **Las percepciones se configuran una vez por proveedor** y el botón "+ Percepciones" abre la lista para **tildar la que vino** — nunca se aplican solas, porque el mismo proveedor a veces las trae y a veces no. El importe se sugiere con la alícuota y se puede corregir al del papel. Si el proveedor no tiene ninguna configurada, el botón queda deshabilitado y avisa dónde cargarlas.
- **Las percepciones NO son IVA**: son pago a cuenta de otro impuesto (IVA RG 5329, Ingresos Brutos), se declaran por separado y **no van al crédito fiscal**. Están en el total porque hay que pagárselas al proveedor. Cada una queda guardada en el comprobante con su nombre y alícuota **copiados**: si mañana cambia la alícuota del proveedor, la factura del año pasado sigue explicando su propio total.
- **Cada línea del pie se puede cambiar y quitar**: al lado de la bonificación y de cada percepción aplicada hay un "cambiar" (vuelve a abrir su modal) y una **×** que la saca. Quitar la bonificación recalcula las percepciones solas, porque su base cambió.

<!--8--> > **OK:** Si la factura entró por la bandeja **"Por procesar"**, el pie agrega una línea más: **el total que dice el papel**, con la diferencia en vivo. Cuando cierra dice "✓ Coincide con el papel"; cuando no, dice si faltan o sobran y cuánto. La tolerancia no es cero a propósito — el proveedor redondea cada renglón y en facturas grandes queda un centavo que no es un error; lo que sí es un error se mide en pesos.

<!--9--> 📍 Compras › Facturación › + Nuevo comprobante · las percepciones se configuran en Compras › Costos y percepciones › (abrir uno) › Percepciones


## TEMA liquidacion — Liquidación: la mitad que el proveedor entrega sin factura  (2026-08-08 05:30)


<!--0--> Hay proveedores que entregan **mitad facturado y mitad sin factura**. Esa segunda mitad **entró al depósito y hay que pagarla**, así que tiene que estar cargada: si no, el stock miente (falta la mercadería que sí llegó) y la cuenta corriente miente (falta la plata que sí se debe). Para eso está el tipo **Liquidación**.

<!--1--> Antes no había forma de cargarla. Los dos tipos que existían daban cada uno la mitad de lo que hacía falta:

<!--2-->
| Tipo | ¿Mueve stock? | ¿Genera deuda? | ¿Es fiscal? |
|---|---|---|---|
| **Factura** | sí (con recepción) | sí | **SÍ** — IVA, CAE, va a ARCA |
| **Remito** | sí (con recepción) | **NO** | no |
| **Liquidación** | sí (con recepción) | sí | **no** ← la que faltaba |

<!--3--> Con un remito la mercadería entraba pero **la deuda no quedaba registrada**; cargar la mitad negra como factura **inflaba el IVA computado**. La liquidación hace las dos cosas bien: suma stock y suma deuda, sin ser fiscal.

<!--4--> Desde el 26/8 el **Remito** dejó de ser un tipo huérfano y tiene su propio circuito: es el documento de "**llegó la mercadería y la factura viene en camino**" (Costa Oliva y compañía). Ingresa el stock para poder vender desde el día uno, queda en la pestaña **⚠ Remitos sin facturar** de Facturación, y cuando llega el papel se convierte con **"Llegó la factura"** — el remito PASA A SER la factura sin volver a mover stock. No confundir con la liquidación: el remito espera una factura que va a llegar; la liquidación ES el documento final de la mitad que nunca se factura.

<!--5--> **Cómo se carga.** Igual que una factura (Compras › Facturación › + Nuevo comprobante), eligiendo el tipo **Liquidación (sin factura)**. La pantalla se acomoda sola: **letra X fija** (no se elige), **sin IVA** y **sin percepciones** — ni las filas del pie ni el botón aparecen. El total es la mercadería y nada más. Se cargan las dos mitades como dos comprobantes del mismo proveedor y la misma fecha; cada uno con lo que le corresponde.

<!--6--> > **OK:** **La plata al proveedor es UNA.** Las dos mitades caen en la misma cuenta corriente y las dos aparecen en la bandeja de pago, así que se le paga junto y el saldo es el real. Facturación muestra además un indicador **"Sin factura"** aparte del "Total facturado", que es el número que se compara contra el libro de IVA: son dos cosas distintas y no hay que mezclarlas.

<!--7--> **Por qué es un tipo propio y no una factura con letra X ni un tilde de "no fiscal".** Lo que importa es qué pasa cuando alguien se olvida. Con un tipo aparte, toda consulta que pide "facturas" la excluye sola y hay que **optar por incluirla**. Con una letra o un tilde, todo la incluye por defecto y hay que acordarse de sacarla — y ese olvido **infla el IVA computado**, que es el lado caro del error. El costo de la decisión: el tipo nuevo hay que agregarlo en **seis listas explícitas** del código (mueve stock, genera deuda, cuenta corriente, documentos pagables, lo que se acepta imputar, y la suma del saldo); están todas marcadas con el comentario `LISTA DE TIPOS` para poder encontrarlas.

<!--8--> > **WARN:** **Quién la ve.** Tiene **permiso propio** (`liquidaciones`), separado del de cargar facturas, y arranca **solo para admin y superadmin**. Sin ese permiso el tipo no está en el alta, no está en el filtro y las liquidaciones **no se listan**. Se puede aflojar cuando quieras en Sistema › Roles. **Pero es una comodidad de pantalla, no un candado**: la API no valida quién llama y no va a poder hasta que haya sesiones con token — es el mismo bloqueante de siempre.

<!--9--> **Lo que la liquidación NO hace:** no tiene CAE ni QR (no es electrónica, el papel se carga a mano), **una nota de crédito no puede ajustarla** (la NC es fiscal y no puede referenciar algo que para ARCA no existe: si vuelve mercadería de esa mitad, se corrige la liquidación), y no aparece en ninguna suma de IVA. Si el proveedor te da un papel de esa mitad, se puede subir a la bandeja de Por procesar y clasificarlo como liquidación a mano.

<!--10--> 📍 Compras › Facturación › + Nuevo comprobante › tipo "Liquidación (sin factura)" · el permiso se configura en Sistema › Roles


## TEMA notas-credito-debito — Notas de crédito y de débito: siempre sobre una factura  (2026-08-07 23:05)


<!--0--> Una nota de crédito o de débito **nace de UNA factura**: la mercadería que se devolvió de esa entrega, el flete que el proveedor se olvidó de cobrar en ese remito. Por eso el **paso 3** del alta, cuando el tipo es NC o ND, muestra **la lista de facturas de ese proveedor** con su saldo, para elegir cuál ajusta. La **NC resta** y la **ND suma**.

<!--1--> La lista muestra, por cada factura, el total, lo pagado, el **saldo de hoy** y —al elegirla— **en cuánto queda**. Ese último número es el que importa: es la consecuencia de lo que se está por registrar, a la vista antes de confirmar.

<!--2--> > **WARN:** **Sin la referencia, la nota quedaba flotando y se le pagaba de más al proveedor.** El campo existía en la base pero ninguna pantalla lo cargaba, así que una NC de $50.000 contra una factura de $200.000 restaba de la deuda TOTAL del proveedor —la cuenta corriente cerraba bien— pero **la factura seguía ofreciendo $200.000 para pagar**. El que paga factura por factura le pagaba los $200.000 enteros. Verificado y corregido: con una NC de $38.675 sobre una factura de $41.934,75, la bandeja pasó de ofrecer $41.934,75 a ofrecer $3.259,75.

<!--3-->
- **Elegir no es opcional, pero "ninguna" es una opción.** La lista tiene una fila final —"no corresponde a una factura en particular"— que hay que marcar a propósito. Si no se elige nada, el alta no deja registrar: por defecto la nota volvería a flotar. Sin factura, la nota mueve la cuenta del proveedor pero no cambia el saldo de ningún documento, que es lo correcto para un ajuste general (una bonificación de fin de año, un recargo financiero sobre varias facturas).
- **La ND que ajusta una factura NO se paga por separado.** Su importe ya está sumado en el saldo de esa factura; pagarla aparte sería cobrar dos veces el mismo ajuste. La bandeja no la lista y la aplicación la rechaza con ese mensaje. La ND **sin** referencia sí sigue siendo un documento pagable por sí mismo.
- **El total del papel no cambia nunca.** La factura sigue diciendo lo que dice. Lo que cambia es cuánto queda debiéndose por ella — y eso es lo que la bandeja de pago ofrece. El detalle de la factura muestra la tabla de sus notas con la cuenta completa: total del papel, ajuste, pagado, y lo que queda.
- **Se puede pasar del saldo, y avisa.** Si la NC es mayor que lo que queda de la factura (pasa cuando ya estaba pagada y la mercadería se devolvió después), el alta lo advierte y deja registrar: el excedente queda a favor tuyo en la cuenta del proveedor.
- **Una NC con recepción devuelve mercadería** y descuenta stock. No puede ser automático por tipo, porque una NC no siempre es devolución: también ajusta un precio mal facturado o compensa un bulto roto que igual te quedaste. **PENDIENTE:** la API lo soporta pero la pantalla no lo puede activar — el alta manda `recepcion` derivado del tipo, y para una nota eso siempre da "no". Hoy la mercadería devuelta hay que sacarla a mano por Almacén › Operaciones; falta el control propio en el paso de la nota.

<!--4--> > **OK:** Guardas al registrar: la nota solo puede ajustar una **factura** (no un remito, que no genera deuda, ni otra nota), **del mismo proveedor** y **confirmada**. Y la referencia solo la aceptan las notas: una factura con referencia se rechaza.

<!--5--> 📍 Compras › Facturación › + Nuevo comprobante › (tipo Nota de crédito o de débito) › paso 3


## TEMA cadena — La cadena de costos  (2026-07-30)


<!--0--> Costo de lista → − descuentos → + flete → COSTO NETO → + IVA → Costo final

<!--1--> **Ejemplo — Caja de 12, lista $19.024,55, flete 8%, IVA 21%**
    Costo de lista            $19.024,55   ← por el bulto de 12
    Costo de lista unitario    $1.585,38   ← ÷ 12
    Descuentos (0%)                    —
    Costo bruto (sin flete)   $19.024,55
    Flete 8%                   +$1.521,96
    COSTO NETO                $20.546,51   ← el que fija el precio
    IVA 21%                    +$4.314,77
    Costo final               $24.861,28   ← lo que se le paga al proveedor
    Costo final unitario       $2.071,77
    COSTO NETO UNITARIO        $1.712,21   ← × markup = precio

<!--2--> > **WARN:** El **Costo Final lleva IVA adentro y es informativo**: sirve para conciliar contra la factura del proveedor. El precio de venta se calcula SIEMPRE desde el neto. Usar el final contaría el IVA dos veces y el número resultante sería plausible — nadie lo notaría.


## TEMA descuentos — La escala de descuentos  (2026-07-30)


<!--0--> Son cuatro campos porque los proveedores dan escalas ("treinta y diez y cinco"). Se aplican **en cascada**, cada uno sobre lo que quedó del anterior.

<!--1--> **Ejemplo — 30 y 10 NO es 40%**
    1 − (1 − 0,30) × (1 − 0,10)  =  1 − 0,70 × 0,90  =  1 − 0,63
    Descuento efectivo: 37%
    
    Con 30 / 10 / 5  →  40,15%   (no 45%)

<!--2--> > **INFO:** La pantalla muestra el **descuento efectivo calculado** al lado de los campos. Sumarlos de cabeza es un error caro y silencioso: ese número existe para evitarlo.


## TEMA modo-carga — Los dos modos de carga  (2026-07-30)


<!--0-->
| Modo | Se carga | Qué hace el sistema |
|---|---|---|
| Costo de lista | El costo del bulto sin IVA | Aplica descuentos y flete |
| Costo final con IVA | El total que factura el proveedor | Deriva el neto hacia atrás; ignora descuentos y flete |

<!--1--> > **WARN:** Es un **interruptor visible**, y eso es deliberado. El sistema anterior cambiaba de modo cuando el costo de lista quedaba en 0: alguien lo borraba para corregir un tipeo y cambiaba el cálculo de todo el producto sin enterarse.


## TEMA sin-factura — La mercadería sin factura (liquidación)  (2026-08-19)


<!--0--> El producto comprado en liquidación (total o parcial) **no puede trasladarle al cliente un IVA que nunca se pagó**: al facturar la venta, ese IVA lo absorbe el negocio. En el sistema viejo se resolvía descontándole a mano el 17,36% al costo (o 8,36% para el mitad y mitad). Ahora es un campo: **"Sin factura %"** en el Formato de Compra — 100 = liquidación pura, 50 = mitad y mitad — y la cuenta la hace el sistema, exacta y para cualquier alícuota.

<!--1--> El costo se parte en dos, porque hay dos preguntas distintas: el **costo real** (lo que la mercadería cuesta: valúa stock, pérdidas y transferencias) y la **base del precio** (lo que multiplica el markup: a la parte sin factura se le quita el IVA que se va a absorber). La diferencia es el **IVA absorbido** — plata que sale del margen al vender, y el dato central de Gerencia › Rentabilidad.

<!--2--> > **WARN:** El flete **acompaña la misma cuenta que la mercadería** (25/8/2026, decisión del dueño: "tal cual el sistema anterior" — revierte la regla del 19/8 que lo dejaba afuera). El motivo es que el flete **viene facturado por el transportista y el % cargado es el bruto**: su IVA vuelve como crédito fiscal, así que a la base del precio entra en neto, por el mismo ratio que la parte sin factura. Con $1.000 de mercadería + 10% de flete al 100% sin factura: base = (1.000 + 100) ÷ 1,21 = **$909,09** — la cadena de Sistel exacta. La regla del 19/8 (flete entero, $926,45) suponía flete pagado sin papel, y cobraba de más: le trasladaba al cliente un 21% del flete que en realidad volvía como crédito. "Le pagás al proveedor" sigue excluyendo el flete (el fletero tiene su propia línea, que muestra lo PAGADO en bruto), y la identidad de control cierra el circuito entero: base × 1,21 = proveedor + fletero. Con todo facturado (0% sin factura) nada de esto cambia nada.

<!--3--> **Ejemplo — Compra de $100 toda en negro, IVA 21%, markup 40%**
    Costo real                  $100,00   ← lo que pagaste
    Base del precio              $82,64   ← ÷ 1,21 (el "17,36%" de antes)
    IVA absorbido                $17,36   ← lo pierde el margen al vender
    Le pagás al proveedor       $100,00   ← base × 1,21: la prueba
    
    Precio final (markup 40%)   $140,00   ← el cliente no paga IVA ajeno
    Venta neta                  $115,70
    Ganancia real          $15,70 (15,7%)  ← no 40: la diferencia es el IVA

<!--4--> El % se **precarga desde la ficha del proveedor** ("Qué emite" + su número: liquidación pura = 100 aunque no lo tipees) y se ajusta por producto — el que manda para el costo es siempre el del formato. El mitad y mitad real (mercadería de $100: $50 en liquidación, $50 facturados con IVA) da **8,68%**: desembolsás $110,50 y la base queda en $91,32.

<!--5--> > **WARN:** El markup se sigue cargando como siempre, pero sobre estos productos **deja de ser tu ganancia**: poné 40 y ganás 15,7 real. Gerencia › Rentabilidad te muestra las dos columnas —margen aparente y real— para que esa diferencia tenga cara. Y cada venta **congela** su costo real, su IVA absorbido y el % del momento: el margen de marzo no cambia porque en julio subió el catálogo.

<!--6--> 📍 Compras › Productos → detalle → Formato de Compra → "Sin factura %" · Proveedores › Padrón → Ficha → "Sin factura %" · Gerencia › Rentabilidad (permiso gerencia.rentabilidad)


## TEMA formato-activo — Cuál formato fija el precio  (2026-07-30)


<!--0--> Exactamente uno por producto, marcado con **"Fija el precio"**. Su costo neto unitario es lo que multiplica el markup del Formato de Venta.

<!--1-->
- Al guardar, el sistema garantiza que quede uno solo activo.
- Si se quita el que estaba activo, el primero que queda toma la posta.
- La recepción de mercadería lo marca sola **solo si el producto todavía no tenía ninguno**. Si ya tenía, cambiarlo es una decisión y se toma a mano, con auditoría.

<!--2--> > **INFO:** Antes esto era un campo "proveedor activo" en el producto. Se eliminó: eran dos fuentes de verdad para el mismo dato, y con varios formatos por proveedor el id del proveedor ya no alcanzaba para saber cuál manda.


# SECCIÓN formato-venta — Formato de Venta
_Cómo SALE el producto: listas, markup y las cuatro puertas._



## TEMA modelo — El precio es del producto, no de la lista  (2026-08-01)


<!--0--> Este es el concepto que sostiene todo el módulo: **la lista no tiene precio ni markup**. Solo aporta identidad y orden de preferencia. El markup vive en la fila producto × lista.

<!--1--> **Ejemplo — La misma lista, dos markups**
    Harina Integral  ·  Mayorista 1  ·  markup 30%
    Lentejas         ·  Mayorista 1  ·  markup 50%
    
    Galletitas       ·  (sin fila mayorista)  → no se vende al por mayor

<!--2--> > **INFO:** La fila **es** la habilitación: si existe, el producto se vende así. Si no existe, no se vende así — no hay nada que destildar ni que excluir.

<!--3--> 📍 Compras › Productos › (abrir un producto) › Formato de Venta


## TEMA formato-fila — La fila del formato: unidades, código y modo de precio  (2026-08-01)


<!--0--> Cada fila del formato de venta dice **en qué se vende** (1 = suelto; 12 = caja de 12, con su propio código de barras) y **cómo se define el precio**: por *markup %* sobre el costo neto — el precio acompaña al costo — o por *precio definido*, un número final fijado a mano que no se mueve aunque el costo cambie.

<!--1--> **Ejemplo — Gaseosa: minorista suelta, mayorista por caja de 6**
    Mostrador   x1   markup 70%     unitario $2.353   formato $2.353
    Mayorista   x6   markup 22%     unitario $1.689   formato $10.134
    
    El "precio detallado por unidad" del mayorista está siempre a la
    vista: la caja de $10.134 son 6 unidades de $1.689.

<!--2-->
- **El precio definido no se redondea**: fijar $10.000 y que el sistema muestre $10.001 sería pisarle la decisión al que lo fijó. La ficha muestra el *markup equivalente* para no perder de vista el margen.
- **Escanear el código de la caja** en el POS carga las N unidades de una y **fija la lista del formato** (origen Manual): el cliente compró la caja, no seis sueltas — y el motor no la recotiza a mostrador.
- Los códigos de formato compiten con TODOS los demás códigos (producto, DUN, presentaciones): si dos cosas responden al mismo código, el lector queda sin desempate.
- Con precio definido, un cambio de costo NO mueve el precio — pero sí queda en la evolución si se edita el precio a mano (origen "formato de venta").


## TEMA modalidad — Modalidad › Lista  (2026-08-01)


<!--0--> Modalidad (carpeta) → Lista (identidad + orden) → Producto × Lista (markup)

<!--1--> La **modalidad** (Minorista, Mayorista) solo agrupa visualmente; no lleva condiciones. La **lista** ("Mayorista 1 · Distribuidor") tiene número, nombre y orden de preferencia.

<!--2--> > **WARN:** El **número de lista no se edita nunca**. Es parte de la identidad que referencian los clientes y las ventas viejas; renumerar reescribiría el historial en silencio. Para dar de baja, se desactiva.

<!--3--> 📍 Ventas › Formato de venta


## TEMA puertas — Las cuatro puertas  (2026-08-01)


<!--0--> Son un **OR**: con que se abra una alcanza. Entre todas las que se habilitan gana la de menor orden. Si no se abre ninguna, queda el piso (la lista base): el precio de mostrador.

<!--1-->
| Puerta | Se mide sobre | Alcanza a | Se aplica |
|---|---|---|---|
| Cliente — la tiene asignada | contrato | ese renglón | Sola |
| Producto — mínimo de unidades | cantidades | ese renglón | Sola |
| Marca — mínimo de unidades de la marca | cantidades | los renglones de esa marca | Sola |
| Monto — total del ticket | pesos | todo el ticket | Avisa; se aplica con un clic |


## TEMA regla-oro — La regla de oro  (2026-08-01)


<!--0--> Las condiciones que se miden sobre **cantidades** son estables: doce unidades siguen siendo doce aunque cambie el precio. Aplicar la lista no altera la condición, así que se pueden aplicar solas.

<!--1--> La condición por **monto** se mide sobre pesos, y ahí aparece el problema:

<!--2--> Ticket $41.000 → aplica mayorista → baja a $38.000 → ya no califica → vuelve atrás → sube a $41.000…

<!--3--> > **WARN:** Por eso el monto **nunca entra en el automático**: la caja avisa y el cajero lo aplica con un clic. No es una limitación, es lo único que evita un ciclo infinito.


## TEMA regla-marca — Reglas de marca  (2026-08-01)


<!--0--> Se acumulan las unidades de toda la marca en el ticket, sumando sus productos. Al llegar al mínimo, pasan a la modalidad **solo los renglones de esa marca**.

<!--1--> **Ejemplo — Regla: Coca-Cola, 12 unidades → Mayorista**
    Ticket: 12 Coca-Cola + 3 Galletitas + 2 Yerbas
    
    Gaseosa Cola    Mayorista 1   $1.800   ← ColaCo: 12 u. ≥ 12
    Galletitas      Mostrador     $1.400   ← no es de la marca
    Yerba           Mostrador     $5.200   ← no es de la marca
    
    Con 11 Coca-Cola: todo queda a precio de mostrador.

<!--2-->
- Pueden convivir varias reglas (Coca-Cola desde 12, Quilmes desde 6).
- Una misma marca puede tener dos reglas que abran modalidades distintas.
- Si un producto de la marca no tiene ninguna lista de esa modalidad, sigue con su precio: no se le asigna nada.
- La regla apunta a la marca por id, no por texto: renombrarla no la desarma.

<!--3--> 📍 Ventas › Formato de venta › Reglas de marca


## TEMA monto — Condición por monto  (2026-08-01)


<!--0--> Se configura un monto mínimo, qué modalidad desbloquea y —opcionalmente— con qué medios de pago vale ("solo efectivo").

<!--1-->
- Alcanza a todo el ticket, porque habla de la compra entera.
- Solo cambia los productos que tengan una lista cargada en esa modalidad.
- Los renglones que entran por esta vía quedan marcados, y al confirmar se valida el medio de pago.

<!--2--> 📍 Ventas › Configuración › Precios


# SECCIÓN ofertas — Ofertas
_Promociones: mecánicas, alcance y cómo se aplican en la caja._



## TEMA mecanicas — Las siete mecánicas  (2026-08-01)


<!--0-->
| Mecánica | Ejemplo | Se aplica |
|---|---|---|
| Descuento % | 20% en Galletitas | Sola |
| Precio de oferta | La yerba a $3.500 | Sola |
| Llevá N pagá M | 3×2 en yerbas | Sola |
| 2ª unidad con descuento | 2ª unidad al 50% | Sola |
| Pack | 3 por $10.000 | Sola |
| Combo | Galletitas + yerba por $5.000 | Sola |
| % al ticket | 10% desde $30.000 en efectivo | **Se sugiere** — el cajero la aplica con un clic |

<!--1--> Los precios configurados ($ del pack, del combo y el precio de oferta) son **finales, con IVA** — el número del cartel. El motor deriva el neto por producto, porque cada uno tiene su alícuota.

<!--2--> 📍 Ventas › Ofertas


## TEMA alcance — Alcance y condiciones  (2026-08-15 05:00)


<!--0-->
- **Alcance**: producto, **paquete fraccionado**, marca, categoría o etiqueta — y se pueden mezclar; la unión habilita.
- **Los paquetes fraccionados no entran solos** (10/8/2026): el paquete tiene su propio precio, así que una oferta a la madre —o a su marca, categoría o etiqueta— **no lo toca** salvo que se tilde *"incluir también los paquetes fraccionados"*. Para poner en oferta UN tamaño puntual ("Lentejas 500 g"), se lo elige como **Paquete** en el buscador de alcance: eso no toca el kilo suelto ni los otros tamaños.
- **Vigencia**: desde/hasta, días de la semana, **sucursales** (se tildan en el formulario; todas tildadas = corre en todas).
- **Medio de pago**: solo la de ticket puede exigirlo ("10% pagando en efectivo"); se valida al confirmar la venta, que es cuando el medio existe.
- **Listas de precio** (15/8/2026): sobre cuáles corre. Se tildan igual que los días y las sucursales, y **todas tildadas = corre sobre cualquier precio**. Dejando solo la de mostrador se consigue lo de siempre —que un mayorista no reciba además la promo, o sea el doble beneficio— y además ahora se puede lo que antes era imposible: **una promo solo para Mayorista 1**.

<!--1--> > **INFO:** Las listas **reemplazaron a la tilde "solo sobre el precio de mostrador"** (0065). Decía lo mismo con otro vocabulario, y dos perillas que se pisan obligan a explicar cuál gana cada vez que alguien arma una oferta. Las ofertas que ya existían se convirtieron solas: las que tenían la tilde quedaron atadas a la lista base —la de mostrador— y las que no, corriendo en todas. **Se compara contra la lista con la que quedó cotizado el renglón**, no contra su origen: si alguien lo pasó a mano a esa lista, está en esa lista (antes, con el criterio viejo, un renglón puesto a mano en mostrador quedaba afuera de una promo de mostrador).

<!--2--> > **INFO:** Una oferta vencida figura **Vencida** sola: el estado se calcula con el reloj, nadie tiene que acordarse de apagarla. Y si ya se usó en ventas, borrar la **desactiva** — el ticket viejo la referencia.

<!--3--> > **WARN:** **Esta pantalla avisa cuando una oferta está descontando mercadería que YA venció** (10/8/2026): el dato viene del vigía de fechas (Almacén › Vencimientos), y el aviso vive acá porque acá está el remedio — editar la oferta para apagarla o recortarle el alcance. La fila de esa oferta además queda marcada "⚠ mercadería vencida". Desde Vencimientos también se llega al alta con el formulario ya lleno (producto, fecha de fin y sucursal del lote); ver Stock e inventario › "Vencimientos: el vigía de fechas".


## TEMA resolucion — Cómo resuelve la caja  (2026-08-14 22:00)


<!--0--> Precio de lista resuelto → Combos (consumen unidades) → Mejor oferta por renglón → Descuento con nombre (si gana) → Sugerencia de ticket

<!--1-->
- **Una oferta por renglón**: la de mayor beneficio. Apilar promos vuelve el ticket inexplicable.
- Los **combos van primero** y consumen unidades: lo que entró en un combo no cuenta para el 3×2.
- La de **ticket no se apila**: reparte su % solo entre los renglones que quedaron sin promo.
- Misma regla de oro de las listas: cantidades → sola; pesos → se sugiere.

<!--2--> **Ejemplo — Verificado en caja: 30 galletitas + 1 kg de harina, 10% desde $30.000**
    Galletitas ×30    2ª unidad al 50%     −$10.208,70   (15 pares)
    Harina 1 kg       10% al ticket        −$113,03      (no tenía promo)
    
    Las galletitas NO reciben además el 10%: ya tienen su oferta.
    Ahorro total: $10.321,73 — auditado renglón por renglón en la venta.

<!--3--> Cada renglón guarda **qué oferta** se le aplicó y **cuánto descontó** (nombre congelado, como la lista): meses después se puede responder cuánto costó cada promoción.


## TEMA descuentos-nombre — Descuentos con nombre (la autorización escrita)  (2026-08-15 01:00)


<!--0--> Hasta acá un precio podía bajar por tres caminos: el descuento del **cliente** (con quién se vende), el **manual** del renglón (decisión del vendedor, acotada por el tope de Configuración) y la **oferta** (promoción del catálogo). Esto es un cuarto y no encaja en ninguno: *"Empleados 15%"*, *"Atención por tardanza 25%"*. Lo crea el dueño una vez, y en la caja se elige por su nombre — **sin tipear un número**.

<!--1--> Existe porque ese porcentaje **saltea el tope del vendedor**: lo autorizó el dueño al crearlo, no la cajera al tipearlo. Sin esto, permitir un 25% de vez en cuando obliga a subirle el tope a todo el mundo, todo el tiempo.

<!--2-->
| Campo | Qué decide |
|---|---|
| **Nombre** | Único. Es lo que ve la cajera y lo que queda impreso en el ticket. Dos "Empleados" en el desplegable es una trampa |
| **Porcentaje** | El que autoriza el dueño. No lo puede cambiar quien lo aplica |
| **Lista de precios** | **Obligatorio: es su identidad.** El descuento cae solo sobre los renglones de ESA lista, nunca sobre el total del ticket |
| **Vencimiento** | Vacío = no vence. Con fecha, **vale todo ese día** hasta las 23:59 de Argentina |
| **Medio de pago** | Vacío = cualquiera. Con valor, el pago tiene que ser **íntegro** de ese medio |
| **Sucursal** | Vacío = todas. Al revés que la lista a propósito: el alcance geográfico es una restricción opcional |
| **Requiere admin** | Si está tildado, la cajera lo ve pero no lo puede aplicar sola |

<!--3--> **Las seis reglas que decidió el dueño (14/8/2026):**

<!--4-->
- **Cae solo sobre su lista.** Si el cliente lleva algo de Minorista y algo de Mayorista 1, un descuento de Mayorista 1 toca **solo esa parte**. Nunca el subtotal.
- **Uno por lista.** Dos de la misma lista competirían por los mismos renglones; se rechaza al aplicar.
- **Gana el mayor, nunca se suman.** Si el cliente ya trae 25% propio y el descuento es del 20%, el renglón queda en 25 — y **no cuenta como del descuento**, porque no fue el que lo produjo.
- **No toca los renglones con oferta**: ya tienen su beneficio.
- **El medio de pago se bloquea, y se avisa.** Un descuento "en efectivo" no admite un ticket pagado mitad y mitad: o el pago entero es de ese medio, o el descuento no corre.
- **El vencimiento vale todo el día.** Puesto el 14/8, sirve hasta las 23:59 del 14/8 en hora argentina.

<!--5--> > **INFO:** El navegador **nunca manda un porcentaje**: manda el **id** del descuento y el servidor resuelve todo de nuevo — que exista, que esté vigente, que sea de esta sucursal, que quien lo aplica tenga permiso, y que su lista esté de verdad en el ticket. Es la misma regla que ya rige el precio, el IVA y las ofertas: la pantalla propone, el servidor cobra.

<!--6--> El renglón guarda la pareja **id + nombre congelado**, igual que la lista y la oferta, y **solo si el nombrado ganó**. Un ticket de hace seis meses se reimprime diciendo "Empleados" aunque después se renombre o se dé de baja, y el reporte de cuánto costó cada autorización no cuenta renglones que en realidad bajaron por otra cosa.

<!--7--> 📍 Ventas › Configuración › Descuentos con nombre

<!--8--> **En la caja** hay un botón chico debajo del total: **"Aplicar descuento"**. Se abre la lista con los que sirven para ESE ticket, y los que no sirven aparecen **en gris con el motivo escrito** —venció, es de otra sucursal, ningún renglón usa su lista, lo tiene que aplicar un administrador—. Está a propósito: "no está" y "está pero no se puede, por esto" son cosas distintas, y lo primero manda a la cajera a buscar al encargado sin saber qué preguntar.

<!--9--> Aplicado, queda como un cartelito arriba del botón y cada renglón alcanzado muestra su sello (igual que una oferta). **Se re-evalúa en cada cambio del ticket**: si entra otro producto de esa lista, entra solo; si un renglón cambia de lista, se cae; y si se cae el último, el cartel avisa *"ya no descuenta"* en vez de quedarse mintiendo. Vuelve a entrar solo si el ticket vuelve a calificar.

<!--10--> > **INFO:** El campo **Desc. %** del renglón se vuelve texto mientras hay un descuento con nombre ganando. Es a propósito: lo que se tipea ahí es el descuento propio del renglón —el de abajo—, así que escribir 30 sobre un 25 autorizado daría un 30 que el servidor rebota por el tope del vendedor. Para tocarlo a mano, primero se saca el descuento.

<!--11--> 📍 Punto de venta › debajo del total › Aplicar descuento


# SECCIÓN precios — Precios y redondeo
_De la factura del proveedor a la etiqueta de góndola._



## TEMA derivacion — La derivación completa  (2026-08-01)


<!--0--> Costo neto unitario → × (1 + markup) → PRECIO NETO → × (1 + IVA) → redondeo → Etiqueta

<!--1--> Las **presentaciones** (fraccionados) tienen **formato de venta propio** desde la 0053: su markup o su precio fijo, su caja por N paquetes y su mínimo. Antes derivaban del precio por kg de la lista más un recargo, y eso dejaba sin precio a los paquetes de las 73 madres que no tienen listas cargadas.


## TEMA redondeo — Redondeo de góndola  (2026-08-01)


<!--0--> Se redondea el precio **final con IVA**, que es el que ve el cliente, y el neto se deriva hacia atrás.

<!--1--> > **INFO:** Redondear el neto no sirve: $1.455 neto termina igual en $1.760,55 en la etiqueta. La operación es idempotente, así que la etiqueta y el ticket nunca discrepan.

<!--2--> Se configura global (por defecto: al entero más cercano) y cada producto puede tener el suyo propio con **"Heredar de configuración"** como valor por defecto.

<!--3--> 📍 Ventas › Configuración › Precios


## TEMA evolucion — Evolución de precios  (2026-08-01)


<!--0--> El precio se deriva, así que "cambió el precio" no es un evento: es la consecuencia de otra operación. Después de cada una que puede moverlo, un **snapshot** compara el precio de góndola actual contra el último registrado y anota solo lo que cambió — con el anterior, el nuevo, el **% de variación** y qué palanca se movió.

<!--1-->
- Dispara con: cambio de costo, formato de compra, formato de venta (markup), cambio de formato activo y reversión de lote.
- Guarda el precio **final con IVA y redondeo**: el número de la etiqueta. Por eso un +10% de costo puede figurar +9,96% o +10,01% — es el redondeo de góndola real.
- Se consulta en el producto (pestaña **Evolución de precios**) y global con **Alt+F5**.

<!--2--> 📍 Compras › Productos › (producto) › Evolución de precios — o Alt+F5 en Ventas


## TEMA aviso-precios — Aviso de cambio de precios a los cajeros  (2026-08-06 18:53)


<!--0--> El punto de venta pide el catálogo **una sola vez** y lo guarda en memoria (así cambiar de cliente o cruzar un umbral se resuelve sin volver a la red). El costo de eso es que si se actualizan precios mientras un cajero tiene el POS abierto, ese cajero **sigue cobrando el precio viejo** hasta que se acuerda de apretar "Actualizar precios". Nadie se acuerda: por eso el sistema avisa solo.

<!--1--> Cada CRM abierto consulta la **firma del último cambio** (`GET /precios/ultimo-cambio`) cada 30 segundos. Cuando aparece una nueva, suena y aparece un cartel arriba al centro que dice **quién** lo cambió, con el botón **Actualizar precios** que trae los nuevos al instante.

<!--2--> > **INFO:** Ojo con la asimetría respecto del aviso de pedidos web: ese va PARA la administración; este va para el CAJERO, que es el que tiene precios viejos en pantalla. Lo que se filtra acá no es quién lo recibe sino **quién lo provocó** — solo avisa cuando el precio lo movió la administración, que es la única que toca precios. Un cambio sin autor registrado también avisa: un cajero no tiene con qué mover un precio, así que salió igual de una operación de administración (típicamente la recepción de una factura).

<!--3-->
| Decisión | Por qué |
|---|---|
| La firma es el **id** del historial, no la fecha | Es monotónico, no discute con zonas horarias y dos tandas en el mismo segundo no se confunden |
| **No le avisa a quien hizo el cambio** | Ya lo sabe. Un cartel avisándote de lo que acabás de hacer entrena a ignorar los carteles |
| Solo lo ve quien tiene **Punto de venta** | Al que no cobra no le cambia nada |
| **No se auto-esconde** (el de pedidos web sí, a los 10 s) | Un precio viejo cuesta plata en cada venta: el cartel se queda hasta que el cajero actualice o lo cierre |
| Actualizar desde el POS **también apaga el aviso** | Quien ya trajo los precios nuevos no tiene que ver el cartel. El "ya lo vi" vive en el servicio, así las dos puntas hablan del mismo dato |

<!--4--> > **WARN:** Los renglones YA cargados en un ticket abierto no se re-precian: cada uno guarda el precio con el que entró, y cambiarlo por atrás sería cobrarle al cliente un número distinto del que se le dijo. Los precios nuevos rigen para lo que se agregue de ahí en adelante.

<!--5--> 📍 Aparece en cualquier pantalla · el botón equivalente está en Ventas › Punto de venta


## TEMA actualizacion — Actualización masiva y deshacer  (2026-08-15 06:00)


<!--0-->
- Los costos se actualizan desde **Compras › Costos y percepciones › (el proveedor) › Productos y costos**, que es donde aparece el aumento. Se elige el campo (**Costo**, Descuento % o Flete %), cómo se mueve (**variar un %**, sumar/restar, o fijar un valor) y el número. La tabla muestra en el acto el costo neto y el **precio de venta antes → después**, en rojo lo que sube; recién al Guardar viaja.
- **Se puede filtrar antes de aplicar** (15/8/2026): buscador por nombre, marca o código, y un desplegable con las marcas que ESE proveedor trae. Es lo que hace usable el caso normal —"Coca Cola subió 10%" dentro de un distribuidor que trae seis marcas—, porque antes había que destildar a mano, de a 20 por página, todo lo que no cambiaba.
- La regla masiva alcanza **solo a los productos tildados Y VISIBLES** — no siempre sube todo el proveedor. Por defecto están todos tildados; se destildan los que no cambian (el checkbox de la cabecera tilda/destilda **solo lo que se ve**). Lo mismo en "Actualizar márgenes" de Compras › Productos.
- Editar un campo a mano vale siempre, esté tildado o no: el checkbox solo define el alcance de la regla masiva.
- «Actualizar márgenes» (Compras › Productos) opera sobre el **markup del formato de venta**: las filas del producto Y las de cada **paquete fraccionado**, que desde la 0053 son la misma clase de fila. Tenía un segundo modo para el recargo de fraccionamiento, que dejó de existir con la columna. Las filas en **precio definido** se saltean: ese precio lo fijó una persona y un % no lo pisa. Los cambios quedan en la evolución de precios (origen «Formato de venta»).
- Cada cambio queda registrado con el valor anterior Y el nuevo, en lotes.
- Un lote se puede revertir. Las filas que alguien tocó DESPUÉS se saltean: revertirlas pisaría una decisión más nueva.

<!--1--> > **WARN:** **Con el filtro puesto, la regla cae SOLO sobre lo que se ve.** Suena obvio y es lo que evita el accidente caro: los tildes arrancan todos puestos, así que filtrar por una marca y aplicar +10% "a los tildados" —los 134 del proveedor, incluidos los que el filtro esconde— sería subirle el costo a todo el catálogo de un clic, sin verlo. El rótulo del botón lo dice con el número exacto ("Aplicar a 2 de los 2 que se ven"). Los tildes **no se reinician** al filtrar: lo que destildaste sigue destildado cuando volvés.

<!--2--> > **WARN:** El historial cuelga de los formatos de compra. Por eso guardar la pestaña **actualiza por id** en vez de borrar e insertar: hacerlo al revés vaciaba la auditoría del producto en silencio.


# SECCIÓN pos — Punto de venta
_La caja: pestañas, atajos y cierre._



## TEMA presupuestos — Presupuestos (pedidos mayoristas)  (2026-08-01)


<!--0--> La **bandeja de entrada de los pedidos mayoristas**: llegan por WhatsApp (se cotizan a mano en el POS) o **solos desde el sitio web** (el cliente arma su carrito y confirma). El presupuesto NO es fiscal ni toca la caja — es la palabra dada al cliente, con precios congelados.

<!--1--> Cotizar en el POS → Enviar (validez) → Confirmar (reserva stock) → Armar con la hoja → Cerrar en POS (venta real)

<!--2-->
| Paso | Qué pasa |
|---|---|
| Cotizar | En el POS (WhatsApp), con el botón **Presupuesto** del ticket: cotiza el MISMO motor de listas y ofertas de la caja. Desde el **sitio web**, el pedido nace directo en "Enviado" — no hay nadie cotizando en el medio |
| Enviar | Congela la palabra y arranca la **validez** (configurable, 7 días). El botón **WhatsApp abre el chat del cliente con el presupuesto ya escrito** (mensaje con la marca, items ordenados, total y validez — solo queda tocar enviar); el teléfono sale del pedido web o de la ficha del cliente, y sin número completo cae a copiar el texto. Un enviado con la fecha pasada se muestra **Vencido** solo |
| Confirmar | El cliente dijo sí → se **reserva el stock** (disponible → comprometido): mientras el vendedor arma, la caja no puede vender esa mercadería. Un vencido no se confirma: se reabre y se re-cotiza |
| Armar | La **hoja de armado** sale sin precios, con columna en blanco para el lápiz. Al volver se carga pedida / armada / motivo — la venta sale por **lo armado** |
| Cerrar | "Cerrar en POS" crea la venta en curso con lo armado y los precios congelados; el cajero **agrega o saca** lo que el cliente pida y cobra normal. Al cobrar, el presupuesto se cierra solo y la reserva se libera |

<!--3-->
- **Pagos**: si paga al retirar, la venta se cierra ese día al contado. Si transfirió antes, se cierra al momento del pago y el ticket queda junto al pedido esperando el retiro.
- **Entregas con chofer / contra entrega** (clientes de cuenta corriente): la venta se cierra en **cta. cte.** al despachar, y la plata que trae el chofer se registra como **cobranza** — cada cosa en su fecha y su circuito.
- **Cancelar** un confirmado libera la reserva. Los cerrados guardan la referencia a su venta.
- **Permisos**: cotizar/enviar/confirmar es del permiso *presupuestos* (admin); cerrar en el POS lo hace quien vende.

<!--4--> 📍 Ventas › Presupuestos (se cotiza desde Ventas › Punto de venta)


## TEMA ordenes-web — Órdenes web (recepción de pedidos del sitio)  (2026-08-06 18:53)


<!--0--> Todo pedido del sitio nace como presupuesto en estado **Pendiente**, en la bandeja de **Ventas › Órdenes web**. No es un documento nuevo: es el MISMO presupuesto de siempre, pero `Enviado` significa "la casa dio su palabra" — y un pedido que nadie miró todavía no puede serla.

<!--1-->
| Pieza | Cómo funciona |
|---|---|
| **La bandeja** | Lista los pendientes con cliente (o chip **NUEVO**), WhatsApp, entrega y total. "Ver" muestra los renglones con el **stock disponible de cada uno** — el faltante se ve ANTES de aceptar, no al confirmar |
| **Responder por WhatsApp** | Clic en el teléfono del pedido y se abre el chat con el saludo ya escrito (nombre, código y total). Entiende cómo escribe la gente: con o sin `+54`, con el `0` de larga distancia o el viejo `15`. Si el número quedó incompleto, se muestra sin link — uno roto abre un chat que no existe |
| **Aceptar** | Pasa la orden a **Enviado** (arranca la validez) y sigue el ciclo normal de Presupuestos. Si el DNI ya era cliente, queda adjudicada sola; si es desconocido, **pregunta si darlo de alta** (o se asigna a mano a uno existente) — el cliente recién se crea acá, nunca antes |
| **Rechazar** | Cancela con **motivo obligatorio** (queda en observaciones). El cliente nuevo NO se da de alta: una prueba o un spam no ensucian la base |
| **El aviso** | Contador en el sidebar (módulo Ventas) y en el submenu, más una **alerta arriba con campanita** cuando entra un pedido con el CRM abierto. Varios juntos = un solo aviso con el contador. La alerta la ve solo la **administración** (además de tener la sección `ventas.ordenes`): los pedidos del sitio los revisa y acepta el admin, y al cajero un cartel cada vez que entra uno solo lo interrumpe en el mostrador — igual le queda el contador si tiene la sección |
| **Origen marcado** | Columna `origen` propia (`web` | `manual`) — no una nota de texto que el cliente podía pisar. En Presupuestos los de la web llevan 🌐, y en Clientes la columna **Web** cuenta los pedidos del sitio de cada cliente (clic = historial) |

<!--2--> > **INFO:** La bandeja y los contadores se refrescan solos cada 30 segundos. El aviso FUERA del CRM (WhatsApp/email cuando nadie tiene el sistema abierto) sigue pendiente: necesita un servicio externo.

<!--3--> 📍 Ventas › Órdenes web (permiso ventas.ordenes) — el pedido se genera en el sitio (localhost:3002)


## TEMA sitio-web — Sitio web (sitio-web/, Next.js)  (2026-08-10)


<!--0--> Proyecto aparte (`sitio-web/`, puerto **3002**), contra la MISMA API y la misma base — no hay WordPress ni una base propia. Replica estructura y diseño del tema mayorista original (verde `#086633`, tipografía Inter). Sin cuentas de cliente ni pasarela de pago: se cotiza, se arma el carrito y se envía el pedido.

<!--1-->
| Pieza | Qué hace |
|---|---|
| **GET /tienda/catalogo** | Shape público y liviano: nombre, marca, categoría, etiquetas de dieta, un solo precio (la lista "Mayorista"), y si tiene mínimo propio. Nada de costos ni stock por sucursal — solo la Distribuidora surte al sitio |
| **Mínimo de compra** | Igual que el sitio real: NO cambia el precio, **habilita el envío del pedido**. Se cumple con CUALQUIERA de los dos caminos: monto total del carrito, o cantidad mínima por marca/producto (mismas `reglasMarca` y `montoMinimoMayorista` que ya usa el POS) |
| **Mínimo por camioneta** | La entrega con la camioneta de la empresa tiene su PROPIO piso ($80.000, editable en **Ventas › Configuración**) y es DURO — sin el camino alternativo por cantidades: mover el vehículo cuesta lo mismo lleve lo que lleve. El checkout muestra la opción deshabilitada con cuánto falta, y el servidor lo revalida |
| **POST /tienda/pedidos** | Recotiza TODO server-side (nunca confía en el precio que mandó el navegador), valida el mínimo y busca el cliente **por DNI**. El pedido nace como presupuesto **Pendiente** en la bandeja de **Ventas › Órdenes web** — si el DNI es desconocido, el cliente NO se da de alta todavía (sus datos esperan en la orden) |
| **Qué productos aparecen** | Los que tienen **precio en la lista Mayorista** — sin flag manual ni fallback a otra lista. Publicar = cargarle el precio mayorista (Ventas › Formato de venta); sacarlo del sitio = quitárselo. El flag `publicado` viejo quedó sin uso |
| **Carrito** | Vive en el navegador (localStorage), sin cuentas. Cada línea guarda una foto del producto al agregarlo; el precio real se reconfirma en el servidor recién al enviar |
| **"Ya está en tu carrito"** | La tarjeta muestra sobre la foto lo que ya cargaste de ese producto (`🛒 2 kg en el carrito`), así se ve recorriendo la tienda sin abrir el carrito para acordarse |
| **Tope por stock** | El catálogo manda `disponible` (el stock menos el piso reservado al mostrador, `webStockMin`) y el carrito lo usa de TOPE: el `+` se detiene ahí y la tarjeta explica qué pasa — «Solo quedan 0,5 kg (ya tenés 1,5 kg)», «Es todo lo que hay disponible», o el botón en «Sin más stock» cuando ya tenés todo. El tope vive en el carrito y no en la tarjeta, porque la cantidad se toca desde tres lados (tarjeta, carrito, mini-carrito) y con la regla repartida el que se la olvide deja pedir 50 kg de algo que tiene 3 |
| **Imágenes** | Se cargan en el **módulo Web** (foto de producto, imagen de categoría, logo de marca, banner). El catálogo viaja con la URL versionada (`tienda/imagenes/tipo/id?v=…`), nunca con los bytes; sin imagen, el sitio muestra la genérica |
| **Ofertas en el sitio** | El carrusel de "Ofertas" muestra las promos del motor de Ofertas real que corren **sobre TODAS las listas** (o sea, las que no tienen ninguna tildada en particular). El precio con descuento es el que se cobra: recotizado igual que todo lo demás, nunca confiando en el navegador. **Ojo**: el precio que publica el sitio es el de mostrador, así que una promo acotada a esa lista debería verse acá y hoy no se ve — quedó igual que antes a propósito (15/8/2026) y está anotado en Pendientes |
| **Volvieron a stock** | Un producto aparece en este carrusel si tuvo un ingreso de stock (compra) en los últimos 14 días y hoy tiene stock disponible. Definición simple: no distingue si antes llegó a 0 o no |
| **Mega-menú de marcas** | Botón "Marcas" en el header: todas las marcas agrupadas A-Z con un buscador — clic lleva a `/tienda?marca=id`. En mobile, el listado completo va dentro del menú de hamburguesa |
| **Búsqueda en vivo** | El buscador del header sugiere hasta 6 productos mientras se escribe (nombre o marca), usando el catálogo ya cargado en el navegador — sin pedir nada nuevo a la API por cada letra |
| **Popup de bienvenida** | Aparece una vez por sesión (a los ~900ms), con acceso directo a la tienda o a WhatsApp. Se cierra con la X, clic afuera o Escape |
| **PWA instalable** | `app/manifest.ts` + service worker mínimo (`public/sw.js`, solo cachea el shell — nunca precios ni stock) + iconos placeholder en `public/icons/`. El navegador ofrece "Instalar" / "Agregar a pantalla de inicio" |

<!--2--> > **WARN:** CORS: la API solo acepta pedidos de los orígenes en `CORS_ORIGINS` (`.env` de crm-api) — el sitio (`localhost:3002`) tiene que estar en esa lista, si no el carrito no puede leer el catálogo desde el navegador (los fetch server-side de Next si funcionan igual, porque no pasan por CORS).

<!--3--> > **INFO:** RATE LIMIT: los 4 endpoints públicos de la tienda tienen cupo por IP (ventana deslizante en memoria): pedidos **5 cada 10 min** (estricto: protege la bandeja de órdenes), eventos 40/10 min, catálogo 60/min, imágenes 200/min. Al superarlo la API responde 429 con cuánto esperar. La lectura es holgada a propósito: por el CGNAT de los celulares, muchos clientes reales comparten IP. Las IPs privadas y localhost están EXENTAS — el SSR de Next y el CRM son infraestructura propia, no visitantes.

<!--4--> > **INFO:** Los iconos de la PWA son un placeholder (círculo blanco sobre verde) hasta que se cargue el logo real en Sistema › Empresa — reemplazar `sitio-web/public/icons/icon-192.png` e `icon-512.png` cuando esté.

<!--5--> 📍 sitio-web/ (proyecto separado) — npm run dev, puerto 3002


## TEMA web-seo-stats — SEO y estadísticas del sitio  (2026-08-01)


<!--0--> Las estadísticas son **medición propia y anónima**: el sitio manda eventos a la MISMA base del CRM (nada de Google Analytics ni cookies de terceros) y se leen en **Web › Estadísticas**. La "sesión" es un código al azar que muere al cerrar la pestaña — sin nombre, sin IP.

<!--1-->
| Qué | Cómo funciona |
|---|---|
| **Visitas y sesiones** | Cada cambio de página cuenta una vista; el gráfico muestra los días del período (con los vacíos en cero). Sesiones = visitantes distintos |
| **Tiempo mirando cada producto** | Segundos con la tarjeta REALMENTE en pantalla (≥50% visible y pestaña activa) — una pestaña en segundo plano no suma. Es la medida de interés, compre o no |
| **Al carrito / pedidos** | Los clics en Agregar, y las unidades que terminaron en órdenes web no rechazadas: el embudo completo — mirar → cargar → pedir |
| **Envío de eventos** | En lote cada 15 segundos y al salir de la página (`sendBeacon`). Si la API no responde, se descartan: la telemetría jamás rompe una compra |
| **SEO** | Título por página, OpenGraph, JSON-LD (Organization + WebSite + la grilla de productos con precio y stock), `sitemap.xml` y `robots.txt` (carrito y checkout excluidos). El dominio real se setea con `NEXT_PUBLIC_SITE_URL` al deployar |

<!--2--> > **INFO:** La conversión (pedidos ÷ sesiones) puede superar el 100% al principio: hay pedidos anteriores al inicio de la medición. Se acomoda sola con tráfico real. El teléfono del checkout ahora exige un número argentino completo (10 dígitos) — la misma regla del link de WhatsApp de Órdenes.

<!--3--> 📍 Web › Estadísticas (permiso web.estadisticas) — selector de 7/30/90 días


## TEMA modulo-web — Módulo Web (administrar el sitio)  (2026-08-06 18:53)


<!--0--> La administración del sitio desde el CRM. A propósito toca POCO: el producto (nombre, precio, stock, etiquetas) se maneja en **Compras › Productos** y el precio web en el formato de venta — acá solo lo que es del sitio.

<!--1-->
| Sección | Qué se hace |
|---|---|
| **Productos del sitio** | La MISMA lista que ve el cliente (mismo endpoint del catálogo público): quien tiene precio en la lista Mayorista está, quien no, no — y un precio en $0 (costo a medio cargar) tampoco se publica. Editables: **★ Destacado**, la **foto** y el **Mínimo web** |
| **Imágenes (el estándar)** | TODA imagen del sitio pasa por el mismo molde al subir, en el navegador y sin servicios externos: se adapta a su medida, se comprime a **WebP** y se **previsualiza antes de confirmar**. Medidas ideales: producto **800×800** (entra entera, nunca se recorta), slide **1920×600** y categoría **600×600** (se recortan al centro — por eso la vista previa), logo de marca **400×200** transparente. Se acepta cualquier original hasta 12 MB. **Quitar fondo** (productos y logos): detecta el fondo desde los bordes y lo vuelve transparente, con tolerancia ajustable — funciona mejor con fondos lisos y claros, y un blanco DENTRO del producto no se borra. Componente nuevo con imagen = declarar su preset y hereda todo |
| **Mínimo web** (por producto) | El piso de stock para la venta online: cuando el disponible de la Distribuidora llega a ese número, el sitio muestra **"Sin stock"** y lo que queda se prioriza para **fraccionar o para el mostrador**. 0 = se vende online hasta la última unidad. La columna muestra el stock real del depósito al lado |
| **Ofertas del sitio** | Solo lectura: las promos activas que valen para toda lista (no "solo precio de mostrador"), sin combos ni descuentos de ticket. Se editan en **Ventas › Ofertas** |
| **Contenido del sitio** | Los **slides de la portada** con alta, baja, edición y orden (badge, título, texto, botón, posición del texto e imagen propia por slide — nada fijo en código), y las imágenes de **categorías** y **marcas**. Sin slides, la portada arranca directo en los productos |
| **Estadísticas** | Visitas y sesiones por día, ranking de productos (vistas, segundos mirando, carrito, unidades pedidas) y **"Lo más buscado"**: los términos del buscador del sitio — lo que se busca y no se encuentra es la lista de compras del catálogo. Los eventos crudos se guardan **13 meses** (un año completo + el mes en curso, para comparar temporadas) y la API los purga sola: al arrancar y cada 24 hs |
| **Configuración del sitio** | La identidad y el contacto que ve el cliente: **logo** del encabezado (400×120, sin logo se muestra el nombre en texto), **favicon** de la pestaña (128×128), **WhatsApp del negocio** (arma todos los botones de WhatsApp del sitio: footer, flotante y popup), teléfono opcional, correo, ubicación e **Instagram/Facebook** (aparecen en el pie solo si están cargados). Los defaults son la info real de siempre — el sitio nunca queda vacío |

<!--2--> > **INFO:** Si nadie marcó destacados, la portada muestra una selección automática (los primeros 8) para no quedar vacía; apenas hay uno o más ★, la grilla pasa a llamarse "Destacados" y muestra exactamente esos.

<!--3--> 📍 Web › Productos · Ofertas · Contenido (permisos web.productos / web.ofertas / web.contenido)


## TEMA impresion — Impresión y módulo Sistema  (2026-08-10)


<!--0--> TODO lo que se imprime pasa por **un solo motor** que lee la configuración de **Sistema**: el formato asignado a cada documento, el membrete de la empresa (logo + nombre + CUIT) y el pie. Un documento nuevo hereda todo solo.

<!--1-->
| Qué | Dónde / cómo |
|---|---|
| **Sistema › Empresa** | Nombre de fantasía, **razón social**, CUIT, dirección, teléfono, **logo** (imagen hasta 400 KB) y color de marca. Es el membrete de todos los documentos; el color aplica solo a A4/Carta — los rollos térmicos son B/N. **El nombre y la razón social son dos campos distintos**: el de fantasía va grande (acá "Sabor y Aroma"), la razón social es quien factura ("LORENZO LUCAS EMANUEL") y en una factura es obligatoria (RG 1415) — sale como **Emisor** y también prellena el certificado de ARCA. Si son iguales, la razón social se deja vacía y no se repite en el papel |
| **Sistema › Impresión** | Formato por documento: **rollo 80 mm** (recomendado: más texto por línea), **rollo 58 mm** (posnet/portátil), **A4** o **Carta**. Con **vista previa en vivo** (el mismo HTML que va a la impresora) e impresión de prueba |
| **Reimprimir un comprobante** | Desde la fila, en cinco lugares: **Ventas** (Imprimir — con CAE sale la factura con su QR, sin CAE el ticket), **Almacén › Transferencias** (Imprimir remito, en la ficha del envío), **Almacén › Operaciones** (Vale), **Gastos** (Imprimir) y **Gastos › Pagos en sucursal** (Orden). Todas las reimpresiones llevan al pie **cuándo se imprimieron y quién**: el papel no sale en el momento del hecho, y uno viejo encontrado tres meses después puede estar mintiendo si el documento cambió de estado |
| **Ticket del POS** | Se imprime **solo al cobrar** (se apaga en Sistema › Impresión). "Reimprimir" en la registradora saca de nuevo el último ticket del puesto. Leyenda "DOCUMENTO NO FISCAL" configurable hasta que llegue ARCA |
| **Etiquetas del fraccionado** | El único documento que NO es papel: va a la **impresora térmica de etiquetas** en su medida (50 × 30 mm por defecto, más 50 × 25, 40 × 25 y 60 × 40) y **sin membrete** — en 30 mm de alto el logo se come el precio. Una etiqueta = una página del rollo. Se eligen en Almacén › Fraccionamiento › Etiquetas |
| **La impresora física** | La elige cada puesto en el diálogo del navegador (decisión: diálogo está bien por ahora). En la caja: Chrome con `--kiosk-printing` imprime DIRECTO a la predeterminada, sin diálogo |

<!--2--> > **INFO:** Cada documento ofrece **solo los formatos que le sirven**: a los de papel no se les puede elegir una medida de etiqueta, y a la etiqueta no se le puede elegir A4. Elegir mal ahí solo podía terminar en papel tirado.

<!--3--> 📍 Sistema › Empresa · Sistema › Impresión (permiso config)


## TEMA ventas-curso — Ventas en curso  (2026-08-01)


<!--0--> Se pueden tener varias ventas abiertas a la vez, en pestañas: un cliente se va a buscar algo y vuelve, y su venta lo espera. Cerrar la pestaña **no descarta la venta**: queda en la tabla de ventas en curso.

<!--1--> Abrir una venta entra en modo **registradora**: pantalla completa, solo lo que necesita el cajero. Los borradores se guardan solos mientras se carga.


## TEMA listado-ventas — Ventas (el listado de lo vendido)  (2026-08-10)


<!--0--> La pantalla que responde **"¿qué se vendió?"**. Sección propia en el menú de Ventas, entre el Punto de venta y la Caja: se vende, se mira lo vendido, se cierra el turno. Antes de existir, la única lista de ventas del sistema estaba **escondida adentro del detalle de un cliente** (sus últimas 100) — no había forma de mirar el día ni de buscar un ticket viejo.

<!--1-->
| Pieza | Cómo funciona |
|---|---|
| **Abre en HOY** | Y de ahí a cualquier fecha con los atajos (Hoy · Ayer · Últimos 7 · Este mes · Todo) o los dos campos de fecha |
| **Las tarjetas** | Tickets, vendido, ticket promedio y descuentos — más **cómo se pagó** (por medio de pago) y **cuánto costaron las ofertas**. Son del **filtro completo**, no de la página que se ve: "vendí $X hoy" suma las 300 ventas del día, no las 20 visibles |
| **La plata no cuenta lo anulado** | Una anulada **sigue en la lista** (hay que poder auditarla) pero no suma en los totales; se informa aparte, en su propia tarjeta |
| **Filtros** | Fechas, sucursal, cajero, turno de caja, medio de pago, estado, cliente, origen (mostrador / nacida de un pedido), **solo con oferta**, y buscador por **número de ticket o nombre del cliente** |
| **Cada fila** | Comprobante y tipo, hora y turno, sucursal, cajero, cliente, renglones, medio de pago, descuento, **la oferta que se aplicó** (con su nombre al pasar el mouse), total y estado |
| **El ticket** | Clic en la fila: renglones con **la lista y la oferta congeladas al vender**, otros cargos, totales, cómo se pagó y —en cuenta corriente— cobrado y saldo |
| **Reimprimir** | Sale por el motor de impresión de Sistema, con el formato configurado (rollo 80 mm por defecto). Ahora el ticket dice el **nombre del producto**: antes la reimpresión imprimía "#12" porque el renglón no guarda el nombre |
| **Anular** (sin CAE) | Solo administración, y **solo si la venta NO tiene CAE**. Pide confirmación explicando las tres consecuencias: la mercadería **vuelve al stock** con su movimiento, deja de contar como plata vendida, y el comprobante **no se borra** (el número emitido no se recicla). Si tiene cobranzas imputadas, la API la rechaza: primero se anula el recibo |
| **Nota de crédito** (con CAE) | Reemplaza a Anular en cuanto la venta tiene CAE: para ARCA ese comprobante existe, y borrarlo acá haría que los dos sistemas dejen de coincidir. Ver la guía **"La nota de crédito"** acá abajo |
| **Notas de crédito** (tarjeta) | Cuando el filtro tiene notas, aparece su propia tarjeta con cuánto se acreditó. **"Vendido" ya viene neto**: las notas están restadas, y no cuentan como ticket |
| **Paginado de servidor** | La tabla de ventas crece para siempre: se piden 20 filas y el total viene aparte. Bajar 40.000 tickets para mostrar 20 es tráfico tirado |

<!--2--> > **INFO:** QUIÉN VE QUÉ. Administración (admin y superadmin) ve todas las sucursales y todos los filtros. El **cajero ve solo la sucursal donde está operando y solo las ventas de mostrador**: no hay selector de sucursal (un cartelito con su puesto), no está la columna Sucursal, y la consulta sale con la sucursal clavada — no es un adorno de la vista. Anular tampoco: la ve solo administración.

<!--3-->
- Los **tickets abiertos** (sin cobrar) NO están acá: viven en el Punto de venta, que es donde se retoman.
- **Descuento** incluye lo que descontaron las ofertas (por eso las dos cifras pueden coincidir): el renglón guarda el porcentaje y el importe de la promo por separado, y ambos suman al descuento del comprobante.
- **Exportar CSV** baja lo que se está viendo, con BOM y `;` para que Excel en español lo abra derecho.

<!--4--> 📍 Ventas › Ventas (permiso ventas.listado — sección propia, aparte de ventas.caja)


## TEMA nota-credito — La nota de crédito (deshacer una factura)  (2026-08-20)


<!--0--> Una factura con **CAE ya existe para ARCA**. Anularla en el sistema no la borra de allá: solo lograría que los dos libros dejen de coincidir, y el que queda mal parado en una inspección es el nuestro. La forma de deshacerla es **emitir otro comprobante que diga qué vuelve**, y eso es la nota de crédito.

<!--1--> > **INFO:** UNA PUERTA O LA OTRA, NUNCA LAS DOS. En el detalle de la venta aparece **"Nota de crédito"** si tiene CAE, y **"Anular"** si no lo tiene (ticket interno, o una factura que todavía no se emitió porque ARCA estaba caído). No es una preferencia de la pantalla: la API rechaza anular una venta con CAE aunque se la llame por afuera.

<!--2-->
| Lo que se elige | Por qué lo tenés que decir vos |
|---|---|
| **Toda la venta** o **algunos renglones** | Es el mismo circuito: la nota total es la que lleva todos los renglones completos. Si ya hubo una nota antes, "toda la venta" quiere decir **todo lo que queda**, no lo que decía la factura |
| **La mercadería vuelve al stock** | Viene tildado. **Destildalo si la nota es por un error de precio o de facturación**: ahí no volvió un gramo, y reingresarlo inventaría stock que no existe. Es la misma nota y una cosa distinta — el sistema no lo puede adivinar |
| **Devolver el efectivo por caja** | Viene apagado a propósito. Tildado, sale un **egreso del turno abierto** y le baja el efectivo esperado al arqueo. Hacerlo automático le descuadraría el cierre a quien no lo esperaba |
| **El motivo** (obligatorio) | Va **impreso en la nota** y queda guardado con tu nombre y la hora |

<!--3-->
- **El precio es el de la venta original, no el de hoy.** Si el producto aumentó la semana pasada, eso no es problema del cliente: la nota devuelve exactamente lo que se cobró.
- **Los otros cargos** (envío, packaging) solo viajan en la nota **total**: devolver medio envío no significa nada, y prorratearlo sería inventar un número. Y viajan **una sola vez**.
- **No se puede devolver lo mismo dos veces.** Cada renglón muestra cuánto ya volvió por notas anteriores y cuánto queda; la API lo revalida.
- **En cuenta corriente la nota BAJA la deuda** del comprobante que ajusta. No aparece como algo para cobrar, y no se le puede imputar un recibo — sería cobrarle al cliente su propia devolución.
- **La nota se imprime sola** al emitirse, con su letra, el comprobante asociado, el motivo y el IVA discriminado si es A. Se reimprime desde el listado como cualquier comprobante.
- **Una nota de crédito no se anula ni lleva otra nota**: si está mal, se corrige con una nota de débito (todavía no construida — está en Pendientes).

<!--4--> > **WARN:** ARCA NO TIENE "NOTA DE CRÉDITO" A SECAS: tiene una **por letra** —código 3 (A), 8 (B) y 13 (C)—, cada una con su numeración correlativa, y **la letra tiene que ser la misma que la de la factura que ajusta**. El sistema la deduce de la venta, no se elige. El comprobante viaja además con el **asociado declarado** (tipo, punto de venta y número de la factura): sin eso la nota queda huérfana en el libro de IVA.

<!--5--> > **INFO:** EL CENTAVO DEL REDONDEO. El IVA se redondea comprobante por comprobante, así que partir una factura en dos notas lo redondea dos veces y la suma puede quedar **$0,01 abajo** del total. Ese centavo no se puede acreditar: no hay mercadería que lo respalde y ARCA no toma una nota de un centavo. Por eso **lo que queda por acreditar se mide en mercadería, no en plata** — cuando no queda ni una unidad, el botón se apaga y la cuenta corriente perdona la diferencia en vez de dejar la factura pidiendo un centavo para siempre.

<!--6--> 📍 Ventas › Ventas › (una venta con CAE) › Nota de crédito — permiso devoluciones, el mismo que anular


## TEMA arca-facturar — Facturar con ARCA, paso a paso  (2026-08-20)


<!--0--> Dos cosas distintas: **la puesta en marcha**, que se hace una vez por servidor y es casi toda trámite; y **la operación**, que es apretar una tecla. Lo de abajo está en el orden real y probado el 20/8/2026 contra homologación, de punta a punta.

<!--1--> **A · La puesta en marcha** (una sola vez, y de nuevo para producción)

<!--2-->
1. **La carpeta de los certificados ANTES que nada.** Una carpeta del servidor FUERA de la parte pública y de lo que se actualiza con cada versión (por ejemplo `/home/usuario/arca/`), que solo pueda leer el usuario del servidor web. La clave privada tiene que vivir ahí: una clave generada dentro de la carpeta del sistema se pierde en la próxima actualización, en el medio del trámite.
2. **Las cinco variables**, en el `.env` de la API: `ARCA_ENV`, `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_CERT_PATH=/home/usuario/arca/arca.crt` y `ARCA_KEY_PATH=/home/usuario/arca/arca.key`. **Guardar el `.env` no aplica nada: hace falta `php artisan config:cache`.** Sin las dos rutas, los botones del certificado ni aparecen. `php artisan produccion:verificar` te dice si el certificado se lee.
3. **Generar clave y pedido**, en Ventas › Configuración. La clave privada se genera y se queda en el servidor: nunca pasa por el navegador. Lo que se copia es el pedido (`.csr`), que es público. Elegí bien el **alias** y la **razón social**: quedan adentro del certificado y no se cambian. Poné el entorno en el alias (`saboryaroma-homo`, `saboryaroma-prod`) porque vas a tener los dos en la misma cuenta.
4. **Subir el pedido a ARCA.** Homologación: **WSASS** › *Crear DN y certificado*. Producción: **Administración de Certificados Digitales**. Devuelven el `.crt` en el acto.
5. **AUTORIZAR EL DN AL SERVICIO `wsfe`.** Es un formulario APARTE (WSASS › *Crear autorización a servicio*): crear el DN **no** lo autoriza. Si falta, WSAA contesta **"Computador no autorizado a acceder al servicio"**, que no menciona la autorización por ningún lado y manda a sospechar del certificado. Solo hace falta `wsfe`.
6. **Pegar el `.crt` e instalar** (paso 3 de la pantalla). Antes de guardarlo se controla que sea de esa clave, de ese CUIT y que no esté vencido — los tres errores se manifiestan igual y así se sabe cuál es.
7. **Probar conexión** hasta que den los **tres ✔**. No emite nada: pregunta si ARCA responde, si el certificado autentica y el último número de cada punto de venta. **Sin los tres en verde no se sigue**, porque cualquier problema posterior va a parecer del código y es un trámite a medias.
8. **Los datos fiscales, en Sistema › Empresa**: CUIT, **razón social** y domicilio. No es opcional y no lo cubre ARCA: el CAE se pide con `ARCA_CUIT`, así que **una factura sin estos datos sale bien para ARCA y mal en el papel**. Si falta algo, el panel avisa.
9. **Un punto de venta por sucursal**, en Gerencia › Sucursales. Cada uno se declara ante ARCA contra un domicilio y lleva su numeración aparte. Son de **cinco dígitos**.

<!--3--> > **WARN:** CON EL CERTIFICADO DE HOMOLOGACIÓN PUESTO, EL INTERRUPTOR VA APAGADO. Prendido, las ventas reales consiguen CAE del ambiente de prueba: facturas sin ningún valor fiscal, guardadas en la base real como facturas legítimas — y **con CAE ya no se anulan**. Para probar alcanza con *Probar conexión*, que no emite nada. Si querés el circuito completo, hacé **una** venta y su nota de crédito, y apagá.

<!--4--> **B · Cómo se factura, todos los días**

<!--5--> Cargar el ticket → Cobrar (F2) → Facturar (F8) → CAE de ARCA → Imprimir

<!--6-->
| Qué | Cómo |
|---|---|
| **Facturar (F8) o Liquidar (F10)** | Es LA decisión del cobro. **F8 pide CAE** y emite el comprobante fiscal; **F10 saca ticket interno** y no toca ARCA. El que apura la caja aprieta F10 y después no hay factura |
| **La letra sale sola** | Condición de IVA de la empresa × condición del cliente. Responsable Inscripto contra Consumidor Final da **B**; contra otro Responsable Inscripto da **A**. No se elige a mano |
| **El punto de venta** | El de la **sucursal donde está la caja**, no uno global. Por eso cada local tiene el suyo |
| **El número** | Lo da ARCA (`FECompUltimoAutorizado + 1`), no el contador interno. Se reserva antes de emitir, así que una respuesta perdida no genera dos facturas: el reintento consulta ese número en vez de emitir de nuevo |
| **El papel** | **A discrimina el IVA y B no** — es la ley, no una preferencia. Van el CAE con su vencimiento, el QR de la RG 4892 y el domicilio **de la sucursal** |

<!--7--> > **INFO:** SI ARCA NO CONTESTA, LA VENTA NO SE CAE. Sale **ticket provisorio** con el motivo textual guardado, el cliente se lleva la mercadería, y queda en **Ventas › ⚠ Sin facturar** con su botón **Facturar**. El reintento es inocuo: no toca plata, stock ni turno, y si ARCA sigue caído lo dice y deja la venta donde estaba. Al lograrse, la venta **pasa a ser** la factura.

<!--8--> **C · Deshacer**

<!--9-->
| Situación | Qué se hace |
|---|---|
| La venta **tiene CAE** | **Nota de crédito** (total o parcial), desde la ficha de la venta. Anular es imposible: el comprobante ya existe para ARCA. La nota es otro comprobante, con su propio CAE y su propia numeración |
| La venta **no tiene CAE** | **Anular**, como siempre. Es un comprobante nuestro |
| Es una **nota de crédito** | No se anula ni se acredita: se corrige con una nota de débito (todavía no construida) |
| Los botones **no aparecen** | Están en el **pie de la ficha** de la venta, no en el listado. Y solo para rol `admin` o `superadmin` |

<!--10--> **D · Homologación y producción son dos mundos**

<!--11-->
- **Dos certificados**, cada uno con su trámite y su lugar (WSASS / Administración de Certificados Digitales). El de uno no sirve en el otro.
- **Dos numeraciones.** Lo emitido en homologación no cuenta para nada.
- **Cada máquina, su clave.** La de desarrollo no se copia al servidor: se hace el trámite de nuevo, que es gratis y evita mover un archivo secreto.
- **La clave no está en ningún respaldo** — ni en la descarga de Sistema › Respaldos ni en las copias automáticas: son copias de la base de datos, y el par `.key`/`.crt` vive aparte, en el servidor. Guardalo en otro lado. Perderlo no se restaura: se da de baja el certificado y se tramita otro. Las facturas ya emitidas no se pierden (el CAE vive en la venta).

<!--12--> 📍 Ventas › Configuración (permiso ventas.configuracion) · Sistema › Empresa · Gerencia › Sucursales


## TEMA arca-diagnostico — Diagnóstico de ARCA (¿puedo facturar?)  (2026-08-20)


<!--0--> Al pie de **Ventas › Configuración**. Contesta una sola pregunta —**¿puedo facturar?**— y, cuando la respuesta es no, cuál de las cinco cosas falta. Está pegado al interruptor de facturación electrónica a propósito: **el interruptor es la intención** (quiero facturar) y **el panel es la capacidad** (puedo). Prender una perilla sin forma de saber si hace algo no sirve de nada.

<!--1-->
| Lo que muestra | Para qué |
|---|---|
| **El entorno** | **PRODUCCIÓN en rojo** — es la única diferencia visible entre ensayar sin consecuencias y emitir facturas de verdad, y esa equivocación no se deshace. En homologación lo dice también, con todas las letras |
| **CUIT y punto de venta** | Los del CERTIFICADO, que salen del servidor. Si el CUIT no coincide con el de Sistema › Empresa, avisa: el papel y el comprobante estarían diciendo cosas distintas, y eso no lo nota nadie hasta que lo mira un inspector |
| **Qué falta** | Con nombre y apellido (`Falta ARCA_CUIT…`, `No existe el certificado en …`), no un "no disponible" pelado que manda a adivinar entre cinco causas |
| **Probar conexión** | Las tres preguntas del protocolo, **en orden y cortando en la primera que falla**. El corte ES el diagnóstico: ¿ARCA responde? → ¿el certificado autentica? → ¿el punto de venta está autorizado? |
| **Último número de ARCA** | Cuando la conexión anda: el correlativo de cada comprobante **según ARCA**, que es quien lleva la numeración fiscal. El próximo sale con el siguiente |
| **El trámite del certificado** | Tres pasos: **generar la clave y el pedido**, subir el pedido a ARCA, y **pegar el `.crt`** que devuelven. La clave privada se genera EN EL SERVIDOR y nunca pasa por la pantalla; nunca se pisa una que ya exista. Al instalar se controla que sea de tu clave, de tu CUIT y que esté vigente |
| **Los cinco puntos de venta** | Una fila por local con su número, su domicilio y su último número autorizado. Se cargan en **Gerencia › Usuarios y roles › Sucursales**; acá se ve si ARCA los reconoce |
| **Las ventas trabadas** | Las que salieron como ticket provisorio, con su motivo y su botón de **Facturar**, de la más vieja primero. La que lleva tres días es la urgente |

<!--2--> > **INFO:** LA PRIMERA PREGUNTA CORRE AUNQUE NO HAYA CERTIFICADO. "¿ARCA está vivo?" no lleva credenciales, así que es justo la que contesta si el problema es de ellos o nuestro — y saltearla por no tener el certificado cargado sería tapar la única respuesta que se podía dar en ese estado.

<!--3--> > **WARN:** SI RENOMBRÁS UN CERTIFICADO, VOLVÉ A ABRIR ESTA PANTALLA. El sistema recuerda si el archivo existe para no mirar el disco en cada venta; abrir el panel fuerza la relectura, sin reiniciar la API. Es la trampa clásica: Windows esconde las extensiones y el `.crt` que baja ARCA suele quedar como `algo.crt.crt`.

<!--4-->
- **Probar conexión puede tardar diez segundos**, y es normal: eso es lo que cuesta pedirle un ticket de acceso nuevo a ARCA. Por eso lo dispara el botón y no la carga de la pantalla.
- **Reintentar Facturar es inocuo**: no toca plata, stock ni turno. Si ARCA sigue caído, dice por qué y la venta queda donde estaba.
- **Sin CAE no hay factura**: si el reintento no consigue el CAE, la venta se queda pendiente. Nunca se convierte en una factura que ARCA no autorizó.
- Las cinco variables (`ARCA_ENV`, `ARCA_CUIT`, `ARCA_PTO_VTA`, `ARCA_CERT_PATH`, `ARCA_KEY_PATH`) se configuran **en el servidor**, no en una pantalla: el CUIT tiene que ser el del certificado y ARCA compara.
- **`ARCA_PTO_VTA` es el punto de venta "de la casa"**: lo usa la sucursal que no tenga el suyo cargado. Con un solo local eso es lo correcto y no hay nada que cargar; con varios, el panel marca en rojo a los que estén cayendo ahí, porque sus facturas saldrían por la boca de expendio de otro domicilio.

<!--5--> 📍 Ventas › Configuración › Facturación electrónica — diagnóstico (permiso ventas.configuracion)


## TEMA atajos — Atajos de teclado  (2026-08-01)


<!--0-->
| Tecla | Qué hace |
|---|---|
| F2 | Cobrar |
| F4 | Volver al buscador |
| Ins | Carga rápida de producto |
| Shift + Ins | Búsqueda de productos (categoría / marca / producto) — stock de TU sucursal y precio por lista |
| Esc | Salir de la registradora a la lista (guardando) |
| F10 | Liquidar — ticket interno, al contado |
| F8 | Facturar — comprobante fiscal |
| Alt + F5 | Cambios de precio — **desde cualquier pantalla del sistema** |
| Alt + F3 | Existencias por sucursal — **desde cualquier pantalla del sistema** |

<!--1--> > **INFO:** Los dos últimos son **globales**: andan en Compras, Almacén, Ventas y el Inicio. Volver a apretar el mismo atajo cierra la consulta. Viven en el layout y no en un módulo, porque un atajo global no tiene ninguna ruta de la cual colgarse.

<!--2--> Las dos consultas comparten estructura: **filtros arriba, grilla con scroll propio, pie abajo**. Los filtros y los encabezados no se van nunca de la vista, que es lo que permite recorrer cientos de filas sin perder de vista qué columna es cuál. Los encabezados van en dos niveles (Producto / Stock / Precios) porque ocho columnas de números seguidas son indistinguibles.

<!--3-->
| Consulta | Filtros | Columnas |
|---|---|---|
| **Existencias** (Alt+F3) | búsqueda, proveedor, categoría, marca, solo con stock | código · producto · una por sucursal · **total** · mostrador · otras listas |
| **Cambios de precio** (Alt+F5) | búsqueda, marca, lista, motivo, desde | producto · lista · antes → después · variación · fecha — el **motivo** se filtra arriba pero ya no tiene columna (15/8/2026): era la más ancha para un dato que se mira poco. Sigue disponible al pasar el mouse por la fecha |

<!--4--> > **INFO:** Esc es escalonado: con un modal abierto, ese Esc es del modal; con texto en el buscador, lo limpia. Recién sin nada de eso sale de la registradora.

<!--5--> > **OK:** **LA BÚSQUEDA DE PRODUCTOS MUESTRA TU SUCURSAL (18/8/2026, pedido tuyo).** El Shift+Ins traía una columna de stock por CADA sucursal: seis columnas que empujaban el precio fuera de la pantalla, y que además invitan a prometer mercadería que está en otro local. Ahora sale **una sola: la de la caja con la que entraste** (Fontana ve Fontana). Las columnas de precio quedaron **agrupadas por modalidad: primero Minorista, después Mayorista**, y adentro de cada una por número de lista. El orden sale de la configuración —el mismo `orden` que ordena las modalidades en Formato de Venta—, así que una modalidad nueva entra sola en su lugar sin tocar código.


## TEMA cierre — Cerrar la venta  (2026-08-14 22:00)


<!--0-->
| Forma | Comprobante | Condición |
|---|---|---|
| Liquidar (F10) | Ticket interno | Siempre contado |
| Facturar (F8) | Fiscal — la letra la resuelve el backend | Admite cuenta corriente |

<!--1--> El modal de cobro está pensado para la velocidad de la caja: el total grande, y el foco entra directo en **"Con cuánto paga"** — se tipea lo que entrega el cliente, el **vuelto** salta a la vista y **Enter cobra** (vacío = pagó justo). El selector Contado/Cta. Cte. solo aparece si **ese cliente** tiene cuenta corriente habilitada; si no, toda venta es al contado y no hay nada que elegir.

<!--2--> Admite **pago mixto**: mitad efectivo y mitad transferencia. La letra del comprobante sale de cruzar la condición de IVA del cliente con la de la empresa.

<!--3--> Cobrado el ticket, el modal ofrece **imprimir** y **Nuevo ticket**. Ese botón abre **otra venta en el mismo punto de venta**, con el foco en el buscador y listo para cargar — no vuelve a la pantalla de Caja. Es el movimiento de una caja con cola: se cobra, se entrega, se arranca el siguiente sin pasar por ningún lado.

<!--4--> > **INFO:** La caja pide turno abierto si está configurado así. El turno que manda lo resuelve el backend por sucursal: el que informa la pantalla es una sugerencia, no una orden.


## TEMA arqueo-caja — Arqueo de caja  (2026-08-26)


<!--0--> El efectivo del cajón se controla en TRES momentos: al abrir (fondo), durante el turno (controles) y al cerrar (arqueo final). El "esperado" siempre se calcula en vivo: fondo inicial + efectivo cobrado + ingresos − egresos.

<!--1-->
| Momento | Qué pasa |
|---|---|
| **Apertura** | El fondo inicial es **obligatorio y mayor a cero**: sin punto de partida declarado no hay arqueo posible, así que el turno no se abre |
| **Control de caja** (durante el turno) | Se cuenta el efectivo SIN cerrar nada: queda registrado con **fecha, hora, esperado, contado, diferencia y quién contó**. Si hay diferencia, la observación es obligatoria. Se pueden hacer todos los que hagan falta; el turno sigue abierto |
| **Cierre** | El arqueo final: se cuenta el efectivo, la diferencia (contado − sistema) se guarda tal cual — incluso negativa — y el turno queda **cerrado definitivo**, sin reapertura. Los totales por medio quedan como foto |

<!--2--> > **OK:** Los controles intermedios sirven para achicar la ventana del problema: un faltante detectado a las 14:00 se investiga sobre 3 horas de ventas, no sobre el día entero. El historial completo se ve en el detalle de cada turno (Ventas › Caja, clic en la fila).

<!--3--> Para contar sin calculadora, abajo de "Efectivo contado" (en el control y en el cierre) está **"🧮 Contar billetes"**: las 17 denominaciones de $0,05 a $20.000, se tipea la cantidad de cada una (Enter baja al siguiente renglón), el total se calcula solo y "Usar este total" lo deja puesto en el campo. El conteo no se guarda — es la ayuda para llenar bien el número que sí queda en el arqueo.

<!--4--> 📍 Ventas › Caja — el turno de tu sucursal arriba (abrir, movimientos, pagar a proveedor, control, cierre) y el historial de arqueos abajo. El punto de venta solo muestra el estado del turno.


# SECCIÓN inventario — Stock e inventario
_El modelo de existencias y los movimientos._



## TEMA producto-ciclo-vida — El producto que ya no se trae: dar de baja, no borrar  (2026-08-10 12:15)


<!--0--> Hasta el 10/8/2026 el producto solo tenía **Eliminar**, y era borrado real: el sistema cumplía su propio principio ("lo que está en uso se desactiva, no se borra") con las marcas, las categorías, las listas, las ofertas, los clientes y los usuarios — pero no con el producto, que es el que más historia acumula. Ahora tiene ciclo de vida, y son **DOS decisiones distintas**, no un interruptor.

<!--1-->
| Estado | Compras | POS y web | Para qué es |
|---|---|---|---|
| **Activo** | Aparece | Aparece | Todo normal. |
| **Discontinuado** | **No aparece** (ni en la carga de facturas ni en la reposición por stock mínimo) | **Sigue vendiéndose** | El caso más común: el proveedor lo bajó o se decidió no reponerlo, pero lo que quedó en góndola se termina de vender. Apagar todo de golpe sería tirar esa plata. |
| **Archivado** | No | **No** (tampoco control de vencimientos) | Fuera de catálogo. Exige que NO quede stock: si queda, el sistema dice cuánto y dónde, y ofrece dejarlo discontinuado. |

<!--2--> **Volver es un clic.** "Reactivar" conserva TODO: los códigos, el historial de precios, las presentaciones, los formatos de compra de cada proveedor, cuántas veces venció. Con el borrado viejo, volver a traer un producto significaba crearlo de nuevo a mano y **perder la historia que justamente sirve para decidir si conviene traerlo**. Al reactivar, el modal avisa de cuándo es el último costo cargado: el precio de venta se calcula con ese número hasta que entre la primera compra nueva.

<!--3-->
1. **Dar de baja.** En Compras › Productos, botón **Dar de baja** en la fila. El modal explica las dos opciones (no hay que adivinar la diferencia), pide un motivo que queda anotado, y muestra el stock que todavía hay y en qué sucursal.
2. **Verlos y reactivarlos.** El listado muestra por defecto lo que **está en juego** (activos + discontinuados) con un chip en los que no están activos; el filtro de estado llega a los archivados, que es el camino para reactivar uno.
3. **Eliminar de verdad** quedó como excepción: solo si el producto NO dejó ninguna huella (un duplicado del importador, un alta con el dedo). Si ya se compró, vendió o movió, el sistema dice **cuál es la huella** ("2 ventas, 1 movimiento de stock") en lugar del error crudo de la base, y ofrece la baja.

<!--4--> **¿Y cuando se vende la última unidad, se archiva solo?** No, y la decisión es deliberada — **archivar lo propone el sistema, no lo hace solo; volver a abrir sí es automático**. La asimetría es la clave: archivar CIERRA puertas y por eso lo decide una persona; reabrir las ABRE, y no hacerlo dejaría plata inmovilizada esperando que alguien se acuerde.

<!--5-->
| Momento | Qué hace el sistema | Por qué así |
|---|---|---|
| **Se agotó un discontinuado** | Lo **sugiere** en Compras › Productos: "2 productos discontinuados se agotaron — archivarlos", con un botón que los archiva de una (revalidando cada uno). | Archivar en el acto de vender la última unidad rompería al cajero: el catálogo del POS se carga **al abrir la caja**, así que un ticket ya armado daría "está archivado" sobre algo que estaba en pantalla. Y una devolución o la anulación de ese mismo ticket devuelve el stock. |
| **Espera 30 días** sin movimiento | Recién agotado no lo sugiere. | Los primeros días una devolución es probable; sugerir archivar el mismo día es ruido. |
| **Reaparece stock** de un archivado | Vuelve **solo** a *discontinuado*, con el motivo "Volvió a haber stock…" anotado. | "Archivado con stock" es un estado imposible: mercadería que existe y que el sistema no deja vender. Vuelve a *discontinuado* y no a *activo* porque que aparezca una unidad no significa que se haya vuelto a comprar. |

<!--6--> > **INFO:** El **cierre de caja no tiene nada que ver**: no toca el stock, solo cuenta la plata. El stock baja al **confirmar cada venta**, en su transacción. Por eso, si el archivado fuera automático, ocurriría en medio del turno — otra razón para que sea una sugerencia. La sugerencia ignora el stock **en tránsito** (lo que está arriba de un camión va a llegar a algún lado) pero sí sugiere los que solo tienen stock vencido o defectuoso, porque esa mercadería ya no se vende.

<!--7--> > **INFO:** Tres claves foráneas dejaron de ser `cascade` y pasaron a `restrict` (migración 0051): **stock, renglones de transferencias e incidencias**. Antes, borrar un producto hacía desaparecer en silencio sus existencias y mutilaba remitos viejos; ahora la base misma lo impide. El borrado legítimo limpia solo las filas de stock en CERO, que no son información. El "reabrir automático" vive en el corazón del inventario (`addDelta`), que es el único lugar por donde pasa TODO aumento de stock: así ningún camino nuevo se lo puede olvidar.

<!--8--> > **WARN:** Los candados están en la API, no solo en las pantallas: la venta rechaza lo archivado incluso en un borrador armado antes (el catálogo del POS se cachea al abrir la caja), la factura de compra rechaza lo discontinuado y lo archivado, y el importador de catálogo **no revive un archivado en silencio** — lo saltea avisando "hay que reactivarlo". El estado NO se cambia editando el producto: tiene su propia acción, así no se modifica de costado sin que nadie lo decida.

<!--9--> 📍 Compras › Productos › Dar de baja / Reactivar · filtro de estado · el aviso de "se agotaron" arriba del listado · migración 0051


## TEMA vencimientos-vigia — Vencimientos: el vigía de fechas (la app externa se volvió módulo)  (2026-08-10 22:00)


<!--0--> La app externa de vencimientos (PHP en Hostinger) se **reconstruyó adentro del sistema** como Almacén › Vencimientos: la LÓGICA vino de allá, el DATO es 100% de acá — catálogo, sucursales (incluida **Fontana**, dada de alta con la migración 0050), costos reales y usuarios. El corazón del modelo: **el registro de vencimiento NO es stock, es un vigía**. "6 unidades de X vencen el 15/9 en Express 2" se anota caminando la góndola, el sistema avisa a tiempo, y el stock se toca recién cuando algo venció y se procesa. Es la versión SIN lote de los vencimientos que el modelo original descartó (aquéllos eran por lote).

<!--1-->
| Pestaña | Qué hace |
|---|---|
| **Panel** | Las alertas por rango **EXCLUYENTE** — vencidos sin procesar / 0-7 / 8-15 / 16-30 días — con plata al costo congelado. Un registro vive en UNA tarjeta, jamás en dos. Clic en la tarjeta = ir filtrado a Registros. Los días se calculan SIEMPRE contra el calendario argentino, nunca contra el reloj UTC del server (a la noche UTC ya es "mañana" y adelantaría los vencidos un día). |
| **Control** | La sesión de góndola, en el ORDEN FÍSICO del acto: **1· el producto** (botón 📷 **Escanear** con la cámara del celular, lector USB, o buscándolo por nombre/código/barras — también el de las presentaciones fraccionadas) → **2· la fecha** impresa en el paquete → **3· cuántos hay** → Agregar. El producto elegido queda a la vista ("en la mano") con su código de barras, y **la fecha y la cantidad se conservan** al agregar: cuando toda una tanda vence igual, el siguiente es escanear y agregar, nada más. Enter en fecha, cantidad u observaciones también agrega. Todo cae a una lista editable que se guarda de un saque; mismo producto + misma fecha se suman. La fecha pasada avisa pero DEJA: es la forma de asentar lo encontrado tarde. Cada control queda en el historial con usuario y sucursal. |
| **Registros** | Todo lo anotado con chips por rango, filtros y exportación CSV. El **costo viaja CONGELADO** al registrar: la pérdida de marzo no cambia en julio porque subió el catálogo. Editar no re-valúa. El botón **"Oferta"** lleva al motor de ofertas de Ventas con el formulario ya lleno (ver abajo). |
| **Ofertas** | El **cruce con Ventas**: qué mercadería vigilada está —o debería estar— en oferta, y qué se desalineó. No mira solo las ofertas nacidas acá: resuelve el alcance REAL de cada oferta (producto, marca, categoría, etiqueta, componentes de un combo) contra los registros abiertos, así también aparece la promo que alguien armó en Ventas sobre algo que además está por vencer. Filtros por aviso y por sucursal, exportación CSV, y el globito rojo de la pestaña cuenta lo URGENTE. |
| **Vencidos** | El cierre del ciclo: procesar = contar cuántas se **vendieron antes de vencer** y cuántas se tiran. Separa pérdida ESTIMADA (todo lo registrado) de pérdida **REAL** (lo que de verdad se perdió). Con "bajar del stock" tildado genera el movimiento «vencido» (disponible → estado vencido) EN LA MISMA transacción: o pasa todo, o no pasó nada — sin stock suficiente, no procesa ni a medias. Dos personas procesando lo mismo: una sola gana (FOR UPDATE). Lo procesado no se edita ni se borra: es pérdida asentada. |
| **Mermas** | La baja de siempre (merma / vencido / defectuoso) **se mudó acá**: registrar abre el modal de movimiento con el producto precargado, y el listado muestra todas las bajas con su costo congelado y su origen ("De vencimiento" si nació de procesar). El modal existía registrado pero SIN botón que lo abriera — quedó huérfano en alguna refactor; ahora tiene casa. |
| **Reportes** | General (estimada + real + mermas), por sucursal, por categoría, **los que MÁS vencen** (la señal para comprar distinto), historial mensual y controles hechos con usuario. Períodos semana/mes/trimestre/año. Los movimientos nacidos de procesar NO cuentan como merma suelta: sumarían la misma pérdida dos veces. |

<!--2--> **"Oferta" NO abre un mini-formulario propio: lleva al MOTOR de ofertas con todo cargado** (10/8/2026). En el sistema hay **un solo lugar para crear una oferta** —Ventas › Ofertas, con sus siete mecánicas y su vista previa que corre el motor real sobre un ticket de ejemplo— y el vencimiento aporta el CONTEXTO, no un motor paralelo. El botón abre "Nueva oferta" ya con: el **producto** en el alcance, la **fecha de fin = el día que vence** (así el descuento nunca sobrevive a la mercadería), la **sucursal del lote** (rematar donde no está el lote es regalar margen), 25% propuesto y una ficha arriba que dice cuántas unidades son, dónde y **cuánta plata se pierde** si no se venden. Todo se puede cambiar antes de crear. Al crearla, la oferta **queda atada al registro** ("🏷 En oferta"); un registro se ata a UNA sola. Ojo: el alcance es el producto COMPLETO — si tiene presentaciones fraccionadas a la venta, entran mientras dure.

<!--3--> **El vínculo no puede mentir.** Si la oferta que se creó no alcanza al producto del registro (porque se le cambió el alcance en el formulario), la API **rechaza el vínculo** y lo dice: la oferta se creó igual —es válida— pero el registro no va a figurar "en oferta" cuando en la caja no descuenta nada. Y de paso, el formulario de ofertas ganó el **selector de sucursales** que le faltaba: el dato existía y se mostraba en la tabla, pero no había forma de elegirlo, así que toda oferta nacía "en todas".

<!--4-->
| Aviso del cruce | Qué pasó y qué hacer |
|---|---|
| 🔴 **Mercadería vencida con la oferta corriendo** | Lo más caro que puede estar pasando: la caja vende con **descuento** algo que **ya venció**. Aparece arriba del Panel con la plata en góndola, con globito en la pestaña, y **también en Ventas › Ofertas** — que es donde se apaga. Apagar la oferta + procesar el registro. |
| 🟡 **La oferta ya no alcanza al producto** | Estaba atada y alguien le cambió el alcance: el registro dice "en oferta" y la caja no descuenta. Corregir el alcance o desatar. |
| 🟡 **La oferta no corre en esa sucursal** | La promo está viva pero no en el local donde está el lote. |
| 🟡 **Apagada / terminada / arranca después** | La oferta que se armó para este lote ya no está descontando y la mercadería todavía no venció: hay tiempo, pero sin descuento no se va a ir. |
| 🔵 **La oferta corta antes de la fecha** | Termina antes de que venza el paquete: quedan días de mercadería a precio lleno. |
| 🟡 **Venció y la oferta ya no descuenta** | Se apagó o terminó a tiempo, así que no hay nada regalándose — pero el registro sigue abierto: retirar y procesar. (Decir "todo en orden" al lado de "venció hace 3 días" sería absurdo.) |

<!--5--> > **INFO:** La lista de la pestaña Ofertas es honesta a propósito: una fila existe solo si la oferta está **atada** al registro (ahí cualquier desajuste es la noticia) o si está **descontando de verdad** ese lote (vigente + alcanza + cubre la sucursal). Una promo apagada, o que corre solo en otro local, no es "el producto en oferta" — mostrarla llenaría la pantalla de filas «todo en orden» que no descuentan nada. Y lo **procesado** sale de la lista: ya es historia.

<!--6--> **Escanear con la cámara del celular** (10/8/2026): el botón 📷 abre la cámara trasera y agrega el producto al leer el código — con bip y vibración, porque caminando la góndola nadie mira la pantalla. Usa `BarcodeDetector`, la API nativa, cuando existe (**Chrome de Android sí la tiene**, y Android es donde se escanea); si no, cae a **ZXing** por *import dinámico*: son ~450 KB que se descargan SOLO al abrir la cámara la primera vez, así el arranque de la app no engorda. Lee EAN-13, EAN-8, UPC-A/E, Code-128, Code-39 e ITF. No escanea de continuo a lo bruto: mira un frame cada ~120 ms (más rápido calienta el teléfono sin leer mejor), corta al primer acierto y **apaga la cámara en el acto**.

<!--7--> > **WARN:** **La cámara solo funciona en "contexto seguro": HTTPS o localhost.** Entrando desde el celular por `http://192.168.0.x:3000` el navegador la bloquea sin explicar nada — por eso la pantalla lo detecta ANTES y lo dice. Para usarla en la red local hay que levantar el front con **`npm run dev:https`** (imprime la dirección `https://…` a la que entrar; el celular avisa que el certificado no es de confianza → Avanzado → Continuar, una sola vez). En producción, con el dominio y su HTTPS, no hace falta nada. El lector USB y la búsqueda por nombre funcionan siempre, con o sin HTTPS.

<!--8--> > **WARN:** Lo que se decidió al importar la app y NO se rediscute: el catálogo es SOLO el del sistema (de la app vieja no vino ni un dato — arrancó de cero); no hay productos manuales; el endpoint de BI externo no se replicó; la sección es permiso propio (`almacen.vencimientos`, migración 0050 a admin/superadmin) así se le puede dar a un empleado por local sin abrirle el resto del Almacén. El globito del menú cuenta lo que APURA: vencidos sin procesar + vence en ≤7 días.

<!--9--> 📍 Almacén › Vencimientos (permiso almacen.vencimientos) · pestañas Panel / Control / Registros / Ofertas / Vencidos / Mermas / Reportes · la oferta se crea en Ventas › Ofertas (permiso ventas.ofertas: sin él el botón no aparece) · migración 0050 (tablas, Fontana, costo congelado en movimientos) · cámara: npm run dev:https en la red local


## TEMA fraccionado-pantalla-propia — El fraccionado tiene pantalla propia (y la madre dice la verdad total)  (2026-08-10 22:00)


<!--0--> Construido el 9/8/2026, con la lógica que definió el dueño: **el fraccionado muestra lo suyo y la madre cuenta la verdad total**. Si hay 5 kg de ajo sueltos y 10 paquetes de 500 g ya fraccionados, el Ajo X500G muestra sus 10 unidades, y la madre muestra "5 kg suelto + 5 kg fraccionado = **10 kg en total**" — que es la respuesta a "¿cuánto ajo hay?". Comprar mirando solo el suelto compra de más.

<!--1-->
| Qué | Cómo quedó |
|---|---|
| **Fila propia en el listado** | Compras › Productos lista cada fraccionado debajo de su madre ("↳ Lentejas · 500 g", badge Fraccionado) con su stock en paquetes. Se busca también por el código de barras de la etiqueta del paquete. Clic abre su pantalla propia. |
| **La pantalla propia** | Tres pestañas. **Resumen**: tamaño, código de barras, costo del paquete (derivado), precio de venta, su formato de venta por lista, stock por sucursal (paquetes y equivalente en kg) y los movimientos DE ESE fraccionado. **Formato de venta** (editable, 10/8): el precio del paquete, que es propio. **Producto madre**: el "Prod.Util" del sistema viejo — de qué producto descuenta, cuánto consume por paquete (tamKg) y a qué costo sale. Más el desglose: suelto + este fraccionado + todas las presentaciones = TOTAL equivalente. |
| **El costo es de SOLO LECTURA, el precio es PROPIO** | Ésa es la división. El **costo** se deriva de la madre (costo/kg × tamaño) porque lo pone el proveedor: si fuera editable, el costo del paquete y el de la madre divergirían — el vicio del sistema viejo que obligó a revisar 24 precios al importar Bavosi. El **precio** se decide en la ficha del paquete, con la misma libertad que un producto. |
| **"Solo para fraccionar"** (el "SOLO STOCK" del viejo) | Tilde en la ficha del granel que no se vende suelto (la pimienta de Jamaica: llega 1 kg y se fracciona entera en 20×50 g). El POS no lo ofrece por kg, y la venta suelta se **rechaza en la API** (hasta en borrador) — sus paquetes se venden normal. |
| **Borrar una presentación con stock se rechaza** | Esos paquetes existen en el depósito: borrar el renglón los haría desaparecer del sistema. Primero se venden o se ajustan. |
| **El código de barras se pide EAN-13** (10/8/2026) | El campo de la pestaña Presentaciones exige un **EAN-13 válido** —13 dígitos con el verificador cerrando— en todo código que nace o se edita, y avisa al lado del renglón qué le pasa a cada uno. Al lado tiene un botón **Generar**: da un código propio de la serie interna, libre y sin repetir. Una presentación nueva **no puede nacer sin código** (sería un paquete que la caja no puede escanear); vaciarle el código a una que ya existe SÍ se puede, es la forma de sacar uno malo. |
| **El paquete se vende SOLO** (10/8/2026, migración 0053) | El paquete tiene **formato de venta propio**: su markup o su precio fijo, su caja por N paquetes, su mínimo de unidades y su código, igual que un producto. El `recargo` que había —un solo número que multiplicaba el precio de la lista de la madre— **se borró**. La pestaña Presentaciones de la madre quedó para lo que es suyo: el **tamaño** (cuánto granel consume cada paquete), el código y el link a la ficha. |
| **Los paquetes y su stock, debajo del granel** (11/8/2026) | La pestaña *Fraccionar* muestra abajo **solo los fraccionados** —código, producto, tamaño y marca— con **una columna por sucursal** y el total. La madre ya está arriba con su granel, así que no se repite. El cero se atenúa a propósito: lo que hay tiene que saltar a la vista. |
| **Corregir una tanda mal cargada** (11/8/2026) | Botón **Corregir** en cada paquete: "puse 20 y son 19". La corrección **mueve las dos puntas** — da de baja el paquete y **devuelve los kilos al granel** — porque el fraccionamiento no crea ni destruye mercadería: la convierte. Si solo se editaran los paquetes, los kilos totales del producto cambiarían de la nada. El modal muestra la cuenta en vivo ("0,5 kg vuelven al granel, que quedaría en 10,5 kg") y no deja fabricar paquetes sin granel para respaldarlos. Toca solo el **disponible**: lo comprometido está apartado para un envío confirmado. |
| **Dos códigos que no son el mismo** | El **código del paquete** es el de su etiqueta y se carga una vez, en Presentaciones de la madre. El **código de una fila del formato de venta** es otra cosa: el de la **caja de N paquetes**, para que escanearla cargue las N de una. Por eso ese campo solo se habilita cuando "Vende por" es mayor a 1 — con 1 sería un segundo código para el mismo artículo y el escáner de la caja se quedaría sin desempate. La ficha del paquete muestra arriba cuál es su código, para no volver a cargarlo abajo. Y a la caja no se le pide EAN-13: suele venir con un **DUN-14**, que tiene 14 dígitos y es igual de legítimo. |

<!--2--> > **WARN:** El motivo del cambio se veía en pantalla: **73 de las 103 madres con fraccionados no tienen listas de venta**, y como el precio del paquete se derivaba de la madre, esos paquetes no tenían precio de verdad — el cálculo se caía al costo neto y había paquetes cotizando **por debajo del costo** (la Nuez Pecán de 250 g: precio $4.266,94 contra un costo de $4.267,13). Ahora el paquete se cotiza solo y la madre puede no tener ninguna lista. Los **238 paquetes arrancaron sin precio** (decisión del dueño): un paquete sin formato de venta **no vale cero, no tiene precio** — la caja lo muestra pero no lo deja cargar, la etiqueta sale sin precio avisando, y Almacén › Fraccionamiento tiene el contador **"N sin precio"** con la lista de lo que falta y el atajo para cargarlo.

<!--3--> > **INFO:** Por qué el verificador y no "cualquier número": es lo único que hace que un dígito mal tipeado NO produzca otro código válido — el lector se da cuenta en vez de cargar otro producto. Los **71 códigos heredados** del sistema viejo que no cumplen (13 con el verificador mal, 58 más cortos) **pasan igual mientras no se los toque**: si se rechazaran, esas presentaciones no podrían guardar ni un cambio de tamaño. Se muestran en amarillo y se arreglan de a uno con Generar. Y el duplicado se frena por las **tres** puertas donde vive un código: el producto, la presentación y el **formato de venta** (el EAN de la caja) — las tres se escanean en la misma caja, y el único de la base no puede verlo porque es por tabla.

<!--4--> > **WARN:** **Bug grave encontrado y corregido al construir esto**: guardar la pestaña Presentaciones hacía borrar-todo-y-reinsertar, y como el stock cascadea por `presentacionId`, CADA guardado **borraba el stock de todos los fraccionados en silencio** — aunque no se hubiera sacado ninguna presentación. Ahora actualiza por id (misma lección que los formatos de compra y su historial): los ids sobreviven al guardado y el stock queda donde estaba. Verificado: guardar conserva ids y stock intactos.

<!--5--> > **INFO:** **Un granel sin tamaños definidos no se puede fraccionar**, y son más de los que parece: al 15/8/2026, **62 de los 164 granel activos**. Es lo primero que hay que cargar —el sistema no sabe de cuántos kilos es cada paquete—, así que Almacén › Fraccionamiento lo marca **en la fila** ("sin tamaños de paquete definidos") y, si se abre igual, el modal dice qué falta y dónde se carga en vez de mostrar una lista de paquetes vacía.

<!--6--> 📍 Compras › Productos (filas ↳) · clic en el fraccionado › Resumen / Producto madre · ficha del producto › tilde "Solo para fraccionar" · pestaña Presentaciones para los tamaños


## TEMA modelo — Modelo sin lote  (2026-07-30)


<!--0--> El stock se identifica por **Producto × Sucursal × Presentación × Estado**. No hay lote: se evaluó y agrega una dimensión que el negocio no usa para decidir nada.

<!--1-->
| Estado | Significa |
|---|---|
| disponible | Se puede vender |
| comprometido | Reservado (presupuesto, si está configurado) |
| retenido | Apartado por una revisión |
| defectuoso | Roto o fallado |
| vencido | Fuera de fecha |


## TEMA movimientos — Movimientos  (2026-08-27)


<!--0--> Registro **inmutable**: nada se edita ni se borra, se corrige con un movimiento opuesto. Es lo que permite explicar cualquier saldo. Se mira en **dos lugares con la misma pantalla**: Compras › Historial y la pestaña **Movimientos** de Almacén › Existencias (la foto y su película juntas; el botón "Movs." de cada fila abre la pestaña ya filtrada por ese producto y sucursal). Cada fila dice cuándo, qué, dónde, **por qué** (el documento o motivo que la generó), cuánto valió si fue una pérdida (a costo congelado) y **quién**.

<!--1-->
- compra · fraccionamiento · venta (granel y fraccionada) · devolución
- ajuste · merma · vencido · defectuoso · transferencia

<!--2--> > **WARN:** Los movimientos y los comprobantes **no viajan** en la carga inicial. Crecen sin techo, y meterlos ahí hacía que el sistema se pusiera más lento cada mes. Se piden paginados desde la pantalla que los muestra.


## TEMA fraccionamiento — Fraccionamiento (y las etiquetas de los paquetes)  (2026-08-10)


<!--0--> La pantalla tiene **dos pestañas, y la separación es a propósito**: **Fraccionar** convierte granel en presentaciones (baja kilos, sube paquetes, en un solo movimiento) y **Etiquetas** solamente imprime. Vive en Almacén porque es una operación de depósito, no de compra.

<!--1--> > **OK:** **Sacar etiquetas NO mueve stock** (10/8/2026, decisión del dueño). Se imprimen las que se necesiten, todas las veces que hagan falta: la que sale corrida se tira y no pasó nada. Si imprimir descontara, cada etiqueta arruinada, cada prueba y cada rollo mal cargado dejarían el inventario mintiendo — y el inventario es lo único que no se puede recuperar mirando el depósito.

<!--2--> Cómo es el trabajo de verdad: los chicos reciben el pedido (la lista **Fraccionados** del envío), fraccionan, **sacan las etiquetas**, las pegan, y recién ahí se asienta en el sistema y se despacha. Los días sin pedidos se fracciona para la Distribuidora o para stockear. Las dos pestañas acompañan eso sin obligar a ningún orden: la etiqueta no espera al asiento y el asiento no espera a la etiqueta.

<!--3-->
| En Etiquetas | Qué hace |
|---|---|
| **Buscador** | Lista los **fraccionados** del catálogo (cada presentación de un granel activo), buscables por nombre, marca o código de barras. Un granel sin presentaciones no aparece: no hay etiqueta que sacarle |
| **Cantidad** | Cuántas etiquetas salen, una por paquete armado. Hasta 500 por impresión: un cero de más no puede vaciar el rollo |
| **Fecha de vencimiento** | Sale impresa como "Vto 15/09/2026". Vacía, la etiqueta sale sin fecha (hay productos que no la llevan) |
| **Precio** | NO se tipea: sale del catálogo, de la **lista base** (Mostrador) y con **IVA incluido** — el mismo número que cobra la caja. Un precio escrito a mano en la etiqueta es un precio que en dos semanas discute con el POS |
| **Vista previa** | El **mismo HTML** que va a la impresora, en el tamaño real de la etiqueta. Lo que se ve es lo que sale |

<!--4--> La etiqueta lleva **nombre, peso, precio, código de barras y vencimiento**. Es interna (precio y código para la caja), no un rótulo legal: si algún día tiene que cumplir el rótulo del fraccionado, faltan **lote, RNE/RNPA y razón social**, y eso es otra vuelta.

<!--5--> > **WARN:** El código de barras se dibuja **EAN-13** cuando el código de la presentación tiene 13 dígitos y el verificador cierra; cualquier otro (7, 9 u 11 dígitos, con letras, o de 13 con el dígito mal) se dibuja en **Code 39**, que escanea los mismos caracteres pero ocupa mucho más ancho y algunos lectores baratos lo traen apagado. La pantalla lo avisa en los dos casos, y también **avisa si el código quedó demasiado fino** para la etiqueta configurada (abajo de 0,25 mm por barra una térmica empieza a fallar): ahí conviene una etiqueta más ancha o corregir el código a EAN-13 en el producto madre. Antes de tirar una tanda larga, pasale el lector a UNA etiqueta.

<!--6--> 📍 Almacén › Fraccionamiento › pestañas Fraccionar / Etiquetas · el tamaño de la etiqueta se elige una vez en Sistema › Impresión


## TEMA transferencias — Transferencias entre sucursales  (2026-08-15 02:00)


<!--0--> Modelo **pull**: cada local pide lo que necesita, a cualquier otra sucursal (la Distribuidora es el depósito central solo porque las compras entran por ella). No son cuatro pantallas: es **un documento con estados**, y cada bandeja es un filtro por estado + qué papel juega tu sucursal en él.

<!--1--> > **INFO:** En el paso 1, **el destino es tu sucursal y no se elige** —pedís para donde estás parado— y el origen ofrece **las otras**, nunca la propia: pedirse mercadería a uno mismo no es una operación. El servidor dice lo mismo: clava el destino en la sucursal de la sesión y toma el origen libre. Arranca en la **Distribuidora**, que es de donde se pide casi siempre.

<!--2--> Armando (borrador) → Pedido (pendiente) → En preparación (dos listas) → Despachar (en tránsito) → Recibir contando

<!--3-->
| Paso | Qué pasa con el stock |
|---|---|
| Armando (borrador) | **Nada, y el origen NO lo ve** (11/8/2026). El cajero atiende clientes y arma el pedido en los ratos libres, así que el pedido vive en la base desde que se elige la ruta: **se guarda solo**, sin botón, y cerrar es "sigo después". No lleva código —la serie TR se asigna al enviarlo— y **no le llega a nadie hasta que se envía**: nadie tiene que preparar algo que el que pide sigue escribiendo. Hay **UNO por ruta** (origen → destino), no uno por cajero: el pedido es del local, y el que entra al turno sigue la lista que dejó el anterior. Si fuera de cada uno, dos cajeros armarían dos pedidos el mismo día y el depósito mandaría mercadería duplicada. Se retoma desde el aviso de arriba del panel ("Seguir armando") y se **descarta** —se borra, no queda un pedido cancelado en el historial, porque nunca fue un documento |
| Pedido | **Nada** — es demanda; el origen quizá ni tiene la mercadería. Se arma en **tres pasos** (a quién le pido → qué se pide → revisar y enviar) y dentro del segundo, en **dos pestañas** (**Prod. Enteros** y **Prod. a granel**) porque son dos recorridos distintos de góndola. El pedido que sale es **uno solo**: la división es de la pantalla, no del documento. **Cada pestaña tiene su propio buscador y solo ofrece sus productos**: parado en Enteros no aparece un granel. Si lo que se buscó está en la otra, el aviso lo dice y ofrece el atajo ("hay 3 a granel · Ver Prod. a granel"). Al lado del buscador está **Buscar en el catálogo**: el mismo lenguaje que la consulta de Existencias (Alt+F3) pero recortado a lo que el pedido necesita — filtros de proveedor, categoría y marca en una fila, botón Agregar por renglón, y de las cinco sucursales **solo las dos de este pedido**. En granel **se ofrecen los tamaños y no la madre** (lo que viaja son paquetes), cada uno con su código y ya con la presentación elegida; el granel suelto del destino va como info debajo de su stock ("hay 123 kg a granel"), que es lo que la fila de la madre decía antes. La lista tiene **su propio scroll y el paginador fijo abajo**: los filtros no se van de vista y no hay que llegar al final de la página para enterarse de que hay 14 más. El paso 3 muestra el resumen, los kilos que el origen va a tener que fraccionar y —lo que más sirve— **qué renglones el origen no puede cubrir hoy** ("pide 20 kg y hay 3 kg de granel"): no frena el pedido, pero se sabe antes y no cuando llega el envío cortado |
| En preparación | **Nada todavía.** El pedido se parte en dos listas por tipo de producto: **Enteros** (preparador) y **Fraccionados** (fraccionador). **Cada encargado ve SOLO la suya**: la del otro no le sirve y le haría buscar sus renglones entre los ajenos. Cada uno imprime la suya, ajusta lo preparado y agrega lo que llegó a último momento |
| Confirmar lista | La mercadería quedó apartada físicamente → se valida y **reserva ESA lista** (disponible → comprometido). Cada encargado confirma la suya |
| Despachar | Exige las dos confirmaciones. Viaja **lo preparado** (no lo pedido): comprometido → **en_transito**, sigue siendo del origen |
| Recibir | Se cuenta contra lo ENVIADO; lo contado entra al destino y el faltante vuelve a comprometido en el origen con **incidencia automática** |

<!--4--> Cada renglón lleva tres cantidades: **pedida** (lo que pidió el destino, no se toca), **preparada** (lo que el origen armó de verdad, con su motivo: "sin stock", "llegó tarde") y **recibida** (lo contado). Ejemplo: Express 1 pide 12 galletitas y 3 harinas de 1kg; hay 6 galletitas y 2 harinas, y justo llegó yerba → van 6 + 2 + 10 de yerba **agregada**, cada una con su motivo, sin que Express 1 tenga que re-pedir. El destino ve "≠ difiere de lo pedido" en su bandeja ANTES de abrir cajas.

<!--5--> > **INFO:** **Lo que se pide a granel se fracciona del MADRE** (11/8/2026, regla del dueño). Por eso, al armar el pedido, la columna del origen de un renglón a granel muestra el **granel suelto en kg** —no los paquetes— y debajo dice cuántos kilos hay que fraccionar ("se fraccionan 8 kg") o cuántos faltan. Los paquetes que ya están armados en la Distribuidora **son su góndola y no viajan**: verlos ahí era peor que no ver nada, porque "10 paq." al lado de un pedido de 8 daba tranquilidad sobre mercadería que no se iba a mandar.

<!--6--> > **OK:** **Quién ve qué:** el fraccionador ve solo Fraccionados, el preparador solo Enteros, y quien tenga los dos permisos (o sea admin) ve las dos — necesita el pedido completo para despachar. Si el pedido no trae nada de tu lado, la pantalla lo dice ("este pedido no trae fraccionados") en vez de mostrar una tabla vacía. **Ojo: esto es una comodidad de pantalla, no un candado** — la API todavía no valida quién confirma qué lista, y no va a poder hasta que haya sesiones con token. Confirmar una lista con más de lo disponible se rechaza renglón por renglón ("preparado 3 paq., disponible 2 paq."). La lista del fraccionador muestra al lado de cada renglón el **granel suelto disponible** y un atajo a Fraccionar. Desconfirmar libera la reserva para seguir editando. Lo pedido y no enviado solo queda **visible** (no genera pedidos automáticos).

<!--7--> > **WARN:** Se acepta **lo que llegó** — esa es la verdad — y la diferencia nunca desaparece: queda atada a una incidencia que alguien tiene que cerrar (apareció → liberar; no apareció → merma con responsable). El faltante va a `comprometido` a propósito: es el estado sobre el que ya trabaja la resolución de incidencias.

<!--8-->
- **El pedido se arma con un buscador** (como el legacy): tipeás, Enter o clic agrega, y el último queda arriba. Cada renglón muestra el stock de las DOS puntas — lo que tiene el origen y lo que te queda a vos — y "Ver solo sin stock" lista lo que se te acabó, para reponer de un vistazo. El granel se totaliza en kg equivalentes (suelto + paquetes × tamaño).
- **Reposición sugerida**: productos bajo su mínimo en tu sucursal → "Generar pedido" lo arma con las cantidades que faltan.
- **Alerta de estancados**: un remito con 3+ días en tránsito se marca en naranja — es mercadería perdida o una recepción sin registrar.
- **Recepción a ciegas** (opcional en el modal): contás sin ver lo esperado; si ves el número, todo el mundo aprieta "conforme".
- **Imprimir** en cada lista de preparación: hoja simple con Pedido / Preparar / Obs. y casillero para tildar a lápiz.
- **Los renglones pedidos no se borran**: si no hay, van en 0 con su motivo — el destino tiene que ver qué pidió y no llegó. Solo se borran los agregados.
- **Quién hace qué**: cualquier encargado (permiso *preparar* o *fraccionar*) toma el pedido pendiente y abre las listas — cada uno edita y confirma SOLO la suya (el fraccionador ve Enteros en solo lectura). Despachar y cancelar son del admin. **Recibe quien pide** (permiso *pedidos* — el cajero): armar el pedido y confirmar que llegó bien son las dos puntas del mismo trabajo. El pedido nuevo nace con el destino y el responsable de la SESIÓN. La cola de envíos se ve parado en la sucursal ORIGEN.

<!--9--> 📍 Almacén › Transferencias (parado en tu sucursal)


## TEMA incidencias — Incidencias: la cuarentena del stock  (2026-08-10)


<!--0--> El principio: **ante una anomalía no se toca el stock a mano, se abre una incidencia y la mercadería queda en cuarentena**. Eso la separa de la merma. La merma dice "esto se perdió, bajalo"; la incidencia dice "acá hay algo raro y todavía no sé qué, no lo vendas hasta que lo resolvamos".

<!--1--> La cuarentena es el estado **`comprometido`**: el stock sigue existiendo y sigue valorizado, pero el POS y el sitio no lo pueden vender. Nada desaparece mientras se averigua.

<!--2-->
| Pieza | Cómo funciona |
|---|---|
| **Cómo nace, a mano** | «+ Nueva incidencia» en Almacén › Incidencias (permiso `incidencia_crear`, que el cajero tiene). Seis tipos: etiqueta incorrecta, producto mal pesado, bolsa rota, diferencia de inventario, defectuoso, vencido. Valida que haya stock disponible y mueve esa cantidad a comprometido |
| **Cómo nace, sola** | Al **recibir una transferencia con faltante**: se acepta lo que llegó (esa es la verdad) y la diferencia vuelve a comprometido **en el origen**, con una incidencia tipo `faltante` cuyo motivo ya viene escrito ("se enviaron 10 y llegaron 8"). Es el uso que más corre |
| **El ciclo** | `pendiente → revisión → resuelta`. "A revisión" es un acuse ("lo estoy mirando"); **resolver es de admin** |
| **Liberar** | Vuelve a `disponible`: apareció, era error de conteo, la etiqueta se corrigió. No es pérdida — no descuenta ni congela costo |
| **Baja por merma / vencido / defectuoso** | Sale de comprometido: la merma se descuenta y las otras dos pasan al estado `vencido` o `defectuoso`. Las tres **congelan el costo del día**: son pérdida y tienen que valer plata en el reporte |
| **Queda registrado** | Código `INCnnnn`, el movimiento atado (`refIncidenciaId`) y el motivo. No se borra nunca: desde la 0051 la FK del producto es `restrict`, así que la incidencia es historia |

<!--3--> > **INFO:** LA CONEXIÓN CON VENCIMIENTOS. No hay vínculo de datos entre los dos módulos —ninguna tabla se referencia— pero se cruzan en un lugar y es a propósito: la pestaña **Vencimientos › Mermas** no lista "las mermas del módulo", lista TODOS los movimientos de tipo merma, vencido y defectuoso. Entonces una incidencia resuelta como baja aparece ahí y suma en el reporte de pérdidas del período, con el chip **«De incidencia»** (y el código en el tooltip). Vencimientos es el lugar donde se lee la pérdida de TODO el negocio, sin importar por qué puerta entró; la incidencia es una de esas puertas.

<!--4--> > **WARN:** Lo que NO hay, aunque suene razonable: un producto que el control de vencimientos detecta por vencer **no abre una incidencia** (el vigía de fechas es una lista de control, sin stock), y una incidencia de tipo "Producto vencido" **no crea un registro de vencimiento**. Son circuitos paralelos que se cruzan solo en el reporte de pérdidas.

<!--5--> 📍 Almacén › Incidencias (crear: permiso incidencia_crear · resolver: admin)


## TEMA conteos — Control de stock: el físico contra el virtual  (2026-08-15 10:00)


<!--0--> Se cuenta lo que hay en la góndola y el sistema lo compara contra lo que él cree que hay (migración 0066). El conteo es una **sesión de trabajo**, no una acción: dura horas, se interrumpe, y la sigue el que entra al turno — igual que el pedido de mercadería, y es **del local**, no de cada persona. Se hace con el **local cerrado**.

<!--1-->
- **El alcance define qué se cuenta**: marca, categoría, proveedor, enteros/granel, y "solo con stock" (destildado entra también lo que figura en cero, para descubrir sobrantes). El dueño cuenta por marca, no todo junto. **La lista se congela al abrir**: un alta a mitad del conteo no se cuela.
- **La pantalla está pensada para el lector**: escaneás el código (del producto o del paquete), el foco cae en su renglón, tipeás la cantidad, Enter, y el foco vuelve al lector. El granel madre se cuenta **en kg** (pesado) y cada tamaño de paquete **por paquetes**, en filas separadas.
- **Es CIEGO por defecto** (decisión del dueño): el que cuenta no ve cuánto "debería" haber — se cuenta la realidad, no la pantalla. Y el ciego lo impone **la API**, no el CSS: mientras la sesión está en curso, el payload no trae el virtual para quien no tiene la llave de aplicar; ocultarlo solo en pantalla se lee con F12. El jefe puede abrir sesiones no-ciegas.
- **Los apartados avisan**: si un renglón tiene mercadería comprometida (separada para envíos), la pantalla lo dice para que no se cuente — sin eso la diferencia daría un sobrante fantasma.
- **Cerrar → reporte de diferencias** (lo ve quien puede aplicar): contado vs. sistema, la diferencia **valorizada al costo del día**, faltante/sobrante/neto en pesos, y el botón **Recontar** por renglón — las diferencias grandes casi siempre son errores de conteo. Se reabre, el contador ve los marcados resaltados, recuenta y se vuelve a cerrar.
- **Aplicar** (llave `conteos_aplicar`: admin, o el encargado a quien se la des en Usuarios y roles) genera un lote **atómico** de ajustes, cada uno atado a la sesión (`refConteoId`) y con el **costo congelado** — el reporte en pesos de este conteo no cambia el mes que viene.

<!--2--> > **WARN:** **SE APLICA POR DIFERENCIA, NUNCA POR VALOR ABSOLUTO.** Cada renglón guarda el disponible del instante en que se contó, y al aplicar se ajusta por `contado − ese snapshot` sobre el stock actual. Si el sistema pisara el stock con el contado, resucitaría mercadería legítimamente movida después del conteo. Y como el control se hace con el local cerrado, **cualquier movimiento entre contar y aplicar es una alarma**: la aplicación lo lista con nombre y apellido ("el stock se movió después de contarlo — ¿se vendió algo con el local cerrado?"). **Lo no contado queda como está**: un pendiente no es un cero, es una pregunta sin responder.

<!--3--> > **INFO:** Candados: un producto no puede estar en **dos sesiones abiertas** de la misma sucursal (dos conteos ajustarían dos veces, y el error dice en cuál está). La cajera abre, cuenta, cierra y puede **descartar su sesión virgen**; con renglones contados, tirar ese trabajo lo decide quien puede aplicar. El ajuste de un **paquete no toca a la madre** — un faltante de paquetes es pérdida real, no un error de fraccionamiento (para eso está "Corregir fraccionado").

<!--4--> > **OK:** **LA PLANILLA DE PAPEL (18/8/2026, pedido tuyo).** Adentro del control, arriba a la derecha de los filtros, está **🖨 Imprimir planilla (N)**: la hoja que se lleva a la góndola, con el membrete de la empresa, el alcance, la sucursal, un renglón por producto —nombre, presentación, código, unidad— y el **casillero en blanco** para anotar a lápiz, más el cuadrito de tildar. Sale **lo que muestra la pestaña elegida** (Pendientes / Contados / Todos) y el número del botón es el que va a salir; el buscador NO la recorta, porque ese campo es el lector y se llena y se vacía todo el tiempo. Dos cosas a propósito: la planilla **NUNCA imprime la cantidad del sistema** —ni cuando el control no es ciego y la pantalla la muestra—, porque un número al lado del casillero es el número que se termina copiando; y los **apartados SÍ van, en negrita**, con el aviso de no contarlos. Después se cargan los números en la pantalla, que es donde el sistema toma el instante de cada renglón. El formato (A4 / Carta / rollo) se elige en **Sistema › Impresión → "Planilla del control de stock"**, y ahí mismo hay vista previa.

<!--5--> 📍 Almacén › Control de stock (contar: sección almacen.conteos · revisar y aplicar: conteos_aplicar)


## TEMA operaciones — Operaciones del almacén  (2026-07-30)


<!--0--> El libro de cada almacén: **una fila por documento** (envío, recepción, compra recibida, ajuste, merma) en un rango de fechas, con usuario y observación. Los envíos y recepciones se valúan al **costo congelado al despachar** — el remito viejo dice siempre lo mismo aunque el costo haya cambiado.

<!--1--> > **INFO:** Los movimientos sueltos (ajuste, merma) figuran **sin monto**: no congelan costo, y valuarlos al costo de hoy sería inventar un número histórico.

<!--2--> 📍 Almacén › Operaciones


# SECCIÓN catalogos — Catálogos del producto
_Marca, categoría › subcategoría y etiquetas._



## TEMA entidades — Por qué son entidades y no texto  (2026-07-30)


<!--0--> Antes eran texto libre dentro del producto. Como entidades con id: renombrar deja de romper nada, y **"Cachafaz" y "CACHAFAZ" dejan de ser dos marcas distintas**.

<!--1-->
- La unicidad se mide normalizada: sin acentos, sin mayúsculas, sin espacios de más.
- Lo que está en uso **se desactiva, no se borra**. Un producto viejo con la marca en null es un dato perdido para siempre.
- Existe "Fusionar" para juntar duplicados que ya entraron: es el antídoto contra el catálogo sucio.

<!--2--> 📍 Compras › Catálogos


## TEMA cascada — Categoría › Subcategoría  (2026-07-30)


<!--0--> La subcategoría pertenece a una categoría. Al elegir categoría se filtra el segundo desplegable; si se cambia la categoría, la subcategoría elegida se limpia porque dejó de ser válida.

<!--1--> La subcategoría es **opcional**: muchos productos no necesitan el segundo nivel.


## TEMA codigos — Los tres códigos  (2026-07-30)


<!--0-->
| Código | Identifica |
|---|---|
| Código propio | El SKU interno; el que se tipea cuando no hay etiqueta |
| Código de barras | El EAN de la unidad de venta |
| DUN | El EAN-14 del bulto cerrado |

<!--1--> > **WARN:** Los tres son únicos cuando no están vacíos, y además **no pueden pisarse entre sí ni contra los de las presentaciones**: si dos cosas responden al mismo código, el escáner de la caja queda sin desempate.

<!--2--> El **código del proveedor** no está acá: es del par producto × proveedor, porque el mismo artículo tiene un código distinto en cada proveedor. Vive en el Formato de Compra.


# SECCIÓN proveedores — Proveedores
_La relación comercial con cada proveedor: pedidos, cuentas corrientes, echeqs y estados de cuenta. Solo dueño y admin._



## TEMA prov-que-es — Qué es el módulo (y de dónde viene)  (2026-08-17)


<!--0--> Es la app externa de proveedores (PHP+MySQL) **integrada como módulo del CRM** — la app se apaga y este es el único sistema. Junta lo que antes vivía repartido: a quién hay que pedirle, qué promesas de pago hay firmadas, la cartera de echeqs y cuánto se le debe de verdad a cada uno. **La deuda nace SOLO de la factura cargada en Compras** (o del gasto): acá no se tipean deudas, se administran.

<!--1-->
| Sección | Qué es |
|---|---|
| **Pedidos** | La pizarra interna (kanban): Solicitado / Pedido / Para retomar, y el historial de ingresos con la demora real |
| **Cuentas corrientes** | Los compromisos de pago con fecha. Nacen solos al confirmar la factura de un proveedor diferido |
| **Echeqs** | La cartera de echeqs propios. Cobrarlo ES el pago real |
| **Estados de cuenta** | El saldo con cada proveedor de mercadería, y la cuenta de cada uno en pantalla propia: el mayor completo, lo impago y el botón para pagarle |
| **Proveedores** | El padrón único del sistema: la ficha fiscal y comercial completa |

<!--2--> > **WARN:** El módulo es de **dueño y admin** (permisos `proveedores.*`, sembrados solo en el rol admin). La equivalencia con la app vieja: su "REM" acá es **Liquidación**.

<!--3--> 📍 Proveedores (módulo propio en el menú)


## TEMA prov-ficha — La ficha única, y qué quedó en Compras  (2026-08-17)


<!--0--> Desde 0068 hay **una sola ficha de proveedor** y vive acá: identidad (nombre, CUIT, contacto), clasificación (mercadería/gastos, condición de IVA, letra), y lo COMERCIAL de la app vieja — **qué emite** (factura/liquidación/mixto), **cómo cobra** (efectivo, transferencia, depósito, echeq, cta cte), **días de plazo** (obligatorio si cobra diferido), **modo de cuenta** y hasta 5 **cuentas bancarias** (CBU o alias) para transferirle.

<!--1-->
| Modo de cuenta | Qué significa |
|---|---|
| **Por facturas** | La factura se paga COMPLETA (o la cuota pactada). El sistema rechaza el pago parcial suelto — es el modo de casi todos |
| **Libre** | Acepta pagos a cuenta de cualquier importe; la antigüedad de la deuda se calcula por FIFO |

<!--2--> > **OK:** En Compras quedó **Costos y percepciones**: lo OPERATIVO del proveedor que no es su ficha — los costos por producto con la regla masiva, las percepciones que cobra, sus operaciones y su cuenta. Sin alta ni edición: eso se hace acá.

<!--3--> 📍 Proveedores › Proveedores · Compras › Costos y percepciones


## TEMA prov-pedidos — Pedidos: la pizarra  (2026-08-17)


<!--0--> Info interna entre el admin y el encargado de compras, calcada de la app vieja. **No toca stock ni deuda**: la mercadería y la plata entran al cargar la factura en Compras. "+ Solicitar pedidos" tilda varios proveedores y crea una tarjeta por cada uno en **Solicitado**; "Ya lo pedí" registra el pedido hecho por teléfono y entra directo en **Pedido** con fecha de hoy.

<!--1-->
- La tarjeta en Solicitado tiene **Enviado ✓** (se le mandó el pedido) y **Ya lo vi** (el admin la revisó) — marcas que se resetean al mover de columna.
- **→ Pedido** cuando se le pidió en serio; **Aparcar** la manda a "Para retomar" (sin fecha, para más adelante).
- **✓ Recibido** la saca de la pizarra y la manda al historial de **Ingresos**: cuándo se pidió, cuándo llegó y cuántos días tardó (con la demora promedio del filtro).
- Las notas son **texto libre a propósito**: "yerba x 20, harina integral" — es la nota entre ustedes, no un remito.

<!--2--> 📍 Proveedores › Pedidos (el globito cuenta los no recibidos)


## TEMA prov-ctasctes — Cuentas corrientes: los compromisos  (2026-08-17)


<!--0--> Un **compromiso** es una promesa de pago con fecha. Nace SOLO al confirmar la factura (o liquidación) de un proveedor que cobra **cta cte o echeq**: el alta de la factura muestra la sección "Compromiso de pago" prellenada — una cuota por el saldo, con vencimiento a los días de plazo de la ficha — y se puede partir en **cuotas** editables que tienen que sumar el saldo. También se puede crear un compromiso manual suelto.

<!--1--> **El puente**: el compromiso se cierra SOLO cuando el pago salda la factura (con las notas de crédito descontadas), y si ese pago después se anula o desimputa, el compromiso **se reabre solo**. La cuota cerrada por un pago que sigue vivo no se toca. Nunca hay que marcar nada a mano — el botón Pagar de la fila arma el pago con su imputación en un solo paso.

<!--2--> > **WARN:** El candado del modo **por facturas**: el pago tiene que ser el saldo completo del documento o coincidir con una cuota pactada. Si el proveedor de verdad acepta pagos sueltos, se le cambia el modo de cuenta a "libre" en la ficha.

<!--3--> 📍 Proveedores › Cuentas corrientes (el globito: vencidos + próximos 3 días)


## TEMA prov-echeqs — Echeqs: la cartera propia  (2026-08-17)


<!--0--> Solo echeqs **propios** (emitidos por la empresa). Con la factura del proveedor que cobra así nace el echeq **placeholder** (número "a completar") junto con su compromiso; el número y el banco reales se completan cuando se emite de verdad. Estados: **emitido → entregado → cobrado** (anulado aparte; "vencido" no es un estado — se deriva de la fecha).

<!--1--> > **WARN:** **Cobrar el echeq ES el momento contable**: cuando el banco lo debita, "Cobrar" crea el pago real (medio echeq, con la fecha del débito), lo imputa a la factura y cierra el compromiso — todo junto. Por eso un compromiso de echeq no se paga desde Cuentas corrientes: se cobra desde acá. Un echeq cobrado no retrocede; si el pago estuvo mal, se anula desde Pagos y la cascada reabre todo.

<!--2--> 📍 Proveedores › Echeqs (el globito: vencidos sin cobrar + debitan en 3 días)


## TEMA prov-edoc — Estados de cuenta: el saldo real  (2026-08-17)


<!--0--> La foto global: **saldo = facturado (mercadería) + gastos + ajustes − pagado**, por proveedor. Al lado, lo **comprometido** (compromisos pendientes) y el **proyectado** (saldo − comprometido). El estado sale del documento impago más viejo contra los días de plazo: al día / pendiente / vencido / a favor. **Acá van solo los proveedores de mercadería**: el que solo factura gastos —el plomero, la imprenta— tiene su cuenta en el módulo Gastos.

<!--1--> La fila abre **la cuenta completa del proveedor, en pantalla propia** (antes era un modal apretado): el encabezado con su ficha, el saldo y **de qué está hecho** (mercadería, notas de crédito, gastos, ajustes, pagado), lo que **le queda impago documento por documento** con su botón Pagar, los compromisos pendientes, el **mayor entero con saldo acumulado renglón por renglón** —filtrable por tipo de movimiento, rango de fechas y texto— y las cuentas bancarias para transferirle. Se vuelve al listado con **← Estados de cuenta**.

<!--2-->
- **"Registrar un pago"** está ahí, en la cuenta: el mismo pago de siempre del sistema (su egreso de caja, su arqueo, su bandeja) más la posibilidad de **tildar qué facturas cancela** en el mismo acto. Si tildás documentos, el importe es la **suma exacta** de sus saldos y no se edita: así el pago nunca sobrepasa lo que se debe y siempre pasa el candado del modo "por facturas". Si no tildás nada, queda **a cuenta** —baja el saldo del proveedor— y se aplica después desde la factura.
- El pago que deja la factura saldada **cierra sus compromisos solo** (el puente), y **anularlo los reabre**. Anular pide motivo, lo hace solo administración y **solo si el pago no tiene nada aplicado**: con imputaciones vivas hay que desaplicarlas primero desde el documento.
- Un pago vive en **una** bandeja: si se tilda una factura de mercadería y un gasto a la vez, la pantalla lo corta y explica que van dos pagos.
- **Ajustes manuales** DEBE/HABER con motivo obligatorio: la diferencia de flete, el redondeo que el proveedor perdonó. Sin motivo no se registra.
- **"Concilié con su resumen"** deja sellado hasta qué fecha se cuadró con el resumen del proveedor (y se puede quitar).
- En cuenta **libre**, la antigüedad es FIFO: lo cobrado cancela primero lo más viejo, y el mayor dice desde qué fecha arrastra deuda.
- El pago acepta **multi-forma** (se partió en varios medios, cada parte con su fecha): el mayor muestra el split. El egreso de caja sale solo por la parte en efectivo.
- El mayor ordena **por día de calendario** y, dentro del día, primero lo que genera la deuda y después lo que la cancela. Es a propósito: la hora que queda grabada es incidental (el pago se guarda a medianoche del día elegido, la factura con la hora de carga), y ordenando por hora el pago aparecía ANTES de la factura que estaba pagando.

<!--3--> 📍 Proveedores › Estados de cuenta › (la fila o "Ver cuenta") · los ajustes y las anulaciones, solo admin


## TEMA prov-flete — El flete que el proveedor descuenta  (2026-08-18)


<!--0--> Llega el camión: a la cajera le deja **la factura de la mercadería** y **el remito del flete**, y ella le paga el flete al fletero de su caja. Son dos papeles distintos y el sistema los trata como tales. **La factura se carga tal cual dice**, por su total. El flete queda como plata que ya se le adelantó al proveedor —es de él, no un gasto nuestro— y **se descuenta recién cuando se le paga la cuenta corriente**, que es cuando se decide cuánto transferir.

<!--1--> La cajera paga el flete → El administrativo carga el remito → La factura entra por su total → Al pagar, se descuenta el flete

<!--2--> **Ejemplo — Mercadería $100.000, flete $20.000**
    Factura de mercadería      $100.000   ← se carga tal cual
    Flete pagado de caja        $20.000   ← queda a cuenta del proveedor
    Debe el proveedor           $80.000   ← su cuenta corriente
    
    Al pagar: se tilda la factura y se tilda el flete
    A transferir                $80.000
    La factura queda            SALDADA   ← $80.000 + $20.000 de flete

<!--3-->
- **La cajera**: Ventas › Caja › Ingreso / egreso → Egreso → "Pago a un proveedor" → Mercadería → el proveedor → tilde **"Es el flete de esta entrega"**. Sale el egreso de caja con la hora y su nombre —eso ES el recibo: fecha, monto, medio, quién— y queda en Compras › Pagos en sucursal marcado **Flete**.
- **El remito lo carga el administrativo**, que es quien tiene el papel: se abre el pago desde Compras › Pagos en sucursal y se completa el **Nº de remito y el transportista**. No toca un solo peso —ni el importe, ni el medio, ni la caja—, así que se puede hacer al día siguiente y con el turno ya cerrado.
- **La factura de mercadería no se mezcla**: entra por su total. Los fletes ni siquiera se ofrecen para tomar en el alta ni en el detalle de la factura; ahí solo se avisa que existen y dónde se usan.
- **Al pagarle** (Proveedores › Estados de cuenta › Registrar un pago) aparece la sección **"Fletes ya pagados de caja"**. Se tilda la factura y se tildan los fletes: el importe a transferir baja solo y la factura **igual queda saldada**, porque el flete se imputa contra ella en el mismo acto. Si el flete cubre todo, no hay nada que transferir y el botón pasa a decir **"Descontar $X de flete"**.
- **El orden importa y es a propósito**: el flete se imputa PRIMERO. Así el saldo de la factura baja a $80.000 y el pago cae por el saldo exacto — pasa el candado del modo "por facturas" sin ninguna excepción. Todo en la misma operación: si el pago falla, el flete vuelve a estar disponible.
- **En el estado de cuenta** el movimiento se llama **Flete**, "De qué está hecho el saldo" dice cuánto de lo pagado fueron fletes, y hay un filtro **"Solo fletes adelantados"** que responde *"¿cuánto le adelanté de fletes a este proveedor?"*.
- **Si el proveedor reconoce MENOS de lo que se le pagó al fletero** (pagaste $20.000 y te admite $18.000): descontás $18.000 y los $2.000 que sobran quedan en el flete, a la vista. Esa diferencia es un **costo nuestro** y se cierra con un **Ajuste DEBE** en su estado de cuenta, con el motivo escrito.

<!--4--> > **INFO:** El **flete propio** —el que contratás vos y nadie te reintegra— NO se tilda: eso es un gasto de verdad y va por el módulo Gastos. El tilde solo aparece del lado de mercadería justamente por eso. Y ojo con el otro "flete": el **% de flete del Formato de Compra** es otra cosa —forma parte del costo del producto—; este flete no toca el costo, porque el proveedor te lo devuelve.

<!--5--> 📍 Ventas › Caja › Ingreso / egreso (la cajera) · Compras › Pagos en sucursal (el remito) · Proveedores › Estados de cuenta › Registrar un pago (descontarlo)


# SECCIÓN gastos — Gastos
_Lo que la empresa PAGA y no es mercadería: comprobantes, vencimientos y en qué se va la plata._



## TEMA gastos-que-es — Qué es un gasto y qué no  (2026-08-05)


<!--0--> Un **gasto** es un comprobante que la empresa recibe y tiene que pagar, y que **no entra al stock**: luz, alquiler, combustible, fletes, honorarios, impuestos, seguros. La mercadería NO es un gasto — sigue entrando por **Compras › Facturación**, porque mueve stock y define el costo del producto.

<!--1-->
|  | Compra de mercadería | Gasto |
|---|---|---|
| Dónde se carga | Compras › Facturación | Gastos › Gastos |
| Tiene ítems | Sí: productos con cantidad y costo | No: se imputa a un **rubro** |
| Mueve stock | Sí (si es recepción) | Nunca |
| Toca precios | Sí: actualiza el costo y el precio de venta | Nunca |
| Va al libro IVA compras | Sí | Sí |

<!--2--> > **OK:** Son tablas separadas justamente por eso: mezclarlas dejaría la mitad de las columnas vacías en la mitad de las filas. Lo único que comparten es el proveedor y el libro de IVA.

<!--3--> 📍 Gastos › Gastos


## TEMA gastos-proveedor — Un solo padrón de proveedores  (2026-08-05)


<!--0--> El proveedor de gastos es **el mismo** que el de compras: una entidad, un CUIT, una cuenta. Lo que lo clasifica son dos casillas — **Provee mercadería** y **Provee gastos** — que solo definen en qué buscador aparece. Un proveedor puede tener las dos: el que te trae la mercadería y además te cobra el flete es uno solo.

<!--1-->
- Los proveedores que ya existían quedaron marcados como **de mercadería** (es lo que eran).
- Un gasto puede ir **sin proveedor**: para el ticket de nafta o la changa hay un campo "A nombre de" que es solo descriptivo. Sin ficha no hay cuenta corriente, y está bien — obligar a dar de alta un proveedor por cada ticket termina en un "Varios" que junta todo.

<!--2--> 📍 Proveedores › Proveedores (la ficha única del sistema desde 0068 — los ABM de Compras y Gastos se fueron)


## TEMA gastos-rubros — Rubros: fijos y variables  (2026-08-05)


<!--0--> Cada gasto se imputa a un **rubro** del plan de gastos, y cada rubro es **fijo** o **variable**. Esa marca es la que hace útil el resumen: el alquiler no se compara con el combustible.

<!--1-->
| Tipo | Qué es | Ejemplos |
|---|---|---|
| **Fijo** | Se paga igual vendas mucho o poco. Es el piso que hay que cubrir todos los meses | Alquiler, servicios, sueldos, seguros, impuestos, honorarios |
| **Variable** | Depende de la actividad | Combustible, fletes, packaging, mantenimiento, comisiones |

<!--2--> > **WARN:** Un rubro con gastos imputados NO se borra: se da de baja. Borrarlo dejaría gastos históricos apuntando al vacío y el resumen del año pasado sin explicación. Dado de baja deja de ofrecerse y la historia sigue siendo legible.

<!--3--> 📍 Gastos › Rubros


## TEMA gastos-carga — Cargar un gasto  (2026-08-16 12:30)


<!--0--> La carga se parece a **leer la factura**, y arranca por el **PROVEEDOR** (rediseño del 16/8/2026): elegirlo completa solo la letra del comprobante y cómo se van a leer los montos. Después se anotan **CONCEPTOS con su monto** —"abono mensual $45.000, reconexión $8.000"— y el total es la suma, solo lectura.

<!--1-->
| Los montos que vas a cargar… | Cómo cuenta |
|---|---|
| **…ya incluyen el IVA** (ticket, factura B/C) | El total es la suma tal cual. El campo "IVA incluido" es opcional e informativo: no cambia el total, ya está adentro de los montos — por atrás el neto se deriva solo |
| **…son sin IVA y el IVA va aparte** (factura A) | Los renglones se tipean **NETOS, tal como los lista el papel**, y el IVA se **calcula solo con la alícuota** (o se copia del pie): se SUMA al total (neto + IVA) y cuadra centavo a centavo. Acá neto e IVA son los del comprobante, no derivados — el crédito fiscal del resumen sale exacto |

<!--2--> > **OK:** **EL PIE DE LA FACTURA (18/8/2026, migración 0071, pedido tuyo).** El IVA **se calcula solo**: se pone el neto en el concepto y el sistema lo saca con la **alícuota** que elijas al lado (21 · 10,5 · **27** · sin IVA · a mano). El 27 % no es adorno: **luz, gas, agua y teléfono a responsable inscripto** van a esa alícuota, y son los gastos de todos los meses. Escribir el número a mano pasa el selector a "A mano" y no se vuelve a tocar — el papel manda sobre la cuenta, siempre. En modo "ya incluyen el IVA" la cuenta es al revés (lo **desagrega** de los montos) y el total no se mueve. Y abajo, tres campos propios: **Impuestos internos**, **Percepción D.G.I.** y **Percepción D.G.R. (Ingresos Brutos)**, que SUMAN al total en los dos modos. Van separados porque terminan en lugares distintos: la de D.G.R. se computa contra Ingresos Brutos, la de D.G.I. contra el impuesto nacional, y los internos no se recuperan (son costo). En una sola bolsa eso no se puede reclamar.

<!--3-->
- **Un importe sin concepto NO se suma, y ahora lo dice.** El renglón necesita el texto ("de qué es") para contar; si escribís el monto y dejás el concepto vacío, el Neto se queda en $0,00. Antes pasaba **en silencio** y no había forma de saber por qué; ahora aparece el aviso al lado del Neto y el guardado se planta.
- **El modo lo trae la LETRA**: elegir un proveedor que factura A (o poner la letra A a mano) pasa el selector a "sin IVA" solo — y queda editable, porque la excepción existe. Un IVA mayor que el neto se rechaza: no salió de ninguna factura.
- **La LETRA viene del proveedor**: en su ficha se responde una vez "qué factura hace" (A/B/C/X) y el formulario la precarga al elegirlo. El selector la muestra al lado del nombre ("Edesur · factura A").
- **El selector ofrece solo proveedores de GASTOS**: a los de mercadería se les carga factura en Compras. Si uno de mercadería también factura gastos (el flete aparte, un service), se le tilda **Provee gastos** en su ficha — el padrón es uno y las dos casillas conviven.
- **Sucursal o General**: el gasto se imputa a una sucursal o a "General (toda la empresa)". Para quien no es jefe queda clavado en la suya.
- **Guard de duplicado:** con proveedor y número, la combinación tiene que ser única. Cargar dos veces la misma factura es EL error clásico de un módulo de gastos, y se descubre tarde — cuando el resumen del mes no coincide con el banco.
- **"¿Cómo se pagó?":** el caso más común es cargar y pagar en el mismo acto — vino el plomero y se le pagó del cajón. La casilla registra el pago junto con el gasto; con efectivo y turno abierto ofrece **"Sale de la caja de [tu sucursal] — turno #N"**: el egreso queda en el arqueo de esa noche, con hora y nombre. Solo se puede sacar del cajón de la sucursal con la que entraste, y registrar el pago exige su permiso propio. Cubre **el resto**: lo que los pagos de sucursal tomados no explican.

<!--4--> > **INFO:** LO QUE SE FUE DEL FORMULARIO el 15/8/2026 (decisión del dueño): **"O anotalo a mano"**, la **Descripción** libre y el selector de **Negocio** (los gastos son siempre de Sabor y Aroma). Nada se fue de la BASE: los gastos viejos conservan sus campos, los gastos fijos generados siguen usando el camino anterior, y la descripción ahora se escribe sola con los conceptos — por eso el listado y la búsqueda siguen mostrando lo mismo de siempre. Los gastos del negocio Cafetería que existían siguen contando en su métrica; los nuevos nacen todos como Distribuidora.

<!--5--> 📍 Gastos › Gastos › + Nuevo gasto


## TEMA gastos-pagos — Pagos a proveedores: la plata sale una sola vez  (2026-08-06 18:53)


<!--0--> El pago es **del proveedor**, no del documento. Ese giro es lo que permite el caso de todos los días: llega el pedido a la sucursal, la cajera le paga al repartidor y NO carga la factura — no le corresponde y no tiene los datos. Si el pago colgara del documento, ese pago no podría existir hasta que alguien cargue la factura, y la plata ya salió del cajón a las 10:40.

<!--1-->
| Momento | Qué pasa |
|---|---|
| **10:40 · la cajera paga** | Ventas › Caja › **Ingreso / egreso** › Egreso › **Pago a un proveedor**: elige primero el **TIPO** (Mercadería o Gastos — la lista de proveedores se filtra sola) y después el proveedor, el importe, el concepto y el remito. Sale el egreso de caja con hora exacta y su nombre, y el pago queda **a cuenta** |
| **Mientras tanto** | El tipo elegido es el **destino** del pago y decide su bandeja: Mercadería → **Compras › Facturación › pestaña Pagos en sucursal** · Gastos → **Gastos › Gastos › pestaña Pagos en sucursal**. Los de gastos suman al badge del sub-menú |
| **Al otro día · el admin carga la factura** | En el alta del comprobante, el paso **Pago y confirmación** ofrece los pagos a cuenta de ese proveedor **de la sucursal de recepción de la factura** (los de otras sucursales se avisan pero se toman con SU factura). Se tilda el que la factura explica y el resto se cubre al contado. Tomarlo ahí es lo que lo **aplica** |

<!--2--> > **OK:** Aplicar se hace SIEMPRE desde el documento, nunca desde el pago — en los DOS mundos, con la misma dinámica. En Compras: el **alta de la factura** (paso "Pago y confirmación": se tildan los pagos que la factura explica) o el **detalle de una factura ya cargada**. En Gastos: al **cargar el gasto** aparece la misma tabla con tilde ("Pagos a cuenta del proveedor"), y en su detalle están **"Aplicar un pago existente"** y **"Pagar"** (que registra y aplica en un paso). Las dos bandejas de pagos son de **solo lectura** — el control de "qué plata salió y todavía no tiene comprobante detrás" — y las dos viven como **segunda pestaña** del listado de documentos (Compras › Facturación y Gastos › Gastos), con el filtro de proveedor compartido entre pestañas. En todos lados rige la misma regla de sucursal: solo se ofrecen los pagos de la sucursal del documento (un gasto de "toda la empresa" ve todos).

<!--3-->
| En el alta de la factura | Qué hace |
|---|---|
| **Tomar pagos de sucursal** | Aplica plata que YA salió. No mueve un peso más: el egreso quedó en el arqueo de la caja que pagó |
| **Se paga ahora** | Registra el pago en el acto. De dónde sale se elige: la **caja de la sucursal** (si hay turno abierto — el egreso queda en ese arqueo) o **administración sin caja** (una transferencia del negocio, que no impacta en ningún arqueo) |
| **Lo que queda** | Va a cuenta corriente, y ahí recién tiene sentido el vencimiento de pago — que por eso solo aparece cuando queda saldo |

<!--4--> > **WARN:** La **condición de pago** ya no se elige: se DERIVA de lo que se pagó (saldada = contado, con saldo = cuenta corriente), y la calcula la API para que no dependa de quién la llame. Antes era solo una etiqueta: se podía marcar "contado" sin registrar un peso y la factura figuraba como deuda del proveedor igual. Un dato que puede contradecir a los otros termina mintiendo.

<!--5--> > **WARN:** La plata sale UNA sola vez: al registrar el pago. **Aplicarlo después no vuelve a mover plata** — solo dice contra qué documento se descuenta. Si aplicar generara otro egreso, la salida se contaría dos veces y el arqueo dejaría de cerrar.

<!--6--> > **INFO:** Un pago sin aplicar NO es un gasto todavía: es un crédito contra el proveedor. Por eso no figura en el resumen de gastos — si figurara, y después entrara la factura, el mes contaría el doble. El gasto lo genera siempre el comprobante.

<!--7-->
- **Un pago cubre varios documentos y un documento se cubre con varios pagos.** "Repartir todo el saldo" reparte del más viejo al más nuevo, y nunca aplica más de lo que cada documento debe.
- **Solo se aplica a documentos del MISMO proveedor.** El pago a Coca-Cola no puede pagar la factura de otro.
- **Y solo a documentos de SU MUNDO**: un pago de mercadería únicamente a facturas de compra; uno de gastos únicamente a gastos. Si la cajera eligió mal el tipo, el pago se **mueve de bandeja** ("Mover a Compras/Gastos" en su detalle) mientras no tenga nada aplicado — el error se corrige, no se cruza.
- **La cuenta del proveedor sigue siendo UNA** (mercadería + gastos − pagos): el destino separa bandejas de trabajo, no cuentas.
- **La bandeja es el control.** Un pago que lleva días sin aplicar significa una de dos cosas, y las dos hay que mirarlas: falta cargar el comprobante, o salió plata sin respaldo.

<!--8-->
| Regla | Por qué |
|---|---|
| Un gasto **con pagos aplicados** no se anula ni se le cambian importes, número o proveedor | La plata que salió tiene que poder rastrearse. Primero se quita la aplicación |
| **Quitar** una aplicación no devuelve plata | El egreso de caja sigue registrado; el pago vuelve a la bandeja de "sin aplicar". Por eso se puede hacer aunque el turno esté cerrado |
| **Anular** un pago exige que no tenga nada aplicado | Anular por arriba dejaría facturas figurando como pagadas sin pago detrás |
| Un pago que salió de un turno **ya cerrado** no se anula | Ese arqueo se firmó con el egreso adentro; sacarlo por atrás convierte un cierre correcto en un descuadre inexplicable. El reintegro va como ingreso de caja del turno actual, dejando rastro de las dos operaciones |
| El gasto anulado queda, no se borra | La carga y su anulación tienen que poder explicarse |

<!--9--> > **OK:** La cuenta corriente del proveedor pasó a ser real: comprado (mercadería + gastos) − pagado. Antes solo podía crecer, porque no había dónde registrar que se le pagó. Se ve en **Proveedores › Estados de cuenta**, clic en la fila (desde 0068 el mayor completo vive allá).

<!--10--> > **INFO:** En **Compras › Facturación** el filtro de proveedor está afuera de las pestañas y manda sobre las dos: elegir "Bebidas SA" muestra sus facturas de un lado y los pagos que se le hicieron del otro. La columna **Pago** de la tabla de facturas dice de dónde salió la plata (qué sucursal, qué turno, qué cajero), y la columna **Aplicado a** de los pagos dice qué comprobante lo explica — un pago puede quedar partido entre varias facturas y se ve.

<!--11--> 📍 Ventas › Caja › Ingreso / egreso (Egreso › Pago a un proveedor) · Compras › Facturación (pestañas Facturas / Pagos en sucursal) · Gastos › Gastos (pestañas Gastos / Pagos en sucursal)


## TEMA gastos-fijos — Gastos fijos (los que se repiten)  (2026-08-05)


<!--0--> Una **plantilla** de lo que llega todos los meses: alquiler, internet, seguro. No es un gasto todavía — es el recordatorio de que va a llegar. Con un clic se generan los del período, como pendientes y con el importe **estimado**, que se corrige cuando llega la factura real.

<!--1-->
- La generación es **idempotente**: se comprueba contra los gastos ya emitidos por cada plantilla, no contra un flag. Reintentar nunca duplica, y si se borra el gasto generado la plantilla vuelve a ofrecerse sola.
- La **frecuencia** define la ventana: un seguro anual generado en agosto no vuelve a aparecer hasta el agosto siguiente, mientras que los mensuales reaparecen cada mes.
- El importe generado es el **estimado** de la plantilla y el vencimiento sale del día configurado (si el mes no llega a ese día, se usa el último). Los dos se corrigen editando el gasto cuando llega el papel.

<!--2--> 📍 Gastos › Gastos fijos


## TEMA gastos-resumen — Cuentas a pagar y resumen  (2026-08-05)


<!--0-->
| Pantalla | Qué responde |
|---|---|
| **Cuentas a pagar** | Qué debo y para cuándo. Ordenado por urgencia, con cortes de vencido / vence hoy / próximos 7 días. El **badge del sidebar** cuenta lo vencido o que vence hoy — no lo pendiente, para que no se vuelva un número que nunca baja a cero y deje de mirarse |
| **Resumen** | En qué se va la plata: por rubro con su peso, fijos vs. variables, evolución por mes, a quién se le paga más y el IVA acumulado (crédito fiscal) |

<!--1--> > **WARN:** El resumen cuenta los gastos PENDIENTES también: el gasto existe desde que llega el comprobante, no desde que se paga. Los anulados no cuentan.

<!--2--> 📍 Gastos › Cuentas a pagar · Gastos › Resumen


# SECCIÓN chat-interno — Chat interno
_El mostrador le pregunta a administración sin dejar el puesto. Hoy, solo en la Distribuidora._



## TEMA chat-como-funciona — Cómo funciona  (2026-08-07 08:45)


<!--0--> El caso de todos los días: la cajera necesita saber si hay cuenta para transferencia, o qué pasó con un pedido web, y no puede dejar el mostrador. El **botón de chat del Topbar** (al lado de las notificaciones) abre un **panel lateral que flota sobre cualquier pantalla — incluido el POS**: pregunta, sigue cobrando, y el badge naranja le avisa cuando le respondieron.

<!--1-->
- **El canal grupal del local + privados 1-a-1.** El canal lo ven todos (si ya preguntaron y ya respondieron, nadie repite); el privado ordena lo otro — si tres cajeros le preguntan a la vez al administrador por el canal, las respuestas se pisan. El panel abre en una LISTA: el canal arriba y abajo el **Equipo**, con punto verde para los que están **en línea** — clic en un nombre y se abre su conversación. Un privado sin leer no desaparece porque el otro se desconectó: la fila queda con su badge.
- **Los mensajes se borran a las 24 horas.** El chat es conversación, no archivo: lo que hay que decidir va a su documento (el pedido, la factura, la observación del comprobante), no al chat — ahí se pierde. La regla se avisa en el propio panel. Son DOS capas y las dos hacen falta: las consultas **filtran** por el corte (así el límite es exacto en todo momento) y una **purga borra de verdad** cada 10 minutos como máximo (así la tabla no crece). El navegador descarta con el mismo corte, así el panel no muestra lo que el servidor ya borró aunque el CRM lleve dos días abierto. La marca de "leído hasta acá" sobrevive a la purga: es un número, no una referencia al mensaje.
- **"En línea" sin infraestructura**: el mismo poller que trae mensajes es el latido — en línea = su sistema preguntó hace menos de 15 segundos. Se pierde al reiniciar la API y se rearma solo en el próximo tick.
- **Los privados son privados EN EL SERVIDOR**: la API solo le entrega cada mensaje a sus dos puntas — no es un filtro de pantalla. Cada conversación (canal o privado) tiene su propia marca de lectura.
- **Solo en la Distribuidora, y lo decide la API.** El gate es por TIPO de sucursal en el servidor — una sesión parada en un Express ni ve el botón ni gasta un request. Si mañana otra sucursal necesita su canal, es cambiar esa regla, no rediseñar.
- **Sin WebSockets, a propósito.** El cliente pregunta por lo nuevo cada 4 segundos, como los avisos de órdenes web y de precios: para esta dinámica es indistinguible de instantáneo, no agrega infraestructura nueva y la BASE es la verdad — historial consultable, sobrevive recargas, el que llega tarde ve todo.
- **El "no leídos" es por usuario y por conversación, y vive en la base** (no en el navegador): sobrevive al F5 y a cambiar de máquina. Lo propio nace leído — el badge del Topbar suma todas las conversaciones y cada fila muestra el suyo. La conversación a la vista queda leída sola.
- **Pestaña en segundo plano = avisos demorados.** El navegador estrangula los relojes de las pestañas que no se ven: un mensaje puede tardar hasta un minuto en sonar si el CRM está detrás de otra ventana. Con el CRM a la vista (el caso del mostrador), llega en segundos.
- **Enter envía, Shift+Enter hace salto de línea.** Cada mensaje muestra quién y a qué hora (con fecha si no es de hoy). Al llegar un mensaje con el panel cerrado suena UNA nota corta — distinta de la campanita de dos notas de los pedidos web, para que el oído las distinga.
- **Como la sesión es por pestaña**, cada ventana chatea como su usuario: dos ventanas en la misma máquina son dos personas distintas en el canal.

<!--2--> > **WARN:** Mientras la API no tenga autenticación (bloqueante del deploy), el chat hereda el mismo agujero que todo el resto: cualquiera en la red podría escribir a nombre de otro. Se cierra con el mismo trabajo de auth, no necesita nada propio.

<!--3--> 📍 Botón de chat en el Topbar (visible solo con sesión en la Distribuidora) · API: /chat/bootstrap · /chat/mensajes · /chat/leido


# SECCIÓN usuarios-roles — Usuarios y roles
_Quién es quién: roles dinámicos con permisos, contraseñas y el superadmin._



## TEMA modelo-roles — Roles dinámicos con permisos  (2026-08-06 18:53)


<!--0--> El rol es una **fila con su lista de permisos**, no algo fijo en el código. El catálogo tiene DOS niveles: **secciones** (`modulo.seccion` — qué pantallas ve; un módulo sin ninguna sección asignada desaparece ENTERO del menú, y la URL tipeada a mano rebota) y **acciones** (qué operaciones puede hacer dentro de lo que ve: registrar merma, preparar envíos, cobrar…). El editor de Gerencia muestra una tarjeta por módulo con el detalle fino, sección por sección, y un tilde maestro para marcar o desmarcar el módulo completo.

<!--1-->
| Rol | Qué ve / qué hace |
|---|---|
| **Superadmin** (Lucas) | Maneja todo (`*`): crea roles, permisos y usuarios con sus contraseñas. No se edita ni se borra, y siempre queda al menos uno activo |
| Administrador | Todas las secciones salvo Gerencia › Usuarios y roles, con todas las acciones operativas |
| Fraccionador | Solo Almacén › Fraccionamiento y Transferencias (su lista de Fraccionados) + Info de sistema |
| Cajero | Ventas › POS, Clientes y Caja; Almacén › Transferencias e Incidencias; Dashboard e Info |

<!--2--> > **INFO:** Los cambios de permisos llegan a los usuarios al RECARGAR la pantalla (F5), sin re-login: la sesión refresca sus permisos contra la API en cada carga. Si la API no responde, vale la foto del login.

<!--3--> > **WARN:** **La llave del crédito (26/8)**: la acción `cta_cte` ("Clientes: habilitar cuenta corriente y fijar límite") **no la trae ningún rol de fábrica** — solo pasa el `*` del superadmin. El admin carga y edita la ficha completa del cliente en Ventas › Clientes; habilitar la cuenta corriente, el límite y el plazo se ven pero no se tocan sin la llave (y la API rechaza el intento por atrás). Con la llave hay además un **atajo**: en el detalle del cliente, pestaña Cuenta corriente, se habilita ahí mismo con límite y plazo, sin abrir la edición completa. Para delegarla, se tilda en el rol desde acá.

<!--4-->
- **Usuarios**: nombre + rol + contraseña (guardada hasheada, nunca en texto) + activo. No se borran — están en los historiales — se **desactivan**.
- **Roles de sistema** (los cuatro de arriba): editables salvo el superadmin, no borrables. Los roles propios se borran solo sin usuarios asignados.
- **Login**: usuario + contraseña + **la sucursal con la que se va a operar**, con paso de confirmación ("¿estás seguro?") antes de entrar. La elección fija el contexto de TODA la sesión (Compras, Almacén y Ventas nacen parados ahí) y el header muestra siempre nombre + sucursal. Cerrar sesión: menú de la cuenta.
- **El usuario operativo ES el de la sesión**: en Compras/Almacén/Ventas ya no se cambia de usuario a mano — para operar como otro, se cierra sesión y entra el otro.
- **Dónde se ve y se cambia el puesto**: usuario y sucursal figuran una sola vez, arriba a la derecha junto al perfil (los paneles ya no repiten esa barra). Admin y superadmin cambian de sucursal desde el **menú del perfil › Cambiar de sucursal**; el resto opera donde dijo al entrar.
- **La sesión es POR VENTANA/PESTAÑA**: se pueden tener dos ventanas del mismo navegador logueadas con usuarios y sucursales distintos (Marta en Express 3 y Carla en Express 2 a la vez) sin que se pisen — cada una ve SU caja y opera en SU sucursal. Una pestaña nueva hereda el último login hecho en ese navegador; loguearse en una ventana no afecta a las que ya estaban trabajando.

<!--5--> 📍 Gerencia › Usuarios y roles (permiso gerencia.usuarios — de fábrica, solo el superadmin)


# SECCIÓN decisiones — Decisiones de diseño
_Por qué las cosas son como son. Leer antes de "arreglar" algo._



## TEMA principios — Los principios que se repiten  (2026-08-06 18:53)


<!--0-->
| Principio | Dónde aparece |
|---|---|
| Lo que se mide en cantidades se automatiza; lo que se mide en pesos se sugiere | Puertas del formato de venta |
| Una sola fuente de verdad, aunque cueste una migración | Se eliminó "proveedor activo" en favor del formato marcado |
| Lo que está en uso se desactiva, no se borra | Listas, marcas, categorías, etiquetas — y desde el 10/8/2026 también el PRODUCTO, que era la única excepción (ver "El producto que ya no se trae") |
| Los modos se cambian con un interruptor, nunca con un valor mágico | Modo de carga del costo |
| Lo que crece sin techo no viaja en la carga inicial | Movimientos y comprobantes |
| La fila existe = está habilitado | Formato de venta y de compra |
| Si algo es global, se monta en el layout y no en un módulo | Atajos Alt+F5 y Alt+F3 |


## TEMA trampas — Trampas conocidas  (2026-08-06 18:53)


<!--0-->
- **IVA contado dos veces.** El precio se calcula desde el costo NETO. El "costo final" ya lo tiene adentro y es solo informativo.
- **Descuentos sumados.** La escala es en cascada: 30 y 10 es 37%, no 40%.
- **Borrar e insertar al guardar.** El historial de costos cuelga de los formatos por id; hay que actualizar, no reemplazar.
- **Campos nuevos que no llegan a la pantalla.** Si la API devuelve algo nuevo y el contexto del frontend no lo copia a su estado, la pantalla queda vacía sin que nada falle. Pasó dos veces.
- **Cálculos duplicados desincronizados.** Precios y costos están en la API y en la pantalla. Se tocan de a dos.
- **Lost updates en concurrencia.** El stock se actualizaba leyendo el valor y escribiendo el resultado: dos operaciones simultáneas se pisaban en silencio. Los deltas van SIEMPRE en SQL relativo (cantidad = cantidad + δ) y las transiciones de estado reclaman con WHERE estado = el-que-vi.


## TEMA lecciones — Lecciones que costaron caro  (2026-08-06 18:53)


<!--0-->
- **Verificar con eventos sintéticos no es verificar.** Los atajos Alt+F5 / Alt+F3 se dieron por buenos disparando `KeyboardEvent` por consola. Con una tecla real fallaban en todo el sistema menos en Ventas, porque el listener vivía en el shell de ese módulo. Lo que se prueba con simulación hay que volver a probarlo como lo usa una persona.
- **Un campo que no se copia rompe una regla entera en silencio.** El renglón del POS no copiaba `marcaId`, así que la regla de marca nunca disparaba en la caja aunque el motor pasara sus pruebas.
- **Lo que la API devuelve tiene que llegar al estado del frontend.** Dos veces un campo nuevo viajó bien y la pantalla quedó vacía porque el contexto no lo copiaba a su estado.
- **Un prop mal escrito no da error, simplemente no hace nada.** `ModalShell` espera `footer` y `size`; dos pantallas le pasaban `actions` y `width`. React los ignoró en silencio: el formulario de Ofertas quedó sin botón de guardar y las consultas se renderizaban a 600 px con ocho columnas. En JSX un prop de más no avisa — hay que mirar la firma del componente.
- **Toda tabla nueva va también en `truncateAll`.** Si se olvida, re-sembrar no la limpia y los datos de ejemplo se acumulan: las ofertas terminaron con tres copias de cada promoción.


## TEMA candados-saldo — Saldos y dos pedidos a la vez: por qué los chequeos van con candado  (2026-08-08 03:00)


<!--0--> **La regla, corta: todo chequeo de "no le podés aplicar más que su saldo" tiene que leer la fila con candado (`FOR UPDATE`) DENTRO de la transacción.** Leerla sin candado hace que el chequeo sea una foto vieja, y el que la mira no se entera.

<!--1--> **Por qué.** Un `select` común (sin candado) **no espera** a la transacción de al lado: lee una foto de lo ya confirmado. Así, dos pedidos simultáneos de imputar el mismo pago leían los dos `aplicado = 0`, los dos pasaban la validación, y las dos imputaciones entraban. No hace falta un ataque: un doble click en una conexión lenta alcanza.

<!--2--> **Demostrado, no supuesto.** Con dos conexiones sobre un pago de $500, escalonadas para que la segunda lea mientras la primera todavía no confirmó:

<!--3-->
|  | Sin candado | Con `FOR UPDATE` |
|---|---|---|
| Qué lee la segunda | saldo = 500 (la foto vieja) | espera a que la primera confirme, y lee saldo = 0 |
| Resultado | **entran las DOS: $1.000 imputados a un pago de $500** | la segunda se rechaza: "el pago solo tiene 0.00 sin aplicar" |

<!--4--> > **WARN:** **El comentario del código afirmaba que esto ya estaba cubierto** ("ni por dos pedidos simultáneos"), y eso es peor que no decir nada: una promesa falsa hace que nadie vuelva a mirar. Si un comentario garantiza una propiedad, o está demostrada o la frase se cambia.

<!--5--> **ORDEN DE BLOQUEO: primero el pago, después el documento.** Siempre igual, en las cuatro funciones de Pagos que bloquean (`aplicar`, `desimputar`, `anular`, `cambiarDestino`). Dos caminos que tomen los mismos dos candados en orden distinto se abrazan y se quedan esperando para siempre. Hacen falta los dos: el del pago evita que se pase el MISMO pago dos veces; el del documento evita que **dos pagos distintos** sobre-paguen la misma factura entre ambos.

<!--6--> **Dónde más apareció el mismo patrón** (se revisaron los tres módulos que faltaban):

<!--7-->
| Dónde | Qué pasaba | Cómo quedó |
|---|---|---|
| **Cobranzas** · `saldosEnTx` | Idéntico al de Pagos, del lado de las ventas: dos cobranzas simultáneas sobre la misma venta leían el mismo saldo, las dos pasaban el "debe $X y estás imputando $Y", y la venta terminaba **cobrada de más**. | La fila de la venta se lee con candado. El agregado de imputaciones no se puede bloquear (es una suma), pero al serializar la venta la suma que se lee ya es estable. |
| **Caja** · `cerrar` | No era un saldo sino el CIERRE, y es el peor de los tres. El cierre son tres pasos —ver que está abierta, sumar el arqueo, marcarla cerrada— y entre el segundo y el tercero entraba plata: un pago a proveedor de esa caja, o un movimiento manual. Ese egreso quedaba **adentro de un turno cerrado pero fuera de `sistemaEfectivo`**, así que la diferencia del arqueo nacía mal y quedaba **congelada en la fila**: no se detectaba nunca más. | El cierre es una transacción y bloquea la sesión. Las dos puertas que insertan movimientos (`caja.movimiento` y `pagos.crear`) leen la sesión con el mismo candado: o entran antes y el arqueo las cuenta, o esperan y se rechazan porque el turno ya cerró. |
| **Comprobantes** | Nada que arreglar. El único lugar parecido lee `total`/`pagado` para decidir una etiqueta derivada (contado vs cuenta corriente), no para autorizar plata. | Y el stock ya usaba el patrón correcto desde antes: `UPDATE stock SET cantidad = cantidad + delta`, que es atómico y no necesita candado. |

<!--8--> Y un detalle de método: el primer intento de probar esto fue disparar dos pedidos HTTP a la vez, y **pasó igual sin el candado** — la transacción dura menos de un milisegundo y no llegaron a solaparse. Un test que pasa con y sin el arreglo no prueba nada. La carrera se reprodujo bajando al nivel donde vive (dos conexiones SQL, con la ventana agrandada a propósito).

<!--9--> 📍 crm-api/src/pagos/pagos.module.ts · cobranzas.module.ts (saldosEnTx) · caja.module.ts (cerrar, movimiento)


# SECCIÓN pendientes — Pendientes
_Funciones a medio construir, notas técnicas puntuales y cómo se mantiene esta sección._



## TEMA fraccionado-pantalla — Pantalla propia del fraccionado — CONSTRUIDA (ver Stock e inventario)  (2026-08-09 05:30)


<!--0--> **Se construyó el 9/8/2026** con las respuestas del dueño a las cuatro decisiones que esperaban acá (la madre cuenta la verdad total; el costo es de solo lectura; el fraccionado es fila propia; borrar con stock se frena) y al "SOLO STOCK" (el tilde "Solo para fraccionar" — la pimienta de Jamaica existe). La guía completa está en **Stock e inventario › "El fraccionado tiene pantalla propia"**.


## TEMA lectura-renglones — Leer los renglones de la factura — PDFs digitales HECHO · fotos EN ESPERA  (2026-08-08 07:00)


<!--0--> > **OK:** **La mitad barata quedó construida el 8/8/2026.** Si el papel de la bandeja es un **PDF digital** (la factura electrónica que el proveedor manda por mail), los renglones **se leen del archivo** — sin modelo de visión, sin clave de API, sin costo, y el archivo no sale del sistema. En el paso 2 del alta aparece el botón **"Leer renglones del PDF"**. Lo que sigue EN ESPERA es la otra mitad: las **fotos** (no tienen texto adentro) — para esas el único camino es el modelo de visión de abajo, ahora con menos volumen y menos costo que el presupuestado.

<!--1--> **Cómo funciona lo construido.** El PDF trae cada fragmento de texto con su posición X/Y en la hoja: se agrupa por altura (misma línea) y se ordena de izquierda a derecha — el renglón queda reconstruido tal como se ve impreso. Después una **receta por proveedor** interpreta ese texto: dónde están los renglones, cómo viene el pie, qué mugre trae (Tango parte los números con espacios: "87, 731. 41"). La primera receta es la de **Bavosi** (formato Tango, el ERP más común del país). La propuesta llena renglones, bonificación, percepciones (se tildan solas si el proveedor las tiene configuradas) y el encabezado — que en un PDF también es texto, así que **completa lo que el QR no pudo** (número, fecha, CAE, vencimiento) con un botón "usar este encabezado".

<!--2--> **Los tres controles que hacen confiable la lectura**: Σ renglones tiene que dar el subtotal del papel (si falta un renglón, se delata solo); el pie tiene que cerrar consigo mismo (neto + IVA + percepciones = total); y el total leído tiene que coincidir con el de la lectura (QR o tipeado). Con la factura real de Bavosi: 12 de 12 renglones, todo al centavo. El **matcheo de productos** es el único paso con criterio (el papel dice "AVENA INSTANT FWP CUM10x400g" y el catálogo "Avena Instantanea CUMANA x400g"): propone por similitud de tokens, y lo que no reconoce queda listado para agregar a mano — **el parser propone, la persona confirma**, nunca adivina. Los renglones sin matchear suelen ser artículos nuevos del proveedor.

<!--3--> **El mapeo de artículos se APRENDE, y el trabajo manual es solo la primera vez.** El producto se reconoce en tres niveles, del más confiable al menos: (1) el **mapeo aprendido** — el código del artículo tal como lo imprime la factura, asociado a nuestro producto la última vez que una persona confirmó una factura; (2) el **código del catálogo** (el campo "código de proveedor" del formato de compra, que vino del sistema viejo — con corrimientos: la factura real dice 10206 donde el catálogo dice 10200); (3) el **parecido de nombres**, solo para el arranque en frío. Con la factura real de Bavosi: 8 de 12 salen por código exacto del catálogo, 1 por parecido, y quedan 2 genuinamente nuevos (salmón y mariscos, que no están en el catálogo).

<!--4--> **Cómo se asocia lo que no reconoce.** En el panel del PDF, cada renglón sin producto muestra un selector **"Asociar con un producto…"** con todo el catálogo: el admin elige el producto del sistema (aunque en la factura figure con otro nombre), el renglón se agrega al alta, y **al GUARDAR el comprobante el par (código → producto) queda aprendido** — la próxima factura del mismo proveedor lo reconoce sola. Si se cancela, no se aprende nada. Un mapeo mal aprendido se corrige solo: en la factura siguiente se cambia el producto del renglón y el guardado pisa el mapeo viejo. Si el artículo es realmente nuevo, primero se crea en Productos y después se asocia.

<!--5--> > **WARN:** **Para agregar la receta de otro proveedor** hace falta UNA factura real suya en PDF: el botón del modal muestra el **texto extraído** aunque no haya receta, y con eso se arma (registro `RECETAS` en `crm-api/src/facturas/recetas.ts`, por CUIT del emisor). Si el proveedor también factura con Tango, la receta de Bavosi probablemente sirva casi entera. Un PDF **sin** capa de texto (escaneo, foto convertida) avisa y no propone nada: eso es una foto con otro nombre.

<!--6--> **Lo que sigue EN ESPERA — las fotos.** El diseño original de esta ficha era para leer la imagen con un modelo de visión, y queda vigente solo para los papeles fotografiados: la decisión sigue siendo del dueño (la imagen sale de la máquina) más una clave de API. Todo lo de abajo describe ese camino.

<!--7--> **Por qué hace falta un modelo de visión y no un programa.** El encabezado se resuelve leyendo un QR, que es un dato exacto. Los renglones no: solo existen dibujados en el PDF del proveedor, cada proveedor los imprime distinto, y Argentina no tiene intercambio de factura estructurada (nada como el CFDI mexicano). Hay que interpretar imagen, y eso lo hace un modelo.

<!--8-->
- **El circuito**: el papel ya está guardado y el encabezado ya salió del QR (eso no cambia) → la API manda la imagen o el PDF al modelo con un esquema fijo de respuesta → vuelve un JSON con los renglones → el sistema calcula el pie y lo compara contra el total del QR → la factura aparece en la bandeja con los renglones puestos.
- **Corre en la API (Laravel), nunca en el navegador**: la clave de la API no puede estar en el frontend, cualquiera la vería mirando el código de la página.
- **Sería un interruptor, no una pieza**: sin clave configurada, la bandeja anda exactamente como hoy (papel guardado, encabezado del QR, renglones a mano). Se puede probar con veinte facturas y apagarlo si no convence.

<!--9--> **Lo que se le pediría, y sobre todo lo que NO.** Acá está la diferencia entre que funcione y que sea una lotería: cuanto más chico el trabajo del modelo, más confiable el resultado.

<!--10-->
- **NO se le pide el encabezado.** Ya lo tenemos exacto del QR; pedírselo sería meter una posibilidad de error donde hoy no hay ninguna.
- **NO se le pide identificar el producto.** No se le pasa el catálogo para que elija: es justo donde un modelo inventa con más ganas — le das 900 productos y devuelve uno parecido con total seguridad. El producto lo resuelve el **código del proveedor** contra el diccionario que se va llenando (determinístico), y si no matchea es un rojo que decide una persona.
- **NO se le pide sumar nada.** La aritmética la hace el código, siempre. Un modelo que suma es un modelo al que hay que revisarle la suma.
- **SÍ se le pide una sola cosa: copiar lo que dice el papel** — por renglón: código, descripción, cantidad, unidad, precio unitario, % de descuento e importe; más las líneas del pie tal como están impresas. Transcribir, no interpretar. "Copiá esta tabla" es una tarea muchísimo más fácil y más verificable que "entendé esta factura".

<!--11--> > **OK:** **El esquema no es una sugerencia.** La API tiene salida estructurada: se declara la forma exacta del JSON —qué campos, de qué tipo, cuáles obligatorios— y la respuesta está **obligada** a cumplirla. No es pedirle amablemente que devuelva JSON y después rezar. Lo que el esquema NO garantiza es que los números sean los correctos; para eso está el control del total.

<!--12--> **El lazo que se cierra solo.** El total del QR es la respuesta al final del libro. Si el pie calculado con los renglones leídos da ese número, la extracción está *demostrada* y la factura queda lista para confirmar. Si no da, **segundo intento con el modelo más capaz** — la primera pasada va con el barato y solo las que fallan escalan, así que el costo lo domina el camino barato. Si tampoco cierra, queda para cargar a mano con la diferencia marcada: nunca se carga nada roto en silencio.

<!--13--> > **WARN:** Lo que **no** se le pediría es que declare cuánta confianza tiene en cada renglón. Esa autoevaluación es poco confiable y da una falsa sensación de control: un renglón mal leído con "confianza alta" es peor que no tener el dato. **Vale más la prueba aritmética que la opinión del modelo sobre sí mismo.**

<!--14--> **El PDF se da vuelta y pasa a ser el mejor caso.** Hoy el PDF es el peor: no se le puede leer el QR y su encabezado va a mano. Para leer renglones es al revés — la API acepta PDF de forma nativa y un PDF de factura es texto vectorial, no una foto de un papel con sombras, arrugas y flash. Como muchos proveedores mandan la factura por mail en PDF, ese circuito (bajar del mail → subir → salen los renglones) sería el más confiable de todos, aunque su encabezado se siga tipeando.

<!--15-->
| Modelo | Por factura | 50 facturas/mes |
|---|---|---|
| Sonnet 5 (la primera pasada) | ~US$ 0,056 | **~US$ 3** |
| Opus 5 (solo los reintentos) | ~US$ 0,094 | — |

<!--16--> Las cuentas son sobre una factura de 40 renglones fotografiada (la de Bavosi tiene 3): la imagen a resolución completa pesa hasta ~4.800 tokens, la instrucción con el esquema ~1.500 y la respuesta con 40 renglones ~2.500, a US$3 por millón de entrada y US$15 de salida. **El costo no es el problema** — son unos pocos dólares por mes.

<!--17--> > **WARN:** **La decisión real: el papel sale de la máquina.** La imagen viaja a la API del modelo — los precios de los proveedores, los CUITs, los códigos. Es el único componente de todo el sistema que manda datos afuera: el chat, el importador de catálogos, la lectura del QR y todo lo demás corren en la red local. No es una objeción, es el precio del servicio, pero la decisión es del dueño.

<!--18--> **Qué NO arregla, incluso funcionando perfecto:**

<!--19-->
- **El bulto contra la unidad.** El modelo va a leer "4.00" y "CUM10x1kg" fielmente; decidir si son 4 cajas o 40 kg es conocimiento del negocio, no lectura. Es justo el punto ciego del control del total (la plata cierra igual), así que la guarda contra el costo histórico de la presentación sigue siendo necesaria.
- **El flete y los envases retornables.** El modelo transcribe el renglón sin problema; el sistema sigue sin tener dónde guardarlo. **Esto hay que resolverlo ANTES**: si no, cada factura con flete falla el cuadre por más perfecta que sea la lectura.
- **La compresión del papel.** Lo que se guarda hoy está comprimido a 2.200 px de lado largo, justo debajo del límite de 2.576 px de la API, así que sirve. Si algún día se baja esa compresión para ahorrar base, la letra chica de los renglones se pierde y la lectura empeora sin que nada avise.

<!--20--> **Qué falta para poder empezar** — dos cosas, y una es del dueño:

<!--21-->
- **Decidir que el papel puede salir de la máquina**, y sacar una **clave de API de Anthropic** (console.anthropic.com, con tarjeta). Esa clave es una credencial de la cuenta del dueño y factura a su nombre: no la puede sacar nadie más.
- **Resolver los renglones que no son mercadería** (flete, envases retornables, redondeo). Hoy `comprobante_items` exige un producto, así que ese renglón no se puede guardar. Es una decisión de diseño de una sola vez: un flag de "concepto no inventariable" en el ítem —más honesto— o productos de servicio designados.
- Con esas dos, el resto es construirlo: el módulo que llama a la API, el esquema de respuesta, el reintento con escalada de modelo, y el diccionario de códigos del proveedor que aprende de cada confirmación (`producto_proveedores.codigoProveedor` ya existe y es la llave).

<!--22--> 📍 Lo que ya funciona está en Formato de Compra › "Facturas por procesar" · esta ficha es solo el diseño de la etapa que sigue


## TEMA gastos-notas-tecnicas — Nota técnica: fechas del formulario  (2026-08-05)


<!--0--> Un `<input type="date">` manda `AAAA-MM-DD` pelado, y `new Date('2026-08-05')` lo interpreta como **medianoche UTC**: en Argentina (UTC−3) eso es el día 4 a las 21:00, y el gasto fechado el 5 aparecía listado el 4. Las fechas de Gastos se parsean con hora explícita (`T00:00:00`) para que queden en medianoche LOCAL.

<!--1--> > **WARN:** Si aparece el mismo corrimiento de un día en otro módulo con campos de fecha, la causa es esta y el arreglo es el mismo.

<!--2-->
- Recordatorio: cualquier módulo nuevo con `<input type="date">` tiene que parsear igual del lado del servidor.


## TEMA como-mantener — Cómo se mantiene esta sección  (2026-08-06 20:52)


<!--0--> Al cerrar cualquier función o cambiar una regla de negocio se actualiza la sección que corresponda **y esta lista**. Documentación vieja es peor que no tener ninguna: si dice algo que ya no es cierto, alguien la va a creer.

<!--1--> Cada tema lleva su **fecha de última modificación** (se ve al lado del título) y el botón **Orden › Reciente** de arriba pone lo último primero — el índice se reordena y salta a lo más nuevo. La fecha de una sección es la del tema más nuevo que tenga adentro: se deriva, no se escribe aparte, así no puede contradecir a sus temas. Tocar un tema significa actualizar su `actualizado`: si no se hace, el orden por fecha empieza a mentir.

<!--2--> El campo admite `AAAA-MM-DD` y, cuando hace falta desempatar dentro del mismo día, `AAAA-MM-DD HH:MM` — sin eso, una jornada con diez secciones tocadas las deja empatadas y el orden "Reciente" pierde sentido. La hora **no se muestra** (queda en el tooltip): sirve solo para ordenar. Las fechas históricas salieron de los commits del repositorio, no de la memoria de nadie.

<!--3--> Todo el contenido vive en un solo archivo (`modules/manual/content/manual.js`) como estructura de datos. Sumar documentación es agregar un objeto, nunca escribir pantalla.