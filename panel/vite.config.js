import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite configuration.
 *
 * Path aliases mirror the top-level architecture folders so imports stay
 * absolute and refactor-safe (e.g. `import { MainLayout } from '@core/layout'`).
 * These aliases are duplicated in `jsconfig.json` so the editor resolves them too.
 */
/**
 * HTTPS en desarrollo, solo cuando se pide (`npm run dev:https`).
 *
 * Por qué existe: los navegadores solo dan acceso a la CÁMARA en un "contexto
 * seguro" — HTTPS o localhost. Entrando desde el celular por
 * `http://192.168.0.x:3000` la cámara no arranca y el navegador no explica nada.
 * Con HTTPS (certificado autofirmado; el teléfono pide aceptarlo una vez) el
 * escáner de códigos de barras de Vencimientos funciona en la red local.
 *
 * Queda APAGADO por defecto: en la PC, `http://localhost` ya es contexto seguro
 * y un certificado autofirmado solo agregaría advertencias.
 */
const HTTPS = process.env.VITE_DEV_HTTPS === '1';



export default defineConfig(({ mode }) => {
  /*
   * PUERTO DEL SERVIDOR DE DESARROLLO. 3000 salvo que la maquina diga otra cosa.
   *
   * Es configurable porque el 3000 es un puerto MUY peleado: si en la misma
   * maquina corre otra aplicacion que ya lo ocupa, Vite se corre solo a otro
   * puerto y el CORS de la API —que lista origenes exactos— lo rechaza, asi
   * que el CRM carga y ninguna llamada funciona.
   *
   * Va por `loadEnv` y no por `process.env`: adentro de este archivo las
   * variables del `.env` del proyecto todavia no existen en `process.env`
   * —Vite las expone al CLIENTE, no a su propia configuracion—, asi que
   * leerlas de ahi devolvia siempre vacio y el puerto quedaba clavado en 3000.
   *
   * El tercer argumento vacio es a proposito: sin el, `loadEnv` solo devuelve
   * las que empiezan con VITE_ ... que es justo el caso, pero dejarlo explicito
   * evita la sorpresa si mañana la variable se llama distinto.
   */
  const env = loadEnv(mode, process.cwd(), '');
  const PUERTO = Number(env.VITE_DEV_PORT) || 3000;

  return {
    plugins: [
      react(),
      ...(HTTPS ? [basicSsl()] : []),
      /*
       * INSTALABLE COMO APP (notebook y celular) — solo el "cascarón"
       * (JS/CSS/HTML/íconos) queda en caché; la API NUNCA se cachea acá.
       * `navigateFallbackDenylist` excluye `/api/*` del fallback de SPA, así
       * que una llamada de red real jamás recibe `index.html` en su lugar.
       * Sin `runtimeCaching`: una vez que el cascarón cargó, cada pedido a
       * `/api` sale a la red tal cual — el service worker ni se entera, así
       * que un plan "offline de datos" (ventas/caja sin internet) queda
       * totalmente fuera de esto, es un proyecto aparte.
       */
      VitePWA({
        /*
         * 'prompt', no 'autoUpdate': con autoUpdate la app recargaba SOLA al encontrar
         * una versión nueva, aunque hubiera un cobro a medio hacer. Con 'prompt' la
         * versión nueva espera y se avisa (ver core/pwa/actualizacion.js).
         */
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'CCS · checat commerce systems',
          short_name: 'CCS',
          description: 'Sistema de gestión para comercios: ventas, stock, compras y caja.',
          lang: 'es-AR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f1f5f9',
          theme_color: '#121826',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
          /*
           * El bundle principal ya pasó los 2 MiB que workbox precarga por
           * defecto (2,1 MB al 2/10/2026), y sin este tope el BUILD FALLA con
           * "is 2.1 MB, and won't be precached". Es el cascarón de la app:
           * tiene que quedar precargado para que el POS abra sin conexión.
           * Si vuelve a crecer, la salida de fondo es partirlo por módulo
           * (carga perezosa por ruta), no subir este número otra vez.
           */
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          /*
           * Las librerías de exportar a PDF (jsPDF y sus dependencias
           * opcionales) pesan ~600 kB y se cargan SOLO al exportar: precargarlas
           * le haría bajar ese peso a cada instalación de la app para algo que
           * casi nunca se usa (y `html2canvas`/`purify` ni siquiera se ejecutan).
           */
          globIgnores: ['**/assets/jspdf*', '**/assets/html2canvas*', '**/assets/purify*'],
        },
        /*
         * Sin esto, el service worker SOLO existe en el build de producción
         * (`vite build` + `vite preview`) — en `npm run dev` (el día a día de
         * acá) no se registra nada, así que el botón de instalar nunca
         * aparece aunque el código esté bien. Con `devOptions` también se
         * registra en desarrollo, en la misma URL de siempre (`:3000`).
         */
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
        '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
        '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
        '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
      },
    },
    server: {
      port: PUERTO,
      open: true,
      /*
       * `127.0.0.1` explícito, NO `undefined` — sin esto Vite/Node resuelven
       * "localhost" a IPv6 (`::1`) en esta máquina, pero `php artisan serve`
       * solo escucha en IPv4 (`127.0.0.1`). El panel cargaba igual (ambos
       * responden a "localhost" para la página en sí), pero cada llamada a
       * la API fallaba con "no se pudo conectar" cada vez que el navegador
       * resolvía esa segunda conexión por IPv6: del otro lado no había nadie
       * escuchando ahí. Mismo motivo por el que `VITE_API_BASE_URL` en el
       * `.env` de ejemplo apunta a `http://localhost:8000` — las dos partes
       * tienen que hablar la MISMA familia de IP.
       *
       * Con HTTPS sigue en `true` (todas las interfaces): ahí el celular
       * necesita entrar por la IP de la máquina en la red local, no por
       * loopback.
       */
      host: HTTPS ? true : '127.0.0.1',
    },
    build: {
      outDir: 'dist',
      // Sin mapas: publicarlos entrega el código fuente completo del panel (rutas, claves de permisos, lógica) a cualquiera.
      sourcemap: false,
    },
  };
});
