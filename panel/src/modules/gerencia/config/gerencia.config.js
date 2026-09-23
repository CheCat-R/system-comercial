/**
 * GERENCIA — menú interno del módulo.
 * ============================================================================
 * Las marcadas "pronto" son la agenda de Gerencia: se construyen más adelante,
 * pero el lugar donde van a vivir ya queda a la vista.
 *
 * `permiso` es la clave de SECCIÓN del catálogo de permisos: el manifiesto
 * deriva de acá qué claves hacen visible el módulo, y la página filtra el
 * sub-menú con las mismas.
 */
import GroupIcon from '@mui/icons-material/Group';
import BarChartIcon from '@mui/icons-material/BarChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import SettingsIcon from '@mui/icons-material/Settings';

export const GERENCIA_SECCIONES = [
  { id: 'usuarios', label: 'Usuarios y roles', icon: GroupIcon, permiso: 'gerencia.usuarios' },
  {
    /* Construida el 23/9/2026: resumen con comparativa contra el período
     * anterior, serie diaria, y el desglose por sucursal, vendedor, medio de
     * pago y producto. Sin costo de por medio (eso es Rentabilidad). */
    id: 'reportes', label: 'Reportes de ventas', icon: BarChartIcon, permiso: 'gerencia.reportes',
    desc: 'Ventas por día, sucursal y vendedor; tickets, medios de pago y comparativa contra el período anterior.',
  },
  {
    /* Construida el 19/8/2026 (0072): margen real vs aparente, IVA absorbido
     * por la mercadería sin factura, posición fiscal y control por proveedor. */
    id: 'rentabilidad', label: 'Rentabilidad', icon: TrendingUpIcon, permiso: 'gerencia.rentabilidad',
    desc: 'Margen real por producto, marca, categoría y proveedor — con el IVA absorbido por la mercadería sin factura a la vista.',
  },
  {
    /* Construida el 23/9/2026: foto de HOY (no un período), al costo actual
     * del formato activo — el mismo criterio que Rentabilidad. Entran todos
     * los estados, incluidos vencido/defectuoso: siguen siendo plata parada. */
    id: 'valorizacion', label: 'Valorización de stock', icon: Inventory2Icon, permiso: 'gerencia.valorizacion',
    desc: 'Cuánta plata hay parada en mercadería, valuada a costo, por sucursal y por estado.',
  },
  {
    /* Construida el 23/9/2026: línea de tiempo sobre cuatro fuentes que ya
     * existían (cambios de ficha, anulaciones, reversiones de precios,
     * diferencias de caja). Los ajustes de stock quedan afuera a propósito:
     * ya tienen su propia pantalla completa en Almacén (Existencias e
     * Incidencias) y traerlos acá sería duplicarla, no sumar algo nuevo. */
    id: 'auditoria', label: 'Auditoría', icon: FactCheckIcon, permiso: 'gerencia.auditoria',
    desc: 'Quién hizo qué: anulaciones, reversiones de precios y diferencias de caja, además de los cambios de ficha ya registrados.',
  },
  {
    id: 'configuracion', label: 'Configuración', icon: SettingsIcon, permiso: 'gerencia.configuracion', pronto: true,
    desc: 'Parámetros generales del sistema: datos de la empresa, numeraciones y preferencias.',
  },
];
