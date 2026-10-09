/* eslint-env node */
/**
 * HALLAZGO: doble clic en "Cobrar (provisorio)" encola DOS ventas offline.
 *
 * No hay DOM en los tests del panel (node:test), así que se compila
 * `CobroModal.jsx` con esbuild y se reemplazan React y los módulos de alrededor
 * por dobles mínimos. Los hooks guardan estado entre "renders": después del
 * primer clic se vuelve a renderizar (con `enviando` ya en true, como haría
 * React tras un evento discreto) y se clickea el botón de la NUEVA vista. Ni
 * así se frena: el botón del pie no recibe `disabled` y `confirmar` no mira
 * `enviando`. Cada clic llama a `agregarVentaPendiente`, que genera un
 * `idLocal` nuevo — el servidor no puede deduplicar y al sincronizar quedan
 * dos ventas, doble egreso de stock y el arqueo esperando el doble de efectivo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const aqui = path.dirname(fileURLToPath(import.meta.url));

const DOBLES = {
  react: `
    const st = globalThis.__hooks;
    export function useState(init) {
      const i = st.idx++;
      if (!(i in st.vals)) st.vals[i] = typeof init === 'function' ? init() : init;
      return [st.vals[i], (v) => { st.vals[i] = typeof v === 'function' ? v(st.vals[i]) : v; }];
    }
    export function useRef(v) { const i = st.idx++; if (!(i in st.vals)) st.vals[i] = { current: v }; return st.vals[i]; }
    export function useMemo(fn) { st.idx++; return fn(); }
    export function useEffect() { st.idx++; }
  `,
  'react/jsx-runtime': `
    export const jsx = (type, props) => ({ type, props });
    export const jsxs = jsx;
    export const Fragment = 'Fragment';
  `,
  ventasContext: `
    export const useVentas = () => ({
      getCliente: (id) => ({ id, nombre: 'Consumidor Final' }),
      config: { mediosPago: ['efectivo'] }, ctx: { usuarioId: 1 },
      closeModal() {}, toast(m, t) { globalThis.__toasts.push([t, m]); }, operadorId: null,
    });
  `,
  useResource: 'export const useResource = () => ({ data: null });',
  ventasApi: 'export const ventasApi = {};',
  ui: `
    const C = (n) => { const f = () => null; f.displayName = n; return f; };
    export const Table = C('Table'); export const Btn = C('Btn'); export const Di = C('Di');
    export const ModalShell = C('ModalShell'); export const VentaTag = C('VentaTag');
    export const money = (n) => String(n); export const fmtFechaHora = (x) => String(x);
    export const s = new Proxy({}, { get: (_, k) => String(k) });
  `,
  imprimir: 'export const configImpresion = async () => ({ impresion: {} }); export const imprimirVenta = async () => {};',
  cola: `
    export async function agregarVentaPendiente(payload) {
      await new Promise((r) => setTimeout(r, 5));   // IndexedDB es asíncrono
      globalThis.__cola.push(payload);
      return 'local-' + globalThis.__cola.length;
    }
  `,
  sesion: 'export const leerSesion = () => null;',
  classNames: 'export const cx = (...a) => a.filter(Boolean).join(" ");',
  css: 'export default new Proxy({}, { get: (_, k) => String(k) });',
};

const MAPA = [
  [/^react$/, 'react'], [/^react\/jsx-runtime$/, 'react/jsx-runtime'],
  [/VentasContext\.jsx$/, 'ventasContext'], [/useResource\.js$/, 'useResource'],
  [/ventas\.api\.js$/, 'ventasApi'], [/\/ui\.jsx$/, 'ui'], [/imprimir\.js$/, 'imprimir'],
  [/colaVentas\.js$/, 'cola'], [/sesion\.js$/, 'sesion'], [/classNames\.js$/, 'classNames'],
  [/\.module\.css$/, 'css'],
];

async function cargarCobroModal() {
  const res = await build({
    entryPoints: [path.join(aqui, 'CobroModal.jsx')],
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', logLevel: 'silent',
    plugins: [{
      name: 'dobles',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          const m = MAPA.find(([re]) => re.test(a.path));
          return m ? { path: m[1], namespace: 'doble' } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: 'doble' }, (a) => ({ contents: DOBLES[a.path], loader: 'js' }));
      },
    }],
  });
  const codigo = res.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`);
}

test('HALLAZGO doble clic: "Cobrar (provisorio)" dos veces encola dos ventas offline', async () => {
  globalThis.__hooks = { idx: 0, vals: {} };
  globalThis.__cola = [];
  globalThis.__toasts = [];
  const { CobroModal } = await cargarCobroModal();

  const ticket = {
    renglones: [{ uid: 1, key: 'p1', productoId: 1, cantidad: 1, precioUnitario: 1000, descuento: 0, iva: 21, listaId: 1 }],
    extras: [], descuentos: [], ctx: { descuentos: [] },
  };
  let cobrados = 0;
  const props = {
    ventaId: 'offline:abc', offline: true, ticket, sucursalId: 1, clienteId: 1, cajaSesionId: 9,
    totales: { total: 1210 }, onCobrado: () => { cobrados += 1; },
  };
  const render = () => { globalThis.__hooks.idx = 0; return CobroModal(props); };
  // Offline el pie es [Cancelar, Cobrar (provisorio)]: el de cobrar es el último.
  const botonCobrar = (vista) => vista.props.footer[vista.props.footer.length - 1];

  // Primer clic: arranca el guardado (enviando = true) y React vuelve a renderizar.
  const primera = botonCobrar(render());
  const p1 = primera.onClick();
  const segunda = botonCobrar(render());
  assert.equal(segunda.texto, 'Registrando…', 'la vista ya sabe que está enviando');
  // Segundo clic sobre el botón ya "Registrando…": nada lo apaga.
  const p2 = segunda.onClick();
  await Promise.all([p1, p2]);

  assert.equal(globalThis.__cola.length, 1,
    `se encolaron ${globalThis.__cola.length} ventas offline para un solo ticket (onCobrado x${cobrados})`);
});
