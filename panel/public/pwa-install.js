/*
 * Captura "instalar app" ANTES de que arranque React.
 *
 * Chrome dispara `beforeinstallprompt` apenas evalúa manifest + service worker, que puede ser antes
 * de que React termine de montar todo el árbol (login, permisos, plan, layout…). Un listener puesto
 * adentro de un componente llega tarde: el evento ya pasó y no vuelve. Este script plano (NO módulo)
 * corre primero, síncrono, antes que cualquier JS de la app.
 *
 * Vive en un archivo y no inline en index.html porque la política de seguridad del sitio
 * (Content-Security-Policy, ver security-headers.conf) no permite scripts en línea.
 */
window.__pwaInstallEvent = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__pwaInstallEvent = e;
  window.dispatchEvent(new CustomEvent('pwa-install-ready'));
});
