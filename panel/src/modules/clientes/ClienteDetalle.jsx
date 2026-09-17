import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import CustomerHeader from "./components/CustomerHeader";
import ActivityTimeline from "./components/ActivityTimeline";
import ActivityTab from "./components/ActivityTab";
import AddressesTab from "./components/AddressesTab";
import SegmentacionTab from "./components/SegmentacionTab";
import VentasTab from "./components/VentasTab";
import RfmScorecard from "./components/RfmScorecard";
import ValuePanel from "./components/ValuePanel";
import TagEditor from "./components/TagEditor";

import {
  getAccount, getAccountOrders, getOrderSummary,
  getActivities, getSegmentAverages,
} from "./api/clientsApi";
import { getAccountMarketingActivity, getAccountLoyaltyActivity } from "../marketing/api/marketingApi";
import { money, formatDate } from "./lib/time";
import "./ClienteDetalle.css";

const TABS = ["Resumen", "Historial", "Pedidos", "Ventas", "Actividad", "Direcciones", "Segmentación"];

const orderColumns = [
  { field: "id", headerName: "Pedido", renderCell: (o) => <span className="mono" style={{ fontWeight: 600 }}>#{o.id}</span> },
  { field: "date", headerName: "Fecha", renderCell: (o) => <span className="text-tertiary nowrap">{formatDate(o.date)}</span> },
  {
    field: "payment", headerName: "Pago", align: "center",
    renderCell: (o) => <StatusBadge status={{ paid: "Pagado", pending: "Pendiente", refunded: "Reembolsado" }[o.paymentStatus]} />,
  },
  {
    field: "fulfillment", headerName: "Logística", align: "center",
    renderCell: (o) => <StatusBadge status={{ unfulfilled: "Sin despachar", shipped: "Despachado", delivered: "Entregado", returned: "Devuelto" }[o.fulfillmentStatus]} />,
  },
  { field: "total", headerName: "Total", align: "right", renderCell: (o) => <span style={{ fontWeight: 600 }}>{money(o.total)}</span> },
];

const ClienteDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const account = useMemo(() => getAccount(id), [id, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orders = useMemo(() => getAccountOrders(id), [id, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activities = useMemo(() => getActivities(id, [...getAccountMarketingActivity(id), ...getAccountLoyaltyActivity(id)]), [id, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orderSummary = useMemo(() => getOrderSummary(id), [id, version]);

  if (!account) {
    return (
      <Box className="page">
        <Typography variant="h5" fontWeight={700}>Cliente no encontrado</Typography>
        <Button variant="secondary" onClick={() => navigate("/clientes")} sx={{ mt: 2 }}>
          Volver a Clientes
        </Button>
      </Box>
    );
  }

  const m = account.metrics;
  const segAverages = getSegmentAverages(m.segmentKey, account.id);

  return (
    <Box className="page fade-in">
      <IconButton className="entity-back" onClick={() => navigate("/clientes")} aria-label="volver">
        <ArrowBackIcon fontSize="small" />
      </IconButton>

      <CustomerHeader account={account} onEdit={() => showToast("Edición de cuenta — Fase 2", "info")} />

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons={false}>
          {TABS.map((t) => <Tab key={t} label={t} />)}
        </Tabs>
      </Box>

      {/* ---- RESUMEN ---- */}
      {tab === 0 && (
        <Box className="cd-grid">
          <Box className="cd-col">
            <Card className="entity-card">
              <Box className="card-title-row">
                <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Últimos pedidos</Typography>
                <Button variant="ghost" size="small" onClick={() => setTab(2)}>Ver todos</Button>
              </Box>
              <DataTable
                columns={orderColumns}
                data={orders.slice(0, 4)}
                onRowClick={(o) => navigate(`/pedidos/${o.id}`)}
                emptyMessage="Sin pedidos todavía."
              />
            </Card>

            <Card className="entity-card">
              <Box className="card-title-row">
                <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Actividad reciente</Typography>
                <Button variant="ghost" size="small" onClick={() => setTab(1)}>Ver historial</Button>
              </Box>
              <ActivityTimeline activities={activities} variant="compact" limit={5} />
            </Card>
          </Box>

          <Box className="cd-col cd-col--side">
            <Card className="entity-card">
              <Typography variant="h6" className="card-title">Valor del cliente</Typography>
              <ValuePanel metrics={m} segmentAverages={segAverages} />
            </Card>

            <Card className="entity-card">
              <Typography variant="h6" className="card-title">Segmento</Typography>
              <RfmScorecard metrics={m} />
            </Card>

            <Card className="entity-card">
              <Typography variant="h6" className="card-title">Etiquetas</Typography>
              <TagEditor account={account} onChange={refresh} />
            </Card>
          </Box>
        </Box>
      )}

      {/* ---- HISTORIAL ---- */}
      {tab === 1 && (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Historial completo</Typography>
          <ActivityTimeline activities={activities} variant="full" />
        </Card>
      )}

      {/* ---- PEDIDOS ---- */}
      {tab === 2 && (
        <Box className="cd-stack">
          <Box className="cd-orders-summary">
            <div><strong>{money(orderSummary.billed)}</strong><span>Total facturado</span></div>
            <div><strong>{orderSummary.ordersCount}</strong><span>Pedidos pagados</span></div>
            <div><strong>{money(orderSummary.aov)}</strong><span>Ticket promedio</span></div>
            <div>
              <strong className={orderSummary.returns ? "text-danger" : ""}>{orderSummary.returns}</strong>
              <span>Devoluciones ({orderSummary.returnRate}%)</span>
            </div>
          </Box>
          <DataTable
            columns={orderColumns}
            data={orders}
            onRowClick={(o) => navigate(`/pedidos/${o.id}`)}
            emptyMessage="Esta cuenta no tiene pedidos."
          />
        </Box>
      )}

      {/* ---- VENTAS ---- */}
      {tab === 3 && (
        <VentasTab account={account} onChange={refresh} />
      )}

      {/* ---- ACTIVIDAD ---- */}
      {tab === 4 && (
        <ActivityTab accountId={account.id} activities={activities} onChange={refresh} />
      )}

      {/* ---- DIRECCIONES ---- */}
      {tab === 5 && (
        <AddressesTab account={account} onChange={refresh} />
      )}

      {/* ---- SEGMENTACIÓN ---- */}
      {tab === 6 && (
        <SegmentacionTab account={account} activities={activities} onChange={refresh} />
      )}
    </Box>
  );
};

export default ClienteDetalle;
