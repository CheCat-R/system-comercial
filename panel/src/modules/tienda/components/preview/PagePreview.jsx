/**
 * Vista previa de una página: árbol → React.
 *
 * Es el mismo renderer que usaría el storefront; lo único que agrega el panel es
 * la capa de selección (`selectedId`, `onSelect`) para poder hacer click en un
 * bloque y que el inspector lo tome. Fiel, pero **no editable inline**: toda
 * edición pasa por el inspector (docs/MODULO-TIENDA-CMS.md §9.4).
 *
 * Con `fit`, la página se dibuja al ancho real del dispositivo elegido y se
 * **escala** para entrar en el panel. Sin eso el preview de escritorio se vería
 * como un mobile: los bloques usan container queries y responderían al ancho de
 * la columna del editor, no al del visitante.
 */
import { useRef, useState, useEffect } from "react";
import { layoutClassName, gridStyle } from "../../lib/layout";
import { resolveBlockData, getStoreChrome, getTheme } from "../../api/tiendaApi";
import { themeToCssVars } from "../../lib/theme";
import BlockRenderer from "./blocks";
import { Announcement, StoreHeader, StoreFooter } from "./StoreChrome";

/** Ancho real de cada dispositivo: es lo que hace fiel al preview. */
const FRAME_WIDTH = { desktop: 1280, tablet: 768, mobile: 390 };

const BlockNode = ({ block, page, selectable, selectedId, onSelect }) => {
  const isSelected = selectedId === block.id;
  // `page` va al resolver porque hay bloques (p. ej. `post-content`) cuyo
  // contenido sale de la página misma, no de sus props.
  const content = <BlockRenderer type={block.type} props={block.props || {}} data={resolveBlockData(block, page)} />;

  if (!selectable) return content;

  return (
    <div
      className={`st-selectable ${isSelected ? "is-selected" : ""}`.trim()}
      onClick={(e) => { e.stopPropagation(); onSelect?.(block.id); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSelect?.(block.id); } }}
      data-block-id={block.id}
    >
      {content}
    </div>
  );
};

const SectionNode = ({ section, page, selectable, selectedId, onSelect }) => {
  const layout = section.layout || {};
  const isSelected = selectedId === section.id;

  return (
    <section
      className={`${layoutClassName(layout)} ${selectable ? "st-selectable-section" : ""} ${isSelected ? "is-selected" : ""}`.trim()}
      data-section-id={section.id}
      onClick={selectable ? () => onSelect?.(section.id) : undefined}
    >
      <div className="st-section__inner" style={gridStyle(layout)}>
        {section.blocks.map((block) => (
          <BlockNode key={block.id} block={block} page={page} selectable={selectable} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
};

const Store = ({ sections, page, selectable, selectedId, onSelect, chrome }) => (
  <>
    {chrome && (
      <>
        <Announcement announcement={chrome.announcement} />
        <StoreHeader header={chrome.header} menu={chrome.headerMenu} />
      </>
    )}

    {sections.length === 0 ? (
      <div className="st-empty">
        <strong>Esta página no muestra nada todavía.</strong>
        <span>Agregá una sección y después un bloque adentro.</span>
      </div>
    ) : (
      sections.map((section) => (
        <SectionNode
          key={section.id} section={section} page={page}
          selectable={selectable} selectedId={selectedId} onSelect={onSelect}
        />
      ))
    )}

    {chrome && <StoreFooter footer={chrome.footer} menus={chrome.footerMenus} />}
  </>
);

/**
 * @param {object[]} sections   Árbol ya filtrado por visibilidad (`getRenderTree`)
 * @param {"desktop"|"tablet"|"mobile"} viewport
 * @param {boolean} selectable  Habilita la selección (editor)
 * @param {boolean} fit         Dibuja al ancho real del dispositivo y escala para entrar
 * @param {boolean} chrome      Dibuja anuncio, header y footer alrededor
 * @param {object} theme        Tema a aplicar; por defecto el guardado. Apariencia
 *                              pasa el borrador para previsualizar sin guardar.
 * @param {string} at           Fecha de la vista (para la vigencia del anuncio)
 */
const PagePreview = ({
  sections = [], page = null, viewport = "desktop", selectable = false,
  selectedId, onSelect, fit = false, chrome = false, theme, at,
}) => {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const frameWidth = FRAME_WIDTH[viewport] || FRAME_WIDTH.desktop;

  // El tema se aplica como variables CSS **sólo dentro del preview**, así el
  // panel conserva su identidad y lo que cambia de aspecto es la tienda.
  // Sin `theme` se usa el guardado; Apariencia pasa el borrador sin guardar.
  const activeTheme = theme || getTheme();
  const chromeData = chrome ? getStoreChrome({ at, theme: activeTheme }) : null;
  const themeVars = themeToCssVars(activeTheme);

  useEffect(() => {
    if (!fit || !outerRef.current || !innerRef.current) return undefined;

    const outer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / frameWidth));
    });
    const inner = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));

    outer.observe(outerRef.current);
    inner.observe(innerRef.current);
    return () => { outer.disconnect(); inner.disconnect(); };
  }, [fit, frameWidth]);

  if (!fit) {
    return (
      <div className={`st-canvas st-canvas--${viewport}`}>
        <div className="st-store" style={{ maxWidth: frameWidth, marginInline: "auto", ...themeVars }}>
          <Store sections={sections} page={page} chrome={chromeData} selectable={selectable} selectedId={selectedId} onSelect={onSelect} />
        </div>
      </div>
    );
  }

  return (
    <div className="st-fit" ref={outerRef} style={{ height: height * scale }}>
      <div
        className={`st-canvas st-canvas--${viewport}`}
        ref={innerRef}
        style={{ width: frameWidth, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <div className="st-store" style={themeVars}>
          <Store sections={sections} page={page} chrome={chromeData} selectable={selectable} selectedId={selectedId} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
};

export default PagePreview;
