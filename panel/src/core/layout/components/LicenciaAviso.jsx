import { Alert, Button } from '@mui/material';
import { Link } from 'react-router-dom';
import { usePermissions } from '@core/permissions/PermissionContext.jsx';
import { usePlan } from '@core/plan/PlanContext.jsx';

const fecha = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR') : '');

/**
 * EL AVISO DE LA LICENCIA, arriba del contenido en cualquier pantalla.
 *
 *  - Por vencer (15 días o menos): solo al DUEÑO, que es quien renueva.
 *  - Vencida pero en gracia: a todos — el sistema todavía funciona, pero hay
 *    que avisarle al dueño antes de que pase a solo lectura.
 *  - Solo lectura (vencida pasada la gracia, o sin licencia): a todos, y fijo,
 *    porque es lo que explica por qué ninguna venta nueva se guarda.
 *
 * Nada de esto bloquea por sí mismo: lo que corta los cambios es el servidor
 * (`ExigirLicencia`). Esto solo explica qué pasa y adónde ir.
 */
export function LicenciaAviso() {
  const { licencia } = usePlan();
  const { can } = usePermissions();
  if (!licencia?.exigida) return null;

  const esDueno = can('sistema.licencia');
  const ir = esDueno ? (
    <Button component={Link} to="/sistema?seccion=licencia" color="inherit" size="small" sx={{ fontWeight: 700 }}>
      Ir a Licencia
    </Button>
  ) : null;

  if (licencia.estado === 'por_vencer' && esDueno) {
    return (
      <Alert severity="warning" action={ir} sx={{ mb: 2 }}>
        Tu licencia vence el <strong>{fecha(licencia.vence)}</strong>
        {licencia.diasRestantes === 0 ? ' (hoy)' : ` (en ${licencia.diasRestantes} día${licencia.diasRestantes === 1 ? '' : 's'})`}.
        Pedí la renovación para no quedarte en modo solo lectura.
      </Alert>
    );
  }
  if (licencia.estado === 'en_gracia') {
    return (
      <Alert severity="error" action={ir} sx={{ mb: 2 }}>
        La licencia <strong>venció el {fecha(licencia.vence)}</strong>. El sistema todavía funciona, pero en unos días pasa a solo lectura.
        {esDueno ? ' Cargá la clave de renovación.' : ' Avisale al dueño.'}
      </Alert>
    );
  }
  if (licencia.restringido) {
    return (
      <Alert severity="error" action={ir} sx={{ mb: 2 }}>
        <strong>Modo solo lectura:</strong>{' '}
        {licencia.estado === 'vencida' ? `la licencia venció el ${fecha(licencia.vence)}` : 'el sistema no tiene una licencia activa'}.
        Podés ver tus datos y bajar respaldos, pero no se registran ventas ni compras nuevas.
        {esDueno ? ' Cargá una clave vigente.' : ' Avisale al dueño.'}
      </Alert>
    );
  }

  return null;
}
