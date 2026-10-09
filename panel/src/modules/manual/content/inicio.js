/** PRIMEROS PASOS — cómo entrar, moverse, qué incluye cada plan y cómo se cuida el sistema. */
export const INICIO = {
  id: 'inicio',
  titulo: 'Primeros pasos',
  resumen: 'Entrar, moverse por el sistema, atajos y qué incluye tu plan.',
  temas: [
    {
      id: 'ingresar',
      titulo: 'Entrar al sistema y cambiar de sucursal',
      bloques: [
        {
          t: 'p',
          texto: 'Para entrar se escribe el **usuario**, la **contraseña** y, si el negocio tiene más de una sucursal, **la sucursal con la que se va a trabajar**. El sistema pide una confirmación antes de entrar. Si hay una sola sucursal, no la pregunta.',
        },
        {
          t: 'lista',
          items: [
            'La sucursal elegida fija el puesto de **toda la sesión**: Compras, Almacén y Ventas se abren parados ahí. Arriba a la derecha siempre se ve quién entró y en qué sucursal.',
            'La **primera vez** que entra el dueño, el sistema le pide elegir su propia contraseña. Nadie debería seguir usando la contraseña inicial.',
            'Cualquier usuario puede cambiar **su** contraseña desde el menú del perfil (arriba a la derecha) › **Mi perfil**.',
            'Quien administra (administrador y superadmin) puede cambiar de sucursal desde ese mismo menú › **Cambiar de sucursal**. El resto trabaja donde dijo al entrar.',
            'Cada pestaña o ventana del navegador tiene **su propia sesión**: se pueden tener dos ventanas con usuarios y sucursales distintos sin que se pisen. Una pestaña nueva hereda el último ingreso hecho en ese navegador.',
            'Si el sistema estuvo mucho tiempo sin usarse, la sesión **vence** y hay que volver a entrar. No se pierde nada de lo ya guardado.',
            'Para trabajar como otra persona se **cierra la sesión** (menú del perfil › Cerrar sesión) y entra la otra: en las operaciones el usuario siempre es el de la sesión.',
          ],
        },
      ],
    },
    {
      id: 'modulos',
      titulo: 'Los módulos del menú',
      bloques: [
        {
          t: 'p',
          texto: 'El menú de la izquierda se arma según **tu rol y tu plan**: si no tenés permiso para nada de un módulo, ese módulo no aparece. Lo que ves depende de quién sos, no es un error.',
        },
        {
          t: 'tabla',
          cols: ['Módulo', 'Para qué sirve'],
          filas: [
            ['Dashboard', 'La pantalla de inicio: lo vendido hoy y el estado de la caja de tu sucursal, y el resumen del inventario (valor, productos, stock bajo y comprometido, stock por sucursal, últimos movimientos). En Pymes y Corporativo suma las cobranzas, los presupuestos y las transferencias pendientes.'],
            ['Compras', 'Productos, facturas y remitos de proveedores, catálogos (marcas, categorías, etiquetas), costos y precios.'],
            ['Proveedores', 'La ficha de cada proveedor, pedidos, cuentas corrientes, echeqs y estados de cuenta.'],
            ['Ventas', 'Punto de venta, listado de ventas, clientes, cobranzas, caja, formato de venta, ofertas y configuración del mostrador.'],
            ['Almacén', 'Existencias, transferencias entre sucursales, incidencias, control de stock, fraccionamiento y vencimientos.'],
            ['Gastos', 'Lo que se paga y no es mercadería: servicios, alquileres, impuestos, y cuánto se va en cada rubro.'],
            ['Gerencia', 'Usuarios y roles, reportes de ventas, rentabilidad, valorización de stock, auditoría y configuración.'],
            ['Sistema', 'Datos de la empresa, impresión, este equipo, respaldos y licencia.'],
            ['Info de sistema', 'Esta guía.'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'Hay dos consultas que se abren **desde cualquier pantalla** con el teclado: **Alt + F3** (existencias por sucursal) y **Alt + F5** (cambios de precio). Apretar de nuevo el mismo atajo las cierra.',
        },
      ],
    },
    {
      id: 'planes',
      titulo: 'Qué incluye cada plan',
      bloques: [
        {
          t: 'p',
          texto: 'El sistema se ofrece en tres planes. **Es el mismo sistema**: el plan decide qué secciones se habilitan y cuántas sucursales y usuarios activos se pueden tener. Si una sección no aparece o dice que el plan no la incluye, se habilita subiendo de plan (consultá a quien te dio el sistema).',
        },
        {
          t: 'tabla',
          cols: ['', 'Emprendedor', 'Pymes', 'Corporativo'],
          filas: [
            ['Sucursales', '1', 'hasta 3', 'sin límite'],
            ['Usuarios activos', 'hasta 3', 'hasta 10', 'sin límite'],
            ['Compras, productos, proveedores (ficha y pedidos), gastos', 'Sí', 'Sí', 'Sí'],
            ['Punto de venta, listado de ventas, clientes, caja', 'Sí', 'Sí', 'Sí'],
            ['Existencias, operaciones del almacén y vencimientos', 'Sí', 'Sí', 'Sí'],
            ['Usuarios y roles, configuración, respaldo manual, empresa, impresión y licencia', 'Sí', 'Sí', 'Sí'],
            ['Presupuestos, cobranzas, listas de precio, ofertas y cambios de precio', '—', 'Sí', 'Sí'],
            ['Control de stock, fraccionamiento, transferencias e incidencias', '—', 'Sí', 'Sí'],
            ['Cuentas corrientes, echeqs y estados de cuenta de proveedores', '—', 'Sí', 'Sí'],
            ['Reportes de ventas y rentabilidad', '—', 'Sí', 'Sí'],
            ['Terminales (este equipo) y copia diaria automática', '—', 'Sí', 'Sí'],
            ['Valorización de stock y auditoría (Gerencia)', '—', '—', 'Sí'],
            ['Sitio web propio con tienda (módulo Web)', '—', '—', 'A pedido'],
            ['Adaptaciones y módulos a medida', '—', '—', 'A pedido'],
          ],
        },
        {
          t: 'nota',
          tono: 'ok',
          texto: 'Al **bajar** de plan no se borra nada: lo que ya cargaste queda, solo se impide crear más cosas por encima del tope del plan nuevo (más sucursales o usuarios de los permitidos).',
        },
      ],
    },
    {
      id: 'tablas',
      titulo: 'Tablas, búsquedas y paginación',
      bloques: [
        {
          t: 'p',
          texto: 'Todos los listados (productos, proveedores, clientes, movimientos, comprobantes, existencias…) muestran **20 filas por vez**. Al pie de cada tabla está el paginador, con las páginas y el selector **"Filas por página"** (10 / 20 / 50 / 100).',
        },
        {
          t: 'lista',
          items: [
            'El tamaño que elegís se **recuerda por tabla**, en ese navegador: si en Productos elegís 50, Productos vuelve a abrir en 50 y las demás tablas siguen como estaban.',
            'Al cambiar un filtro o la búsqueda se vuelve a la página 1.',
            'El paginador no aparece si el listado entra en una pantalla (10 filas o menos).',
          ],
        },
      ],
    },
    {
      id: 'atajos',
      titulo: 'Atajos de teclado',
      bloques: [
        {
          t: 'tabla',
          cols: ['Tecla', 'Qué hace'],
          filas: [
            ['F2', 'Cobrar (en el punto de venta)'],
            ['F8', 'Facturar: comprobante fiscal con CAE de ARCA'],
            ['F10', 'Liquidar: ticket interno, al contado, sin tocar ARCA'],
            ['F4', 'Volver al buscador'],
            ['Ins', 'Carga rápida de producto'],
            ['Shift + Ins', 'Búsqueda de productos por categoría, marca o producto (muestra el stock de **tu** sucursal y el precio por lista)'],
            ['Esc', 'Salir de la registradora a la lista de ventas, guardando. Con una ventana abierta, cierra la ventana; con texto en el buscador, lo limpia'],
            ['Alt + F3', 'Existencias por sucursal, **desde cualquier pantalla**'],
            ['Alt + F5', 'Cambios de precio, **desde cualquier pantalla** (planes Pymes y Corporativo)'],
          ],
        },
        {
          t: 'p',
          texto: 'Las dos consultas globales tienen los filtros arriba y la tabla con su propio desplazamiento: los filtros y los encabezados no se van de la vista aunque recorras cientos de filas.',
        },
        {
          t: 'tabla',
          cols: ['Consulta', 'Filtros', 'Columnas'],
          filas: [
            ['Existencias (Alt + F3)', 'búsqueda, proveedor, categoría, marca, solo con stock', 'código, producto, una columna por sucursal, total y precios'],
            ['Cambios de precio (Alt + F5)', 'búsqueda, marca, lista, motivo, desde', 'producto, lista, antes → después, variación y fecha (el motivo se ve al pasar el mouse por la fecha)'],
          ],
        },
      ],
    },
    {
      id: 'sin-conexion',
      titulo: 'Si se corta internet y cuando hay una versión nueva',
      bloques: [
        {
          t: 'p',
          texto: 'El punto de venta sigue funcionando **sin conexión**. Abajo aparece un cartel amarillo ("Sin conexión con el servidor — reintentando") con la cantidad de ventas que esperan para subirse.',
        },
        {
          t: 'lista',
          items: [
            'Sin conexión se puede seguir vendiendo con el catálogo que quedó guardado en el equipo, pero **solo en efectivo**, sin cuenta corriente y **sin factura de ARCA** (sale ticket interno). Si al sincronizar el stock no alcanza, la venta entra igual y el producto queda en negativo: el sistema lo avisa.',
            'Al volver la conexión, las ventas se suben **solas**, una sola vez cada una y en la sucursal donde se cobraron. Un cartel muestra cuántas entraron y avisa si alguna no pudo registrarse o dejó un producto en negativo.',
            'Si alguna venta no se pudo enviar, queda **guardada en este equipo** con las opciones **Reintentar** o **Descartar**. Descartar significa que esa plata, ya cobrada, **no figura en el sistema**: se usa solo cuando se sabe que esa venta ya está registrada o es un error.',
            '**No cierres la caja mientras haya ventas sin subir**: el cierre cuenta lo que ya está en el sistema.',
          ],
        },
        {
          t: 'p',
          texto: 'Cuando hay una **versión nueva** del sistema aparece un aviso con el botón **Actualizar**. La actualización nunca se hace sola: se toca el botón **entre una venta y otra**, para no perder un cobro a medio hacer. Si hay varias ventanas abiertas, solo se recarga la que tocó "Actualizar"; las demás avisan y esperan.',
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'El sistema también avisa a los cajeros cuando un precio cambió mientras tenían el punto de venta abierto (ver Precios › "Aviso de cambio de precios").',
        },
      ],
    },
  ],
};
