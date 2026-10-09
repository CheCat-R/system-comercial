/** GASTOS — lo que la empresa paga y no es mercadería. */
export const GASTOS = {
  id: 'gastos',
  titulo: 'Gastos',
  resumen: 'Lo que se paga y no es mercadería: cómo cargarlo, los gastos fijos y en qué se va la plata.',
  temas: [
    {
      id: 'gastos-que-es',
      titulo: 'Qué es un gasto y qué no',
      bloques: [
        {
          t: 'p',
          texto: 'Un **gasto** es un comprobante que la empresa recibe y tiene que pagar, y que **no entra al stock**: luz, alquiler, combustible, fletes, honorarios, impuestos, seguros. La **mercadería no es un gasto**: sigue entrando por Compras › Facturación, porque mueve stock y define el costo del producto.',
        },
        {
          t: 'tabla',
          cols: ['', 'Compra de mercadería', 'Gasto'],
          filas: [
            ['Dónde se carga', 'Compras › Facturación', 'Gastos › Gastos'],
            ['Tiene ítems', 'Sí: productos con cantidad y costo', 'No: se imputa a un **rubro**'],
            ['Mueve stock', 'Sí (si es recepción)', 'Nunca'],
            ['Toca precios', 'Sí: actualiza el costo y el precio de venta', 'Nunca'],
            ['Va al libro de IVA compras', 'Sí', 'Sí'],
          ],
        },
        {
          t: 'p',
          texto: 'El proveedor de gastos es **el mismo padrón** que el de compras: una entidad, un CUIT, una cuenta. Lo que lo clasifica son dos casillas, **Provee mercadería** y **Provee gastos**, que solo definen en qué buscador aparece. Un gasto puede ir **sin proveedor** (el ticket de nafta, una changa): hay un campo "A nombre de" que es solo descriptivo; sin ficha no hay cuenta corriente, y está bien.',
        },
        { t: 'ruta', texto: 'Gastos › Gastos' },
      ],
    },
    {
      id: 'gastos-rubros',
      titulo: 'Rubros: fijos y variables',
      bloques: [
        {
          t: 'p',
          texto: 'Cada gasto se imputa a un **rubro** del plan de gastos, y cada rubro es **fijo** o **variable**. Esa marca hace útil el resumen: el alquiler no se compara con el combustible.',
        },
        {
          t: 'tabla',
          cols: ['Tipo', 'Qué es', 'Ejemplos'],
          filas: [
            ['**Fijo**', 'Se paga igual vendas mucho o poco: el piso que hay que cubrir todos los meses', 'Alquiler, servicios, sueldos, seguros, impuestos, honorarios'],
            ['**Variable**', 'Depende de la actividad', 'Combustible, fletes, packaging, mantenimiento, comisiones'],
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'Un rubro con gastos imputados **no se borra: se da de baja**. Dado de baja deja de ofrecerse y la historia sigue siendo legible.',
        },
        { t: 'ruta', texto: 'Gastos › Rubros' },
      ],
    },
    {
      id: 'gastos-carga',
      titulo: 'Cargar un gasto',
      bloques: [
        {
          t: 'p',
          texto: 'La carga se parece a **leer la factura** y arranca por el **proveedor**: al elegirlo se completa solo la letra del comprobante y cómo se van a leer los montos. Después se anotan **conceptos con su monto** ("abono mensual $45.000, reconexión $8.000") y el total es la suma.',
        },
        {
          t: 'tabla',
          cols: ['Los montos que cargás…', 'Cómo cuenta'],
          filas: [
            ['**…ya incluyen el IVA** (ticket, factura B o C)', 'El total es la suma tal cual. El campo "IVA incluido" es opcional e informativo: no cambia el total.'],
            ['**…son sin IVA y el IVA va aparte** (factura A)', 'Los renglones se tipean **netos, como los lista el papel**, y el IVA se **calcula solo con la alícuota** elegida (21 · 10,5 · 27 · sin IVA · a mano) y se **suma** al total. Escribir el IVA a mano lo deja "a mano": el papel manda sobre la cuenta.'],
          ],
        },
        {
          t: 'lista',
          items: [
            'En el pie hay tres campos propios que **suman al total**: **Impuestos internos**, **Percepción D.G.I.** y **Percepción D.G.R. (Ingresos Brutos)**. Van separados porque terminan en lugares distintos (los internos no se recuperan, son costo). La alícuota del **27%** es la de luz, gas, agua y teléfono a responsable inscripto.',
            '**El modo lo trae la letra**: un proveedor que factura A pasa el selector a "sin IVA" solo (se puede cambiar). Un IVA mayor que el neto se rechaza.',
            '**Un importe sin concepto no se suma** y el sistema lo avisa al lado del Neto: el renglón necesita su texto ("de qué es") para contar.',
            'El selector ofrece **solo proveedores de gastos**; los de mercadería se cargan en Compras.',
            '**Sucursal o General**: el gasto se imputa a una sucursal o a "General (toda la empresa)". Quien no es jefe queda fijado en la suya.',
            '**No se duplica**: con proveedor y número, la combinación tiene que ser única. Cargar dos veces la misma factura es el error clásico de un módulo de gastos. Cargar y pagar es todo o nada, y un doble clic no duplica el gasto.',
            '**"¿Cómo se pagó?"**: lo más común es cargar y pagar en el mismo acto (vino el plomero y se le pagó del cajón). Con efectivo y turno abierto ofrece **"Sale de la caja de [tu sucursal] — turno #N"**: el egreso queda en el arqueo con hora y nombre. Solo se puede sacar del cajón de la sucursal con la que entraste, y registrar el pago exige su permiso propio.',
          ],
        },
        { t: 'ruta', texto: 'Gastos › Gastos › + Cargar gasto' },
      ],
    },
    {
      id: 'gastos-fijos',
      titulo: 'Gastos fijos: los que se repiten',
      bloques: [
        {
          t: 'p',
          texto: 'Una **plantilla** de lo que llega todos los meses: alquiler, internet, seguro. No es un gasto todavía: es el recordatorio de que va a llegar. Con un clic se generan los del período, como **pendientes** y con el importe **estimado**, que se corrige cuando llega la factura real.',
        },
        {
          t: 'lista',
          items: [
            '**Generar no duplica**: reintentar nunca crea dos veces el mismo período, aunque se haya corregido la fecha del gasto generado. Si se borra el gasto generado, la plantilla vuelve a ofrecerse sola.',
            'La **frecuencia** define cuándo vuelve: un seguro anual generado en agosto no reaparece hasta el agosto siguiente; los mensuales, cada mes.',
            'El vencimiento sale del día configurado (si el mes no llega a ese día, se usa el último). Importe y vencimiento se corrigen al editar el gasto cuando llega el papel.',
          ],
        },
        { t: 'ruta', texto: 'Gastos › Gastos fijos' },
      ],
    },
    {
      id: 'gastos-resumen',
      titulo: 'Cuentas a pagar y resumen',
      bloques: [
        {
          t: 'tabla',
          cols: ['Pantalla', 'Qué responde'],
          filas: [
            ['**Cuentas a pagar**', 'Qué debo y para cuándo. Ordenado por urgencia, con cortes de vencido / vence hoy / próximos 7 días. El **globito del menú** cuenta lo vencido o que vence hoy (no lo pendiente, para que no sea un número que nunca baja a cero).'],
            ['**Resumen**', 'En qué se va la plata: por rubro con su peso, fijos contra variables, evolución por mes, a quién se le paga más y el IVA acumulado (crédito fiscal).'],
          ],
        },
        {
          t: 'nota',
          tono: 'warn',
          texto: 'El resumen cuenta los gastos **pendientes** también: el gasto existe desde que llega el comprobante, no desde que se paga. Los **anulados** no cuentan, y un gasto anulado queda en el sistema (no se borra).',
        },
        { t: 'ruta', texto: 'Gastos › Cuentas a pagar · Gastos › Resumen' },
      ],
    },
  ],
};
