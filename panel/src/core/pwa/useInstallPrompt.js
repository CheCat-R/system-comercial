import { useEffect, useState } from 'react';

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const yaInstalada = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Estado de "instalar esta app", compartido por cualquier botón que lo
 * ofrezca (hoy vive en el pie de la Sidebar). Dos caminos, porque el
 * navegador no da el mismo mecanismo en los dos:
 *
 *  · Chrome/Edge (notebook y Android): dispara `beforeinstallprompt` cuando
 *    el manifest + service worker cumplen las condiciones de instalable —
 *    puede ser MUY temprano, antes de que React monte este componente. Por
 *    eso no se escucha acá: `index.html` ya lo capturó en un script plano
 *    apenas carga la página (ver el comentario ahí) y lo deja en
 *    `window.__pwaInstallEvent`. Acá solo se LEE ese valor.
 *  · Safari (iPhone/iPad): no existe ese evento — Apple no da una API para
 *    instalar por código. `modo` devuelve `'ios'` para que quien lo use
 *    muestre los pasos manuales (Compartir › Agregar a inicio) en vez de
 *    intentar instalar nada.
 *
 * `modo` es `null` si ya está instalada o si el navegador no ofrece ninguno
 * de los dos caminos — ahí no hay nada útil que mostrar.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(() => window.__pwaInstallEvent ?? null);
  const [instalada, setInstalada] = useState(yaInstalada);

  useEffect(() => {
    // Por si ya estaba capturado antes de que este componente existiera.
    if (window.__pwaInstallEvent && !promptEvent) setPromptEvent(window.__pwaInstallEvent);
    const onReady = () => setPromptEvent(window.__pwaInstallEvent);
    const onInstalled = () => { setInstalada(true); setPromptEvent(null); window.__pwaInstallEvent = null; };
    window.addEventListener('pwa-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const instalar = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    // El evento solo sirve una vez; si lo rechazó, no vuelve a ofrecerse hasta
    // que el navegador dispare `beforeinstallprompt` de nuevo.
    setPromptEvent(null);
    window.__pwaInstallEvent = null;
  };

  if (instalada) return { modo: null };
  if (promptEvent) return { modo: 'nativo', instalar };
  if (esIOS()) return { modo: 'ios' };
  return { modo: null };
}
