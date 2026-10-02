import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@core/auth/AuthContext.jsx';
import { appConfig } from '@core/config/app.config.js';
import { FullScreenLoader } from '@shared/components/FullScreenLoader/FullScreenLoader.jsx';
import { ElegirPasswordPage } from '../ElegirPasswordPage.jsx';

/**
 * Route guard: allows the nested routes only for authenticated users.
 * While auth is resolving, shows a loader (prevents flicker/redirect races).
 * Unauthenticated users are sent to login, preserving the intended location.
 *
 * Si la contraseña de la cuenta la puso otro (el instalador, un administrador,
 * la consola) y todavía no eligió la suya, NO se muestra el sistema: se muestra
 * la pantalla de elegirla. El servidor lo exige igual (`ExigirCambioPassword`);
 * esto evita que el panel arranque a pedir datos que van a dar 403.
 */
export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader label="Verificando sesión…" />;

  if (!isAuthenticated) {
    return (
      <Navigate
        to={appConfig.routes.login}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (user?.debeCambiarPassword) return <ElegirPasswordPage />;

  return <Outlet />;
}
