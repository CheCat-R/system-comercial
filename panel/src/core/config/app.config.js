import { env } from './env.js';

/**
 * Global application configuration.
 *
 * Static, cross-cutting settings that are not tied to any single module.
 * Anything a deployment/tenant might want to override lives here (or is derived
 * from env), so components read config instead of hard-coding values.
 */
export const appConfig = Object.freeze({
  name: env.appName,
  version: '0.1.0',
  company: 'CheCAT',

  api: {
    baseUrl: env.apiBaseUrl,
    timeoutMs: 20000,
  },

  routes: {
    root: '/',
    // Where the app lands after login / on "/".
    defaultAuthenticatedRoute: '/dashboard',
    login: '/login',
    notFound: '/404',
  },

  layout: {
    // Persisted UI preferences default here (see UIContext).
    sidebarDefaultCollapsed: false,
  },

  theme: {
    defaultMode: env.defaultTheme === 'dark' ? 'dark' : 'light',
    storageKey: 'crm.theme-mode',
  },

  i18n: {
    defaultLocale: 'es-AR',
    fallbackLocale: 'en',
  },

  /**
   * Interruptores de negocio, no de ambiente (para eso está `env`). Viven acá
   * y no en el manifiesto del módulo Web porque los lee también código de
   * `@core` (la alerta global de pedidos), y el `core` no puede importar de
   * `@modules` — al revés sí, así que el módulo Web lee este mismo valor.
   *
   * `webHabilitado: false`: este negocio no vende online por ahora. Apaga el
   * módulo Web entero y todo lo que otros módulos le enganchan (hoy: la
   * sección "Órdenes web" de Ventas y su alerta) sin borrar una línea — en
   * `true` el día que se necesite.
   */
  features: {
    webHabilitado: false,
  },
});
