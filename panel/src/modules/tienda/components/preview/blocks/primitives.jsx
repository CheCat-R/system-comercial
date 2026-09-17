/**
 * Piezas compartidas por los renderers de bloque.
 *
 * Sólo exporta componentes: así Fast Refresh sigue funcionando y ningún bloque
 * termina reimplementando el encabezado o el estado vacío por su cuenta.
 */

/** Markdown acotado: **negrita** y *cursiva*. Sin HTML crudo, a propósito. */
const renderInline = (text) =>
  String(text || "")
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
      return part;
    });

export const Paragraphs = ({ text, className = "" }) =>
  String(text || "")
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, i) => (
      <p key={i} className={className}>
        {renderInline(p)}
      </p>
    ));

/** Aviso dentro del preview cuando un bloque no tiene con qué dibujarse. */
export const Placeholder = ({ children }) => <div className="st-placeholder">{children}</div>;

export const SectionHeading = ({ children, action }) =>
  !children && !action ? null : (
    <div className="st-heading-row">
      {children ? <h3 className="st-heading">{children}</h3> : <span />}
      {action}
    </div>
  );

export const Stars = ({ rating }) => (
  <span className="st-stars" aria-label={`${rating} de 5`}>
    {"★★★★★".slice(0, Math.round(rating))}
    <em>{"★★★★★".slice(0, 5 - Math.round(rating))}</em>
  </span>
);
