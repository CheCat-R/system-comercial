/**
 * SISTEMA — menú interno del módulo.
 * ============================================================================
 * `permiso` es la clave de SECCIÓN del catálogo de permisos: el manifiesto
 * deriva de acá qué claves hacen visible el módulo, y la página filtra el
 * sub-menú con las mismas.
 */
import BusinessIcon from '@mui/icons-material/Business';
import PrintIcon from '@mui/icons-material/Print';
import BackupIcon from '@mui/icons-material/Backup';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import VpnKeyIcon from '@mui/icons-material/VpnKey';

export const SISTEMA_SECCIONES = [
  { id: 'empresa', label: 'Empresa', icon: BusinessIcon, permiso: 'sistema.empresa' },
  { id: 'impresion', label: 'Impresión', icon: PrintIcon, permiso: 'sistema.impresion' },
  { id: 'terminales', label: 'Este equipo', icon: PointOfSaleIcon, permiso: 'sistema.terminales' },
  {
    id: 'respaldos', label: 'Respaldos', icon: BackupIcon, permiso: 'sistema.respaldos',
    desc: 'Descargar la copia de la base a esta máquina, con el rastro de quién y cuándo, y las copias diarias del servidor.',
  },
  // Solo el dueño (superadmin): el rol Administrador no trae este permiso.
  {
    id: 'licencia', label: 'Licencia', icon: VpnKeyIcon, permiso: 'sistema.licencia',
    desc: 'El plan contratado, hasta cuándo vale y dónde cargar la clave de activación.',
  },
];
