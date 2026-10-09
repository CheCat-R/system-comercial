/** COMPRAS Y COSTOS — cómo entra la mercadería y de dónde sale el costo de cada producto. */
export const COMPRAS = {
  id: 'compras',
  titulo: 'Compras y costos',
  resumen: 'Cómo entra la mercadería, cómo se carga una factura y de dónde sale el costo.',
  temas: [
    {
      id: 'formato-compra',
      titulo: 'Formato de compra: cómo se le compra a cada proveedor',
      bloques: [
        {
          t: 'p',
          texto: 'Un **formato de compra** es una forma de comprar un producto: **proveedor + cantidad por bulto + costo**. Un producto puede tener varios (también del mismo proveedor: caja x12 y caja x24), y **uno solo fija el precio**, el marcado como **"Fija el precio"**. Su costo neto unitario es el que multiplica el markup al calcular el precio de venta.',
        },
        {
          t: 'lista',
          items: [
            'La **cantidad por bulto** hace comparables a dos proveedores que venden en presentaciones distintas: el costo unitario los pone en la misma escala.',
            'El primer proveedor puede cargarse **en el alta del producto** (campo "Con quién llega", con su costo de lista opcional): así el producto ya aparece en el buscador de la factura de ese proveedor desde el primer día. Los siguientes se suman en el Formato de compra.',
            'Al guardar, el sistema garantiza que **quede uno solo** marcado. Si se quita el que fijaba el precio, el primero que queda toma su lugar.',
            'Al **recibir mercadería**, el formato se marca solo **si el producto todavía no tenía ninguno**. Si ya tenía uno, cambiarlo es una decisión y se toma a mano.',
            'El **código del proveedor** (cómo lo llama ese proveedor en su factura) vive en el formato de compra, porque un mismo artículo tiene un código distinto en cada proveedor.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Productos › (abrir un producto) › Formato de Compra' },
      ],
    },
    {
      id: 'cadena-costos',
      titulo: 'Cómo se calcula el costo (descuentos, flete e IVA)',
      bloques: [
        { t: 'flujo', items: ['Costo de lista', '− descuentos', '+ flete', 'COSTO NETO', '+ IVA', 'Costo final'] },
        {
          t: 'ejemplo',
          titulo: 'Caja de 12, lista $19.024,55, flete 8%, IVA 21%',
          lineas: [
            'Costo de lista            $19.024,55   ← por el bulto de 12',
            'Costo de lista unitario    $1.585,38   ← ÷ 12',
            'Descuentos (0%)                    —',
            'Costo bruto (sin flete)   $19.024,55',
            'Flete 8%                   +$1.521,96',
            'COSTO NETO                $20.546,51   ← el que fija el precio',
            'IVA 21%                    +$4.314,77',
            'Costo final               $24.861,28   ← lo que se le paga al proveedor',
            'COSTO NETO UNITARIO        $1.712,21   ← × markup = precio',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'El **Costo final lleva IVA adentro y es solo informativo**: sirve para conciliar contra la factura del proveedor. El precio de venta se calcula **siempre desde el neto**; usar el final contaría el IVA dos veces.',
        },
        {
          t: 'p',
          texto: '**La escala de descuentos.** Son cuatro campos porque los proveedores dan escalas ("treinta y diez y cinco"). Se aplican **en cascada**, cada uno sobre lo que quedó del anterior: 30% y 10% **no** son 40%, son 37%. La pantalla muestra el **descuento efectivo** calculado al lado de los campos para no sumar de cabeza.',
        },
        {
          t: 'tabla',
          cols: ['Modo de carga', 'Qué se carga', 'Qué hace el sistema'],
          filas: [
            ['Costo de lista', 'El costo del bulto sin IVA', 'Aplica descuentos y flete'],
            ['Costo final con IVA', 'El total que factura el proveedor', 'Deriva el neto hacia atrás; ignora descuentos y flete'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'El modo es un **interruptor visible**, y se elige a propósito: no cambia solo aunque se borre un campo.',
        },
        { t: 'ruta', texto: 'Compras › Productos › (producto) › Formato de Compra' },
      ],
    },
    {
      id: 'carga-factura',
      titulo: 'Cargar una factura: el asistente de tres pasos',
      bloques: [
        {
          t: 'p',
          texto: 'El alta de un comprobante es un asistente de tres pasos: **1) Datos del comprobante** (tipo, proveedor, letra, punto de venta y número, fechas, sucursal de recepción), **2) Ítems** (los renglones y el impacto en precios) y **3) Pago y confirmación**. Se avanza con "Continuar" y se puede volver atrás sin perder nada, con los botones o tocando un paso ya recorrido arriba.',
        },
        {
          t: 'lista',
          items: [
            'El **proveedor se elige en el paso 1 y queda fijo**. Si el alta se abre desde la ficha de un proveedor (botones "+ Factura", "+ Remito"…), viene bloqueado con ese proveedor. Si se cambia el proveedor teniendo renglones cargados, **los renglones se vacían**: eran productos y costos del proveedor anterior.',
            'En el paso de ítems el buscador ofrece **solo los productos de ese proveedor** (los que tienen formato de compra con él). Cada resultado muestra además cuál es su proveedor activo hoy; ese cambio se decide abajo, en "Impacto en precios", viendo el precio de góndola que va a quedar.',
            'El **renglón es un buscador**: por nombre, código interno o código de barras (el escáner funciona). El costo que precarga es el de **este** proveedor, así la variación se compara contra su propia lista.',
            'Se carga **en bultos, como habla la factura**: llegaron 2 bolsas de 25 kg → Cantidad 2, y el sistema ingresa los 50 kg solo. El renglón muestra la cuenta ("50 kg · $2.000/kg") y, abajo, lo que entra al stock ("= 36 u.").',
            'Si un producto **entero vino suelto** (unidades que no completan el bulto), el selector debajo de la cantidad cambia el renglón a **"u. sueltas"**: cantidad y costo pasan a ser por unidad. Una entrega suelta no cambia el tamaño del bulto declarado en el formato de compra. El granel no tiene este selector.',
            'El **tamaño del bulto** sale del Formato de compra y en el renglón solo se muestra. Si el proveedor cambió la bolsa o la caja, se corrige en el Formato de compra, no en la factura.',
            '**Buscar en lote**: se filtra por texto, marca y categoría sobre los productos del proveedor, se tildan los que vinieron y entran todos juntos con su costo precargado. Lo ya cargado aparece deshabilitado ("ya en la factura").',
            'Si el proveedor es **monotributista o exento**, los renglones llevan **IVA 0** automáticamente (no discrimina IVA). Al cambiar de proveedor, los renglones siguen su condición.',
            'La tabla de **Impacto en precios** compara **por kg o por unidad, nunca por bulto**: $50.000 la bolsa de 25 kg contra $42.000 la de 20 kg parece una baja, pero es $2.000/kg contra $2.100/kg, una suba del 5%. Al tildar "actualizar costo", el precio del bulto y su tamaño viajan juntos al Formato de compra.',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'La compra **siempre ingresa el producto base**: el granel en kg, el entero en unidades. Los paquetes fraccionados (lenteja 500 g, 1 kg) se **producen** fraccionando el granel; no se compran. Si un proveedor vende un empaquetado que no se fracciona acá, es un producto entero nuevo.',
        },
        {
          t: 'p',
          texto: '**El pie de la factura** replica el papel en su orden, para cuadrar de un vistazo: subtotal de los ítems → bonificación → neto gravado → IVA → percepciones → **TOTAL**. Si el total del sistema coincide con el de la factura, la carga está bien; si no, falta algo. Solo muestra lo que la factura trajo: la bonificación y las percepciones se agregan con **"+ Bonificación"** y **"+ Percepciones"**.',
        },
        {
          t: 'lista',
          items: [
            'La **bonificación** es el descuento general del pie, aparte de los descuentos de cada renglón. Se escribe el porcentaje, el importe se calcula solo y se puede corregir al del papel (el proveedor redondea a su manera y manda el papel).',
            'El **IVA se calcula sobre el neto ya bonificado, renglón por renglón**: con dos alícuotas en la misma factura (21% y 10,5%), repartir el IVA total daría un número que no cierra con el libro.',
            'Las **percepciones** se configuran una vez por proveedor, y el botón "+ Percepciones" abre la lista para **tildar la que vino** (nunca se aplican solas: el mismo proveedor a veces las trae y a veces no). Son un pago a cuenta de otro impuesto (IVA, Ingresos Brutos): están en el total porque se le pagan al proveedor, pero **no son IVA ni van al crédito fiscal**.',
            'Cada línea del pie se puede cambiar o quitar. Quitar la bonificación recalcula las percepciones, porque su base cambió.',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'El control del total mira **la plata, no las cantidades**: 1 × $12.000 y 12 × $1.000 cierran igual, y el segundo mete el stock doce veces mal. **Mirá el número de bultos aparte**: si en el impacto en precios el costo unitario salta justo por el factor del bulto, no es un aumento, es una caja cargada como unidad.',
        },
        {
          t: 'lista',
          items: [
            '**Si el proveedor tiene pagos a cuenta** (los que hizo la cajera desde la sucursal), el paso 1 avisa cuánto hay esperando y el paso 3 ofrece **los de la sucursal de recepción** de la factura. Se **tilda** el que la factura explica; si se pagó por otro lado, no se tilda nada y se usa "Se paga ahora". Tomar un pago no mueve plata: el egreso ya quedó en el arqueo de la caja que pagó.',
            'Una **factura ya cargada** no se puede volver a cargar: el sistema frena el mismo número del mismo proveedor. Y cargar y pagar es **todo o nada**: si algo falla, no queda la mitad hecha. El doble clic no duplica el comprobante.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Facturación › + Nuevo comprobante · las percepciones se configuran en Compras › Costos y percepciones › (proveedor) › Percepciones' },
      ],
    },
    {
      id: 'tipos-comprobante',
      titulo: 'Facturas, remitos, liquidaciones y notas',
      bloques: [
        {
          t: 'tabla',
          cols: ['Tipo', '¿Mueve stock?', '¿Genera deuda?', '¿Es fiscal?'],
          filas: [
            ['**Factura**', 'Sí (con recepción)', 'Sí', 'Sí: IVA, CAE, va a ARCA'],
            ['**Remito**', 'Sí (con recepción)', 'No', 'No'],
            ['**Liquidación**', 'Sí (con recepción)', 'Sí', 'No'],
            ['**Nota de crédito**', 'Solo si se tilda "devuelve mercadería"', 'Resta deuda', 'Sí'],
            ['**Nota de débito**', 'No', 'Suma deuda', 'Sí'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**Remito**: es el documento de "**llegó la mercadería y la factura viene en camino**". Ingresa el stock para poder vender desde el primer día y queda en la pestaña **⚠ Remitos sin facturar** de Facturación. Cuando llega el papel se convierte con **"Llegó la factura"**: el remito **pasa a ser** la factura, sin volver a mover stock.',
            '**Liquidación**: para la mitad que algunos proveedores entregan **sin factura**. Esa mercadería entró al depósito y hay que pagarla, así que tiene que estar cargada, o el stock y la cuenta corriente mienten. Se carga como una factura, eligiendo el tipo "Liquidación (sin factura)": la pantalla se acomoda sola (letra X, sin IVA ni percepciones, el total es la mercadería). Se cargan las dos mitades como dos comprobantes del mismo proveedor.',
            'La **plata al proveedor es una sola**: las dos mitades caen en la misma cuenta corriente y se le paga junto. Facturación muestra un indicador **"Sin factura"** aparte del "Total facturado", que es el número que se compara contra el libro de IVA.',
            'Una liquidación **no tiene CAE ni QR**, no suma en ningún IVA y **no se ajusta con una nota de crédito** (la nota es fiscal; si vuelve mercadería de esa mitad, se corrige la liquidación). Tiene **permiso propio** (de fábrica, solo administrador y superadmin): sin él, el tipo no aparece.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Facturación › + Nuevo comprobante · el permiso de liquidaciones se da en Gerencia › Usuarios y roles' },
      ],
    },
    {
      id: 'notas-credito-debito',
      titulo: 'Notas de crédito y de débito de compra',
      bloques: [
        {
          t: 'p',
          texto: 'Una nota **nace de una factura**: la mercadería que se devolvió de esa entrega, o el flete que el proveedor olvidó cobrar en ese remito. Por eso, cuando el tipo es nota, el **paso 3** muestra las facturas de ese proveedor con su saldo para elegir cuál ajusta. La **nota de crédito resta** y la **de débito suma**. Lo que se ve al elegir una factura es su saldo hoy y **en cuánto queda** al registrar la nota.',
        },
        {
          t: 'lista',
          items: [
            '**Elegir la factura es obligatorio**, pero hay una opción **"no corresponde a una factura en particular"** para ajustes generales (una bonificación de fin de año): mueve la cuenta del proveedor pero no el saldo de ninguna factura. Sin elegir nada no deja registrar: sin referencia la nota quedaría flotando y se le terminaría pagando de más al proveedor.',
            'La nota solo puede ajustar una **factura** (no un remito ni otra nota), **del mismo proveedor** y **confirmada**.',
            '**El total del papel no cambia nunca**: la factura sigue diciendo lo que dice. Lo que cambia es cuánto queda debiéndose por ella, y eso es lo que ofrece la bandeja de pago. El detalle de la factura muestra sus notas con la cuenta completa.',
            'La **nota de débito que ajusta una factura no se paga por separado**: su importe ya está sumado al saldo de esa factura.',
            'Si la nota es **mayor que el saldo** (pasa cuando la factura ya estaba pagada y la mercadería se devolvió después), el sistema avisa pero deja registrar: el excedente queda a favor en la cuenta del proveedor. Pero una nota nunca puede superar el total de la factura que ajusta.',
            'Una nota de crédito **no siempre es una devolución** (también corrige un precio mal facturado o compensa un bulto roto que igual te quedaste), por eso el sistema no lo decide solo: en el alta de la nota hay un tilde **"Esta nota devuelve mercadería"**. Tildado, descuenta del stock los ítems que volvieron al proveedor.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Facturación › + Nuevo comprobante › (tipo Nota de crédito o de débito) › paso 3' },
      ],
    },
    {
      id: 'sin-factura',
      titulo: 'La mercadería sin factura',
      bloques: [
        {
          t: 'p',
          texto: 'El producto comprado en liquidación (total o parcialmente) **no puede trasladarle al cliente un IVA que nunca se pagó**: al facturar la venta, ese IVA lo absorbe el negocio. En el Formato de compra hay un campo **"Sin factura %"**: **100** = liquidación pura, **50** = mitad y mitad. La cuenta la hace el sistema, exacta y para cualquier alícuota.',
        },
        {
          t: 'p',
          texto: 'El costo se parte en dos: el **costo real** (lo que la mercadería cuesta: valúa stock, pérdidas y transferencias) y la **base del precio** (lo que multiplica el markup: a la parte sin factura se le quita el IVA que se va a absorber). La diferencia es el **IVA absorbido**: plata que sale del margen al vender.',
        },
        {
          t: 'ejemplo',
          titulo: 'Compra de $100 toda sin factura, IVA 21%, markup 40%',
          lineas: [
            'Costo real                  $100,00   ← lo que pagaste',
            'Base del precio              $82,64   ← ÷ 1,21',
            'IVA absorbido                $17,36   ← lo pierde el margen al vender',
            '',
            'Precio final (markup 40%)   $140,00',
            'Venta neta                  $115,70',
            'Ganancia real          $15,70 (15,7%)  ← no 40: la diferencia es el IVA',
          ],
        },
        {
          t: 'lista',
          items: [
            'El **flete** acompaña la misma cuenta que la mercadería: viene facturado por el transportista, su IVA vuelve como crédito fiscal, así que entra a la base del precio en neto.',
            'El porcentaje se **precarga desde la ficha del proveedor** ("Qué emite" y su número) y se puede ajustar por producto.',
            'El markup se carga como siempre, pero en estos productos **deja de ser tu ganancia real**: poné 40 y ganás 15,7. **Gerencia › Rentabilidad** muestra las dos columnas, margen aparente y real. Cada venta **congela** su costo real, su IVA absorbido y el porcentaje del momento.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Productos › detalle › Formato de Compra › "Sin factura %" · Proveedores › Proveedores › Ficha · Gerencia › Rentabilidad' },
      ],
    },
    {
      id: 'importar-catalogo',
      titulo: 'Importar el catálogo de un proveedor',
      bloques: [
        {
          t: 'p',
          texto: 'Para dar de alta cientos de productos de una vez: se cargan los tres listados que exporta el sistema de gestión anterior (**productos**, **formatos de compra** y **formatos de venta**) tal como salen. Se reconocen **por sus columnas**, así que el orden en que se eligen no importa.',
        },
        { t: 'flujo', items: ['Elegir archivos', 'Proveedor y listas', 'VISTA PREVIA', 'Se escribe todo junto'] },
        {
          t: 'lista',
          items: [
            '**No se puede importar sin ver la vista previa.** Muestra cuántos productos y presentaciones entran, qué rubros se asignaron y, sobre todo, **qué precios se mueven**.',
            'Los **paquetes fraccionados** ("x100g / x250g / x1kg") **no entran como productos**: son presentaciones de su producto base y se atan solas por el nombre, con su código de barras y su propio formato de venta.',
            'El **costo sale del formato de compra**: lista − descuentos en cascada + flete ÷ bulto. El costo del maestro del sistema anterior suele traer el IVA adentro y acá los costos se guardan netos.',
            'El **rubro se deduce del nombre** del producto. "GRANEL" o "VARIOS" no se toman como marca.',
            'Se escribe **todo junto o nada**, y es **repetible**: lo que ya existe con el mismo código interno no se toca y se informa al final, así que reimportar el mismo archivo no duplica nada. Un producto archivado no se reactiva en silencio: se avisa que hay que reactivarlo.',
            'El **stock arranca en cero**: entra con la primera factura de compra (los archivos no traen existencias).',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'La vista previa separa los precios que cambian en dos: hasta **15%** es el costo que se actualizó y el precio que venía atrasado (normal). **Más de 15% casi siempre significa que en el archivo el costo del producto y el de su paquete no coinciden**: uno de los dos está mal. Quedan con el costo real, pero conviene revisarlos con la factura del proveedor a mano antes de vender.',
        },
        { t: 'ruta', texto: 'Compras › Productos › Importar catálogo' },
      ],
    },
    {
      id: 'productos',
      titulo: 'Cargar un producto y leer su ficha',
      bloques: [
        {
          t: 'p',
          texto: 'El alta de un producto es un asistente de **dos etapas**: **1) El producto en sí** y **2) Con quién llega** (el primer proveedor y su costo, que es lo que después permite calcular el precio de cada lista).',
        },
        {
          t: 'lista',
          items: [
            '**Entero o a granel** es lo primero que se decide y **no se cambia después de crearlo**: entero = se cuenta por unidad; granel = se vende por peso y se puede fraccionar en paquetes. En un granel, el tilde **"Solo para fraccionar"** lo deja fuera de la venta suelta (ver Stock › Fraccionamiento).',
            '**Identificación**: el **Concepto** es el nombre del producto (el único dato obligatorio de la etapa 1), con una descripción adicional opcional; los tres códigos (propio, de barras y DUN) son opcionales y no pueden repetirse (ver Catálogos).',
            '**Marca, categoría y subcategoría** se eligen del catálogo; desde el mismo formulario se pueden administrar (agregar o renombrar).',
            '**Valores**: unidades por bulto, tasa de **IVA** y **tipo de redondeo** ("Heredar de configuración" usa el general; ver Precios).',
            '**Etapa 2**: el proveedor con el que llega, su código para ese producto, el **costo de lista neto**, el **flete %** y la **escala de descuentos** en cascada. Con eso el producto ya aparece en el buscador de las facturas de ese proveedor.',
          ],
        },
        {
          t: 'p',
          texto: '**La ficha** (clic en el producto) tiene pestañas: **Resumen** (tipo, marca, categoría, IVA, proveedor activo, lo disponible y su valor al costo), **Formato de Compra**, **Formato de Venta**, **Evolución de precios** y, solo en los granel, **Presentaciones** (los tamaños de paquete). Editar el producto es de administración.',
        },
        { t: 'ruta', texto: 'Compras › Productos › + Nuevo producto · clic en un producto para abrir su ficha' },
      ],
    },
    {
      id: 'baja-producto',
      titulo: 'El producto que ya no se trae: dar de baja, no borrar',
      bloques: [
        {
          t: 'p',
          texto: 'Un producto con historia **no se borra**: se da de baja, que son **dos decisiones distintas**.',
        },
        {
          t: 'tabla',
          cols: ['Estado', 'Compras', 'Punto de venta', 'Para qué es'],
          filas: [
            ['**Activo**', 'Aparece', 'Aparece', 'Todo normal.'],
            ['**Discontinuado**', 'No aparece (ni en la carga de facturas ni en la reposición por stock mínimo)', 'Sigue vendiéndose', 'El proveedor lo bajó o se decidió no reponerlo, pero lo que queda en góndola se termina de vender.'],
            ['**Archivado**', 'No', 'No', 'Fuera de catálogo. Exige que no quede stock: si queda, el sistema dice cuánto y dónde, y ofrece dejarlo discontinuado.'],
          ],
        },
        {
          t: 'pasos',
          items: [
            '**Dar de baja**: en Compras › Productos, botón **Dar de baja** en la fila. Explica las dos opciones, pide un motivo y muestra el stock que todavía hay y en qué sucursal.',
            '**Verlos y reactivarlos**: el listado muestra por defecto lo que está en juego (activos y discontinuados, con una marca en los no activos). El filtro de estado llega hasta los archivados, que es el camino para reactivar uno. **Reactivar conserva todo**: códigos, historial de precios, presentaciones y formatos de compra; el modal avisa de cuándo es el último costo cargado.',
            '**Eliminar de verdad** queda solo para un producto que **no dejó ninguna huella** (un duplicado, un alta equivocada). Si ya se compró, vendió o movió, el sistema dice cuál es la huella ("2 ventas, 1 movimiento de stock") y ofrece la baja.',
          ],
        },
        {
          t: 'lista',
          items: [
            'Cuando un **discontinuado se agota**, el sistema **sugiere** archivarlo (aviso arriba del listado, con un botón que los archiva), pero lo hace una persona y recién a los **30 días** sin movimiento, porque al principio una devolución es probable.',
            'Si **reaparece stock** de un archivado, vuelve **solo** a discontinuado (con el motivo anotado): mercadería que existe tiene que poder venderse.',
            'El estado **no se cambia editando** el producto: tiene su propia acción.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Productos › Dar de baja / Reactivar · filtro de estado' },
      ],
    },
    {
      id: 'catalogos',
      titulo: 'Catálogos: marcas, categorías, etiquetas y códigos',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Marcas, categorías, subcategorías y etiquetas** son registros propios, no texto suelto: renombrar una no rompe nada, y **"Cachafaz" y "CACHAFAZ" no son dos marcas distintas** (se comparan sin acentos, mayúsculas ni espacios de más).',
            'Lo que está en uso **se desactiva, no se borra**. Si ya entraron duplicados, **Fusionar** los junta en uno.',
            'La **subcategoría** pertenece a una categoría y es opcional. Al cambiar la categoría, la subcategoría elegida se limpia porque dejó de ser válida.',
          ],
        },
        {
          t: 'tabla',
          cols: ['Código', 'Identifica'],
          filas: [
            ['Código propio', 'El código interno; el que se tipea cuando no hay etiqueta'],
            ['Código de barras', 'El EAN de la unidad de venta'],
            ['DUN', 'El EAN-14 del bulto cerrado'],
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'Los tres códigos son **únicos** cuando no están vacíos, y además **no pueden repetirse entre sí ni contra los de los paquetes fraccionados**: si dos cosas responden al mismo código, el lector de la caja no sabría cuál elegir.',
        },
        { t: 'ruta', texto: 'Compras › Catálogos' },
      ],
    },
  ],
};
