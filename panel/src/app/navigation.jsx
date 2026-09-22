/**
 * ⭐ La navegación del panel, declarada **una sola vez**.
 *
 * Vivía dentro de `Sidebar.jsx` como una constante local, y por eso el Command
 * Palette tuvo que inventar sus propios tres accesos rápidos escritos a mano y
 * los breadcrumbs mantienen todavía su propio mapa de etiquetas. Tres listas
 * paralelas de lo mismo, que se desincronizan en silencio: la auditoría encontró
 * **34 segmentos de ruta sin etiqueta** por exactamente esa razón.
 *
 * Acá está el árbol; quien lo necesite lo lee de acá.
 *
 * ── ⭐ La estructura calca la del CRM de referencia (crm-dashboard-main), no la
 * del template de e-commerce genérico del que partió este panel ───────────
 *
 * Las secciones "MÓDULO" y sus submenús reproducen el árbol real del CRM
 * (General: Dashboard/Info de sistema; Módulo: Compras → Proveedores → Ventas
 * → Almacén → Gerencia → Sistema → Gastos, en ese orden). Lo que el CRM tiene
 * pero acá no existe todavía (lectura de facturas, formato de venta como
 * pantalla propia, carteles de góndola, vencimientos por lote, impresión,
 * respaldos, valorización de stock) se dejó afuera del menú a propósito: un
 * link a una pantalla que no existe es peor que no tenerlo. Lo que el CRM deja
 * repartido en varias pantallas y acá ya vive junto en una (p. ej. Fraccionar
 * e Incidencias son pestañas de la misma página de Ajustes) apunta las dos
 * entradas del menú a esa misma pantalla — igual que hace el propio CRM con
 * Compras puertas adentro. Marketing, Tienda y el módulo Web (sitio mayorista)
 * quedan afuera por decisión del dueño: este negocio no vende online.
 */
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import WarehouseOutlinedIcon from "@mui/icons-material/WarehouseOutlined";
import BusinessCenterOutlinedIcon from "@mui/icons-material/BusinessCenterOutlined";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";

export const NAV_SECTIONS = [
  {
    title: "GENERAL",
    items: [
      { text: "Dashboard", icon: <GridViewOutlinedIcon fontSize="small" />, path: "/" },
      { text: "Info de sistema", icon: <InsightsOutlinedIcon fontSize="small" />, path: "/info-sistema" },
    ],
  },
  {
    title: "MÓDULO",
    items: [
      {
        text: "Compras",
        icon: <Inventory2OutlinedIcon fontSize="small" />,
        path: "/productos",
        children: [
          { text: "Productos", path: "/productos" },
          { text: "Marcas", path: "/productos/marcas" },
          { text: "Categorías", path: "/productos/categorias" },
          { text: "Etiquetas", path: "/productos/etiquetas" },
          { text: "Atributos", path: "/productos/atributos" },
          { text: "Valoraciones", path: "/productos/valoraciones" },
          // "Costos y percepciones" + "Cambios de precio" del CRM: una sola
          // pantalla acá, con la evolución de precios adentro.
          { text: "Precios y costos", path: "/productos/precios" },
          // El "Facturación" del Compras del CRM: los comprobantes del proveedor.
          { text: "Facturación", path: "/abastecimiento/compras" },
        ],
      },
      {
        text: "Proveedores",
        icon: <LocalShippingOutlinedIcon fontSize="small" />,
        path: "/abastecimiento/proveedores",
        children: [
          { text: "Proveedores", path: "/abastecimiento/proveedores" },
          { text: "Pedidos", path: "/abastecimiento/pedidos" },
          // "Cuentas corrientes" + "Echeqs" del CRM: una sola pantalla con las
          // dos carteras (mismo criterio que el propio CRM en varios lados).
          { text: "Cuentas corrientes y echeqs", path: "/abastecimiento/vencimientos" },
          { text: "Estados de cuenta", path: "/abastecimiento/cuentas" },
          // Sin equivalente directo en el CRM: la bandeja de pagos sin aplicar.
          { text: "Pagos a proveedores", path: "/abastecimiento/pagos" },
        ],
      },
      {
        text: "Ventas",
        icon: <PointOfSaleOutlinedIcon fontSize="small" />,
        path: "/ventas",
        children: [
          { text: "Punto de venta", path: "/ventas/pos" },
          { text: "Ventas", path: "/ventas" },
          { text: "Caja", path: "/ventas/caja" },
          { text: "Presupuestos", path: "/ventas/presupuestos" },
          { text: "Clientes", path: "/clientes" },
          { text: "Cobranzas", path: "/ventas/cobranzas" },
          { text: "Ofertas", path: "/ventas/ofertas" },
          { text: "Configuración", path: "/ventas/configuracion" },
        ],
      },
      {
        text: "Almacén",
        icon: <WarehouseOutlinedIcon fontSize="small" />,
        path: "/inventario",
        children: [
          { text: "Existencias", path: "/inventario" },
          { text: "Control de stock", path: "/inventario/fisico" },
          { text: "Operaciones", path: "/inventario/movimientos" },
          // Fraccionamiento e Incidencias son pestañas de la misma pantalla.
          { text: "Fraccionamiento", path: "/inventario/ajustes" },
          { text: "Incidencias", path: "/inventario/ajustes" },
          { text: "Transferencias", path: "/inventario/transferencias" },
        ],
      },
      {
        text: "Gerencia",
        icon: <BusinessCenterOutlinedIcon fontSize="small" />,
        path: "/finanzas/rentabilidad",
        children: [
          { text: "Usuarios y roles", path: "/seguridad/usuarios" },
          { text: "Roles y permisos", path: "/seguridad/roles" },
          { text: "Rentabilidad", path: "/finanzas/rentabilidad" },
          { text: "Auditoría", path: "/seguridad/auditoria" },
          { text: "Actividad", path: "/seguridad/actividad" },
        ],
      },
      {
        text: "Sistema",
        icon: <SettingsSuggestOutlinedIcon fontSize="small" />,
        path: "/inventario/sucursales",
        children: [
          // Empresa (sucursales, punto de venta de ARCA) y Este equipo
          // (terminales) del CRM: una sola pantalla acá.
          { text: "Sucursales y equipos", path: "/inventario/sucursales" },
        ],
      },
      {
        text: "Gastos",
        icon: <RequestQuoteOutlinedIcon fontSize="small" />,
        path: "/finanzas/gastos",
        children: [
          { text: "Gastos", path: "/finanzas/gastos" },
          { text: "Cuentas a pagar", path: "/finanzas/gastos?tab=pagar" },
          { text: "Gastos fijos", path: "/finanzas/gastos?tab=fijos" },
          { text: "Rubros", path: "/finanzas/gastos?tab=rubros" },
          { text: "Resumen", path: "/finanzas/gastos?tab=resumen" },
        ],
      },
    ],
  },
];

/**
 * El árbol aplanado en destinos buscables: `{ path, label, section, parent }`.
 * Un ítem sin `path` (sólo agrupa) no es un destino; uno `disabled` tampoco,
 * porque llevar a alguien a una pantalla apagada no es ayudarlo.
 */
const flatten = (sections) => sections.flatMap((section) =>
  section.items.flatMap((item) => {
    const children = item.children || item.submenu || [];
    const self = item.path && !item.disabled
      ? [{ path: item.path, label: item.text, section: section.title, icon: item.icon }]
      : [];
    const kids = children
      .filter((c) => c.path && !c.disabled)
      .map((c) => ({
        path: c.path,
        label: c.text,
        section: section.title,
        parent: item.text,
        icon: item.icon,
      }));
    // Un hijo que repite la ruta del padre ("Todos los productos" → /productos)
    // se queda con la etiqueta del hijo, que es la que la persona lee en el menú.
    const seen = new Set(kids.map((k) => k.path));
    return [...kids, ...self.filter((x) => !seen.has(x.path))];
  })
);

/**
 * ⭐ Una ruta, un destino.
 *
 * El menú ofrece `/seguridad/usuarios` **dos veces** —como «Usuarios» en
 * ORGANIZACIÓN y dentro del submenú de Seguridad— y eso está bien en un menú:
 * son dos caminos al mismo lugar. En un buscador es un resultado repetido, y
 * además dos elementos de React con la misma clave. Se deduplica acá y no en
 * cada consumidor.
 */
export const NAV_DESTINATIONS = (() => {
  const seen = new Set();
  return flatten(NAV_SECTIONS).filter((d) => {
    if (seen.has(d.path)) return false;
    seen.add(d.path);
    return true;
  });
})();

/** La etiqueta que el menú le da a una ruta, si la conoce. */
export const navLabelFor = (path) =>
  NAV_DESTINATIONS.find((d) => d.path === path)?.label || null;
