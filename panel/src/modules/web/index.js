import LanguageIcon from '@mui/icons-material/Language';
import { defineModule } from '@core/modules/defineModule.js';
import { appConfig } from '@core/config/app.config.js';
import { WebPage } from './pages/WebPage.jsx';
import { WEB_SECCIONES } from './config/web.config.js';

/**
 * WEB — manifiesto del módulo.
 * ============================================================================
 * La administración del sitio mayorista: qué productos se ven (regla: precio en
 * lista Mayorista — solo lectura acá), destacados, imágenes, contenido de la
 * portada, estadísticas y la configuración del sitio. Todo lo demás del
 * producto se maneja en Compras.
 *
 * `permissions` sale del propio menú: con CUALQUIER sección el módulo aparece;
 * sin ninguna, desaparece entero del sidebar.
 *
 * ⭐ APAGADO A PROPÓSITO (no borrado): este negocio no vende online por ahora,
 * pero puede que lo haga más adelante. `enabled` saca el módulo del sidebar Y
 * de la tabla de rutas (`moduleRegistry` filtra por esto en los dos lugares)
 * sin tocar una línea de código de adentro — reactivarlo es volver
 * `appConfig.features.webHabilitado` a `true`. Ese mismo valor es lo que leen
 * los otros módulos que dejan algo ENGANCHADO a Web (hoy: la sección "Órdenes
 * web" de Ventas y su alerta global) — un solo interruptor, no dos.
 */
export const webModule = defineModule({
  id: 'web',
  name: 'Web',
  description: 'El sitio mayorista: productos publicados, destacados, imágenes y banners.',
  icon: LanguageIcon,
  enabled: appConfig.features.webHabilitado,
  basePath: '/web',
  permissions: WEB_SECCIONES.map((x) => x.permiso),
  navigation: { showInSidebar: true, group: 'catalog', order: 45 },
  routes: [
    { path: '', Component: WebPage, handle: { crumb: 'Web' } },
  ],
});
