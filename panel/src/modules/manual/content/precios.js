/** PRECIOS Y FORMATO DE VENTA — de la factura del proveedor a la etiqueta de góndola y al ticket. */
export const PRECIOS = {
  id: 'precios',
  titulo: 'Precios y formato de venta',
  resumen: 'Cómo se arma el precio, las listas, las reglas por cantidad y los cambios masivos.',
  temas: [
    {
      id: 'derivacion',
      titulo: 'De la factura a la etiqueta',
      bloques: [
        { t: 'flujo', items: ['Costo neto unitario', '× (1 + markup)', 'PRECIO NETO', '× (1 + IVA)', 'redondeo', 'Etiqueta'] },
        {
          t: 'p',
          texto: 'El precio **no se tipea: se deriva** del costo del proveedor que fija el precio y del markup (o del precio fijo) de cada lista. Por eso un cambio de costo mueve el precio solo. El número que ve el cliente es siempre el **precio final con IVA**, ya redondeado.',
        },
        {
          t: 'lista',
          items: [
            '**Se redondea el precio final con IVA** (el de la etiqueta) y el neto se deriva hacia atrás. Así la etiqueta y el ticket nunca discrepan: **el ticket cobra lo que dice la góndola**.',
            'El redondeo se configura **global** (por defecto, al entero más cercano) y cada producto puede tener el suyo; "Heredar de configuración" es el valor por defecto.',
            'Las **cantidades pesadas** (granel) se redondean al **gramo**.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Configuración › Precios y descuentos (el redondeo) · Compras › Productos › (producto) › Formato de Venta' },
      ],
    },
    {
      id: 'modelo-formato-venta',
      titulo: 'El precio es del producto, no de la lista',
      bloques: [
        {
          t: 'p',
          texto: 'Este es el concepto que sostiene todo: **la lista no tiene precio ni markup**; solo aporta identidad y orden de preferencia. El markup vive en la fila **producto × lista**, y esa fila **es** la habilitación: si existe, el producto se vende así; si no existe, no se vende así (no hay nada que destildar).',
        },
        {
          t: 'ejemplo',
          titulo: 'La misma lista, dos markups',
          lineas: [
            'Harina Integral  ·  Mayorista 1  ·  markup 30%',
            'Lentejas         ·  Mayorista 1  ·  markup 50%',
            '',
            'Galletitas       ·  (sin fila mayorista)  → no se vende al por mayor',
          ],
        },
        {
          t: 'p',
          texto: 'Las **modalidades** (Minorista, Mayorista) solo agrupan a las listas; no llevan condiciones. Cada **lista** ("Mayorista 1 · Distribuidor") tiene número, nombre y orden de preferencia. **El número de lista no se edita nunca**: lo referencian los clientes y las ventas viejas, y renumerar reescribiría el historial. Para dejar de usar una, se desactiva.',
        },
        { t: 'ruta', texto: 'Ventas › Formato de venta (listas y modalidades; planes Pymes y Corporativo) · Compras › Productos › (producto) › Formato de Venta' },
      ],
    },
    {
      id: 'listas-modalidades',
      titulo: 'Administrar modalidades, listas y reglas de marca',
      bloques: [
        {
          t: 'p',
          texto: 'La pantalla **Formato de venta** muestra cada **modalidad** con sus **listas**, y abajo las **reglas de marca**. Arriba están los botones **+ Modalidad**, **+ Lista** y **Ver lógica** (una explicación viva de cómo se decide el precio de cada renglón, con tu configuración real). Planes Pymes y Corporativo.',
        },
        {
          t: 'tabla',
          cols: ['Qué', 'Qué se carga', 'Para tener en cuenta'],
          filas: [
            ['**Modalidad**', 'Nombre y orden de aparición; un tilde **Activa**.', 'Agrupa (Minorista, Mayorista…) y es lo que desbloquean las reglas de marca y el monto de compra. El orden **solo ordena la pantalla**. No se puede eliminar una modalidad que todavía tiene listas.'],
            ['**Lista**', 'Modalidad, nombre, **orden** y estado **Activa**.', 'Es solo identidad: no lleva markup ni condición (eso va en cada producto). **Orden menor = se prueba antes** y, entre las que un renglón habilita, **gana la de orden más bajo**: las de mejor precio primero y la de mostrador (el piso) última. El número no se edita. Si ya se vendió con ella, **eliminar la desactiva**.'],
            ['**Regla de marca**', 'Marca (del catálogo), unidades mínimas, modalidad que desbloquea y **Activa**.', 'Se aplica sola, porque se mide en cantidades. Eliminar una regla no toca las ventas hechas: solo deja de habilitar la modalidad en los tickets nuevos.'],
          ],
        },
        {
          t: 'p',
          texto: 'Los clientes pueden tener **listas asignadas** en su ficha (la puerta "Cliente"), y la **lista base (piso)** —la que se cobra cuando no se habilita ninguna otra— se elige en Ventas › Configuración › Precios y descuentos.',
        },
        { t: 'ruta', texto: 'Ventas › Formato de venta' },
      ],
    },
    {
      id: 'fila-formato',
      titulo: 'La fila del formato: unidades, código y modo de precio',
      bloques: [
        {
          t: 'p',
          texto: 'Cada fila dice **en qué se vende** (1 = suelto; 12 = caja de 12, con su propio código de barras) y **cómo se define el precio**: por **markup %** sobre el costo neto (el precio acompaña al costo) o por **precio definido**, un número final fijado a mano que no se mueve aunque el costo cambie.',
        },
        {
          t: 'ejemplo',
          titulo: 'Gaseosa: minorista suelta, mayorista por caja de 6',
          lineas: [
            'Mostrador   x1   markup 70%     unitario $2.353   formato $2.353',
            'Mayorista   x6   markup 22%     unitario $1.689   formato $10.134',
            '',
            'El "precio por unidad" del mayorista está siempre a la vista:',
            'la caja de $10.134 son 6 unidades de $1.689.',
          ],
        },
        {
          t: 'lista',
          items: [
            'El **precio definido no se redondea**: fijar $10.000 y ver $10.001 sería pisar la decisión de quien lo fijó. La ficha muestra el **markup equivalente** para no perder de vista el margen. Con precio definido, un cambio de costo **no** mueve el precio.',
            '**Escanear el código de la caja** en el punto de venta carga las N unidades de una vez y **fija la lista del formato**: el cliente compró la caja, no seis sueltas.',
            'Los códigos de formato compiten con **todos** los demás códigos (producto, DUN, paquetes): si dos cosas responden al mismo código, el lector no sabe cuál elegir.',
          ],
        },
      ],
    },
    {
      id: 'puertas',
      titulo: 'Las cuatro puertas: cuándo un cliente cae en una lista mayorista',
      bloques: [
        {
          t: 'p',
          texto: 'Son un **O**: con que se abra una alcanza, y entre todas las habilitadas gana la de menor orden. Si no se abre ninguna, queda el **piso**: la lista base (el precio de mostrador).',
        },
        {
          t: 'tabla',
          cols: ['Puerta', 'Se mide sobre', 'Alcanza a', 'Se aplica'],
          filas: [
            ['**Cliente**: tiene asignada la lista', 'el contrato', 'ese renglón', 'Sola'],
            ['**Producto**: mínimo de unidades', 'cantidades', 'ese renglón', 'Sola'],
            ['**Marca**: mínimo de unidades de la marca', 'cantidades', 'los renglones de esa marca', 'Sola'],
            ['**Monto**: total del ticket', 'pesos', 'todo el ticket', 'Avisa; se aplica con un clic'],
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: '**La regla de oro:** lo que se mide en **cantidades** se aplica solo (doce unidades siguen siendo doce aunque cambie el precio); lo que se mide en **pesos** solo se **sugiere**. Si el monto se aplicara solo: ticket $41.000 → pasa a mayorista → baja a $38.000 → ya no califica → vuelve atrás → sube a $41.000… La caja avisa y el cajero lo aplica con un clic.',
        },
        {
          t: 'p',
          texto: '**Reglas de marca.** Se suman las unidades de toda la marca en el ticket; al llegar al mínimo pasan a la modalidad indicada **solo los renglones de esa marca**.',
        },
        {
          t: 'ejemplo',
          titulo: 'Regla: Coca-Cola, 12 unidades → Mayorista',
          lineas: [
            'Ticket: 12 Coca-Cola + 3 Galletitas + 2 Yerbas',
            '',
            'Gaseosa Cola    Mayorista 1   $1.800   ← la marca llegó a 12 u.',
            'Galletitas      Mostrador     $1.400   ← no es de la marca',
            'Yerba           Mostrador     $5.200   ← no es de la marca',
            '',
            'Con 11 Coca-Cola: todo queda a precio de mostrador.',
          ],
        },
        {
          t: 'lista',
          items: [
            'Pueden convivir varias reglas (una marca desde 12, otra desde 6) y una misma marca puede tener dos reglas que abran modalidades distintas.',
            'Si un producto de la marca no tiene lista en esa modalidad, sigue con su precio.',
            'La regla apunta a la marca por registro, no por texto: renombrar la marca no la desarma.',
            '**Condición por monto**: se configura un monto mínimo, qué modalidad desbloquea y —opcionalmente— con qué medios de pago vale ("solo efectivo"). Alcanza a todo el ticket, cambia solo los productos que tengan lista en esa modalidad, y al confirmar se valida el medio de pago.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Formato de venta › Reglas de marca · Ventas › Configuración › Acceso mayorista por monto de compra' },
      ],
    },
    {
      id: 'evolucion',
      titulo: 'Evolución de precios y cambios de precio',
      bloques: [
        {
          t: 'p',
          texto: 'El precio se deriva, así que "cambió el precio" no es algo que se cargue: es la consecuencia de otra operación (un costo, un formato, un markup). Después de cada operación que puede moverlo, el sistema compara el precio de góndola con el último registrado y **anota solo lo que cambió**: el anterior, el nuevo, el **% de variación** y qué lo movió.',
        },
        {
          t: 'lista',
          items: [
            'Guarda el precio **final con IVA y redondeo**, el de la etiqueta. Por eso un +10% de costo puede figurar +9,96% o +10,01%: es el redondeo real.',
            'Se consulta en el producto (pestaña **Evolución de precios**) y globalmente con **Alt + F5**.',
            'Los paquetes fraccionados también figuran, con su tamaño.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Productos › (producto) › Evolución de precios · Ventas › Cambios de precio (planes Pymes y Corporativo) · Alt + F5' },
      ],
    },
    {
      id: 'aviso-precios',
      titulo: 'Aviso de cambio de precios a los cajeros',
      bloques: [
        {
          t: 'p',
          texto: 'El punto de venta guarda los precios al abrirse, para que cambiar de cliente o cruzar un umbral no dependa de la red. Si la administración actualiza precios mientras un cajero tiene la caja abierta, ese cajero seguiría cobrando el precio viejo. Por eso el sistema **avisa solo**: suena y aparece un cartel arriba que dice **quién** hizo el cambio, con el botón **Actualizar precios**, que trae los nuevos al instante.',
        },
        {
          t: 'lista',
          items: [
            'El aviso lo ve **quien tiene el punto de venta**; no se le muestra a quien hizo el cambio.',
            'No se esconde solo: se queda hasta que el cajero actualice o lo cierre, porque un precio viejo cuesta plata en cada venta.',
            'Los **renglones ya cargados** en un ticket abierto **no cambian de precio**: cada uno conserva el precio con el que entró, para cobrarle al cliente el número que se le dijo. Los precios nuevos rigen para lo que se agregue de ahí en adelante.',
          ],
        },
        { t: 'ruta', texto: 'Aparece en cualquier pantalla · el botón equivalente está en Ventas › Punto de venta' },
      ],
    },
    {
      id: 'actualizacion-masiva',
      titulo: 'Actualización masiva de costos y márgenes, y deshacer',
      bloques: [
        {
          t: 'lista',
          items: [
            'Los **costos** se actualizan en **Compras › Costos y percepciones › (el proveedor) › Productos y costos**. Se elige el campo (**Costo**, **Descuento %** o **Flete %**), cómo se mueve (**variar un %**, sumar o restar, o fijar un valor) y el número. La tabla muestra en el acto el costo neto y el **precio de venta antes → después** (en rojo lo que sube); recién al Guardar se aplica.',
            '**Se puede filtrar antes de aplicar**: por nombre, marca o código, y con un desplegable de las marcas que ese proveedor trae. Es lo que hace usable el caso normal ("una marca subió 10%" dentro de un distribuidor que trae seis).',
            'La regla masiva cae **solo sobre los productos tildados Y visibles**. Por defecto están todos tildados; se destildan los que no cambian. Con un filtro puesto, la regla cae solo sobre lo que se ve, y el botón lo dice con el número exacto ("Aplicar a 2 de los 2 que se ven"). Los tildes no se reinician al filtrar.',
            'Editar un campo a mano vale siempre, esté tildado o no: el tilde solo define el alcance de la regla masiva.',
            '**"Actualizar márgenes"** (Compras › Productos) cambia el **markup** del formato de venta, de los productos y de sus paquetes fraccionados. Las filas en **precio definido** se saltean: ese precio lo fijó una persona y un porcentaje no lo pisa.',
            'Cada cambio queda registrado **con el valor anterior y el nuevo**, en lotes. **Un lote se puede revertir.** Las filas que alguien tocó **después** se saltean: revertirlas pisaría una decisión más nueva.',
          ],
        },
        { t: 'ruta', texto: 'Compras › Costos y percepciones › (proveedor) · Compras › Productos › Actualizar márgenes' },
      ],
    },
    {
      id: 'carteles',
      titulo: 'Carteles de góndola',
      bloques: [
        {
          t: 'p',
          texto: 'El **precio que el cliente lee en el estante**, para que no tenga que preguntarle al cajero. Es la misma etiqueta autoadhesiva de los fraccionados, con el nombre más grande y sin código de barras. Planes Pymes y Corporativo.',
        },
        {
          t: 'pasos',
          items: [
            'Buscá el producto por nombre o marca y hacé clic en el resultado: se agrega a la lista con su marca, su nombre y su precio, sin tipear nada. Se buscan los productos **enteros**.',
            'Repetí con todos los que quieras: salen **todos juntos** con un solo Imprimir (rehacer una góndola son quince o veinte carteles).',
            'Si hace falta, editá la **Marca**, el **Nombre** (va grande) o la **Cantidad** de copias de cada renglón. **Vaciar un campo hace que esa línea no se imprima.**',
            'Tocá **Guardar los textos** si cambiaste algo: el texto corto queda guardado por producto y la próxima vez sale igual.',
            'Tocá **Imprimir**. Al lado hay una **vista previa** del primero.',
          ],
        },
        {
          t: 'lista',
          items: [
            '**El precio no se tipea**: sale del catálogo, con IVA, el mismo que cobra la caja. Si cambia el precio, el cartel lo sigue solo: es volver acá y apretar Imprimir. La línea de mayorista aparece solo en los productos que tienen ese precio cargado.',
            '**+ Cartel libre** es para uno sin producto, como un título de góndola ("ACEITES", "OFERTAS").',
            '**Diseñar el cartel** abre un recuadro con las medidas reales de la etiqueta para **arrastrar cada elemento** (marca, nombre, precios) a donde lo quieras. El diseño es por formato y se guarda en el servidor: lo comparten todas las máquinas.',
            'El **tamaño** de la etiqueta se elige en Sistema › Impresión › Cartel de góndola.',
          ],
        },
        { t: 'ruta', texto: 'Ventas › Carteles de góndola' },
      ],
    },
  ],
};
