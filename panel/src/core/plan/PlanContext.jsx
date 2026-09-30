import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from '@core/auth/AuthContext.jsx';

const PlanContext = createContext(null);

/**
 * La API del PLAN COMERCIAL de esta instalación, derivada de la sesión — eje
 * DISTINTO de `PermissionContext`: ese pregunta "¿el ROL de este usuario lo
 * deja pasar?"; este pregunta "¿lo que esta empresa CONTRATÓ lo incluye?".
 * Un Administrador con permiso de sobra en un cliente Emprendedor sigue sin
 * ver algo que su plan no trae — las dos cosas se exigen juntas.
 *
 * El servidor ya resolvió la matriz (`PlanCatalogo`, `/auth/yo`): acá NO se
 * porta esa lógica a JS, solo se pregunta si la lista de claves del plan
 * (`null` en Corporativo — no tiene lista, es "todas") contiene la clave.
 */
export function PlanProvider({ children }) {
  const { user } = useAuth();

  const planId = user?.plan?.id ?? null;
  const claves = useMemo(() => user?.plan?.claves ?? null, [user]);

  const planIncluye = useCallback(
    (clave) => {
      if (!clave) return true;
      // `claves === null` es Corporativo: sin lista, incluye cualquier cosa.
      return claves === null || claves.includes(clave);
    },
    [claves],
  );

  const planIncluyeAlguna = useCallback(
    (lista = []) => lista.length === 0 || lista.some((c) => planIncluye(c)),
    [planIncluye],
  );

  const value = useMemo(
    () => ({ planId, planIncluye, planIncluyeAlguna }),
    [planId, planIncluye, planIncluyeAlguna],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan must be used within <PlanProvider>');
  }
  return ctx;
}
