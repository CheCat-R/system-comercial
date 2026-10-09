/** OFERTAS — promociones: mecánicas, alcance y cómo se aplican en la caja. */
export const OFERTAS = {
  id: 'ofertas',
  titulo: 'Ofertas y descuentos',
  resumen: 'Promociones y descuentos con nombre: a qué alcanzan y cómo los resuelve la caja. Las ofertas son de los planes Pymes y Corporativo.',
  temas: [
    {
      id: 'mecanicas',
      titulo: 'Las siete mecánicas de oferta',
      bloques: [
        {
          t: 'tabla',
          cols: ['Mecánica', 'Ejemplo', 'Se aplica'],
          filas: [
            ['Descuento %', '20% en Galletitas', 'Sola'],
            ['Precio de oferta', 'La yerba a $3.500', 'Sola'],
            ['Llevá N pagá M', '3×2 en yerbas', 'Sola'],
            ['2ª unidad con descuento', '2ª unidad al 50%', 'Sola'],
            ['Pack', '3 por $10.000', 'Sola'],
            ['Combo', 'Galletitas + yerba por $5.000', 'Sola'],
            ['% al ticket', '10% desde $30.000 en efectivo', '**Se sugiere**: el cajero la aplica con un clic'],
          ],
        },
        {
          t: 'p',
          texto: 'Los precios que se configuran ($ del pack, del combo y el precio de oferta) son **finales, con IVA**: el número del cartel. El sistema calcula el neto de cada producto con su propia alícuota.',
        },
        { t: 'ruta', texto: 'Ventas › Ofertas' },
      ],
    },
    {
      id: 'alcance',
      titulo: 'A qué productos alcanza y cuándo vale',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Alcance**: producto, **paquete fraccionado**, marca, categoría o etiqueta, y se pueden mezclar (la unión habilita).',
            '**Los paquetes fraccionados no entran solos**: tienen su propio precio, así que una oferta al producto base (o a su marca, categoría o etiqueta) **no los toca** salvo que se tilde **"incluir también los paquetes fraccionados"**. Para poner en oferta un tamaño puntual ("Lentejas 500 g") se lo elige como **Paquete** en el buscador de alcance.',
            '**Vigencia**: desde y hasta, días de la semana y **sucursales** (todas tildadas = corre en todas).',
            '**Listas de precio**: sobre cuáles corre. Todas tildadas = corre sobre cualquier precio. Dejando solo la de mostrador, un mayorista no recibe además la promo (el doble beneficio); y se puede armar una promo solo para una lista mayorista. Se compara contra la lista con la que quedó cotizado el renglón.',
            '**Medio de pago**: solo la oferta de ticket puede exigirlo ("10% pagando en efectivo"); se valida al confirmar la venta.',
            'Una oferta vencida figura **Vencida** sola: el estado se calcula con el reloj. Si ya se usó en ventas, **borrarla la desactiva** (los tickets viejos la referencian).',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'La pantalla de Ofertas **avisa cuando una oferta está descontando mercadería que ya venció** (el dato viene de Almacén › Vencimientos): ahí mismo se la edita para apagarla o recortar su alcance. Desde Vencimientos también se llega al alta de una oferta con el formulario ya lleno.',
        },
      ],
    },
    {
      id: 'resolucion',
      titulo: 'Cómo resuelve la caja las ofertas',
      bloques: [
        { t: 'flujo', items: ['Precio de lista', 'Combos (consumen unidades)', 'Mejor oferta por renglón', 'Descuento con nombre (si gana)', 'Sugerencia de ticket'] },
        {
          t: 'lista',
          items: [
            '**Una oferta por renglón**: la de mayor beneficio. Apilar promociones vuelve inexplicable el ticket.',
            'Los **combos van primero** y consumen unidades: lo que entró en un combo no cuenta para el 3×2.',
            'La oferta **de ticket no se apila**: reparte su porcentaje solo entre los renglones que quedaron sin promoción.',
            'Misma regla de oro de las listas: lo que depende de cantidades se aplica solo; lo que depende de pesos se sugiere.',
            'Cada renglón guarda **qué oferta** se le aplicó y **cuánto descontó**: meses después se puede responder cuánto costó cada promoción.',
          ],
        },
        {
          t: 'ejemplo',
          titulo: '30 galletitas + 1 kg de harina, 10% desde $30.000',
          lineas: [
            'Galletitas ×30    2ª unidad al 50%     −$10.208,70   (15 pares)',
            'Harina 1 kg       10% al ticket        −$113,03      (no tenía promo)',
            '',
            'Las galletitas NO reciben además el 10%: ya tienen su oferta.',
          ],
        },
      ],
    },
    {
      id: 'descuentos-nombre',
      titulo: 'Descuentos con nombre (autorizados por el dueño)',
      bloques: [
        {
          t: 'p',
          texto: 'Un precio puede bajar por el descuento del **cliente**, por el descuento **manual** del renglón (decisión del vendedor, acotada por el tope de Configuración) o por una **oferta**. Un cuarto camino son los **descuentos con nombre**: *"Empleados 15%"*, *"Atención por tardanza 25%"*. Los crea el dueño una vez, y en la caja se eligen **por su nombre, sin tipear un número**. Existen porque ese porcentaje **saltea el tope del vendedor**: lo autorizó quien lo creó, no quien lo aplica.',
        },
        {
          t: 'tabla',
          cols: ['Campo', 'Qué decide'],
          filas: [
            ['**Nombre**', 'Único. Es lo que ve la cajera y lo que queda impreso en el ticket.'],
            ['**Porcentaje**', 'El que autoriza el dueño. No lo puede cambiar quien lo aplica.'],
            ['**Lista de precios**', 'Obligatorio. El descuento cae solo sobre los renglones de **esa lista**, nunca sobre el total del ticket.'],
            ['**Vencimiento**', 'Vacío = no vence. Con fecha, vale todo ese día hasta las 23:59 (hora de Argentina).'],
            ['**Medio de pago**', 'Vacío = cualquiera. Con un valor, el pago tiene que ser íntegro de ese medio.'],
            ['**Sucursal**', 'Vacío = todas.'],
            ['**Requiere admin**', 'Si está tildado, la cajera lo ve pero no lo puede aplicar sola.'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**Cae solo sobre su lista**: si el cliente lleva algo de Minorista y algo de Mayorista 1, un descuento de Mayorista 1 toca solo esa parte.',
            '**Uno por lista.** Dos de la misma lista competirían por los mismos renglones.',
            '**Gana el mayor, nunca se suman.** Si el cliente ya trae 25% propio y el descuento es del 20%, el renglón queda en 25.',
            '**No toca los renglones con oferta**: ya tienen su beneficio.',
            '**El medio de pago se bloquea y se avisa**: un descuento "en efectivo" no admite un ticket pagado mitad y mitad.',
          ],
        },
        {
          t: 'p',
          texto: '**En la caja** hay un botón debajo del total: **"Aplicar descuento"**. Muestra los que sirven para ese ticket y, **en gris y con el motivo escrito**, los que no (venció, es de otra sucursal, ningún renglón usa su lista, lo tiene que aplicar un administrador). Una vez aplicado queda como un cartelito arriba del botón y cada renglón alcanzado muestra su sello. **Se vuelve a evaluar con cada cambio del ticket**: si entra otro producto de esa lista entra solo; si un renglón cambia de lista, se cae; y si se cae el último, el cartel avisa "ya no descuenta".',
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'Mientras gana un descuento con nombre, el campo **Desc. %** del renglón se vuelve solo lectura. Para tocarlo a mano, primero se saca el descuento.',
        },
        { t: 'ruta', texto: 'Ventas › Configuración › Descuentos · Punto de venta › debajo del total › Aplicar descuento' },
      ],
    },
  ],
};
