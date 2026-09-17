/**
 * Menús de navegación.
 *
 * El header y el footer **no son bloques**: son del sitio, no de una página, y
 * por eso viven acá. Un ítem enlaza a una página, a una colección, a una
 * categoría del catálogo o a una URL suelta — el `linkType` decide contra qué se
 * resuelve `ref`. Ver docs/MODULO-TIENDA-CMS.md §3.8.
 */

export const menus = [
  {
    id: "MN-HEADER",
    name: "Navegación principal",
    location: "header",
    items: [
      {
        id: "MI-1", label: "Calzado", linkType: "collection", ref: "CO-CALZADO", badge: null,
        children: [
          { id: "MI-1-1", label: "Running", linkType: "collection", ref: "CO-CALZADO", badge: null, children: [] },
          { id: "MI-1-2", label: "Trail", linkType: "collection", ref: "CO-TRAIL", badge: null, children: [] },
        ],
      },
      { id: "MI-2", label: "Indumentaria", linkType: "collection", ref: "CO-INDUMENTARIA", badge: null, children: [] },
      { id: "MI-3", label: "Accesorios", linkType: "collection", ref: "CO-ACCESORIOS", badge: null, children: [] },
      { id: "MI-4", label: "Ofertas", linkType: "collection", ref: "CO-OFERTAS", badge: "sale", children: [] },
      { id: "MI-5", label: "Blog", linkType: "url", ref: "/blog", badge: null, children: [] },
    ],
  },
  {
    id: "MN-FOOTER",
    name: "Pie de página",
    location: "footer",
    items: [
      {
        id: "MI-6", label: "La marca", linkType: "none", ref: null, badge: null,
        children: [
          { id: "MI-6-1", label: "Nosotros", linkType: "page", ref: "PG-NOSOTROS", badge: null, children: [] },
          { id: "MI-6-2", label: "Blog", linkType: "url", ref: "/blog", badge: null, children: [] },
        ],
      },
      {
        id: "MI-7", label: "Ayuda", linkType: "none", ref: null, badge: null,
        children: [
          { id: "MI-7-1", label: "Envíos y devoluciones", linkType: "page", ref: "PG-ENVIOS", badge: null, children: [] },
          { id: "MI-7-2", label: "Contacto", linkType: "page", ref: "PG-CONTACTO", badge: null, children: [] },
        ],
      },
    ],
  },
];
