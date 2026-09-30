import { Navigate, Outlet } from 'react-router-dom';
import { usePermissions } from '@core/permissions/PermissionContext.jsx';
import { usePlan } from '@core/plan/PlanContext.jsx';
import { appConfig } from '@core/config/app.config.js';

/**
 * Route guard: allows nested routes only when the user has the required
 * permission(s) AND the installation's plan includes at least one of them —
 * two independent locks (role vs. plan), both have to open.
 *
 * @param {{ anyOf?: string[], redirectTo?: string }} props
 */
export function PermissionRoute({ anyOf = [], redirectTo }) {
  const { canAny } = usePermissions();
  const { planIncluyeAlguna } = usePlan();

  if (!(canAny(anyOf) && planIncluyeAlguna(anyOf))) {
    return <Navigate to={redirectTo ?? appConfig.routes.defaultAuthenticatedRoute} replace />;
  }
  return <Outlet />;
}
