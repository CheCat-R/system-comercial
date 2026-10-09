/** PROVEEDORES Y PAGOS — la ficha de cada proveedor, sus cuentas y cómo se le paga. */
export const PROVEEDORES = {
  id: 'proveedores',
  titulo: 'Proveedores y pagos',
  resumen: 'La ficha, la baja, pedidos, cuentas corrientes, echeqs, estados de cuenta y pagos.',
  temas: [
    {
      id: 'prov-modulo',
      titulo: 'Qué hay en el módulo Proveedores',
      bloques: [
        {
          t: 'p',
          texto: 'Junta lo que tiene que ver con la relación comercial con cada proveedor: a quién hay que pedirle, qué promesas de pago hay firmadas, la cartera de echeqs y cuánto se le debe de verdad. **La deuda nace solo de la factura cargada en Compras (o del gasto)**: acá no se tipean deudas, se administran.',
        },
        {
          t: 'tabla',
          cols: ['Sección', 'Qué es', 'Plan'],
          filas: [
            ['**Proveedores**', 'El padrón único del sistema: la ficha fiscal y comercial completa.', 'Todos'],
            ['**Pedidos**', 'La pizarra interna: Solicitado / Pedido / Para retomar, y el historial de ingresos con la demora real.', 'Todos'],
            ['**Cuentas corrientes**', 'Los compromisos de pago con fecha. Nacen solos al confirmar la factura de un proveedor diferido.', 'Pymes y Corporativo'],
            ['**Echeqs**', 'La cartera de echeqs propios. Cobrarlo **es** el pago real.', 'Pymes y Corporativo'],
            ['**Estados de cuenta**', 'El saldo con cada proveedor de mercadería y su cuenta en pantalla propia: el mayor completo, lo impago y el botón para pagarle.', 'Pymes y Corporativo'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'El módulo es de **dueño y administrador** (de fábrica, los permisos de Proveedores los tiene solo el rol administrador). En Compras quedó **Costos y percepciones**: lo operativo del proveedor que no es su ficha (los costos por producto con la regla masiva, las percepciones que cobra, sus operaciones y su cuenta).',
        },
        { t: 'ruta', texto: 'Proveedores (módulo propio en el menú) · Compras › Costos y percepciones' },
      ],
    },
    {
      id: 'prov-ficha',
      titulo: 'La ficha del proveedor y el modo de cuenta',
      bloques: [
        {
          t: 'p',
          texto: 'Hay **una sola ficha de proveedor** y vive en este módulo. Reúne: identidad (nombre, CUIT, contacto), clasificación (**provee mercadería** y/o **provee gastos**, condición de IVA, letra con la que factura), y lo comercial: **qué emite** (factura, liquidación o mixto), **cómo cobra** (efectivo, transferencia, depósito, echeq, cuenta corriente), **días de plazo** (obligatorio si cobra diferido), el **modo de cuenta** y hasta 5 **cuentas bancarias** (CBU o alias) para transferirle.',
        },
        {
          t: 'tabla',
          cols: ['Modo de cuenta', 'Qué significa'],
          filas: [
            ['**Por facturas**', 'La factura se paga **completa** (o la cuota pactada). El sistema rechaza el pago parcial suelto. Es el modo de casi todos.'],
            ['**Libre**', 'Acepta pagos a cuenta de cualquier importe; la antigüedad de la deuda se calcula con el criterio "lo más viejo primero".'],
          ],
        },
        {
          t: 'lista',
          items: [
            'El **CUIT** de cada proveedor conviene tenerlo cargado: identifica al proveedor sin ambigüedad.',
            'Si un proveedor de mercadería **también factura gastos** (el flete aparte, un service), se tilda **Provee gastos** en su ficha: el padrón es uno y las dos casillas conviven. Un gasto puede ir sin proveedor ("A nombre de…") para un ticket suelto.',
            'La **letra** con la que factura se carga una vez y se precarga al elegirlo en un gasto.',
          ],
        },
        { t: 'ruta', texto: 'Proveedores › Proveedores' },
      ],
    },
    {
      id: 'prov-baja',
      titulo: 'Quitar un proveedor: baja, no borrado',
      bloques: [
        {
          t: 'p',
          texto: 'Un proveedor con historia **no se borra**. **Eliminar** solo se ofrece cuando estaba cargado de más: sin facturas, pagos ni productos. En los demás casos se lo da de **baja**: sigue en el padrón para consultar su cuenta y sus comprobantes, pero **deja de ofrecerse en las compras nuevas**.',
        },
        {
          t: 'lista',
          items: [
            'Al elegir "Quitar proveedor", el sistema revisa **qué tiene cargado** y lo muestra.',
            'Si es el **proveedor activo** de productos que tienen **otro proveedor**, hay que **activar primero al otro** en esos productos (el precio hoy sale de este proveedor). El sistema los lista y el botón queda apagado hasta resolverlo.',
            'Los productos que **solo él** vendía se pueden **dar de baja junto con él** (tilde "Ya no los va a traer"): quedan **discontinuados**, se venden hasta agotar y dejan de comprarse.',
            'Se puede anotar un **motivo**. **Reactivar** devuelve al proveedor a las compras nuevas, con todo lo que tenía.',
            'Nada de esto borra historial: el proveedor y su cuenta siguen disponibles para consultar.',
          ],
        },
        { t: 'ruta', texto: 'Proveedores › Proveedores › (el proveedor) › Quitar' },
      ],
    },
    {
      id: 'prov-pedidos',
      titulo: 'Pedidos: la pizarra',
      bloques: [
        {
          t: 'p',
          texto: 'Información interna entre el administrador y el encargado de compras. **No toca stock ni deuda**: la mercadería y la plata entran al cargar la factura en Compras. **"+ Solicitar pedidos"** tilda varios proveedores y crea una tarjeta por cada uno en **Solicitado**; **"Ya lo pedí"** registra el pedido hecho por teléfono y entra directo en **Pedido**, con fecha de hoy.',
        },
        {
          t: 'lista',
          items: [
            'La tarjeta en Solicitado tiene **Enviado ✓** (se le mandó el pedido) y **Ya lo vi** (el administrador la revisó); se reinician al mover de columna.',
            '**→ Pedido** cuando se le pidió en serio. **Aparcar** la manda a **"Para retomar"** (sin fecha, para más adelante).',
            '**✓ Recibido** la saca de la pizarra y la manda al historial de **Ingresos**: cuándo se pidió, cuándo llegó y cuántos días tardó, con la demora promedio.',
            'Las notas son **texto libre** ("yerba x 20, harina integral"): es la nota entre ustedes, no un remito.',
          ],
        },
        { t: 'ruta', texto: 'Proveedores › Pedidos (el globito cuenta los no recibidos)' },
      ],
    },
    {
      id: 'prov-ctasctes',
      titulo: 'Cuentas corrientes y echeqs',
      bloques: [
        {
          t: 'p',
          texto: 'Un **compromiso** es una promesa de pago con fecha. Nace **solo** al confirmar la factura (o liquidación) de un proveedor que cobra **cuenta corriente o echeq**: el alta de la factura muestra la sección "Compromiso de pago" prellenada (una cuota por el saldo, con vencimiento a los días de plazo de la ficha) y se puede partir en **cuotas** que tienen que sumar el saldo. También se puede crear uno manual suelto.',
        },
        {
          t: 'lista',
          items: [
            'El compromiso **se cierra solo** cuando el pago salda la factura (con las notas de crédito descontadas), y si ese pago después se anula, **se reabre solo**. Nunca hay que marcar nada a mano: el botón **Pagar** de la fila arma el pago con su aplicación en un solo paso.',
            'Con el modo **por facturas**, el pago tiene que ser el saldo completo o coincidir con una cuota pactada. Si el proveedor acepta pagos sueltos, se cambia su modo de cuenta a "libre".',
            '**Echeqs**: solo los **propios** (emitidos por la empresa). Con la factura de un proveedor que cobra así nace un echeq con el número "a completar"; el número y el banco reales se completan al emitirlo. Estados: **emitido → entregado → cobrado** (anulado aparte; "vencido" se deriva de la fecha).',
            '**Cobrar el echeq es el momento contable**: cuando el banco lo debita, "Cobrar" crea el pago real (medio echeq, con la fecha del débito), lo aplica a la factura y cierra el compromiso, todo junto. Por eso un compromiso de echeq no se paga desde Cuentas corrientes: **se cobra desde Echeqs**. Un echeq cobrado no retrocede; si el pago estuvo mal, se anula desde Pagos.',
            'Un compromiso o echeq **no se paga dos veces** aunque se aprieten dos botones a la vez.',
          ],
        },
        { t: 'ruta', texto: 'Proveedores › Cuentas corrientes (el globito: vencidos + próximos 3 días) · Proveedores › Echeqs (vencidos sin cobrar + debitan en 3 días)' },
      ],
    },
    {
      id: 'prov-edoc',
      titulo: 'Estados de cuenta: el saldo real',
      bloques: [
        {
          t: 'p',
          texto: 'La foto global: **saldo = facturado (mercadería) + gastos + ajustes − pagado**, por proveedor. Al lado, lo **comprometido** y el **proyectado** (saldo − comprometido). El estado sale del documento impago más viejo contra los días de plazo: al día / pendiente / vencido / a favor. **Acá van solo los proveedores de mercadería**: el que solo factura gastos tiene su cuenta en el módulo Gastos.',
        },
        {
          t: 'p',
          texto: 'La fila abre **la cuenta completa del proveedor** en pantalla propia: su ficha, el saldo y **de qué está hecho** (mercadería, notas de crédito, gastos, ajustes, pagado), lo que **le queda impago documento por documento** (con botón Pagar), los compromisos pendientes, el **mayor entero con saldo acumulado** (filtrable por tipo, fechas y texto) y las cuentas bancarias. Se vuelve con **← Estados de cuenta**.',
        },
        {
          t: 'lista',
          items: [
            '**"Registrar un pago"**: se **tildan las facturas que cancela** en el mismo acto, y el importe es la **suma exacta** de sus saldos (no se edita, así nunca se pasa de lo que se debe). Sin tildar nada, queda **a cuenta** y baja el saldo del proveedor; se aplica después desde la factura.',
            'Un pago que deja la factura saldada **cierra sus compromisos solo**, y **anularlo los reabre**. **Anular** pide un motivo, lo hace solo administración y **solo si el pago no tiene nada aplicado**: con aplicaciones vivas hay que desaplicarlas primero.',
            'Un pago vive en **una** bandeja: si se tilda una factura de mercadería y un gasto a la vez, la pantalla explica que van dos pagos.',
            '**Ajustes manuales** (debe/haber) con **motivo obligatorio**: la diferencia de flete, el redondeo que el proveedor perdonó.',
            '**"Concilié con su resumen"** deja sellado hasta qué fecha se cuadró con el resumen del proveedor.',
            'El pago acepta **varias formas** (se partió en varios medios, cada parte con su fecha); el egreso de caja sale solo por la parte en efectivo.',
            'El mayor ordena **por día** y, dentro del día, primero lo que genera la deuda y después lo que la cancela.',
          ],
        },
        { t: 'ruta', texto: 'Proveedores › Estados de cuenta › (la fila o "Ver cuenta") · los ajustes y las anulaciones, solo administración' },
      ],
    },
    {
      id: 'prov-flete',
      titulo: 'El flete que el proveedor descuenta',
      bloques: [
        {
          t: 'p',
          texto: 'Llega el camión: a la cajera le deja **la factura de la mercadería** y **el remito del flete**, y ella le paga el flete al fletero de su caja. Son dos papeles distintos. **La factura se carga tal cual dice**, por su total. El flete queda como plata que ya se le adelantó al proveedor (es de él, no un gasto nuestro) y **se descuenta recién cuando se le paga la cuenta corriente**.',
        },
        { t: 'flujo', items: ['La cajera paga el flete', 'El administrativo carga el remito', 'La factura entra por su total', 'Al pagar, se descuenta el flete'] },
        {
          t: 'ejemplo',
          titulo: 'Mercadería $100.000, flete $20.000',
          lineas: [
            'Factura de mercadería      $100.000   ← se carga tal cual',
            'Flete pagado de caja        $20.000   ← queda a cuenta del proveedor',
            'Debe el proveedor           $80.000   ← su cuenta corriente',
            '',
            'Al pagar: se tilda la factura y se tilda el flete',
            'A transferir                $80.000',
            'La factura queda            SALDADA   ← $80.000 + $20.000 de flete',
          ],
        },
        {
          t: 'lista',
          items: [
            '**La cajera**: Ventas › Caja › Ingreso / egreso → Egreso → "Pago a un proveedor" → Mercadería → el proveedor → tilde **"Es el flete de esta entrega"**. Sale el egreso de caja con hora y nombre (eso es el recibo) y queda en Compras › Pagos en sucursal marcado **Flete**.',
            '**El remito lo carga el administrativo**, que tiene el papel: abre el pago en Compras › Pagos en sucursal y completa el **Nº de remito y el transportista**. No toca un peso, así que se puede hacer al día siguiente aunque el turno ya esté cerrado.',
            '**Al pagarle** (Estados de cuenta › Registrar un pago) aparece la sección **"Fletes ya pagados de caja"**: se tilda la factura y los fletes, el importe a transferir baja solo y la factura **igual queda saldada**. Si el flete cubre todo, el botón pasa a decir **"Descontar $X de flete"**.',
            'Si el proveedor reconoce **menos** de lo que se le pagó al fletero, descontás lo que reconoce y la diferencia queda a la vista; se cierra con un **ajuste debe** en su estado de cuenta, con el motivo escrito.',
            'El **flete propio** (el que contratás vos y nadie te reintegra) **no se tilda**: es un gasto y va por el módulo Gastos. Y el **% de flete del Formato de compra** es otra cosa: forma parte del costo del producto.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Caja › Ingreso / egreso · Compras › Pagos en sucursal · Proveedores › Estados de cuenta › Registrar un pago' },
      ],
    },
    {
      id: 'pagos-proveedor',
      titulo: 'Pagos a proveedores: la plata sale una sola vez',
      bloques: [
        {
          t: 'p',
          texto: 'El pago es **del proveedor**, no del documento. Eso permite el caso de todos los días: llega el pedido a la sucursal, la cajera le paga al repartidor y **no carga la factura** (no le corresponde y no tiene los datos). La plata ya salió del cajón a las 10:40; la factura la carga el administrador al otro día.',
        },
        {
          t: 'tabla',
          cols: ['Momento', 'Qué pasa'],
          filas: [
            ['**La cajera paga**', 'Ventas › Caja › **Ingreso / egreso** › Egreso › **Pago a un proveedor**: elige el **tipo** (Mercadería o Gastos), el proveedor, el importe, el concepto y el remito. Sale el egreso de caja con hora y nombre y el pago queda **a cuenta**.'],
            ['**Mientras tanto**', 'El tipo elegido decide la bandeja: Mercadería → **Compras › Facturación › Pagos en sucursal**; Gastos → **Gastos › Gastos › Pagos en sucursal**. Son de **solo lectura**: el control de "qué plata salió y todavía no tiene comprobante".'],
            ['**El administrador carga la factura**', 'En el paso **Pago y confirmación** se ofrecen los pagos a cuenta de ese proveedor **de la sucursal de recepción**. Se tilda el que la factura explica y el resto se cubre al contado. Tomarlo ahí es lo que lo **aplica**.'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**La plata sale una sola vez**, al registrar el pago. **Aplicarlo después no vuelve a mover plata**: solo dice contra qué documento se descuenta.',
            'En el alta de una factura: **"Tomar pagos de sucursal"** aplica plata que ya salió; **"Se paga ahora"** registra el pago en el acto (de la **caja de la sucursal**, si hay turno abierto, o de **administración sin caja** para una transferencia); lo que **queda** va a cuenta corriente, y recién ahí tiene sentido el vencimiento.',
            'La **condición de pago** se deriva de lo que se pagó (saldada = contado, con saldo = cuenta corriente); no se elige.',
            'Un pago **sin aplicar no es un gasto todavía**: es un crédito contra el proveedor. El gasto lo genera siempre el comprobante.',
            'Un pago cubre **varios documentos** y un documento se cubre con **varios pagos**. "Repartir todo el saldo" reparte del más viejo al más nuevo, sin aplicar nunca más de lo que cada documento debe. Solo se aplica a documentos del **mismo proveedor** y **del mismo tipo** (mercadería o gastos); si la cajera eligió mal, el pago se **mueve de bandeja** mientras no tenga nada aplicado.',
            'Un gasto **con pagos aplicados** no se anula ni se le cambian importes, número o proveedor: primero se quita la aplicación. **Quitar** una aplicación no devuelve plata. **Anular** un pago exige que no tenga nada aplicado, y un pago de un turno **ya cerrado** no se anula (el reintegro va como ingreso del turno actual).',
            '**La bandeja es el control**: un pago que lleva días sin aplicar significa que falta cargar el comprobante, o que salió plata sin respaldo.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Caja › Ingreso / egreso · Compras › Facturación (Pagos en sucursal) · Gastos › Gastos (Pagos en sucursal)' },
      ],
    },
  ],
};
