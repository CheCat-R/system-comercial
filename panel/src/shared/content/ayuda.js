/**
 * AYUDA — el contenido.
 * ============================================================================
 * Lo que explica el botón de ayuda (`AyudaButton`) de cada pantalla. Vive acá,
 * centralizado, porque es texto puro sin lógica de módulo — y porque varios
 * botones de pantallas distintas pueden señalar a la misma categoría sin
 * duplicar nada.
 *
 * Artículos cortos, uno por tarea, con el título escrito como la pregunta que
 * el cliente haría — no la arquitectura del sistema (esa es la otra
 * audiencia: `modules/manual`, "Info de sistema", para vos). Cada paso
 * describe lo que el ojo encuentra primero (el botón, el campo), no el
 * nombre técnico de atrás. `**negrita**` marca justamente eso, para que se
 * pueda escanear sin leer línea por línea.
 *
 * Sin campo "dónde": el botón aparece EN la pantalla de la que habla, así que
 * decir dónde estás sería redundante.
 */
export const AYUDA = [
  {
    id: 'caja',
    titulo: 'Caja',
    articulos: [
      {
        id: 'abrir-caja',
        pregunta: '¿Cómo abro la caja?',
        pasos: [
          'Tocá **Abrir caja**.',
          'Cargá el **fondo inicial**: el efectivo con el que arranca el cajón. Es el único dato obligatorio.',
          'Si querés, agregá una observación (por ejemplo, quién dejó el fondo).',
          'Tocá **Abrir turno**.',
        ],
        notas: [
          { tono: 'info', texto: 'Sin un turno abierto, el Punto de venta no deja cobrar al contado — por eso conviene abrir la caja antes de empezar a atender.' },
        ],
      },
      {
        id: 'cerrar-caja',
        pregunta: '¿Cómo cierro la caja al final del día?',
        pasos: [
          'Tocá **Cerrar caja**.',
          'Contá el efectivo que hay de verdad en el cajón.',
          'Cargalo en **Efectivo contado**.',
          'Mirá la diferencia contra el **Efectivo esperado** (lo que el sistema calculó solo).',
          'Tocá **Cerrar turno**.',
        ],
        notas: [
          { tono: 'info', texto: 'La diferencia es solo sobre EFECTIVO. Tarjeta, transferencia y los demás medios se controlan aparte, contra el resumen del banco o del posnet.' },
          { tono: 'warn', texto: 'Una vez cerrado, el turno no se puede reabrir. Si contaste mal, cerralo igual con la diferencia real — se puede ver después en el historial — y abrí uno nuevo.' },
        ],
      },
    ],
  },
  {
    id: 'vender',
    titulo: 'Vender',
    articulos: [
      {
        id: 'cobrar-venta',
        pregunta: '¿Cómo cobro una venta?',
        pasos: [
          'Tocá **+ Nueva venta** para abrir un ticket (necesitás la caja abierta).',
          'Escribí el nombre o el código del producto y tocá el resultado (o Enter) para cargarlo. Atajo: *Ins* carga el último buscado, *Shift+Ins* abre el buscador.',
          'Repetí por cada producto. Cantidad y precio se pueden editar en la línea.',
          'Si no es "Consumidor Final", elegí el cliente en el panel de la derecha.',
          'Tocá **Cobrar** (atajo *F2*).',
          'Elegí el medio de pago — Efectivo por defecto — y el importe. Se pueden combinar varios medios en la misma venta.',
          'Tocá **Facturar** si el cliente quiere comprobante con sus datos, o **Liquidar** si alcanza con un ticket simple.',
        ],
        notas: [
          { tono: 'info', texto: 'Si la facturación electrónica está configurada, la Factura sale con CAE sola — no hay nada distinto que hacer. Si no está configurada, igual se emite un comprobante válido para el día a día, sin CAE.' },
        ],
      },
    ],
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    articulos: [
      {
        id: 'cliente-nuevo',
        pregunta: '¿Cómo cargo un cliente nuevo?',
        pasos: [
          'Tocá **+ Nuevo cliente**.',
          'Completá **Nombre o razón social** — es el único dato obligatorio.',
          'El resto es opcional: nombre de fantasía, condición frente al IVA, documento, teléfono, email, dirección y localidad.',
          'Tocá **Crear**.',
        ],
        notas: [
          { tono: 'info', texto: 'La condición frente al IVA define qué tipo de factura se le puede emitir — para Factura A hace falta el CUIT. Cargar el teléfono habilita además el botón para escribirle directo por WhatsApp desde el listado.' },
        ],
      },
    ],
  },
  {
    id: 'presupuestos',
    titulo: 'Presupuestos',
    articulos: [
      {
        id: 'presupuesto-nuevo',
        pregunta: '¿Cómo hago un presupuesto?',
        pasos: [
          'Se arma en **Punto de venta**, igual que una venta: cargá los productos.',
          'Elegí un **cliente** real — Consumidor Final no sirve, un presupuesto necesita a quién dirigirlo.',
          'Tocá **Presupuesto** (al lado de Cobrar, abajo) en vez de Cobrar.',
          'Va a aparecer acá como **Borrador**.',
        ],
      },
      {
        id: 'presupuesto-seguimiento',
        pregunta: '¿Cómo sigo un presupuesto hasta cobrarlo?',
        pasos: [
          'Tocá **Enviar**: le fija la validez y congela el precio.',
          'Cuando el cliente confirma que lo quiere, tocá **Confirmar** — esto reserva el stock.',
          'Si el pedido se arma distinto a lo cotizado, usá **Cargar armado**.',
          'Cuando esté listo, tocá **Cerrar en POS**: te lleva al Punto de venta para ajustar y cobrar.',
        ],
        notas: [
          { tono: 'info', texto: 'El stock recién se reserva al Confirmar, no antes — un Borrador o un Enviado todavía no le saca mercadería a nadie más.' },
          { tono: 'info', texto: 'Si el cliente se baja o se vence, usá Cancelar (libera el stock reservado) o Reabrir si quiere volver a cotizar.' },
        ],
      },
    ],
  },
  {
    id: 'devoluciones',
    titulo: 'Devoluciones',
    articulos: [
      {
        id: 'devolucion-que-hacer',
        pregunta: '¿Qué hago si un cliente devuelve algo?',
        pasos: [
          'Buscá la venta en este listado y tocala para abrir el detalle.',
          'Si la venta **tiene CAE** (factura electrónica): siempre con **Nota de crédito**, sea toda la venta o una parte — una venta con CAE no se puede anular.',
          'Si la venta **no tiene CAE** y se devuelve **todo**: un encargado o admin puede usar **Anular** directamente.',
          'Si no tiene CAE pero se devuelve **solo una parte**: también con **Nota de crédito** (ver el artículo de abajo).',
        ],
        notas: [
          { tono: 'info', texto: 'Ante la duda, Nota de crédito siempre sirve — es el camino que cubre todos los casos. Anular es el atajo para el caso más simple (todo, sin factura) y solo lo ve un encargado.' },
        ],
      },
      {
        id: 'nota-credito-nueva',
        pregunta: '¿Cómo hago una nota de crédito?',
        pasos: [
          'Buscá la venta en este listado y tocala para abrir el detalle.',
          'Tocá **Nota de crédito**.',
          'Elegí qué se devuelve: **toda la venta** o **solo algunos renglones** (cargando la cantidad de cada uno).',
          'Dejá tildado **la mercadería vuelve al stock** si es una devolución real — destildalo si la nota es solo por un error de precio o facturación.',
          'Tildá **Devolver en efectivo por caja** únicamente si además le das la plata al cliente en el momento.',
          'Escribí el **Motivo** — es obligatorio y va impreso en la nota.',
          'Tocá **Emitir**.',
        ],
        notas: [
          { tono: 'info', texto: 'Una venta ya facturada no se puede anular ni editar: la nota de crédito es el comprobante que la corrige, no un borrado.' },
          { tono: 'warn', texto: 'No se puede acreditar más de lo que queda sin acreditar de esa venta — si ya tiene una nota anterior, el sistema te muestra el tope.' },
        ],
      },
    ],
  },
  {
    id: 'cambios-precio',
    titulo: 'Cambios de precio',
    articulos: [
      {
        id: 'ver-cambios-precio',
        pregunta: '¿Cómo veo cuándo cambió el precio de un producto?',
        pasos: [
          'Escribí el nombre, el código de barras o el código propio en **Buscar producto o código**.',
          'Si hace falta, acotá por **Marca**, **Lista** o **Motivo** del cambio.',
          'Cada fila muestra **Antes** y **Después**: cuánto valía y cuánto pasó a valer, con la **Variación** en %.',
          'Usá **Desde** si solo te interesan los cambios a partir de una fecha.',
        ],
        notas: [
          { tono: 'info', texto: 'Esta pantalla es solo de CONSULTA — acá no se cambia ningún precio, se ve el historial de los que ya cambiaron (y por qué). Se abre desde cualquier pantalla del sistema con el atajo Alt+F5, sin tener que venir hasta Ventas.' },
        ],
      },
    ],
  },
  {
    id: 'almacen',
    titulo: 'Almacén',
    articulos: [
      {
        id: 'ver-stock',
        pregunta: '¿Cómo veo cuánto stock tengo de un producto?',
        pasos: [
          'Entrá a **Existencias** (la primera pestaña).',
          'Filtrá por **Sucursal**, **Producto** o **Estado** (Disponible, Comprometido, Vencido, Defectuoso) para acotar la lista.',
          'La columna **Cantidad** es lo que hay ahora. Tocá **Movs.** en una fila para ver el historial de altas y bajas de ese producto.',
        ],
        notas: [
          { tono: 'info', texto: 'Acá no se carga mercadería a mano: lo que entra por compra se carga con la factura en Compras, y lo que se vende se descuenta solo desde el Punto de venta.' },
        ],
      },
      {
        id: 'nueva-incidencia',
        pregunta: '¿Cómo reporto un problema con la mercadería?',
        pasos: [
          'Andá a **Incidencias**.',
          'Tocá **+ Nueva incidencia**.',
          'Elegí el **Tipo**: etiqueta incorrecta, producto mal pesado, bolsa rota, diferencia de inventario, producto defectuoso o producto vencido.',
          'Elegí el **Producto**, la **Sucursal** y la **Cantidad** afectada.',
          'Tocá **Crear incidencia**.',
        ],
        notas: [
          { tono: 'info', texto: 'Esa cantidad queda "comprometida" hasta que alguien la resuelve — no se descuenta sola del stock disponible ni se pierde sin que quede registrado.' },
        ],
      },
    ],
  },
  {
    id: 'cobranzas',
    titulo: 'Cobranzas',
    articulos: [
      {
        id: 'cobranza-nueva',
        pregunta: '¿Cómo registro un cobro a un cliente?',
        pasos: [
          'Tocá **+ Nueva cobranza**.',
          'Elegí el **Cliente** — solo aparecen los que tienen cuenta corriente habilitada.',
          'Cargá el **Medio** y el **Importe** de cada pago. Se pueden combinar varios (por ejemplo, efectivo + transferencia).',
          'Tocá **Imputar automático** para aplicarlo a los comprobantes más viejos primero, o cargá el importe a mano en cada uno.',
          'Tocá **Registrar cobranza**.',
        ],
        notas: [
          { tono: 'info', texto: 'Lo que cobrás de más sin imputar a ningún comprobante no se pierde: queda a favor del cliente, a cuenta.' },
          { tono: 'warn', texto: 'Si el cliente no aparece en el selector, es porque no tiene la cuenta corriente habilitada en su ficha (Ventas › Clientes).' },
        ],
      },
    ],
  },
  {
    id: 'formato-venta',
    titulo: 'Formato de venta',
    articulos: [
      {
        id: 'modalidad-vs-lista',
        pregunta: '¿Qué es una modalidad y una lista acá?',
        pasos: [
          '**Modalidad** agrupa (por ejemplo Minorista, Mayorista). **Lista** es la identidad concreta adentro de esa modalidad (por ejemplo Mostrador, Mayorista 1).',
          'El margen de cada lista NO se carga acá: se carga por producto, en **Compras › Productos › Formato de Venta** — la misma lista puede ir al 30% en un producto y al 50% en otro.',
          'El **Orden de preferencia** (arriba de la pantalla) define qué lista gana cuando un renglón habilita más de una — gana la primera de la fila.',
          'Tocá **Ver lógica** para el detalle completo de cómo se resuelve el precio.',
        ],
      },
      {
        id: 'reglas-marca',
        pregunta: '¿Cómo hago que comprar varias unidades de una marca pase a un precio mejor solo?',
        pasos: [
          'Tocá **+ Regla** en Reglas de marca.',
          'Elegí la **Marca** y las unidades mínimas que hacen falta acumular en el ticket.',
          'Elegí a qué **Modalidad** pasan esos renglones al llegar al mínimo.',
        ],
        notas: [
          { tono: 'info', texto: 'Solo cambian los renglones de esa marca — el resto del ticket sigue con su lista normal. Cada producto entra con la lista que tenga cargada de esa modalidad; el que no tenga ninguna, sigue igual.' },
        ],
      },
    ],
  },
  {
    id: 'ofertas',
    titulo: 'Ofertas',
    articulos: [
      {
        id: 'oferta-nueva',
        pregunta: '¿Cómo creo una oferta?',
        pasos: [
          'Tocá **+ Oferta**.',
          'Elegí el tipo: Descuento %, Precio de oferta, Llevá N y pagá M (3×2), 2ª unidad con descuento, Pack: N por $X, Combo de productos, o % al total del ticket.',
          'Definí el **alcance** — a qué productos, marcas, categorías o etiquetas aplica (Combo y % al ticket no llevan alcance: son por su cuenta).',
          'Completá los datos del tipo elegido (porcentaje, precio, cantidades) y la vigencia.',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: 'Las que se miden en cantidades (3×2, 2ª unidad, pack, combo) se aplican solas en la caja. La de % al ticket se SUGIERE y el cajero la aplica con un clic — nunca sola.' },
          { tono: 'info', texto: 'Por cada renglón gana una sola oferta: la de mayor beneficio, no se suman todas las que calcen.' },
        ],
      },
    ],
  },
  {
    id: 'carteles',
    titulo: 'Carteles de góndola',
    articulos: [
      {
        id: 'carteles-nuevos',
        pregunta: '¿Cómo hago los carteles para un producto?',
        pasos: [
          'Buscá el producto por nombre o marca.',
          'Hacé clic en el resultado: se agrega a la lista con su marca, nombre y precio — sin tipear nada.',
          'Repetí con todos los productos que quieras: salen todos juntos con un solo Imprimir.',
          'Si hace falta, editá el texto de **Marca** o **Nombre** de algún renglón, y la **Cantidad** de copias. Vaciar un campo hace que esa línea no se imprima.',
          'Tocá **Guardar los textos** si cambiaste algo — así la próxima vez salen igual, sin reescribir.',
          'Tocá **Imprimir**.',
        ],
        notas: [
          { tono: 'info', texto: 'El precio no se tipea nunca: sale del catálogo, el mismo que cobra la caja. Si el precio del producto cambia, el cartel lo sigue solo — no hay que editar nada a mano.' },
          { tono: 'info', texto: '+ Cartel libre es para uno sin producto, como un título de góndola ("ACEITES", "OFERTAS").' },
        ],
      },
    ],
  },
  {
    id: 'configuracion-ventas',
    titulo: 'Configuración',
    articulos: [
      {
        id: 'como-guardar',
        pregunta: '¿Cómo guardo los cambios acá?',
        pasos: [
          'Cada sección agrupa un tema (Comprobantes, Precios y descuentos, Caja, etc.) y cada opción ya trae su propia explicación en letra chica, debajo.',
          'Cambiá lo que necesites: nada se aplica todavía.',
          'Arriba de todo va a decir cuántos cambios quedaron sin guardar.',
          'Tocá **Guardar cambios** para aplicarlos, o **Descartar** para volver atrás sin tocar nada.',
        ],
      },
      {
        id: 'por-que-no-factura',
        pregunta: '¿Por qué no me deja facturar electrónicamente?',
        pasos: [
          'El interruptor **Facturación electrónica (ARCA)**, arriba de todo, es la INTENCIÓN: prenderlo dice "quiero facturar", no garantiza que se pueda.',
          'Bajá hasta **Facturación electrónica — diagnóstico**: ahí se ve qué falta (CUIT, punto de venta o certificado).',
          'Tocá **Probar conexión** en esa sección para confirmar que ARCA responde.',
        ],
        notas: [
          { tono: 'info', texto: 'Mientras falte algo, las ventas se siguen emitiendo igual, como ticket interno sin CAE — no se traba ninguna venta mientras tanto.' },
        ],
      },
    ],
  },
  {
    id: 'gastos',
    titulo: 'Gastos',
    articulos: [
      {
        id: 'gasto-nuevo',
        pregunta: '¿Cómo cargo un gasto?',
        pasos: [
          'Tocá **+ Cargar gasto**.',
          'Elegí el **Rubro** — es el único dato obligatorio, junto con el monto.',
          'Si corresponde, cargá el **Proveedor**, la **Sucursal** y los datos del comprobante (tipo, letra, número y fecha).',
          'Cargá uno o más **conceptos** con su monto — el neto y el IVA se calculan solos.',
          'Elegí la **Condición** (contado o cuenta corriente) y, si es a plazo, cuándo **vence**.',
          'Si lo estás pagando en el momento, completá el pago al final (medio, importe y de qué caja sale si es efectivo).',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: 'Si no lo pagás en el momento, queda pendiente y aparece en Cuentas a pagar hasta que lo liquides.' },
        ],
      },
      {
        id: 'pagar-cuenta',
        pregunta: '¿Cómo pago una cuenta pendiente?',
        pasos: [
          'Entrá a **Cuentas a pagar** — están ordenadas por urgencia, lo vencido primero.',
          'Tocá **Pagar** en la fila que corresponda.',
          'Cargá el **Importe**, el **Medio** y la **Fecha**.',
          'Si pagás en efectivo, podés tildar que salga del turno de caja abierto.',
          'Guardá.',
        ],
      },
    ],
  },
  {
    id: 'proveedores',
    titulo: 'Proveedores',
    articulos: [
      {
        id: 'proveedor-nuevo',
        pregunta: '¿Cómo cargo un proveedor nuevo?',
        pasos: [
          'Entrá a **Proveedores** (el padrón).',
          'Tocá **+ Proveedor**.',
          'Completá **Nombre** — es el único dato obligatorio.',
          'Cargá el CUIT, qué emite (factura, liquidación o mixto), cómo cobra habitualmente y la condición de IVA si los tenés: definen cómo el sistema arma después sus pagos y sus facturas de gasto.',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: '"Importar proveedores" (al lado del botón) sirve para cargar varios de una, desde una planilla, en vez de uno por uno.' },
        ],
      },
      {
        id: 'pagar-cta-cte',
        pregunta: '¿Cómo pago una cuenta corriente a un proveedor?',
        pasos: [
          'Entrá a **Cuentas corrientes** — ahí aparecen solas las facturas de proveedores de cuenta corriente, con su fecha de vencimiento.',
          'Tocá **Pagar** en la que corresponda.',
          'Cargá el importe y el medio de pago.',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: 'Un compromiso se cierra solo cuando el pago lo salda — no hace falta marcarlo a mano. "+ Compromiso manual" es para una promesa de pago que no nació de una factura ya cargada.' },
        ],
      },
    ],
  },
  {
    id: 'compras',
    titulo: 'Compras',
    articulos: [
      {
        id: 'producto-nuevo',
        pregunta: '¿Cómo cargo un producto nuevo?',
        pasos: [
          'Entrá a **Productos** y tocá **+ Nuevo producto**.',
          'Etapa 1: decidí si es **entero** (por unidad) o a **granel** (se vende por peso y se fracciona) — esto no se puede cambiar después de creado. Completá nombre, categoría, marca e IVA.',
          'Etapa 2: cargá el **proveedor** con el que llega y su **costo** — de ahí sale después el margen de cada lista.',
          'Tocá **Crear**.',
        ],
        notas: [
          { tono: 'info', texto: 'El margen de cada lista de precios (Mostrador, Mayorista, etc.) se carga por producto, en la pestaña Formato de Venta de su ficha — no es un dato general del sistema.' },
        ],
      },
      {
        id: 'factura-proveedor',
        pregunta: '¿Cómo cargo la factura de un proveedor?',
        pasos: [
          'Entrá a **Facturación** y tocá **+ Nuevo comprobante**.',
          'Elegí el **Tipo** (factura, remito, liquidación…) y el **Proveedor** — son obligatorios.',
          'Cargá letra, punto de venta, número y fecha del comprobante.',
          'Elegí la **Sucursal de recepción**: ahí es donde entra la mercadería.',
          'Cargá los renglones — productos, cantidades y costo.',
          'Si lo pagás en el momento, completá "Se paga ahora" con el medio y de dónde sale.',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: 'La mercadería entra siempre con la factura — no hay un paso aparte de "recibir". Lo único que elegís es a qué sucursal.' },
        ],
      },
    ],
  },
  {
    id: 'gerencia-usuarios',
    titulo: 'Usuarios y roles',
    articulos: [
      {
        id: 'usuario-nuevo',
        pregunta: '¿Cómo doy de alta un usuario nuevo?',
        pasos: [
          'Entrá a la pestaña **Usuarios**.',
          'Tocá **+ Nuevo usuario**.',
          'Cargá el **Nombre**, elegí el **Rol** y ponele una **Contraseña** (mínimo 8 caracteres).',
          'Si va a poder tomar la caja de otra persona cuando falte, tildá **Puede relevar en caja** y cargale un PIN.',
          'Guardá.',
        ],
        notas: [
          { tono: 'info', texto: 'Un usuario nunca se borra, se desactiva: así su historial de ventas y movimientos queda intacto.' },
        ],
      },
      {
        id: 'rol-nuevo',
        pregunta: '¿Cómo creo o edito un rol?',
        pasos: [
          'Entrá a la pestaña **Roles y permisos**.',
          'Tocá **+ Nuevo rol**, o **Editar permisos** en uno que ya existe.',
          'Marcá las **Secciones**: qué pantallas va a ver ese rol. Sin ninguna marcada, el módulo entero desaparece del menú.',
          'Marcá las **Acciones**: qué puede hacer dentro de lo que ve (cobrar, pisar un precio, etc.).',
          'Guardá.',
        ],
        notas: [
          { tono: 'warn', texto: 'Los cambios llegan a los usuarios de ese rol recién cuando recargan la pantalla (F5) — no hace falta que vuelvan a iniciar sesión.' },
          { tono: 'info', texto: 'Los roles de sistema (Superadmin, Administrador, Cajero, Fraccionador) se pueden editar pero no se pueden borrar.' },
        ],
      },
      {
        id: 'sucursal-punto-venta',
        pregunta: '¿Cómo cargo el punto de venta de una sucursal?',
        pasos: [
          'Entrá a la pestaña **Sucursales**.',
          'Cargá el **Punto de venta** (el de ARCA, para la factura electrónica) y el **Domicilio del comprobante** de ese local.',
          'Tocá **Guardar** en esa fila.',
        ],
        notas: [
          { tono: 'info', texto: 'Con un solo local, dejarlo vacío es válido: usa el de la configuración del servidor. Con varios locales, cada uno necesita el suyo propio — no se puede compartir.' },
        ],
      },
    ],
  },
  {
    id: 'sistema',
    titulo: 'Sistema',
    articulos: [
      {
        id: 'empresa-datos',
        pregunta: '¿Cómo cambio los datos que salen en mis documentos?',
        pasos: [
          'Entrá a la sección **Empresa**.',
          'Cargá el **Nombre** (el de fantasía, el que ve el cliente) y, si corresponde, la **Razón social** — solo hace falta si es distinta del nombre, como figura ante ARCA.',
          'Subí el **Logo** y elegí el **Color de marca** para los documentos A4 (los rollos salen en blanco y negro).',
          'Tocá **Guardar**.',
        ],
        notas: [
          { tono: 'info', texto: 'Esto es el membrete de todo lo que se imprime: tickets, facturas, presupuestos y hojas de trabajo.' },
        ],
      },
      {
        id: 'formato-impresion',
        pregunta: '¿Cómo configuro en qué tamaño sale cada documento?',
        pasos: [
          'Entrá a la sección **Impresión**.',
          'Para cada documento (ticket, factura, presupuesto, etiquetas…) elegí su formato: rollo 80/58 mm, A4, Carta, o la medida de etiqueta que corresponda.',
          'Mirá la **Vista previa** de la derecha — es el mismo documento que va a salir, antes de gastar papel.',
          'Tocá **Guardar**, o probalo de verdad con **Impresión de prueba**.',
        ],
        notas: [
          { tono: 'info', texto: 'La impresora física la elige cada puesto en el diálogo de impresión del navegador — acá solo se define el formato del documento.' },
        ],
      },
      {
        id: 'registrar-equipo',
        pregunta: '¿Cómo hago para que el login no pregunte la sucursal?',
        pasos: [
          'Entrá a **Este equipo**, desde la máquina que querés registrar — el registro queda guardado en ese navegador.',
          'Ponele un nombre (por ejemplo "Caja 1") y elegí su **sucursal**.',
          'Tocá **Registrar este equipo**.',
        ],
        notas: [
          { tono: 'info', texto: 'Se hace una sola vez por máquina. Desde ahí, el login de ese equipo ya no pregunta la sucursal — la pone directamente.' },
        ],
      },
      {
        id: 'descargar-respaldo',
        pregunta: '¿Cómo descargo una copia de seguridad?',
        pasos: [
          'Entrá a **Respaldos**.',
          'Tocá **Descargar respaldo (.sql)** — baja un volcado completo de la base a esta máquina.',
        ],
        notas: [
          { tono: 'warn', texto: 'Guardá esa copia también fuera de este equipo (pendrive, Google Drive): es la red de contención si el servidor se cae con sus propios respaldos adentro.' },
          { tono: 'info', texto: 'Si pasan 7 días sin que nadie baje una copia, el sistema te lo recuerda: aparece un aviso arriba de Respaldos y una insignia en Sistema, en el menú.' },
        ],
      },
    ],
  },
];
