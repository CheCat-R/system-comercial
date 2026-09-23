/**
 * INVENTARIO — configuración de los menús internos.
 * ============================================================================
 * El subsistema de inventario alimenta DOS módulos del CRM que comparten el
 * mismo motor (singleton): **Compras** y **Almacén**. Cada uno define su propio
 * sub-menú (sub-sidebar izquierdo) con este catálogo. Es DATO, no lógica.
 *
 * Sin lote: se quitaron Presentaciones (se editan en el detalle del producto),
 * Vencimientos y Trazabilidad (eran por lote). Sucursales, Transferencias e
 * Incidencias viven en Almacén.
 */
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SellIcon from '@mui/icons-material/Sell';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import HistoryIcon from '@mui/icons-material/History';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import FactCheckIcon from '@mui/icons-material/FactCheck';

/**
 * Menú interno del módulo COMPRAS.
 *
 * Existencias y Fraccionamiento viven solo en Almacén: son operación de
 * depósito, no de compra, y tenerlas en los dos lados obligaba a mantener la
 * misma pantalla en dos menús.
 *
 * `permiso` es la clave de SECCIÓN del catálogo de permisos: un rol sin esa
 * clave no ve el panel, y sin ninguna del módulo no ve el módulo entero.
 */
export const COMPRAS_PANELS = [
  /*
   * SIN "Dashboard" (18/8/2026, pedido del dueño): el resumen del inventario se
   * mudó al **Dashboard del menú principal**, que hasta entonces mostraba
   * métricas de ejemplo. Tener el resumen real escondido adentro de Compras y
   * datos inventados en la puerta de entrada era exactamente al revés.
   */
  { id: 'productos',      label: 'Productos',      icon: Inventory2Icon,     permiso: 'compras.productos' },
  { id: 'catalogos',      label: 'Catálogos',      icon: SellIcon,           permiso: 'compras.catalogos' },
  /*
   * El ABM de la ficha se mudó al MÓDULO Proveedores (0068). Acá queda solo lo
   * OPERATIVO de compras que no tiene reemplazo allá: los costos por producto
   * (con la regla masiva), las percepciones y la cuenta del proveedor.
   */
  { id: 'proveedores',    label: 'Costos y percepciones', icon: LocalShippingIcon, permiso: 'compras.proveedores' },
  /*
   * "Por procesar" (bandeja de lectura de facturas en PDF) oculta a pedido
   * del dueño: por ahora no se usa. El backend Laravel tampoco la tiene
   * portada todavía (factura_lecturas/factura_archivos, extracción de texto
   * y recetas por CUIT — un módulo aparte, no un campo suelto). El panel
   * (LecturasPanel.jsx) y el resto del cableado quedan intactos para
   * reactivarla el día que se porte: solo hace falta volver a importar
   * DocumentScannerIcon de '@mui/icons-material/DocumentScanner' y esta línea:
   * { id: 'lecturas', label: 'Por procesar', icon: DocumentScannerIcon, permiso: 'compras.lecturas', badge: 'lecturas' },
   */
  { id: 'facturacion',    label: 'Facturación',    icon: ReceiptLongIcon,    permiso: 'compras.facturacion' },
  { id: 'historial',      label: 'Historial',      icon: HistoryIcon,        permiso: 'compras.historial' },
];

/** Menú interno del módulo ALMACÉN. */
export const ALMACEN_PANELS = [
  /*
   * Existencias trae adentro la pestaña Movimientos (27/8, pedido del dueño):
   * la película de la foto, sin cruzar a Compras › Historial ni gastar una
   * entrada del menú. Ver ExistenciasPanel.
   */
  { id: 'existencias',    label: 'Existencias',    icon: WarehouseIcon,      permiso: 'almacen.existencias' },
  /*
   * El físico contra el virtual (0066): sesiones de conteo con la lista
   * congelada, ciegas por defecto, que se aplican por diferencia. Vive al lado
   * de Existencias porque es su contraparte: una muestra lo que el sistema
   * cree, la otra lo verifica contra la góndola.
   */
  { id: 'conteos',        label: 'Control de stock', icon: FactCheckIcon,    permiso: 'almacen.conteos' },
  { id: 'fraccionamiento', label: 'Fraccionamiento', icon: CallSplitIcon,    permiso: 'almacen.fraccionamiento' },
  { id: 'transferencias', label: 'Transferencias', icon: SwapHorizIcon,      permiso: 'almacen.transferencias', badge: 'transferencias' },
  { id: 'operaciones',    label: 'Operaciones',    icon: ReceiptLongIcon,    permiso: 'almacen.operaciones' },
  { id: 'incidencias',    label: 'Incidencias',    icon: ReportProblemIcon,  permiso: 'almacen.incidencias', badge: 'incidencias' },
  /*
   * El vigía de fechas (lógica de la app externa, datos 100% del sistema):
   * control por sucursal, alertas 7/15/30, procesar vencidos, ofertas y mermas.
   * El globito son los que APURAN: vencidos sin procesar + vencen en ≤7 días.
   */
  { id: 'vencimientos',   label: 'Vencimientos',   icon: EventBusyIcon,      permiso: 'almacen.vencimientos', badge: 'vencimientos' },
];
