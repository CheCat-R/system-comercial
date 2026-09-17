/** Familia Utilidad — aire, cortes y la puerta de escape. */
import { Placeholder } from "./primitives";

/**
 * Embed externo. En el panel **no se ejecuta**: se muestra un marcador con el
 * código a la vista. Renderizar HTML de terceros dentro del editor sería
 * regalarle el panel a quien haya pegado el snippet; el storefront real lo
 * aislaría en un iframe con sandbox.
 */
export const HtmlEmbed = ({ props }) => {
  if (!props.code) return <Placeholder>Falta pegar el código del embed.</Placeholder>;

  return (
    <div className="st-embed" style={{ minHeight: `${props.height || 260}px` }}>
      <span className="st-embed__tag">Embed externo</span>
      <code className="st-embed__code">{props.code.slice(0, 400)}</code>
      <span className="st-embed__note">
        No se ejecuta en el editor. En el sitio se carga aislado.
      </span>
    </div>
  );
};

export const Spacer = ({ props }) => (
  <div className={`st-spacer st-spacer--${props.size || "md"}`} aria-hidden="true" />
);

export const Divider = ({ props }) => (
  <div
    className={`st-divider st-divider--${props.style || "line"} st-divider--w-${props.width || "content"}`}
    aria-hidden="true"
  />
);
