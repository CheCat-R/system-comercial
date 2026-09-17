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
 */
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import WarehouseOutlinedIcon from "@mui/icons-material/WarehouseOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptOutlinedIcon from "@mui/icons-material/ReceiptOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import AutoModeOutlinedIcon from "@mui/icons-material/AutoModeOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";

export const NAV_SECTIONS = [
  {
    title: "MENÚ PRINCIPAL",
    items: [
      { text: "Dashboard", icon: <GridViewOutlinedIcon fontSize="small" />, path: "/" },
      { text: "Info Sistema", icon: <InsightsOutlinedIcon fontSize="small" />, path: "/info-sistema" },
    ],
  },
  {
    title: "GESTIÓN E-COMMERCE",
    items: [
      {
        text: "Productos",
        icon: <Inventory2OutlinedIcon fontSize="small" />,
        path: "/productos",
        children: [
          { text: "Todos los productos", path: "/productos" },
          { text: "Precios y márgenes", path: "/productos/precios" },
          { text: "Marcas", path: "/productos/marcas" },
          { text: "Categorías", path: "/productos/categorias" },
          { text: "Etiquetas", path: "/productos/etiquetas" },
          { text: "Atributos", path: "/productos/atributos" },
          { text: "Valoraciones", path: "/productos/valoraciones" },
        ],
      },
      {
        text: "Clientes",
        icon: <PeopleAltOutlinedIcon fontSize="small" />,
        path: "/clientes",
        children: [
          { text: "Todos los clientes", path: "/clientes" },
          { text: "Segmentos", path: "/clientes/segmentos" },
          { text: "Etiquetas", path: "/clientes/etiquetas" },
        ],
      },
      { text: "Pedidos", icon: <ShoppingBagOutlinedIcon fontSize="small" />, path: "/pedidos" },
      { text: "Ventas", icon: <ReceiptLongOutlinedIcon fontSize="small" />, path: "/ventas" },
    ],
  },
  {
    title: "OPERACIONES",
    items: [
      {
        text: "Inventario",
        icon: <WarehouseOutlinedIcon fontSize="small" />,
        path: "/inventario",
        children: [
          { text: "Stock", path: "/inventario" },
          { text: "Movimientos", path: "/inventario/movimientos" },
          { text: "Ajustes", path: "/inventario/ajustes" },
          { text: "Transferencias", path: "/inventario/transferencias" },
          { text: "Inventario físico", path: "/inventario/fisico" },
          { text: "Sucursales y Depósitos", path: "/inventario/sucursales" },
        ],
      },
      {
        text: "Abastecimiento",
        icon: <LocalShippingOutlinedIcon fontSize="small" />,
        path: "/abastecimiento",
        children: [
          { text: "Proveedores", path: "/abastecimiento/proveedores" },
          { text: "Órdenes de compra", path: "/abastecimiento/ordenes-compra" },
          { text: "Reposición", path: "/abastecimiento/reposicion" },
          { text: "Compras", path: "/abastecimiento/compras" },
        ],
      },
      {
        text: "Logística",
        icon: <RouteOutlinedIcon fontSize="small" />,
        path: "/logistica",
        children: [
          { text: "Envíos", path: "/logistica" },
          { text: "Transportistas", path: "/logistica/transportistas" },
          { text: "Zonas", path: "/logistica/zonas" },
          { text: "Tarifas", path: "/logistica/tarifas" },
          { text: "Incidencias", path: "/logistica/incidencias" },
        ],
      },
    ],
  },
  {
    title: "FINANZAS",
    items: [
      {
        text: "Finanzas",
        icon: <AccountBalanceWalletOutlinedIcon fontSize="small" />,
        path: "/finanzas",
        children: [
          { text: "Resumen", path: "/finanzas" },
          { text: "Rentabilidad", path: "/finanzas/rentabilidad" },
          { text: "Gastos", path: "/finanzas/gastos" },
          { text: "Comisiones", path: "/finanzas/comisiones" },
          { text: "Reembolsos", path: "/finanzas/reembolsos" },
        ],
      },
      {
        text: "Facturación",
        icon: <ReceiptOutlinedIcon fontSize="small" />,
        path: "/facturacion",
        children: [
          { text: "Comprobantes", path: "/facturacion" },
          { text: "Impuestos", path: "/facturacion/impuestos" },
        ],
      },
    ],
  },
  {
    title: "MARKETING",
    items: [
      {
        text: "Marketing",
        icon: <CampaignOutlinedIcon fontSize="small" />,
        path: "/marketing",
        children: [
          { text: "Resumen", path: "/marketing" },
          { text: "Campañas", path: "/marketing/campanas" },
          { text: "Audiencias", path: "/marketing/audiencias" },
          { text: "Promociones", path: "/marketing/promociones" },
          { text: "Cupones", path: "/marketing/cupones" },
          { text: "Comunicación", path: "/marketing/comunicacion" },
          { text: "Carritos abandonados", path: "/marketing/carritos" },
          { text: "Fidelización", path: "/marketing/fidelizacion" },
        ],
      },
    ],
  },
  {
    title: "TIENDA",
    items: [
      {
        text: "Tienda",
        icon: <StorefrontOutlinedIcon fontSize="small" />,
        path: "/tienda",
        children: [
          { text: "Resumen", path: "/tienda" },
          { text: "Páginas", path: "/tienda/paginas" },
          { text: "Colecciones", path: "/tienda/colecciones" },
          { text: "Banners", path: "/tienda/banners" },
          { text: "Blog", path: "/tienda/blog" },
          { text: "Menús", path: "/tienda/menus" },
          { text: "Contenido", path: "/tienda/contenido" },
          { text: "Apariencia", path: "/tienda/apariencia" },
        ],
      },
    ],
  },
  {
    title: "AUTOMATIZACIÓN",
    items: [
      {
        text: "Automatizaciones",
        icon: <AutoModeOutlinedIcon fontSize="small" />,
        path: "/automatizaciones",
        children: [
          { text: "Reglas", path: "/automatizaciones" },
          { text: "Historial de ejecuciones", path: "/automatizaciones/historial" },
          { text: "Bandeja de eventos", path: "/automatizaciones/eventos" },
          { text: "Aprobaciones", path: "/automatizaciones/aprobaciones" },
        ],
      },
    ],
  },
  {
    title: "ANÁLISIS",
    items: [
      {
        text: "Analytics",
        icon: <QueryStatsOutlinedIcon fontSize="small" />,
        path: "/analytics",
        children: [
          { text: "Resumen ejecutivo", path: "/analytics" },
          { text: "Diccionario de métricas", path: "/analytics/metricas" },
          { text: "Explorador", path: "/analytics/explorador" },
          { text: "Cohortes y retención", path: "/analytics/cohortes" },
          { text: "Reportes", path: "/analytics/reportes" },
          { text: "Dashboards", path: "/analytics/dashboards" },
          { text: "Objetivos y alertas", path: "/analytics/objetivos" },
        ],
      },
    ],
  },
  {
    title: "ORGANIZACIÓN",
    items: [
      { text: "Usuarios", icon: <PeopleAltOutlinedIcon fontSize="small" />, path: "/seguridad/usuarios" },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      {
        text: "Seguridad",
        icon: <ShieldOutlinedIcon fontSize="small" />,
        submenu: [
          { text: "Panel", path: "/seguridad" },
          { text: "Usuarios", path: "/seguridad/usuarios" },
          { text: "Roles y permisos", path: "/seguridad/roles" },
          { text: "Auditoría", path: "/seguridad/auditoria" },
          { text: "Aprobaciones", path: "/seguridad/aprobaciones" },
          { text: "Actividad", path: "/seguridad/actividad" },
        ],
      },
      { text: "Integraciones", icon: <HubOutlinedIcon fontSize="small" />, path: "/integraciones" },
      { text: "Ajustes", icon: <SettingsOutlinedIcon fontSize="small" />, path: "/configuracion", disabled: true },
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
