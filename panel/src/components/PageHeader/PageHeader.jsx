import "./PageHeader.css";

/**
 * Encabezado de módulo estandarizado.
 * @param {string} title      - Título de la página
 * @param {string} subtitle   - Texto de apoyo bajo el título
 * @param {ReactNode} actions - Botones / controles alineados a la derecha
 */
const PageHeader = ({ title, subtitle, actions }) => (
  <header className="page-header">
    <div className="page-header__text">
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
);

export default PageHeader;
