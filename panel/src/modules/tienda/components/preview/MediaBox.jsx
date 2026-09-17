/**
 * Dibuja un asset de la biblioteca.
 *
 * Los mocks no tienen archivos: si el asset trae `url` se usa, y si no se dibuja
 * un placeholder con el color y la etiqueta del asset. Cuando exista un storage
 * real, sólo empiezan a llegar `url` y este componente no cambia.
 */
const MediaBox = ({ media, ratio = "auto", alt, className = "", children }) => {
  const style = {
    aspectRatio: ratio === "auto" ? undefined : ratio.replace(":", " / "),
    background: media?.color
      ? `linear-gradient(135deg, ${media.color} 0%, ${media.color}b0 55%, ${media.color}70 100%)`
      : "var(--bg-sunken)",
  };

  if (media?.url) {
    return (
      <div className={`st-media ${className}`.trim()} style={{ aspectRatio: style.aspectRatio }}>
        <img src={media.url} alt={alt || media.alt || ""} className="st-media__img" />
        {children}
      </div>
    );
  }

  return (
    <div className={`st-media st-media--placeholder ${className}`.trim()} style={style} role="img" aria-label={alt || media?.alt || "Imagen"}>
      {media ? (
        <span className="st-media__label">{media.label || media.name}</span>
      ) : (
        <span className="st-media__label st-media__label--empty">Sin imagen</span>
      )}
      {children}
    </div>
  );
};

export default MediaBox;
