import { cx } from '@shared/utils/classNames.js';
import { s } from '@modules/productos/components/ui.jsx';

/**
 * EL TEASER DE EMPRENDEDOR — una sola tarjeta chica para TODO lo que el rol
 * podría ver si el plan lo incluyera, no un hueco por cada funcionalidad
 * bloqueada. Mismo criterio de venta que `MejoraTuPlan` en Gerencia, pero
 * condensado: en el Dashboard no conviene abrir un espacio por cada cosa que
 * el plan no incluye — por eso `DashboardPage` arma UNA lista y la pasa acá,
 * en vez de que cada resumen (`ResumenCobranzas`, `ResumenPresupuestos`, …)
 * dibuje su propio cartelito.
 *
 * @param {{ items: string[] }} props — frases como "las cobranzas pendientes".
 */
export function TeaserPymes({ items }) {
  if (!items.length) return null;

  return (
    <div className={cx(s.callout, s.warn)}>
      Desde <strong>Pymes</strong> también vas a ver acá {armarLista(items)} — hablá con CheCAT para
      subir de plan.
    </div>
  );
}

/** ["a"] → "a". ["a","b"] → "a y b". ["a","b","c"] → "a, b y c". */
function armarLista(items) {
  if (items.length === 1) return <strong>{items[0]}</strong>;
  const todasMenosUltima = items.slice(0, -1);
  const ultima = items[items.length - 1];
  return (
    <>
      {todasMenosUltima.map((it, i) => (
        <span key={it}>
          <strong>{it}</strong>{i < todasMenosUltima.length - 1 ? ', ' : ' y '}
        </span>
      ))}
      <strong>{ultima}</strong>
    </>
  );
}
