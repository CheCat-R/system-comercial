/** SISTEMA Y ADMINISTRACIÓN — usuarios, licencia, respaldos, impresión y los reportes de Gerencia. */
export const SISTEMA = {
  id: 'sistema',
  titulo: 'Administración del sistema',
  resumen: 'Usuarios y roles, licencia, respaldos, impresión y reportes de Gerencia.',
  temas: [
    {
      id: 'usuarios-roles',
      titulo: 'Usuarios y roles',
      bloques: [
        {
          t: 'p',
          texto: 'Cada persona entra con **su usuario**, y lo que puede ver y hacer lo decide su **rol**. Un rol es una lista de permisos que se arma a gusto: no está fijo en el sistema. Los permisos son de dos clases: **secciones** (qué pantallas ve; un módulo sin ninguna sección asignada desaparece entero del menú) y **acciones** (qué operaciones puede hacer dentro de lo que ve: registrar una merma, preparar envíos, cobrar, pisar un precio…).',
        },
        {
          t: 'tabla',
          cols: ['Rol de fábrica', 'Qué hace'],
          filas: [
            ['Superadmin', 'Maneja todo: crea roles, permisos y usuarios con sus contraseñas. No se edita ni se borra, y siempre queda al menos uno activo.'],
            ['Administrador', 'Operación completa: compras, ventas, almacén, gastos y proveedores. No administra usuarios y roles.'],
            ['Cajero', 'Punto de venta, caja y cobranzas de su sucursal.'],
            ['Fraccionador', 'Almacén: fraccionar granel, preparar envíos, mermas e incidencias.'],
          ],
        },
        {
          t: 'lista',
          items: [
            'Un usuario tiene nombre, rol, contraseña y estado **activo**. **No se borran** (están en los historiales): se **desactivan**. El nombre es el usuario de entrada, así que no puede haber dos iguales.',
            'Los roles de fábrica se pueden editar (salvo el superadmin) pero no borrar. Los roles propios se borran solo si no tienen usuarios asignados.',
            'El editor de roles muestra una tarjeta por módulo, sección por sección, con un tilde para marcar o desmarcar el módulo completo.',
            'Los cambios de permisos le llegan al usuario **al recargar la pantalla (F5)**, sin tener que volver a entrar.',
            '**Habilitar la cuenta corriente de un cliente y fijar su límite** es un permiso aparte que **ningún rol de fábrica trae**: lo tiene solo el superadmin. El administrador carga la ficha completa del cliente, pero esos tres datos los ve sin poder tocarlos hasta que se le dé ese permiso en su rol.',
            'Alta: **+ Nuevo usuario** (nombre, rol y contraseña de **al menos 8 caracteres**). La contraseña de quien entra la cambia cada uno en Mi perfil; un administrador puede restablecerla y la persona elige una nueva al entrar.',
            '**Relevo de caja**: con el tilde **"Puede relevar en caja"** y un **PIN de 4 a 6 dígitos**, esa persona puede tomar la caja de otra sesión desde el punto de venta (cuando la cajera se ausenta y cobra el repositor). Las ventas y los movimientos quedan **firmados con su nombre** y no cambia sus permisos.',
            'El plan limita cuántos usuarios **activos** se pueden tener (3 en Emprendedor, 10 en Pymes). Para dar de alta a otro hay que desactivar a alguien o subir de plan.',
          ],
        },
        { t: 'ruta', texto: 'Gerencia › Usuarios y roles (de fábrica, solo el superadmin)' },
      ],
    },
    {
      id: 'sucursales',
      titulo: 'Sucursales: crear, punto de venta y domicilio',
      bloques: [
        {
          t: 'p',
          texto: 'En Gerencia › Usuarios y roles › **Sucursales** se ve cada local con su tipo (**Distribuidora** o **Express**), su **punto de venta** (el de ARCA, de cinco dígitos) y el **domicilio del comprobante**, que son los dos datos que necesita la factura electrónica. Con **+ Nueva sucursal** se crea un local; con **Editar**, en su fila, se cambia cualquiera de sus datos.',
        },
        {
          t: 'lista',
          items: [
            'Con **un solo local**, dejar el punto de venta vacío es válido: se usa el general que configuró quien instaló el sistema. Con **varios**, cada uno necesita **el suyo**: dos locales no pueden compartirlo.',
            'El estado de la conexión con ARCA y el último número autorizado de cada punto de venta están en Ventas › Configuración (diagnóstico).',
            'El plan pone un tope: **1 sucursal en Emprendedor, 3 en Pymes**, sin tope en Corporativo. Al llegar, el botón se apaga y el panel avisa; para sumar otra hay que subir de plan.',
            'Hay **una sola Distribuidora** (el depósito central); las demás son Express.',
            'Antes de facturar desde un local nuevo, su punto de venta tiene que estar dado de alta en ARCA (sistema “Web Services”). Después, en ese local: registrá el equipo (Sistema › Este equipo) y cargale mercadería con una compra o una transferencia desde otra sucursal.',
            'Por ahora **una sucursal no se borra** desde el panel: tiene ventas, caja y stock que son historia del negocio. Si un local cierra, pasale la mercadería a otra sucursal y se deja de usar.',
          ],
        },
        { t: 'ruta', texto: 'Gerencia › Usuarios y roles › Sucursales' },
      ],
    },
    {
      id: 'licencia',
      titulo: 'Licencia y plan',
      bloques: [
        {
          t: 'p',
          texto: 'El sistema se usa mientras tenga una **clave de activación vigente**. La clave indica el plan contratado y hasta cuándo vale, y se pega en **Sistema › Licencia**, donde también se ve el estado actual.',
        },
        {
          t: 'tabla',
          cols: ['Estado', 'Cuándo', 'Qué pasa'],
          filas: [
            ['Activa', 'Más de 15 días por delante', 'Todo funciona normal.'],
            ['Por vencer', '15 días o menos', 'Aviso con la fecha para quien administra.'],
            ['En gracia', 'Venció hace 10 días o menos', 'Sigue funcionando, con un aviso rojo para todos.'],
            ['Vencida o sin licencia', 'Pasó la gracia, o nunca se cargó una', '**Solo lectura**: se ve todo y se bajan respaldos, pero no se registran ventas ni compras nuevas.'],
          ],
        },
        {
          t: 'nota',
          tono: 'ok',
          texto: 'Los datos **nunca se esconden**: aunque la licencia esté vencida, se puede consultar todo y descargar el respaldo. Cargar una clave vigente lo destraba al instante. Para renovar, pedí una clave nueva (los avisos muestran por dónde).',
        },
        { t: 'ruta', texto: 'Sistema › Licencia' },
      ],
    },
    {
      id: 'respaldos',
      titulo: 'Respaldos (copias de seguridad)',
      bloques: [
        {
          t: 'p',
          texto: 'Hay dos tipos de copia, y conviene tener las dos:',
        },
        {
          t: 'lista',
          items: [
            '**La copia que bajás vos** (todos los planes): Sistema › Respaldos › **Descargar**. Baja un archivo con todos los datos. **Guardalo fuera de esta máquina** (pendrive, Drive): es la que te salva si se pierde el servidor. Cada descarga queda registrada con quién y cuándo, y si la última tiene más de una semana el sistema avisa que está vieja.',
            '**La copia diaria automática** (planes Pymes y Corporativo): una vez por día el servidor guarda una copia comprimida y conserva las últimas. Se pueden bajar desde la misma pantalla. Si la última falló, o pasó más de un día y medio sin generarse, el sistema lo avisa. Ojo: vive en el **mismo servidor** que los datos, así que no reemplaza a la que bajás vos.',
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'La copia trae los **datos** del negocio. El certificado de ARCA y su clave privada **no van en la copia**: quedan aparte, en el servidor. Si se perdieran, no se restauran: se da de baja ese certificado y se tramita otro (las facturas ya emitidas no se pierden: el CAE vive en cada venta).',
        },
        { t: 'ruta', texto: 'Sistema › Respaldos' },
      ],
    },
    {
      id: 'impresion',
      titulo: 'Empresa e impresión',
      bloques: [
        {
          t: 'p',
          texto: 'Todo lo que el sistema imprime sale por **un solo motor**, que lee dos pantallas de Sistema: los datos de la empresa y el formato de cada documento.',
        },
        {
          t: 'tabla',
          cols: ['Dónde', 'Qué se configura'],
          filas: [
            ['Sistema › Empresa', 'Nombre de fantasía, **razón social**, CUIT, dirección, teléfono, **logo** (imagen de hasta 400 KB) y color de marca. Es el membrete de todos los documentos; el color se aplica solo a A4 y Carta (los rollos térmicos son blanco y negro). El nombre de fantasía va grande; la **razón social** es la de quien factura y en una factura es obligatoria: sale como Emisor. Si son iguales, se deja vacía la razón social.'],
            ['Sistema › Impresión', 'El formato de cada documento: **rollo 80 mm** (recomendado), **rollo 58 mm**, **A4** o **Carta**; etiquetas en su medida (50 × 30 mm por defecto, o 50 × 25, 40 × 25, 60 × 40). Tiene vista previa en vivo (el mismo HTML que va a la impresora) e impresión de prueba. Cada documento ofrece solo los formatos que le sirven.'],
          ],
        },
        {
          t: 'lista',
          items: [
            '**El ticket del punto de venta** se imprime solo al cobrar (se puede apagar en Sistema › Impresión). "Reimprimir" en la caja saca de nuevo el último ticket de ese puesto.',
            '**Se puede reimprimir** desde la fila de: Ventas (con CAE sale la factura con su QR; sin CAE, el ticket), Almacén › Transferencias (remito), Almacén › Operaciones (vale), Gastos (comprobante) y Gastos › Pagos en sucursal (orden). Toda reimpresión lleva al pie **cuándo se imprimió y quién**.',
            'Las **etiquetas de los fraccionados** van a una impresora térmica de etiquetas, sin membrete.',
            '**La impresora física** se elige en el diálogo del navegador, en cada equipo. En la caja, abriendo Chrome con la opción de impresión directa, imprime sin diálogo en la impresora predeterminada.',
          ],
        },
        { t: 'ruta', texto: 'Sistema › Empresa · Sistema › Impresión' },
      ],
    },
    {
      id: 'este-equipo',
      titulo: 'Este equipo (registrar una caja)',
      bloques: [
        {
          t: 'p',
          texto: 'Para que una caja no pregunte la sucursal en cada ingreso (y nadie venda por error descontando el stock de otro local), el equipo se **registra una vez**: desde esa misma máquina, en Sistema › Este equipo, se le da un nombre y se le asigna su sucursal. Desde entonces el ingreso muestra "Caja 2 · Sucursal" y la persona solo pone quién es y su clave.',
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'Se registra **desde el propio equipo** a propósito: la marca queda guardada en el navegador de esa máquina, así que registrar una caja desde la oficina no tendría efecto sobre la caja. Disponible en los planes Pymes y Corporativo.',
        },
        { t: 'ruta', texto: 'Sistema › Este equipo' },
      ],
    },
    {
      id: 'reportes-gerencia',
      titulo: 'Reportes de Gerencia',
      bloques: [
        {
          t: 'tabla',
          cols: ['Sección', 'Qué responde', 'Plan'],
          filas: [
            ['Reportes de ventas', 'Ventas por día, sucursal y vendedor; tickets, medios de pago y comparativa contra el período anterior.', 'Pymes y Corporativo'],
            ['Rentabilidad', 'El margen **real** por producto, marca, categoría y proveedor, con el IVA absorbido por la mercadería sin factura a la vista (ver Compras › "La mercadería sin factura").', 'Pymes y Corporativo'],
            ['Valorización de stock', 'Cuánta plata hay parada en mercadería, a costo, por sucursal y por estado.', 'Corporativo'],
            ['Auditoría', 'Quién hizo qué: anulaciones, reversiones de precios y diferencias de caja, además de los cambios de ficha registrados.', 'Corporativo'],
            ['Configuración', 'Un directorio de dónde está cada parámetro del sistema: empresa, impresión y las preferencias de ventas (punto de venta, ARCA, cuenta corriente, redondeo, medios de pago, lector y balanza).', 'Todos'],
          ],
        },
        {
          t: 'nota',
          tono: 'info',
          texto: 'Las pérdidas por merma, vencimiento o producto defectuoso se valúan al **costo del día en que ocurrieron** y ese valor no cambia después: la pérdida de marzo no se modifica porque en julio haya subido el catálogo.',
        },
        { t: 'ruta', texto: 'Gerencia' },
      ],
    },
  ],
};
