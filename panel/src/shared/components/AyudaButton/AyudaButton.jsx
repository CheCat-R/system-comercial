/**
 * AyudaButton — el botón de ayuda contextual de una pantalla.
 * ============================================================================
 * Un círculo "?" que abre, EN el lugar, los artículos de
 * `shared/content/ayuda.js` para la categoría que le pasa el módulo. No
 * navega a ningún lado — la respuesta aparece sobre la misma pantalla donde
 * surgió la duda, que es cuando más sirve.
 *
 * EN AMBAR LLENO, no un ícono gris apagado: ya pasó en este mismo panel
 * (`modules/productos/components/AyudaEncabezado.jsx`) que una ayuda con el
 * color de cualquier otro botón quedó invisible y el dueño ni la vio. Acá
 * directamente no compite con nada más de la pantalla — es el único
 * elemento ambar entre botones del color de marca.
 *
 * `categoriaId` que no existe en el contenido: no rompe nada, el botón
 * simplemente no se dibuja (mejor eso que un popover vacío).
 */
import { useState } from 'react';
import { Popover } from '@mui/material';
import { cx } from '@shared/utils/classNames.js';
import { AYUDA } from '@shared/content/ayuda.js';
import styles from './AyudaButton.module.css';

/** `**negrita**` → <strong>. Lo único que necesita un paso. */
function Texto({ children }) {
  return String(children).split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
}

export function AyudaButton({ categoriaId }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const categoria = AYUDA.find((c) => c.id === categoriaId);

  if (!categoria) return null;

  return (
    <>
      <button
        type="button"
        className={styles.boton}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={`Ayuda: ${categoria.titulo}`}
        title="Ayuda"
      >
        ?
      </button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <div className={styles.panel}>
          <div className={styles.titulo}>{categoria.titulo}</div>
          {categoria.articulos.map((a) => (
            <article key={a.id} className={styles.articulo}>
              <h4 className={styles.pregunta}>{a.pregunta}</h4>
              <ol className={styles.pasos}>
                {a.pasos.map((p, i) => <li key={i}><Texto>{p}</Texto></li>)}
              </ol>
              {(a.notas ?? []).map((n, i) => (
                <div key={i} className={cx(styles.nota, styles[`nota-${n.tono || 'info'}`])}>
                  <Texto>{n.texto}</Texto>
                </div>
              ))}
            </article>
          ))}
        </div>
      </Popover>
    </>
  );
}
