/** VENTAS — el punto de venta, los presupuestos, el listado, las notas de crédito, ARCA y la caja. */
export const VENTAS = {
  id: 'ventas',
  titulo: 'Ventas y caja',
  resumen: 'Cobrar, presupuestos, listado de ventas, facturar con ARCA y arqueo de caja.',
  temas: [
    {
      id: 'punto-de-venta',
      titulo: 'Vender y cobrar en el punto de venta',
      bloques: [
        {
          t: 'p',
          texto: 'Se pueden tener **varias ventas abiertas a la vez**, en pestañas: un cliente se va a buscar algo y vuelve, y su venta lo espera. Cerrar la pestaña **no descarta la venta**: queda en la tabla de ventas en curso. Abrir una venta entra en modo **registradora**: pantalla completa, solo lo que necesita el cajero. Los borradores se guardan solos mientras se carga.',
        },
        {
          t: 'tabla',
          cols: ['Forma de cerrar', 'Comprobante', 'Condición'],
          filas: [
            ['**Liquidar (F10)**', 'Ticket interno', 'Siempre contado'],
            ['**Facturar (F8)**', 'Fiscal: la letra la resuelve el sistema', 'Admite cuenta corriente'],
          ],
        },
        {
          t: 'lista',
          items: [
            'El cobro está pensado para la velocidad: el total grande y el foco directo en **"Con cuánto paga"**. Se tipea lo que entrega el cliente, el **vuelto** salta a la vista y **Enter cobra** (vacío = pagó justo).',
            'El selector **Contado / Cta. Cte.** solo aparece si **ese cliente** tiene la cuenta corriente habilitada; si no, toda venta es al contado.',
            'Admite **pago mixto** (mitad efectivo, mitad transferencia). La letra del comprobante sale de cruzar la condición de IVA del cliente con la de la empresa.',
            'Cobrado el ticket, el modal ofrece **imprimir** y **Nuevo ticket**, que abre otra venta en el mismo puesto con el foco en el buscador: el movimiento de una caja con cola.',
            'La caja pide **turno abierto** si así está configurado.',
            'Un ticket se **cobra una sola vez** aunque se apriete dos veces el botón o se corte la conexión: el sistema lo reconoce.',
            '**El precio lo decide el sistema**: la pantalla propone, pero el precio, el IVA y las ofertas se vuelven a calcular al cobrar. El ticket cobra lo que dice la góndola.',
            'Para **pisar un precio** a mano hace falta un permiso propio, y los descuentos del vendedor tienen un tope configurable.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Punto de venta · la Caja es otra sección: el punto de venta solo muestra el estado del turno' },
      ],
    },
    {
      id: 'presupuestos',
      titulo: 'Presupuestos (pedidos mayoristas)',
      bloques: [
        {
          t: 'p',
          texto: 'La **bandeja de los pedidos mayoristas**: llegan por WhatsApp (se cotizan a mano en el punto de venta). El presupuesto **no es fiscal ni toca la caja**: es la palabra dada al cliente, con precios congelados. Planes Pymes y Corporativo.',
        },
        { t: 'flujo', items: ['Cotizar en el POS', 'Enviar (validez)', 'Confirmar (reserva stock)', 'Armar con la hoja', 'Cerrar en POS (venta real)'] },
        {
          t: 'tabla',
          cols: ['Paso', 'Qué pasa'],
          filas: [
            ['Cotizar', 'En el punto de venta, con el botón **Presupuesto** del ticket: cotiza con el mismo motor de listas y ofertas que la caja.'],
            ['Enviar', 'Congela la palabra y arranca la **validez** (configurable, 7 días). El botón **WhatsApp** abre el chat del cliente con el presupuesto ya escrito; solo queda tocar enviar. Un enviado con la fecha pasada se muestra **Vencido** solo.'],
            ['Confirmar', 'El cliente dijo que sí: se **reserva el stock** (de disponible a comprometido), así que mientras el vendedor arma, la caja no puede vender esa mercadería. Un vencido no se confirma: se reabre y se vuelve a cotizar.'],
            ['Armar', 'La **hoja de armado** sale sin precios, con columna en blanco para el lápiz. Al volver se carga pedida / armada / motivo, y la venta sale por **lo armado**.'],
            ['Cerrar', '**"Cerrar en POS"** crea la venta con lo armado y los precios congelados; el cajero agrega o saca lo que el cliente pida y cobra normal. Al cobrar, el presupuesto se cierra solo y la reserva se libera.'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**Pagos**: si paga al retirar, la venta se cierra ese día al contado. Si transfirió antes, se cierra al momento del pago y el ticket queda junto al pedido esperando el retiro.',
            '**Entregas con chofer / contra entrega** (clientes de cuenta corriente): la venta se cierra en **cuenta corriente** al despachar, y la plata que trae el chofer se registra como **cobranza**.',
            '**Cancelar** un confirmado libera la reserva.',
            'Cotizar, enviar y confirmar es del permiso de **presupuestos** (administración); cerrar en el punto de venta lo hace quien vende.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Presupuestos (se cotiza desde Ventas › Punto de venta)' },
      ],
    },
    {
      id: 'clientes',
      titulo: 'Clientes',
      bloques: [
        {
          t: 'p',
          texto: 'La ficha de cada comprador: quién es (para facturarle), qué precios le corresponden y si puede comprar a crédito. Siempre existe el cliente **Consumidor Final**, para las ventas sin datos, que no se puede dar de baja. Se busca por **nombre, documento o localidad**.',
        },
        {
          t: 'lista',
          items: [
            '**Alta**: **+ Nuevo cliente**. El único dato obligatorio es el **nombre o razón social**; el resto es opcional.',
            '**Documento y condición frente al IVA**: tipos CUIT, CUIL, DNI o "sin identificar"; el CUIT y el CUIL tienen que tener **11 dígitos** exactos. La condición (Responsable Inscripto, Monotributo, Consumidor Final, Exento, No categorizado) define, junto con la de la empresa, **la letra del comprobante**; para Factura A hace falta el CUIT.',
            '**Contacto**: teléfono, email, dirección y localidad. Si el teléfono es un número argentino completo, en el listado aparece como un **enlace a WhatsApp**.',
            '**Precios**: las **listas de precio** asignadas (la puerta "Cliente"; sin ninguna, paga la lista base), un **descuento general (%)** que se le aplica siempre, el **vendedor asignado** y la **sucursal habitual**.',
            '**Cuenta corriente** (Pymes y Corporativo): se habilita por cliente, con un **límite de crédito** (0 = sin tope) y un **plazo de pago** en días. Habilitarla y fijar el monto es un **permiso aparte** (de fábrica, solo el superadmin); quien lo tiene también puede habilitarla desde el detalle del cliente, pestaña Cuenta corriente. Además tiene que estar permitida en Ventas › Configuración › Cuenta corriente.',
            'El **detalle** (clic en la fila) tiene tres pestañas: **Resumen**, **Cuenta corriente** (saldo, facturado, cobrado, límite, crédito disponible y los comprobantes impagos, con el botón **Registrar cobranza**) y **Comprobantes** (los últimos 100).',
            '**Dar de baja**: si el cliente tiene comprobantes o cobranzas queda **inactivo** (el historial no se toca; se ve con "Ver dados de baja" y se **reactiva** cuando haga falta); si no tiene movimientos, se elimina.',
            '**Exportar** baja a Excel o PDF lo que estás viendo, con el contacto completo.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Clientes' },
      ],
    },
    {
      id: 'cobranzas',
      titulo: 'Cobranzas: cobrarle a un cliente de cuenta corriente',
      bloques: [
        {
          t: 'p',
          texto: 'Una **cobranza** es el **recibo** de lo que un cliente de cuenta corriente paga para saldar lo que debe: registra los medios de pago y a qué comprobantes se imputa. Planes Pymes y Corporativo.',
        },
        {
          t: 'pasos',
          items: [
            'Tocá **+ Nueva cobranza** (o **Registrar cobranza** desde la cuenta corriente del cliente).',
            'Elegí el **cliente**: solo aparecen los activos con la cuenta corriente habilitada. Si no está, falta habilitarla en su ficha.',
            'Cargá el **medio** y el **importe** de cada pago (se pueden combinar varios, por ejemplo efectivo y transferencia) y una referencia si hace falta (número de operación, cheque…).',
            'Tocá **Imputar automático** para aplicar el pago a los comprobantes **más viejos primero**, o cargá a mano el importe que va a cada uno.',
            'Tocá **Registrar cobranza**.',
          ],
        },
        {
          t: 'lista',
          items: [
            'Lo que cobrás **de más, sin imputar**, no se pierde: queda **a cuenta**, baja el saldo del cliente y se puede imputar a un comprobante futuro. El sistema avisa si se imputa más de lo cobrado.',
            'El listado se filtra por **cliente** y **estado** (confirmadas / anuladas) y muestra cuántos recibos hay, el **total cobrado** y lo que quedó **sin imputar**.',
            '**Anular un recibo** pide un motivo y **no lo borra**: sus imputaciones dejan de contar, los comprobantes vuelven a figurar como impagos y el saldo del cliente sube por ese importe. Si el **turno de caja** del recibo ya se cerró, no se puede anular: se corrige con un recibo nuevo.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Cobranzas' },
      ],
    },
    {
      id: 'listado-ventas',
      titulo: 'Listado de ventas: qué se vendió',
      bloques: [
        {
          t: 'p',
          texto: 'La pantalla que responde **"¿qué se vendió?"**. **Abre en hoy**, y de ahí se llega a cualquier fecha con los atajos (Hoy · Ayer · Últimos 7 · Este mes · Todo) o con los dos campos de fecha.',
        },
        {
          t: 'lista',
          items: [
            'Las **tarjetas** (tickets, vendido, ticket promedio y descuentos, más cómo se pagó y cuánto costaron las ofertas) son del **filtro completo**, no de la página que se ve: "vendí $X hoy" suma todas las ventas del día.',
            'Una venta **anulada sigue en la lista** (hay que poder auditarla) pero **no suma** en los totales; se informa aparte. "Vendido" ya viene **neto de notas de crédito**.',
            '**Filtros**: fechas, sucursal, cajero, turno de caja, medio de pago, estado, cliente, origen, "solo con oferta", y buscador por **número de ticket o nombre del cliente**.',
            'Al abrir una venta se ven los renglones con **la lista y la oferta que tenían al vender**, otros cargos, los totales, cómo se pagó y, en cuenta corriente, lo cobrado y el saldo.',
            '**Reimprimir** saca el ticket (o la factura con su QR si tiene CAE) con el formato configurado.',
            '**Exportar CSV** baja lo que se está viendo, listo para abrir en Excel en español.',
            'Los **tickets abiertos** (sin cobrar) no están acá: viven en el punto de venta, donde se retoman.',
            '**Quién ve qué**: administración ve todas las sucursales y todos los filtros. El **cajero ve solo la sucursal donde opera y solo las ventas de mostrador**, y no puede anular.',
          ],
        },
        {
          t: 'p',
          texto: '**Anular una venta sin CAE** (solo administración): pide confirmación explicando las tres consecuencias: la mercadería **vuelve al stock** con su movimiento, la venta deja de contar como plata vendida, y el comprobante **no se borra** (el número emitido no se recicla). Si tiene cobranzas aplicadas, primero se anula el recibo.',
        },
        { t: 'ruta', texto: 'Ventas › Ventas' },
      ],
    },
    {
      id: 'configuracion-ventas',
      titulo: 'Configuración de ventas',
      bloques: [
        {
          t: 'p',
          texto: 'Las reglas del mostrador, en una sola pantalla con una sección por tema. Cada opción trae su explicación en letra chica. **Nada se aplica hasta guardar**: arriba dice cuántos cambios quedaron sin guardar y hay dos botones, **Guardar cambios** y **Descartar**.',
        },
        {
          t: 'tabla',
          cols: ['Sección', 'Qué se decide'],
          filas: [
            ['**Comprobantes**', 'El **punto de venta** (numera tickets, facturas y recibos), la **condición de IVA de la empresa** (con la del cliente define la letra) y el interruptor de **Facturación electrónica (ARCA)**. Mientras ARCA esté apagado se emite ticket interno y la venta se confirma sin pedir CAE.'],
            ['**Precios y descuentos**', 'La **lista base (piso)**, si solo un administrador puede cambiar la lista a mano, el **descuento máximo del vendedor (%)** y los redondeos: de **precio de góndola** (sobre el precio final con IVA) y de **efectivo** (para plazas sin monedas chicas; solo afecta pagos en efectivo).'],
            ['**Descuentos**', 'Los descuentos con nombre (ver Ofertas y descuentos).'],
            ['**Acceso mayorista por monto de compra**', 'El monto mínimo del ticket (0 = desactivado; se mide con IVA), la modalidad que desbloquea y los medios de pago con los que vale.'],
            ['**Cuenta corriente**', 'Si se permite vender en cuenta corriente (apagado, toda venta es al contado), si se **bloquea** al superar el límite (apagado, solo avisa) y el límite y el plazo que se proponen al dar de alta un cliente.'],
            ['**Presupuestos**', 'La validez por defecto en días (corre desde que se **envía**) y si se **reserva el stock** al confirmar.'],
            ['**Caja / punto de venta**', 'Si se **exige turno de caja abierto**, si se permite **vender sin stock** (conviene dejarlo apagado: el inventario en negativo no se recupera) y los **medios de pago** habilitados. A cada medio se le puede marcar **"exige factura"**: un peso cobrado con él impide Liquidar y la venta sale facturada (típico de lo bancarizado).'],
            ['**Lector de códigos y balanza**', 'Si hay lector de código de barras y si envía Enter al final, y las **etiquetas de balanza** (EAN-13 con el peso o el importe adentro): el prefijo (los dos primeros dígitos) y si el código trae **peso (kg)** o **importe ($)**.'],
            ['**Facturación electrónica — diagnóstico**', 'Si se puede facturar y qué falta (ver "Diagnóstico de ARCA").'],
          ],
        },
        { t: 'ruta', texto: 'Ventas › Configuración (permiso propio; en Gerencia › Configuración hay un directorio de dónde está cada opción)' },
      ],
    },
    {
      id: 'nota-credito-venta',
      titulo: 'La nota de crédito (deshacer una factura)',
      bloques: [
        {
          t: 'p',
          texto: 'Una factura con **CAE ya existe para ARCA**: anularla en el sistema no la borra de allá, solo haría que los dos libros dejen de coincidir. La forma de deshacerla es **emitir otro comprobante que diga qué vuelve**: la nota de crédito. En el detalle de la venta aparece **"Nota de crédito"** si tiene CAE y **"Anular"** si no lo tiene (ticket interno, o una factura que todavía no se emitió porque ARCA estaba caído). Una cosa o la otra, nunca las dos.',
        },
        {
          t: 'tabla',
          cols: ['Lo que se elige', 'Para qué'],
          filas: [
            ['**Toda la venta** o **algunos renglones**', 'Si ya hubo una nota antes, "toda la venta" significa **todo lo que queda**.'],
            ['**La mercadería vuelve al stock**', 'Viene tildado. **Destildalo si la nota es por un error de precio o de facturación**: ahí no volvió un gramo, y reingresarlo inventaría stock que no existe.'],
            ['**Devolver $X en efectivo por caja**', 'Viene apagado a propósito. Tildado, sale un **egreso del turno abierto** y le baja el efectivo esperado al arqueo.'],
            ['**El motivo** (obligatorio)', 'Va **impreso en la nota** y queda guardado con tu nombre y la hora.'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**El precio es el de la venta original, no el de hoy**: la nota devuelve exactamente lo que se cobró.',
            'Los **otros cargos** (envío, packaging) solo viajan en la nota **total** y una sola vez.',
            '**No se puede devolver lo mismo dos veces**: cada renglón muestra cuánto ya volvió y cuánto queda.',
            'En **cuenta corriente** la nota **baja la deuda** del comprobante que ajusta.',
            'La nota **se imprime sola** al emitirse (con su letra, el comprobante asociado, el motivo y el IVA discriminado si es A).',
            'La letra de la nota es la misma que la de la factura que ajusta, y la deduce el sistema. Una nota de crédito **no se anula ni lleva otra nota**.',
            'Lo que queda por acreditar se mide en **mercadería, no en plata**: el redondeo del IVA puede dejar un centavo que ninguna nota puede acreditar, y la cuenta corriente lo perdona.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Ventas › (una venta con CAE) › Nota de crédito · el permiso de devoluciones es el mismo que el de anular' },
      ],
    },
    {
      id: 'facturar-arca',
      titulo: 'Facturar con ARCA, paso a paso',
      bloques: [
        {
          t: 'p',
          texto: 'Son dos cosas: **la puesta en marcha** (una vez, y de nuevo para pasar a producción), que es casi toda trámite, y **la operación** diaria, que es apretar una tecla.',
        },
        { t: 'p', texto: '**A · La puesta en marcha**' },
        {
          t: 'nota',
          tono: 'info',
          texto: 'El **CUIT, el modo (homologación o producción) y el punto de venta general** los carga quien instaló el sistema (soporte). Si no figuran, el diagnóstico dice qué falta. El resto lo hacés vos desde las pantallas.',
        },
        {
          t: 'pasos',
          items: [
            '**Datos fiscales**, en Sistema › Empresa: CUIT, **razón social** y domicilio. No son opcionales: el CAE se pide con el CUIT del certificado, así que una factura sin estos datos sale bien para ARCA y mal en el papel. Si falta algo, el panel avisa.',
            '**Un punto de venta por sucursal**, en Gerencia › Sucursales. Cada uno se declara ante ARCA contra un domicilio y lleva su numeración aparte. Son de **cinco dígitos**.',
            '**Generar la clave y el pedido** (Ventas › Configuración › Facturación electrónica). La clave privada se genera y se queda en el servidor: nunca pasa por el navegador. Lo que se copia es el pedido (.csr), que es público. Elegí bien el **alias** y la **razón social**: quedan dentro del certificado y no se cambian. Conviene poner el entorno en el alias (minegocio-homo, minegocio-prod).',
            '**Subir el pedido a ARCA**. En homologación: **WSASS › Crear DN y certificado**. En producción: **Administración de Certificados Digitales**. Devuelven el .crt en el acto.',
            '**Autorizar el certificado al servicio wsfe**: es un formulario **aparte** (WSASS › *Crear autorización a servicio*); crear el certificado **no** lo autoriza. Si falta, ARCA responde "Computador no autorizado a acceder al servicio". Solo hace falta wsfe.',
            '**Pegar el .crt e instalarlo** (paso 3 de la pantalla). Antes de guardarlo se controla que sea de esa clave, de ese CUIT y que no esté vencido.',
            '**Probar conexión** hasta que den los **tres ✔**. No emite nada: pregunta si ARCA responde, si el certificado autentica y el último número de cada punto de venta. **Sin los tres en verde, no se sigue**.',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: '**Con el certificado de homologación puesto, el interruptor de facturación va APAGADO.** Prendido, las ventas reales consiguen CAE del ambiente de prueba: facturas sin ningún valor fiscal, guardadas como legítimas, y **con CAE ya no se anulan**. Para probar alcanza con "Probar conexión", que no emite nada. Si querés el circuito completo, hacé **una** venta y su nota de crédito, y apagá.',
        },
        { t: 'p', texto: '**B · Cómo se factura, todos los días**' },
        { t: 'flujo', items: ['Cargar el ticket', 'Cobrar (F2)', 'Facturar (F8)', 'CAE de ARCA', 'Imprimir'] },
        {
          t: 'tabla',
          cols: ['Qué', 'Cómo'],
          filas: [
            ['**Facturar (F8) o Liquidar (F10)**', 'Es la decisión del cobro. **F8 pide CAE** y emite el comprobante fiscal; **F10 saca ticket interno** y no toca ARCA.'],
            ['**La letra sale sola**', 'Condición de IVA de la empresa × condición del cliente: Responsable Inscripto contra Consumidor Final da **B**; contra otro Responsable Inscripto da **A**. No se elige a mano.'],
            ['**El punto de venta**', 'El de la **sucursal donde está la caja**, no uno global.'],
            ['**El número**', 'Lo da ARCA. Una respuesta perdida **no genera dos facturas**: el reintento consulta ese número en vez de emitir de nuevo, y una venta nunca tiene dos CAE.'],
            ['**El papel**', '**A discrimina el IVA y B no** (es la ley). Van el CAE con su vencimiento, el QR y el domicilio **de la sucursal**.'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: '**Si ARCA no contesta, la venta no se cae.** Sale un **ticket provisorio** con el motivo guardado, el cliente se lleva la mercadería, y la venta queda en **Ventas › ⚠ Sin facturar** con su botón **Facturar**. Reintentar es inocuo: no toca plata, stock ni turno. Al lograrse, la venta **pasa a ser** la factura. Sin CAE nunca se convierte en una factura que ARCA no autorizó.',
        },
        { t: 'p', texto: '**C · Deshacer y los dos mundos**' },
        {
          t: 'lista',
          items: [
            'Venta **con CAE** → **nota de crédito**. Venta **sin CAE** → **Anular**. Los botones están en el **pie de la ficha** de la venta, solo para administración.',
            '**Homologación y producción son dos mundos**: dos certificados (el de uno no sirve en el otro), dos numeraciones, y lo emitido en homologación no cuenta para nada.',
            'La **clave privada no está en ningún respaldo**: guardala aparte. Perderla no se restaura: se da de baja el certificado y se tramita otro. Las facturas ya emitidas no se pierden.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Configuración › Facturación electrónica · Sistema › Empresa · Gerencia › Sucursales' },
      ],
    },
    {
      id: 'diagnostico-arca',
      titulo: 'Diagnóstico de ARCA: ¿puedo facturar?',
      bloques: [
        {
          t: 'p',
          texto: 'Al pie de **Ventas › Configuración › Facturación electrónica**. Contesta una sola pregunta, **¿puedo facturar?**, y cuando la respuesta es no, dice **qué falta, con nombre y apellido**. El **interruptor** es la intención (quiero facturar) y el **panel** es la capacidad (puedo).',
        },
        {
          t: 'tabla',
          cols: ['Lo que muestra', 'Para qué'],
          filas: [
            ['**El entorno**', '**PRODUCCIÓN en rojo**: es la única diferencia visible entre ensayar y emitir facturas de verdad, y no se deshace.'],
            ['**CUIT y punto de venta**', 'Los del certificado. Si el CUIT no coincide con el de Sistema › Empresa, avisa.'],
            ['**Probar conexión**', 'Tres preguntas, en orden y cortando en la primera que falla: ¿ARCA responde? → ¿el certificado autentica? → ¿el punto de venta está autorizado? Puede tardar unos diez segundos: es lo que cuesta pedirle un ticket de acceso nuevo a ARCA.'],
            ['**Último número de ARCA**', 'El correlativo de cada comprobante según ARCA, que lleva la numeración fiscal.'],
            ['**El trámite del certificado**', 'Generar clave y pedido, subirlo a ARCA y pegar el .crt. Nunca se pisa una clave que ya exista.'],
            ['**Los puntos de venta**', 'Una fila por local con su número, su domicilio y su último número autorizado. Se cargan en Gerencia › Sucursales.'],
            ['**Las ventas trabadas**', 'Las que salieron como ticket provisorio, con su motivo y su botón **Facturar**, de la más vieja primero.'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'La primera pregunta corre **aunque no haya certificado**: "¿ARCA está vivo?" no lleva credenciales, y es justo la que contesta si el problema es de ellos o nuestro.',
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'Si **renombrás** un certificado, **volvé a abrir esta pantalla**: relee el disco. Es la trampa clásica de Windows, que esconde las extensiones y deja el .crt que baja ARCA como algo.crt.crt.',
        },
        {
          t: 'p',
          texto: 'El **punto de venta "de la casa"** lo usa la sucursal que no tenga el suyo cargado. Con un solo local es lo correcto; con varios, el panel marca en rojo a los que estén cayendo ahí, porque sus facturas saldrían por la boca de expendio de otro domicilio.',
        },
        { t: 'ruta', texto: 'Ventas › Configuración › Facturación electrónica' },
      ],
    },
    {
      id: 'arqueo-caja',
      titulo: 'Caja: turno y arqueo',
      bloques: [
        {
          t: 'p',
          texto: 'El efectivo del cajón se controla en **tres momentos**: al abrir (fondo), durante el turno (controles) y al cerrar (arqueo final). El "esperado" siempre se calcula en vivo: **fondo inicial + efectivo cobrado + ingresos − egresos**.',
        },
        {
          t: 'tabla',
          cols: ['Momento', 'Qué pasa'],
          filas: [
            ['**Apertura**', 'El fondo inicial es **obligatorio y mayor a cero**: sin punto de partida no hay arqueo posible, así que el turno no se abre.'],
            ['**Control de caja** (durante el turno)', 'Se cuenta el efectivo **sin cerrar nada**: queda registrado con fecha, hora, esperado, contado, diferencia y quién contó. Si hay diferencia, la observación es obligatoria. Se pueden hacer todos los que hagan falta.'],
            ['**Cierre**', 'El arqueo final: se cuenta el efectivo y la diferencia (contado − sistema) se guarda tal cual, incluso negativa. El turno queda **cerrado definitivo**, sin reapertura.'],
          ],
        },
        {
          t: 'lista',
          items: [
            'Los controles intermedios achican el problema: un faltante detectado a las 14:00 se investiga sobre 3 horas de ventas, no sobre el día.',
            'Para contar sin calculadora, abajo de "Efectivo contado" está **"🧮 Contar billetes"**: todas las denominaciones, se tipea la cantidad de cada una y **"Usar este total"** lo deja puesto. El conteo no se guarda.',
            '**Ingreso / egreso**: los movimientos manuales de plata, y el **pago a un proveedor** desde el cajón (ver Proveedores y pagos › "Pagos a proveedores"). El egreso queda en el arqueo del turno con hora y nombre.',
            'Un pago hecho en un turno **ya cerrado** no se puede anular: ese arqueo se firmó con el egreso adentro. El reintegro se registra como ingreso del turno actual.',
            'Al **cerrar el turno** no deben quedar ventas sin subir hechas sin conexión.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Caja: el turno de tu sucursal arriba (abrir, movimientos, pagar a proveedor, control, cierre) y el historial de arqueos abajo' },
      ],
    },
    {
      id: 'chat',
      titulo: 'Chat interno',
      bloques: [
        {
          t: 'p',
          texto: 'La cajera necesita saber algo y no puede dejar el mostrador. El **botón de chat de la barra de arriba** abre un panel lateral que flota sobre cualquier pantalla, **incluido el punto de venta**: pregunta, sigue cobrando, y un número naranja avisa cuando le respondieron. Disponible en la **sucursal central** (la de tipo distribuidora).',
        },
        {
          t: 'lista',
          items: [
            'Hay un **canal grupal** del local y **conversaciones privadas** 1 a 1 (solo las ven sus dos personas). La lista muestra el **Equipo**, con un punto verde para quienes están **en línea**.',
            '**Los mensajes se borran a las 24 horas**: el chat es conversación, no archivo. Lo que hay que decidir va a su documento (el pedido, la factura, la observación del comprobante).',
            '**Enter envía, Shift + Enter** hace salto de línea. Cuando llega un mensaje con el panel cerrado suena una nota corta.',
            'Si el sistema está detrás de otra ventana, el aviso puede demorar hasta un minuto.',
            'Como la sesión es por pestaña, cada ventana chatea como su usuario.',
          ],
        },
        { t: 'ruta', texto: 'Botón de chat en la barra superior (solo con sesión en la sucursal central)' },
      ],
    },
  ],
};
