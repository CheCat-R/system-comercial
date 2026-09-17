/**
 * Ventas — el embudo comercial.
 *
 * ⭐ Era la tercera pantalla scaffold del panel: `mockCotizaciones` con cuatro
 * filas escritas a mano ("Empresa ABC S.A.", "Tech Startup SRL"), `mockVendedores`
 * con objetivos inventados y cuatro KPIs literales, encima de un CRM que **ya
 * tiene** las cotizaciones reales y de una capa financiera que **ya calcula** las
 * comisiones por vendedor.
 *
 * ── ⭐ Ventas no es dueña de nada, y por eso esta pantalla lee ──────────
 *
 * El principio de ARCHITECTURE §1.2 separa Pedidos (transacciones ejecutadas) de
 * Ventas (canales, cotizaciones y fuerza de venta). En el panel, la cotización
 * vive en el CRM —es un hecho de la cuenta— y la comisión vive en Finanzas —es
 * un costo del P&L—. Ventas es **la vista que los junta**, no un módulo con
 * datos propios. Por eso acá no hay `data/` ni `api/` nuevo: hay dos lecturas.
 *
 * Lo único que se agregó en el camino fue `clientsApi.listQuotes()`: el CRM ya
 * tenía las cotizaciones pero sólo las exponía **por cuenta**, y esta pantalla
 * necesita verlas todas.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Avatar from "@mui/material/Avatar";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tooltip from "@mui/material/Tooltip";

import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import DonutLargeOutlinedIcon from "@mui/icons-material/DonutLargeOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import SearchIcon from "@mui/icons-material/Search";
import PersonIcon from "@mui/icons-material/Person";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";

import { listQuotes, getQuotesSummary } from "../clientes/api/clientsApi";
import { listCommissions, getPnlSummary } from "../finanzas/api/financeApi";
import "./Ventas.css";

const money = (v) => `$${Math.round(v || 0).toLocaleString("es-AR")}`;

const STAGE_TONE = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  converted: "success",
  lost: "danger",
};

const TABS = [
  { key: "", label: "Todas" },
  { key: "sent", label: "Enviadas" },
  { key: "accepted", label: "Aceptadas" },
  { key: "converted", label: "Convertidas" },
  { key: "lost", label: "Perdidas" },
];

const Ventas = () => {
  const navigate = useNavigate();
  const { filtros, setFiltros } = useVistaGuardada("ventas", { tab: 0, search: "" });
  const { tab, search } = filtros;

  const summary = useMemo(() => getQuotesSummary(), []);
  const pnl = useMemo(() => getPnlSummary(), []);
  const quotes = useMemo(
    () => listQuotes({ status: TABS[tab].key || undefined, search }),
    [tab, search]
  );

  /**
   * ⭐ El desempeño por vendedor sale del **devengado real de Finanzas**, no de
   * un objetivo inventado. Sin objetivos cargados en el sistema no se puede
   * dibujar una barra de cumplimiento, y dibujarla contra un número imaginario
   * es exactamente lo que esta pantalla hacía antes.
   */
  const vendedores = useMemo(() => {
    const rows = listCommissions({ kind: "vendedor" });
    const bySeller = new Map();
    rows.forEach((c) => {
      // `rateLabel` es el nombre de la tarifa del vendedor: es lo que Finanzas
      // usa para nombrarlo en su propio listado, así que las dos pantallas dicen
      // lo mismo.
      const key = c.rateLabel || "—";
      const e = bySeller.get(key) || { name: key, base: 0, commission: 0, orders: 0 };
      e.base += c.base || 0;
      e.commission += c.amount || 0;
      e.orders += 1;
      bySeller.set(key, e);
    });
    return [...bySeller.values()].sort((a, b) => b.base - a.base);
  }, []);

  const maxBase = Math.max(...vendedores.map((v) => v.base), 1);

  const columns = [
    {
      field: "id",
      headerName: "Cotización",
      width: 110,
      renderCell: (r) => <span className="mono nowrap" style={{ fontWeight: 600 }}>{r.id}</span>,
    },
    {
      field: "accountName",
      headerName: "Cliente",
      width: "26%",
      renderCell: (r) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Avatar className="ventas-client-avatar"><PersonIcon fontSize="small" /></Avatar>
          <Typography className="ventas-client-name">{r.accountName}</Typography>
        </Box>
      ),
    },
    { field: "sellerName", headerName: "Vendedor" },
    {
      field: "amount",
      headerName: "Importe",
      align: "right",
      renderCell: (r) => <span className="ventas-amount">{money(r.amount)}</span>,
    },
    {
      field: "status",
      headerName: "Estado",
      align: "center",
      renderCell: (r) => (
        <StatusBadge tone={STAGE_TONE[r.status] || "neutral"} label={r.stageMeta.label} />
      ),
    },
    {
      field: "createdAt",
      headerName: "Creada",
      renderCell: (r) => (
        <span className="text-tertiary nowrap">
          {new Date(r.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
        </span>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Ventas"
        subtitle="Cotizaciones y fuerza de venta. La cotización vive en el CRM y la comisión en Finanzas: acá se leen juntas."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate("/clientes")}>
              Ir a Clientes
            </Button>
            {/* El alta de cotización todavía no existe como operación: el CRM
                sólo sabe convertir una existente en pedido. Se dice. */}
            <Tooltip title="Crear una cotización todavía no existe como operación: el CRM sólo puede convertir una cotización existente en pedido (clientsApi.convertQuoteToOrder).">
              <span>
                <Button variant="primary" disabled>Nueva cotización</Button>
              </span>
            </Tooltip>
          </>
        )}
      />

      {/* ------------------------------------------------------- KPIs */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatCard
            title="Ingreso neto realizado"
            value={money(pnl.revenueNet)}
            icon={<PaymentsOutlinedIcon />}
            hint={`${pnl.orders} pedido(s) computados`}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatCard
            title="Cotizaciones abiertas"
            value={String(summary.open)}
            icon={<RequestQuoteOutlinedIcon />}
            hint={`${money(summary.openAmount)} en el embudo`}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <Tooltip title="Convertidas sobre el total de cotizaciones ya decididas (convertidas + perdidas). Las abiertas no cuentan: todavía no perdieron.">
            <span style={{ display: "block" }}>
              <StatCard
                title="Tasa de cierre"
                value={summary.winRate == null ? "—" : `${(summary.winRate * 100).toFixed(0)} %`}
                icon={<DonutLargeOutlinedIcon />}
                hint={`${summary.won} ganada(s) de ${summary.decided} ya decidida(s)`}
              />
            </span>
          </Tooltip>
        </Grid>
        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
          <StatCard
            title="Vendedores con devengado"
            value={String(vendedores.length)}
            icon={<GroupsOutlinedIcon />}
            hint="según las comisiones de Finanzas"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {/* ------------------------------------------------- embudo */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Embudo</Typography>
            {summary.byStage.map((s) => (
              <div className="ventas-stage" key={s.key}>
                <StatusBadge tone={STAGE_TONE[s.key] || "neutral"} label={s.label} showDot={false} />
                <span className="ventas-stage__count">{s.count}</span>
                <span className="ventas-stage__amount">{money(s.amount)}</span>
              </div>
            ))}
          </Card>

          <Card className="entity-card mt-3">
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
                Fuerza de venta
              </Typography>
              <Button variant="ghost" onClick={() => navigate("/finanzas/comisiones")}>
                Comisiones →
              </Button>
            </Box>

            {vendedores.length === 0 ? (
              <Typography variant="body2" className="text-tertiary">
                Ninguna venta devengó comisión todavía. Se devenga con la venta B2B concretada, no
                con la cotización.
              </Typography>
            ) : vendedores.map((v) => (
              <div className="ventas-seller" key={v.name}>
                <span className="ventas-seller__name">{v.name}</span>
                <span className="ventas-seller__track">
                  <span
                    className="ventas-seller__bar"
                    style={{ width: `${Math.max(2, (v.base / maxBase) * 100)}%` }}
                  />
                </span>
                <span className="ventas-seller__value">
                  {money(v.base)}
                  <em>{v.orders} venta(s) · {money(v.commission)} de comisión</em>
                </span>
              </div>
            ))}
          </Card>
        </Grid>

        {/* --------------------------------------------- cotizaciones */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card className="entity-card ventas-table-card">
            <Tabs
              value={tab}
              onChange={(_, v) => setFiltros({ tab: v })}
              className="table-tabs"
              variant="scrollable"
              scrollButtons="auto"
            >
              {TABS.map((t) => <Tab key={t.key || "all"} label={t.label} />)}
            </Tabs>

            <DataTable
              toolbar={(
                <Box className="table-toolbar">
                  <TextField
                    size="small"
                    placeholder="Buscar por cliente, vendedor o número…"
                    value={search}
                    onChange={(e) => setFiltros({ search: e.target.value })}
                    className="table-toolbar__search"
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>
              )}
              columns={columns}
              data={quotes}
              onRowClick={(row) => navigate(`/clientes/${row.accountId}`)}
              emptyState={{
                icon: <RequestQuoteOutlinedIcon />,
                title: TABS[tab].key
                  ? `No hay cotizaciones ${TABS[tab].label.toLowerCase()}`
                  : "Todavía no hay cotizaciones",
                description: "Las cotizaciones se cargan en la ficha de cada cuenta del CRM, y desde"
                  + " ahí se convierten en pedido.",
                action: <Button variant="ghost" onClick={() => navigate("/clientes")}>Ir a Clientes</Button>,
              }}
            />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Ventas;
