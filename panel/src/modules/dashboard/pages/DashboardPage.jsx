import { useState } from 'react';
import { Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PageHeader } from '@shared/components/PageHeader/PageHeader.jsx';
import { FullScreenLoader } from '@shared/components/FullScreenLoader/FullScreenLoader.jsx';
import { usePermissions } from '@core/permissions/PermissionContext.jsx';
import { usePlan } from '@core/plan/PlanContext.jsx';
import { ProductosProvider, useProductos } from '@modules/productos/context/ProductosContext.jsx';
import { ResumenInventario } from '@modules/productos/panels/ResumenInventario.jsx';
import { ResumenVentasHoy } from '../components/ResumenVentasHoy.jsx';
import { ResumenCobranzas } from '../components/ResumenCobranzas.jsx';
import { ResumenPresupuestos } from '../components/ResumenPresupuestos.jsx';
import { ResumenTransferencias } from '../components/ResumenTransferencias.jsx';
import { TeaserPymes } from '../components/TeaserPymes.jsx';
import styles from '../styles/Dashboard.module.css';

/**
 * DASHBOARD — la pantalla que abre el sistema.
 * ============================================================================
 * Resúmenes independientes, cada uno visible solo para quien tiene el permiso
 * de su propio módulo — no hay un permiso de "Dashboard" aparte:
 *   - VENTAS Y CAJA (`ResumenVentasHoy`): lo que se vendió hoy y el turno de
 *     caja de la sucursal de esta sesión. En los 3 planes — Emprendedor ya
 *     tiene `ventas.listado`/`ventas.caja` en su base.
 *   - COBRANZAS (`ResumenCobranzas`), PRESUPUESTOS (`ResumenPresupuestos`) y
 *     TRANSFERENCIAS (`ResumenTransferencias`): solo Pymes y Corporativo —
 *     Emprendedor no tiene cuenta corriente de clientes, presupuestos ni
 *     transferencias entre sucursales (ver `PlanCatalogo::EMPRENDEDOR`).
 *     Quien tiene el PERMISO de rol para alguno pero el PLAN no lo incluye
 *     no ve un hueco por cada uno: ve UNA sola `TeaserPymes` con la lista de
 *     lo que se desbloquea subiendo de plan.
 *   - INVENTARIO (`ResumenInventario`): valor disponible, productos, stock
 *     bajo y comprometido, el stock por sucursal y los últimos movimientos.
 *
 * Hasta el 18/8/2026 esta página mostraba métricas de EJEMPLO —ventas de
 * $184.500, "Panadería El Sol", "María G."— que venían de la plantilla original
 * y nunca se cablearon, mientras el resumen de inventario real estaba
 * escondido en una pestaña adentro de Compras. El dueño lo dio vuelta: el
 * contenido real subió acá y los datos inventados se fueron. Mostrar cifras
 * falsas en la puerta de entrada es peor que no mostrar nada — alguien las lee
 * como si fueran ciertas. Ventas y Caja se sumaron después, con datos reales
 * desde el primer día — mismo criterio.
 *
 * El resumen de inventario sale del **motor de inventario**, así que esa
 * mitad se monta dentro de su propio `ProductosProvider` (igual que Compras y
 * Almacén) — Ventas y Caja piden sus datos aparte, sin ese contexto.
 *
 * QUIÉN VE QUÉ: el valor del inventario y lo vendido son información sensible,
 * así que cada mitad se dibuja solo para quien ya puede ver esos datos en su
 * propio módulo. Un rol de mostrador sin acceso a Compras/Almacén no ve el
 * valor del depósito — antes tampoco lo veía, y no es este cambio el que
 * debería dárselo.
 */
const CLAVES_INVENTARIO = [
  'compras.productos', 'compras.facturacion', 'compras.historial', 'compras.catalogos',
  'almacen.existencias', 'almacen.operaciones',
];

/** Va adentro del Provider porque el botón Actualizar recarga EL STORE de inventario. */
function ResumenInventarioConRefresh() {
  const { store } = useProductos();
  const [refreshing, setRefreshing] = useState(false);

  const refrescar = async () => {
    setRefreshing(true);
    try { await store.refetch(); } finally { setRefreshing(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={refrescar}
          disabled={refreshing || !store.loaded}
        >
          Actualizar inventario
        </Button>
      </div>
      {store.loaded ? <ResumenInventario /> : <FullScreenLoader label="Cargando datos…" />}
    </div>
  );
}

export function DashboardPage() {
  const { can } = usePermissions();
  const { planIncluye } = usePlan();
  const veInventario = CLAVES_INVENTARIO.some((clave) => can(clave));
  const veVentas = can('ventas.listado') || can('ventas.caja');
  const veCobranzas = can('ventas.cobranzas');
  const cobranzasEnElPlan = planIncluye('ventas.cobranzas');
  const vePresupuestos = can('ventas.presupuestos');
  const presupuestosEnElPlan = planIncluye('ventas.presupuestos');
  const veTransferencias = can('almacen.transferencias');
  const transferenciasEnElPlan = planIncluye('almacen.transferencias');

  const bloqueadasPorPlan = [
    ...(veCobranzas && !cobranzasEnElPlan ? ['las cobranzas pendientes'] : []),
    ...(vePresupuestos && !presupuestosEnElPlan ? ['los presupuestos'] : []),
    ...(veTransferencias && !transferenciasEnElPlan ? ['las transferencias pendientes'] : []),
  ];

  if (!veInventario && !veVentas && !veCobranzas && !vePresupuestos && !veTransferencias) {
    return (
      <div className={styles.page}>
        <PageHeader title="Dashboard" subtitle="El estado del negocio, en una pantalla" />
        <p className={styles.sinAcceso}>
          Tu usuario no tiene acceso a ningún resumen. Entrá por el menú al módulo con el que
          trabajás.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Dashboard" subtitle="El estado del negocio, en una pantalla" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--crm-space-6)' }}>
        {veVentas && <ResumenVentasHoy />}
        {veCobranzas && cobranzasEnElPlan && <ResumenCobranzas />}
        {vePresupuestos && presupuestosEnElPlan && <ResumenPresupuestos />}
        {veTransferencias && transferenciasEnElPlan && <ResumenTransferencias />}
        <TeaserPymes items={bloqueadasPorPlan} />
        {veInventario && (
          <ProductosProvider panels={[]}>
            <ResumenInventarioConRefresh />
          </ProductosProvider>
        )}
      </div>
    </div>
  );
}
