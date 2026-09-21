/**
 * ⭐ Cada módulo se descarga cuando alguien entra, no al abrir el panel.
 *
 * El bundle era **un solo archivo de 1.936 KB**: abrir el login descargaba
 * Analytics, el Store Builder de Tienda y el motor de Automatizaciones enteros.
 * Con 19 módulos y 79 rutas, `React.lazy` por pantalla es el cambio de mayor
 * efecto por menor esfuerzo (auditoría §6.5).
 *
 * Lo que NO se difiere está en `EAGER`: el shell y las dos pantallas que alguien
 * ve seguro en su primer segundo (login y dashboard). Diferirlas cambiaría un
 * bundle grande por un salto en blanco justo al abrir, que es peor.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layout/MainLayout";
import { useAuth } from "../../context/AuthContext";

import Dashboard from "../../modules/dashboard/Dashboard";
/* system */
const SystemInfo = lazy(() => import("../../modules/system/SystemInfo"));

/* productos */
const Productos = lazy(() => import("../../modules/productos/Productos"));
const ProductoDetalle = lazy(() => import("../../modules/productos/ProductoDetalle"));
const ProductosMarcas = lazy(() => import("../../modules/productos/submodules/ProductosMarcas"));
const ProductosCategorias = lazy(() => import("../../modules/productos/submodules/ProductosCategorias"));
const ProductosEtiquetas = lazy(() => import("../../modules/productos/submodules/ProductosEtiquetas"));
const ProductosAtributos = lazy(() => import("../../modules/productos/submodules/ProductosAtributos"));
const ProductosValoraciones = lazy(() => import("../../modules/productos/submodules/ProductosValoraciones"));
const Precios = lazy(() => import("../../modules/productos/Precios"));

/* pedidos */
const Pedidos = lazy(() => import("../../modules/pedidos/Pedidos"));
const PedidoDetalle = lazy(() => import("../../modules/pedidos/PedidoDetalle"));

/* ventas */
const Ventas = lazy(() => import("../../modules/ventas/Ventas"));
const VentaDetalle = lazy(() => import("../../modules/ventas/VentaDetalle"));
const Pos = lazy(() => import("../../modules/ventas/Pos"));
const Caja = lazy(() => import("../../modules/ventas/Caja"));
const Cobranzas = lazy(() => import("../../modules/ventas/Cobranzas"));
const Presupuestos = lazy(() => import("../../modules/ventas/Presupuestos"));
const PresupuestoDetalle = lazy(() => import("../../modules/ventas/PresupuestoDetalle"));
const Ofertas = lazy(() => import("../../modules/ventas/Ofertas"));
const ConfiguracionVentas = lazy(() => import("../../modules/ventas/ConfiguracionVentas"));

/* clientes */
const Clientes = lazy(() => import("../../modules/clientes/Clientes"));
const ClienteDetalle = lazy(() => import("../../modules/clientes/ClienteDetalle"));
const ClientesSegmentos = lazy(() => import("../../modules/clientes/Segmentos"));
const ClientesEtiquetas = lazy(() => import("../../modules/clientes/Etiquetas"));

/* inventario */
const Stock = lazy(() => import("../../modules/inventario/Stock"));
const Movimientos = lazy(() => import("../../modules/inventario/Movimientos"));
const Ajustes = lazy(() => import("../../modules/inventario/Ajustes"));
const Transferencias = lazy(() => import("../../modules/inventario/Transferencias"));
const TransferenciaDetalle = lazy(() => import("../../modules/inventario/TransferenciaDetalle"));
const Sucursales = lazy(() => import("../../modules/inventario/Sucursales"));
const InventarioFisico = lazy(() => import("../../modules/inventario/InventarioFisico"));
const InventarioFisicoDetalle = lazy(() => import("../../modules/inventario/InventarioFisicoDetalle"));

/* abastecimiento */
const Proveedores = lazy(() => import("../../modules/abastecimiento/Proveedores"));
const ProveedorDetalle = lazy(() => import("../../modules/abastecimiento/ProveedorDetalle"));
const OrdenesCompra = lazy(() => import("../../modules/abastecimiento/OrdenesCompra"));
const OrdenCompraDetalle = lazy(() => import("../../modules/abastecimiento/OrdenCompraDetalle"));
const Compras = lazy(() => import("../../modules/abastecimiento/Compras"));
const CompraNueva = lazy(() => import("../../modules/abastecimiento/CompraNueva"));
const CompraDetalle = lazy(() => import("../../modules/abastecimiento/CompraDetalle"));
const PagosProveedores = lazy(() => import("../../modules/abastecimiento/PagosProveedores"));
const PedidosProveedor = lazy(() => import("../../modules/abastecimiento/Pedidos"));
const Vencimientos = lazy(() => import("../../modules/abastecimiento/Vencimientos"));
const EstadosDeCuenta = lazy(() => import("../../modules/abastecimiento/EstadosDeCuenta"));
const EstadoDeCuenta = lazy(() => import("../../modules/abastecimiento/EstadoDeCuenta"));
const Reposicion = lazy(() => import("../../modules/abastecimiento/Reposicion"));

/* logistica */
const Envios = lazy(() => import("../../modules/logistica/Envios"));
const EnvioDetalle = lazy(() => import("../../modules/logistica/EnvioDetalle"));
const Transportistas = lazy(() => import("../../modules/logistica/Transportistas"));
const Zonas = lazy(() => import("../../modules/logistica/Zonas"));
const Tarifas = lazy(() => import("../../modules/logistica/Tarifas"));
const Incidencias = lazy(() => import("../../modules/logistica/Incidencias"));

/* facturacion */
const Comprobantes = lazy(() => import("../../modules/facturacion/Comprobantes"));
const ComprobanteDetalle = lazy(() => import("../../modules/facturacion/ComprobanteDetalle"));
const FacturacionImpuestos = lazy(() => import("../../modules/facturacion/Impuestos"));

/* finanzas */
const FinanzasResumen = lazy(() => import("../../modules/finanzas/Resumen"));
const FinanzasRentabilidad = lazy(() => import("../../modules/finanzas/Rentabilidad"));
const FinanzasGastos = lazy(() => import("../../modules/finanzas/Gastos"));
const FinanzasGastoDetalle = lazy(() => import("../../modules/finanzas/GastoDetalle"));
const FinanzasComisiones = lazy(() => import("../../modules/finanzas/Comisiones"));
const FinanzasReembolsos = lazy(() => import("../../modules/finanzas/Reembolsos"));

/* marketing */
const MarketingResumen = lazy(() => import("../../modules/marketing/Resumen"));
const MarketingPromociones = lazy(() => import("../../modules/marketing/Promociones"));
const MarketingCupones = lazy(() => import("../../modules/marketing/Cupones"));
const MarketingAudiencias = lazy(() => import("../../modules/marketing/Audiencias"));
const MarketingCampanas = lazy(() => import("../../modules/marketing/Campanas"));
const MarketingCampanaDetalle = lazy(() => import("../../modules/marketing/CampanaDetalle"));
const MarketingComunicacion = lazy(() => import("../../modules/marketing/Comunicacion"));
const MarketingCarritos = lazy(() => import("../../modules/marketing/Carritos"));
const MarketingFidelizacion = lazy(() => import("../../modules/marketing/Fidelizacion"));

/* tienda */
const TiendaResumen = lazy(() => import("../../modules/tienda/Resumen"));
const TiendaPaginas = lazy(() => import("../../modules/tienda/Paginas"));
const TiendaPaginaEditor = lazy(() => import("../../modules/tienda/PaginaEditor"));
const TiendaColecciones = lazy(() => import("../../modules/tienda/Colecciones"));
const TiendaBanners = lazy(() => import("../../modules/tienda/Banners"));
const TiendaBlog = lazy(() => import("../../modules/tienda/Blog"));
const TiendaMenus = lazy(() => import("../../modules/tienda/Menus"));
const TiendaContenido = lazy(() => import("../../modules/tienda/Contenido"));
const TiendaApariencia = lazy(() => import("../../modules/tienda/Apariencia"));

/* analytics */
const AnalyticsResumen = lazy(() => import("../../modules/analytics/Resumen"));
const AnalyticsMetricas = lazy(() => import("../../modules/analytics/Metricas"));
const AnalyticsExplorador = lazy(() => import("../../modules/analytics/Explorador"));
const AnalyticsReportes = lazy(() => import("../../modules/analytics/Reportes"));
const AnalyticsCohortes = lazy(() => import("../../modules/analytics/Cohortes"));
const AnalyticsDashboards = lazy(() => import("../../modules/analytics/Dashboards"));
const AnalyticsDashboardDetalle = lazy(() => import("../../modules/analytics/DashboardDetalle"));
const AnalyticsObjetivos = lazy(() => import("../../modules/analytics/Objetivos"));

/* automatizaciones */
const Automatizaciones = lazy(() => import("../../modules/automatizaciones/Automatizaciones"));
const AutomatizacionesHistorial = lazy(() => import("../../modules/automatizaciones/Historial"));
const AutomatizacionesEventos = lazy(() => import("../../modules/automatizaciones/Eventos"));
const AutomatizacionesBuilder = lazy(() => import("../../modules/automatizaciones/Builder"));
const AutomatizacionesAprobaciones = lazy(() => import("../../modules/automatizaciones/Aprobaciones"));

/* seguridad */
const Seguridad = lazy(() => import("../../modules/seguridad/Seguridad"));
const SeguridadUsuarios = lazy(() => import("../../modules/seguridad/Usuarios"));
const SeguridadRoles = lazy(() => import("../../modules/seguridad/Roles"));
const SeguridadAuditoria = lazy(() => import("../../modules/seguridad/Auditoria"));
const SeguridadActividad = lazy(() => import("../../modules/seguridad/Actividad"));
const SeguridadAprobaciones = lazy(() => import("../../modules/seguridad/Aprobaciones"));

/* integraciones */
const Integraciones = lazy(() => import("../../modules/integraciones/Integraciones"));
const IntegracionesTrafico = lazy(() => import("../../modules/integraciones/Trafico"));
const IntegracionesWebhooks = lazy(() => import("../../modules/integraciones/Webhooks"));
const IntegracionDetalle = lazy(() => import("../../modules/integraciones/ConexionDetalle"));












import NoEncontrado from "../../modules/system/NoEncontrado";

import Login from "../../modules/auth/Login";

// Componente para proteger las rutas privadas
const PrivateRoute = () => {
  const { isAuthenticated, cargando } = useAuth();
  // Mientras el servidor revalida el token guardado, no se decide nada: un
  // redirect al login con la sesión viva sería un parpadeo que asusta.
  if (cargando) return <div className="route-loading" aria-busy="true" />;
  return isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />;
};

// Componente para rutas públicas
const PublicRoute = ({ children }) => {
  const { isAuthenticated, cargando } = useAuth();
  if (cargando) return <div className="route-loading" aria-busy="true" />;
  return isAuthenticated ? <Navigate to="/" replace /> : children;
};

const AppRouter = () => {
  return (
    <BrowserRouter>
      {/* ⭐ Un solo Suspense, y su fallback NO es un spinner a pantalla completa:
          el shell (menú y navbar) ya está montado y no se va a ningún lado. Lo
          único que falta es el contenido, así que basta con reservar su altura —
          un spinner centrado en toda la pantalla haría parpadear un panel que
          en realidad sigue ahí. */}
      <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Routes>
        {/* Rutas Públicas */}
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        {/* Sin auto-registro: el alta es por invitación desde Seguridad. */}
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* Rutas Privadas Protegidas con Layout */}
        <Route path="/" element={<PrivateRoute />}>
          <Route index element={<Dashboard />} />
          <Route path="info-sistema" element={<SystemInfo />} />
          
          {/* Sub-rutas del Módulo Productos */}
          <Route path="productos">
            <Route index element={<Productos />} />
            <Route path=":id" element={<ProductoDetalle />} />
            <Route path="marcas" element={<ProductosMarcas />} />
            <Route path="categorias" element={<ProductosCategorias />} />
            <Route path="etiquetas" element={<ProductosEtiquetas />} />
            <Route path="atributos" element={<ProductosAtributos />} />
            <Route path="valoraciones" element={<ProductosValoraciones />} />
            <Route path="precios" element={<Precios />} />
          </Route>

          {/* Sub-rutas del Módulo Pedidos */}
          <Route path="pedidos">
            <Route index element={<Pedidos />} />
            <Route path=":id" element={<PedidoDetalle />} />
          </Route>

          {/* Módulo Ventas (F2): POS, listado, caja, cobranzas, presupuestos, ofertas, configuración */}
          <Route path="ventas">
            <Route index element={<Ventas />} />
            <Route path="pos" element={<Pos />} />
            <Route path="caja" element={<Caja />} />
            <Route path="cobranzas" element={<Cobranzas />} />
            <Route path="presupuestos" element={<Presupuestos />} />
            <Route path="presupuestos/:id" element={<PresupuestoDetalle />} />
            <Route path="ofertas" element={<Ofertas />} />
            <Route path="configuracion" element={<ConfiguracionVentas />} />
            <Route path=":id" element={<VentaDetalle />} />
          </Route>

          {/* Sub-rutas del Módulo Clientes / CRM */}
          <Route path="clientes">
            <Route index element={<Clientes />} />
            <Route path="segmentos" element={<ClientesSegmentos />} />
            <Route path="etiquetas" element={<ClientesEtiquetas />} />
            <Route path=":id" element={<ClienteDetalle />} />
          </Route>

          {/* Sub-rutas del Módulo Inventario */}
          <Route path="inventario">
            <Route index element={<Stock />} />
            <Route path="movimientos" element={<Movimientos />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="transferencias" element={<Transferencias />} />
            <Route path="transferencias/:id" element={<TransferenciaDetalle />} />
            <Route path="fisico">
              <Route index element={<InventarioFisico />} />
              <Route path=":id" element={<InventarioFisicoDetalle />} />
            </Route>
            <Route path="sucursales" element={<Sucursales />} />
          </Route>

          {/* Sub-rutas del Módulo Abastecimiento */}
          <Route path="abastecimiento">
            <Route index element={<Navigate to="proveedores" replace />} />
            <Route path="proveedores">
              <Route index element={<Proveedores />} />
              <Route path=":id" element={<ProveedorDetalle />} />
            </Route>
            <Route path="ordenes-compra">
              <Route index element={<OrdenesCompra />} />
              <Route path=":id" element={<OrdenCompraDetalle />} />
            </Route>
            <Route path="reposicion" element={<Reposicion />} />
            <Route path="compras">
              <Route index element={<Compras />} />
              <Route path="nuevo" element={<CompraNueva />} />
              <Route path=":id" element={<CompraDetalle />} />
            </Route>
            <Route path="pagos" element={<PagosProveedores />} />
            <Route path="pedidos" element={<PedidosProveedor />} />
            <Route path="vencimientos" element={<Vencimientos />} />
            <Route path="cuentas">
              <Route index element={<EstadosDeCuenta />} />
              <Route path=":id" element={<EstadoDeCuenta />} />
            </Route>
          </Route>

          {/* Sub-rutas del Módulo Logística & Fulfillment */}
          <Route path="logistica">
            <Route index element={<Envios />} />
            <Route path="transportistas" element={<Transportistas />} />
            <Route path="zonas" element={<Zonas />} />
            <Route path="tarifas" element={<Tarifas />} />
            <Route path="incidencias" element={<Incidencias />} />
            <Route path=":id" element={<EnvioDetalle />} />
          </Route>

          {/* Sub-rutas del Módulo Facturación */}
          <Route path="facturacion">
            <Route index element={<Comprobantes />} />
            <Route path="impuestos" element={<FacturacionImpuestos />} />
            <Route path=":id" element={<ComprobanteDetalle />} />
          </Route>

          {/* Sub-rutas del Módulo Finanzas */}
          <Route path="finanzas">
            <Route index element={<FinanzasResumen />} />
            <Route path="rentabilidad" element={<FinanzasRentabilidad />} />
            <Route path="gastos">
              <Route index element={<FinanzasGastos />} />
              <Route path=":id" element={<FinanzasGastoDetalle />} />
            </Route>
            <Route path="comisiones" element={<FinanzasComisiones />} />
            <Route path="reembolsos" element={<FinanzasReembolsos />} />
          </Route>

          {/* Sub-rutas del Módulo Marketing */}
          <Route path="marketing">
            <Route index element={<MarketingResumen />} />
            <Route path="campanas">
              <Route index element={<MarketingCampanas />} />
              <Route path=":id" element={<MarketingCampanaDetalle />} />
            </Route>
            <Route path="audiencias" element={<MarketingAudiencias />} />
            <Route path="promociones" element={<MarketingPromociones />} />
            <Route path="cupones" element={<MarketingCupones />} />
            <Route path="comunicacion" element={<MarketingComunicacion />} />
            <Route path="carritos" element={<MarketingCarritos />} />
            <Route path="fidelizacion" element={<MarketingFidelizacion />} />
          </Route>

          {/* Sub-rutas del Módulo Tienda / CMS */}
          <Route path="tienda">
            <Route index element={<TiendaResumen />} />
            <Route path="paginas">
              <Route index element={<TiendaPaginas />} />
              <Route path=":id" element={<TiendaPaginaEditor />} />
            </Route>
            <Route path="colecciones" element={<TiendaColecciones />} />
            <Route path="banners" element={<TiendaBanners />} />
            <Route path="blog" element={<TiendaBlog />} />
            <Route path="menus" element={<TiendaMenus />} />
            <Route path="contenido" element={<TiendaContenido />} />
            <Route path="apariencia" element={<TiendaApariencia />} />
          </Route>

          {/* Sub-rutas del Módulo Analytics */}
          <Route path="analytics">
            <Route index element={<AnalyticsResumen />} />
            <Route path="metricas" element={<AnalyticsMetricas />} />
            <Route path="explorador" element={<AnalyticsExplorador />} />
            <Route path="reportes" element={<AnalyticsReportes />} />
            <Route path="cohortes" element={<AnalyticsCohortes />} />
            <Route path="dashboards" element={<AnalyticsDashboards />} />
            <Route path="dashboards/:id" element={<AnalyticsDashboardDetalle />} />
            <Route path="objetivos" element={<AnalyticsObjetivos />} />
          </Route>

          {/* Sub-rutas del Módulo Automatizaciones */}
          <Route path="automatizaciones">
            <Route index element={<Automatizaciones />} />
            <Route path="historial" element={<AutomatizacionesHistorial />} />
            <Route path="eventos" element={<AutomatizacionesEventos />} />
            <Route path="aprobaciones" element={<AutomatizacionesAprobaciones />} />
            <Route path="nueva" element={<AutomatizacionesBuilder />} />
            <Route path=":id" element={<AutomatizacionesBuilder />} />
          </Route>

          {/* Sub-rutas del Módulo Integraciones */}
          <Route path="integraciones">
            <Route index element={<Integraciones />} />
            <Route path="trafico" element={<IntegracionesTrafico />} />
            <Route path="webhooks" element={<IntegracionesWebhooks />} />
            <Route path=":portKey" element={<IntegracionDetalle />} />
          </Route>

          {/* Sub-rutas del Módulo Seguridad, Auditoría y Control */}
          <Route path="seguridad">
            <Route index element={<Seguridad />} />
            <Route path="usuarios" element={<SeguridadUsuarios />} />
            <Route path="roles" element={<SeguridadRoles />} />
            <Route path="auditoria" element={<SeguridadAuditoria />} />
            <Route path="actividad" element={<SeguridadActividad />} />
            <Route path="aprobaciones" element={<SeguridadAprobaciones />} />
          </Route>

          {/* El padrón vivía acá como scaffold; ahora es parte de Seguridad. */}
          <Route path="usuarios" element={<Navigate to="/seguridad/usuarios" replace />} />
          {/* ⭐ El 404 vive DENTRO del layout: con el menú a la vista, la
              salida es obvia. Antes esto era un redirect silencioso al inicio,
              que convertía un error del sistema en una duda de la persona. */}
          <Route path="*" element={<NoEncontrado />} />
        </Route>

        {/* Cualquier otra cosa, sin sesión, va al login; con sesión la atiende
            el «*» de adentro del layout. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default AppRouter;