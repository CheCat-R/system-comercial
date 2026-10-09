/** STOCK E INVENTARIO — existencias, fraccionamiento, transferencias, incidencias, control de stock y vencimientos. */
export const INVENTARIO = {
  id: 'inventario',
  titulo: 'Stock e inventario',
  resumen: 'Existencias, fraccionamiento, transferencias, incidencias, control de stock y vencimientos.',
  temas: [
    {
      id: 'modelo-stock',
      titulo: 'Cómo se cuenta el stock y qué es un movimiento',
      bloques: [
        {
          t: 'p',
          texto: 'El stock se identifica por **producto × sucursal × presentación × estado**. No se trabaja por lote. Cada producto tiene su existencia en cada sucursal, repartida en estos estados:',
        },
        {
          t: 'tabla',
          cols: ['Estado', 'Significa'],
          filas: [
            ['**disponible**', 'Se puede vender'],
            ['**comprometido**', 'Reservado (un presupuesto confirmado, un envío preparado, o mercadería en cuarentena por una incidencia)'],
            ['**retenido**', 'Apartado por una revisión'],
            ['**defectuoso**', 'Roto o fallado'],
            ['**vencido**', 'Fuera de fecha'],
          ],
        },
        {
          t: 'p',
          texto: 'Todo lo que cambia el stock deja un **movimiento**: compra, fraccionamiento, venta (granel y fraccionada), devolución, ajuste, merma, vencido, defectuoso, transferencia. Los movimientos son un **registro que no se edita ni se borra**: se corrigen con un movimiento opuesto, y por eso permiten explicar cualquier saldo. Cada fila dice cuándo, qué, dónde, **por qué** (el documento o motivo), cuánto valió si fue una pérdida (al costo del día) y **quién**.',
        },
        {
          t: 'lista',
          items: [
            'Los movimientos se miran en **dos lugares con la misma pantalla**: Compras › Historial y la pestaña **Movimientos** de Almacén › Existencias (el botón "Movs." de cada fila la abre ya filtrada por ese producto y sucursal).',
            '**Almacén › Operaciones** es el libro de cada almacén: una fila por documento (envío, recepción, compra recibida, ajuste, merma) en un rango de fechas. Los envíos y recepciones se valúan al **costo congelado al despachar**: un remito viejo dice siempre lo mismo aunque el costo haya cambiado. Los movimientos sueltos (ajuste, merma) figuran sin monto.',
          ],
        },
        { t: 'ruta', texto: 'Almacén › Existencias (Movimientos) · Almacén › Operaciones · Compras › Historial' },
      ],
    },
    {
      id: 'fraccionamiento',
      titulo: 'Fraccionamiento: del granel a los paquetes',
      bloques: [
        {
          t: 'p',
          texto: 'Un producto **a granel** (se cuenta en kg) se **fracciona** en **paquetes de tamaños fijos** ("Lentejas 500 g", "Lentejas 1 kg"). Fraccionar **baja los kilos del granel y sube los paquetes**, en un solo movimiento y en la misma sucursal. No se crea ni se destruye mercadería: se **convierte**. Planes Pymes y Corporativo.',
        },
        {
          t: 'p',
          texto: 'La pantalla tiene **dos pestañas**: **Fraccionar** (convierte granel en paquetes) y **Etiquetas** (solo imprime). Sacar etiquetas **no mueve stock**: se imprimen las que hagan falta, todas las veces que haga falta; la que sale corrida se tira y no pasó nada. Las dos acompañan el trabajo real (se fracciona, se sacan las etiquetas, se pegan y se asienta en el sistema) sin obligar a ningún orden.',
        },
        {
          t: 'lista',
          items: [
            '**Los tamaños se definen antes**: un granel sin tamaños de paquete cargados **no se puede fraccionar**. Es lo primero que hay que cargar (en la ficha del producto › pestaña Presentaciones); la pantalla lo marca en la fila y, si se abre igual, dice qué falta.',
            'Debajo del granel la pantalla muestra **solo los paquetes**, con una columna por sucursal y el total.',
            '**Corregir una tanda mal cargada** ("puse 20 y son 19"): botón **Corregir** en cada paquete. La corrección **mueve las dos puntas**: da de baja el paquete y **devuelve los kilos al granel**. El modal muestra la cuenta en vivo y no deja fabricar paquetes sin granel que los respalde. Es para el error de carga; una rotura es una merma o una incidencia.',
            'En el listado de Compras › Productos cada paquete aparece **debajo de su producto base** ("↳ Lentejas · 500 g"), con su stock en paquetes; se busca también por el código de barras de la etiqueta.',
          ],
        },
        {
          t: 'p',
          texto: '**El paquete tiene su propia pantalla**: Resumen (tamaño, código de barras, costo, precio, stock por sucursal en paquetes y en kg, movimientos), Formato de venta y Producto madre. La regla central: **el producto base cuenta la verdad total**. Con 5 kg sueltos y 10 paquetes de 500 g, el base muestra "5 kg suelto + 5 kg fraccionado = **10 kg en total**": la respuesta a "¿cuánto hay?", y comprar mirando solo lo suelto compraría de más.',
        },
        {
          t: 'tabla',
          cols: ['Qué', 'Cómo funciona'],
          filas: [
            ['**Costo y precio**', 'El **costo** del paquete es de solo lectura: se deriva del costo por kg del producto base × el tamaño, porque lo pone el proveedor. El **precio** es **propio** del paquete, con la misma libertad que un producto (markup o precio fijo, caja por N paquetes, mínimo, código).'],
            ['**Sin precio**', 'Un paquete sin formato de venta **no vale cero: no tiene precio**. La caja lo muestra pero no lo deja cargar y la etiqueta sale avisando. Almacén › Fraccionamiento tiene un contador **"N sin precio"** con la lista de lo que falta.'],
            ['**"Solo para fraccionar"**', 'Tilde en la ficha del granel que **no se vende suelto** (llega 1 kg y se fracciona entero en paquetes). El punto de venta no lo ofrece por kg y la venta suelta se rechaza; sus paquetes se venden normal.'],
            ['**Borrar un paquete con stock**', 'Se rechaza: esos paquetes existen en el depósito. Primero se venden o se ajustan.'],
            ['**Código de barras**', 'Se pide un **EAN-13 válido** (13 dígitos con el verificador cerrando) en todo código nuevo o editado, y avisa al lado de cada renglón qué le pasa. El botón **Generar** da un código propio, libre y sin repetir. Una presentación nueva **no puede nacer sin código**. Los códigos viejos que no cumplen pasan mientras no se toquen (se ven en amarillo). El mismo código no puede repetirse en un producto, un paquete o una caja.'],
            ['**Dos códigos distintos**', 'El **código del paquete** es el de su etiqueta (se carga una vez en Presentaciones). El **código de una fila del formato de venta** es el de la **caja de N paquetes**, para que escanearla cargue las N de una; por eso solo se habilita cuando "Vende por" es mayor a 1. A la caja no se le exige EAN-13: suele traer un DUN-14.'],
          ],
        },
        {
          t: 'p',
          texto: '**Las etiquetas** llevan nombre, peso, precio, código de barras y vencimiento. El **precio no se tipea**: sale del catálogo, de la lista base (mostrador) y con IVA incluido, el mismo número que cobra la caja. La fecha de vencimiento sale como "Vto 15/09/2026" (vacía, la etiqueta sale sin fecha). Se imprimen hasta 500 por vez, con **vista previa** en el tamaño real. El tamaño de la etiqueta se elige una vez en Sistema › Impresión.',
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'El código de barras se dibuja **EAN-13** cuando el código tiene 13 dígitos y el verificador cierra; cualquier otro se dibuja en **Code 39**, que ocupa mucho más ancho y algunos lectores baratos traen apagado. La pantalla avisa en ambos casos, y también si el código quedó **demasiado fino** para la etiqueta. Antes de imprimir una tanda larga, pasá el lector por **una** etiqueta.',
        },
        { t: 'ruta', texto: 'Almacén › Fraccionamiento (pestañas Fraccionar / Etiquetas) · Compras › Productos › (paquete) · ficha del producto › Presentaciones' },
      ],
    },
    {
      id: 'transferencias',
      titulo: 'Transferencias entre sucursales',
      bloques: [
        {
          t: 'p',
          texto: 'Cada local **pide lo que necesita** a cualquier otra sucursal. No son cuatro pantallas: es **un documento con estados**, y cada bandeja es un filtro por estado y por el papel que juega tu sucursal. Planes Pymes y Corporativo.',
        },
        { t: 'flujo', items: ['Armando (borrador)', 'Pedido', 'En preparación (dos listas)', 'Despachar (en tránsito)', 'Recibir contando'] },
        {
          t: 'tabla',
          cols: ['Paso', 'Qué pasa'],
          filas: [
            ['**Armando**', 'Nada con el stock, y **el origen no lo ve**. El pedido se guarda solo mientras se arma y no le llega a nadie hasta que se envía. Hay **uno por ruta** (origen → destino), del local y no de cada cajero: quien entra al turno sigue la lista del anterior. Se retoma desde el aviso "Seguir armando" y se puede descartar.'],
            ['**Pedido**', 'Nada con el stock: es demanda. Se arma en **tres pasos** (a quién le pido → qué se pide → revisar y enviar). El **destino es tu sucursal** y el origen ofrece las otras. Los productos se piden en dos pestañas: **Prod. Enteros** y **Prod. a granel**; cada una con su buscador, y en granel se piden **paquetes**. El paso 3 muestra el resumen, los kilos que el origen va a tener que fraccionar y **qué renglones el origen no puede cubrir hoy**: no frena el pedido, pero se sabe antes y no cuando llega el envío cortado.'],
            ['**En preparación**', 'El pedido se parte en dos listas: **Enteros** (para el preparador) y **Fraccionados** (para el fraccionador). **Cada encargado ve solo la suya.** Cada uno imprime su lista, ajusta lo preparado y agrega lo que llegó a último momento.'],
            ['**Confirmar lista**', 'La mercadería quedó apartada: se valida y **reserva esa lista** (de disponible a comprometido). Se rechaza renglón por renglón si se prepara más de lo disponible.'],
            ['**Despachar**', 'Exige las dos confirmaciones. Viaja **lo preparado** (no lo pedido): de comprometido a **en tránsito**, que sigue siendo del origen.'],
            ['**Recibir**', 'Se **cuenta contra lo enviado**. Lo contado entra al destino y el faltante vuelve a comprometido en el origen, con una **incidencia automática**.'],
          ],
        },
        {
          t: 'p',
          texto: 'Cada renglón lleva **tres cantidades**: **pedida** (lo que pidió el destino, no se toca), **preparada** (lo que el origen armó, con su motivo: "sin stock", "llegó tarde") y **recibida** (lo contado). El destino ve "≠ difiere de lo pedido" **antes** de abrir las cajas. Los renglones pedidos **no se borran**: si no hay, van en 0 con su motivo; solo se borran los agregados.',
        },
        {
          t: 'lista',
          items: [
            '**Lo que se pide a granel se fracciona del producto base**: la columna del origen muestra el **granel suelto en kg** y cuántos kilos hay que fraccionar. Los paquetes ya armados en el origen son su góndola y no viajan.',
            '**Reposición sugerida**: los productos bajo su mínimo en tu sucursal → "Generar pedido" lo arma con las cantidades que faltan.',
            '**Alerta de estancados**: un envío con 3 o más días en tránsito se marca en naranja (mercadería perdida o recepción sin registrar).',
            '**Recepción a ciegas** (opcional): contás sin ver lo esperado; si ves el número, todo el mundo aprieta "conforme".',
            '**Se acepta lo que llegó**, pero la diferencia **nunca desaparece**: queda atada a una incidencia que alguien tiene que cerrar (apareció → liberar; no apareció → merma con responsable).',
            '**Quién hace qué**: los encargados (permisos de preparar o fraccionar) toman el pedido y editan **solo su lista**. **Despachar y cancelar son del administrador.** **Recibe quien pide** (el cajero): armar el pedido y confirmar que llegó bien son las dos puntas del mismo trabajo.',
          ],
        },
        { t: 'ruta', texto: 'Almacén › Transferencias (parado en tu sucursal)' },
      ],
    },
    {
      id: 'incidencias',
      titulo: 'Incidencias: la cuarentena del stock',
      bloques: [
        {
          t: 'p',
          texto: 'Ante una anomalía **no se toca el stock a mano: se abre una incidencia** y la mercadería queda **en cuarentena**. La merma dice "esto se perdió, bajalo"; la incidencia dice "acá hay algo raro y todavía no sé qué, no lo vendas hasta que lo resolvamos". En cuarentena el stock existe y sigue valorizado, pero **no se puede vender**. Planes Pymes y Corporativo.',
        },
        {
          t: 'tabla',
          cols: ['Pieza', 'Cómo funciona'],
          filas: [
            ['**Cómo nace, a mano**', '**"+ Nueva incidencia"**. Seis tipos: etiqueta incorrecta, producto mal pesado, bolsa rota, diferencia de inventario, defectuoso, vencido. Valida que haya stock disponible y mueve esa cantidad a cuarentena. La puede crear el cajero.'],
            ['**Cómo nace, sola**', 'Al **recibir una transferencia con faltante**: la diferencia vuelve a cuarentena **en el origen**, con el motivo ya escrito ("se enviaron 10 y llegaron 8"). Es el uso más frecuente.'],
            ['**El ciclo**', 'Pendiente → revisión → resuelta. "A revisión" es un acuse ("lo estoy mirando"); **resolver es del administrador**.'],
            ['**Liberar**', 'Vuelve a disponible: apareció, era error de conteo o se corrigió la etiqueta. No es una pérdida.'],
            ['**Baja por merma / vencido / defectuoso**', 'Sale de cuarentena como pérdida y **congela el costo del día**: tiene que valer plata en el reporte.'],
          ],
        },
        {
          t: 'p',
          texto: 'Cada incidencia lleva un código (INC0001…) y el motivo; **no se borra nunca**. Una incidencia resuelta como baja figura en **Almacén › Vencimientos › Mermas** y suma en el reporte de pérdidas del período, con la marca "De incidencia". Los dos circuitos no se crean entre sí: un producto por vencer no abre una incidencia, y una incidencia de "producto vencido" no crea un registro de vencimiento.',
        },
        { t: 'ruta', texto: 'Almacén › Incidencias' },
      ],
    },
    {
      id: 'control-stock',
      titulo: 'Control de stock: el físico contra el sistema',
      bloques: [
        {
          t: 'p',
          texto: 'Se cuenta lo que hay en la góndola y el sistema lo compara contra lo que cree que hay. El conteo es una **sesión de trabajo** (dura horas, se interrumpe y la sigue quien entra al turno), **del local**, no de cada persona. Se hace con el **local cerrado**. Planes Pymes y Corporativo.',
        },
        {
          t: 'lista',
          items: [
            '**El alcance define qué se cuenta**: marca, categoría, proveedor, enteros o granel, y "solo con stock" (destildado entra también lo que figura en cero, para descubrir sobrantes). **La lista se congela al abrir**.',
            'Está pensada para el **lector**: escaneás el código, el foco cae en su renglón, tipeás la cantidad, Enter, y el foco vuelve al lector. El granel se cuenta **en kg** y cada tamaño de paquete **por paquetes**, en filas separadas.',
            '**Es ciego por defecto**: quien cuenta no ve cuánto "debería" haber; el sistema no se lo manda hasta que se cierra. El jefe puede abrir sesiones no ciegas.',
            'Si un renglón tiene mercadería **comprometida**, la pantalla lo dice para que no se cuente.',
            '**Cerrar → reporte de diferencias**: contado contra sistema, la diferencia **valorizada al costo del día**, faltante, sobrante y neto en pesos, y el botón **Recontar** por renglón (las diferencias grandes casi siempre son errores de conteo).',
            '**Aplicar** genera un lote de ajustes (cada uno atado a la sesión y con el costo congelado). Requiere un permiso propio: el administrador, o el encargado a quien se le dé.',
            '**🖨 Imprimir planilla**: la hoja que se lleva a la góndola, con un renglón por producto y el **casillero en blanco** para anotar a lápiz. **Nunca imprime la cantidad del sistema**. El formato se elige en Sistema › Impresión.',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'El ajuste se aplica **por diferencia, nunca por valor absoluto**: se corrige por *contado − lo que había al contar* sobre el stock actual. Si hubo movimientos entre contar y aplicar (se vendió algo con el local cerrado), el sistema los lista como alarma. **Lo que no se contó queda como está**: un pendiente no es un cero.',
        },
        {
          t: 'p',
          texto: 'Un producto no puede estar en **dos sesiones abiertas** de la misma sucursal. Ajustar un **paquete no toca al producto base**: un faltante de paquetes es una pérdida real, no un error de fraccionamiento (para eso está "Corregir").',
        },
        { t: 'ruta', texto: 'Almacén › Control de stock' },
      ],
    },
    {
      id: 'vencimientos',
      titulo: 'Vencimientos: el vigía de fechas',
      bloques: [
        {
          t: 'p',
          texto: 'El registro de un vencimiento **no es stock, es un vigía**. "6 unidades de X vencen el 15/9 en esta sucursal" se anota caminando la góndola, el sistema avisa a tiempo, y el stock se toca recién cuando algo venció y se procesa.',
        },
        {
          t: 'tabla',
          cols: ['Pestaña', 'Qué hace'],
          filas: [
            ['**Panel**', 'Las alertas por rango **excluyente**: vencidos sin procesar / 0-7 / 8-15 / 16-30 días, con la plata al costo congelado. Un registro vive en una sola tarjeta. Tocar una tarjeta lleva a Registros ya filtrado.'],
            ['**Control**', 'La sesión de góndola, en el orden físico del acto: **1· el producto** (botón 📷 **Escanear** con la cámara del celular, lector USB, o buscándolo por nombre o código) → **2· la fecha** impresa en el paquete → **3· cuántos hay** → Agregar. La fecha y la cantidad se conservan al agregar: cuando una tanda vence igual, el siguiente es escanear y agregar. Todo cae a una lista editable que se guarda de una vez; mismo producto y misma fecha se suman. Una fecha pasada avisa pero **deja**: es la forma de asentar lo encontrado tarde.'],
            ['**Registros**', 'Todo lo anotado, con filtros por rango y exportación a CSV. El **costo viaja congelado** al registrar. El botón **"Oferta"** lleva al alta de una oferta con el formulario ya lleno.'],
            ['**Ofertas**', 'El cruce con Ventas: qué mercadería vigilada está (o debería estar) en oferta, y qué se desalineó.'],
            ['**Vencidos**', 'El cierre del ciclo: **procesar** es contar cuántas se **vendieron antes de vencer** y cuántas se tiran. Separa pérdida **estimada** de pérdida **real**. Con "bajar del stock" tildado genera el movimiento "vencido" en la misma operación: o pasa todo o no pasó nada. Lo procesado no se edita ni se borra.'],
            ['**Mermas**', 'La baja de siempre (merma / vencido / defectuoso): registrar abre el modal con el producto precargado, y el listado muestra todas las bajas con su costo y su origen.'],
            ['**Reportes**', 'General (estimada, real y mermas), por sucursal, por categoría, **los que más vencen** (la señal para comprar distinto), historial mensual y controles hechos.'],
          ],
        },
        {
          t: 'p',
          texto: '**El botón "Oferta"** no abre un formulario propio: lleva al alta de **Ventas › Ofertas** con el producto en el alcance, la **fecha de fin = el día que vence** (el descuento nunca sobrevive a la mercadería), la **sucursal del lote**, 25% propuesto y una ficha arriba que dice cuántas unidades son, dónde y cuánta plata se pierde si no se venden. Al crearla, la oferta queda atada al registro ("🏷 En oferta").',
        },
        {
          t: 'tabla',
          cols: ['Aviso del cruce', 'Qué hacer'],
          filas: [
            ['🔴 **Mercadería vencida con la oferta corriendo**', 'Lo más caro: la caja vende con descuento algo que ya venció. Apagar la oferta y procesar el registro.'],
            ['🟡 **La oferta ya no alcanza al producto**', 'Se le cambió el alcance: el registro dice "en oferta" y la caja no descuenta. Corregir el alcance o desatar.'],
            ['🟡 **La oferta no corre en esa sucursal**', 'Está viva pero no en el local donde está el lote.'],
            ['🟡 **Apagada / terminada / arranca después**', 'La oferta del lote no está descontando y la mercadería todavía no venció: sin descuento no se va a ir.'],
            ['🔵 **La oferta corta antes de la fecha**', 'Quedan días de mercadería a precio lleno.'],
            ['🟡 **Venció y la oferta ya no descuenta**', 'No se regala nada, pero el registro sigue abierto: retirar y procesar.'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'Los días se cuentan **siempre contra el calendario de Argentina**. El globito del menú cuenta lo que apura: vencidos sin procesar más los que vencen en 7 días o menos. La **cámara** necesita una conexión segura (https), que es la de siempre del sistema en línea; el lector USB y la búsqueda por nombre funcionan siempre.',
        },
        { t: 'ruta', texto: 'Almacén › Vencimientos (permiso propio, para poder dar solo esta sección a un empleado por local)' },
      ],
    },
  ],
};
