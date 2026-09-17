import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";

import SearchIcon from "@mui/icons-material/Search";
import GetAppIcon from "@mui/icons-material/GetApp";
import VisibilityIcon from "@mui/icons-material/Visibility";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import { listOrders } from "./api/pedidosApi";
import { useToast } from "../../components/Toast/ToastContext";
import { orderDateLabel, money } from "./lib/time";
import "./Pedidos.css";

const TABS = ["Todos", "Pendientes de pago", "Para despachar", "Completados"];

/**
 * Exportar a CSV, como ya lo hacen Auditoría, Analytics e Integraciones.
 * El BOM hace que Excel lo abra en UTF-8 sin romper los acentos.
 */
const downloadCsv = (rows, filename) => {
  const cell = (v) => {
    const t = String(v ?? "");
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = rows.map((r) => r.map(cell).join(";")).join("\n");
  const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const Pedidos = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // La pestaña también va a la URL: "mirá los pendientes de pago" es un link,
  // no una instrucción de tres pasos.
  const { filtros, setFiltros } = useVistaGuardada("pedidos", { tab: 0, search: "" });
  const { tab, search } = filtros;

  let data = listOrders();
  if (tab === 1) data = data.filter((o) => o.paymentStatus === "Pendiente");
  if (tab === 2) data = data.filter((o) => o.fulfillmentStatus === "Sin despachar" && o.paymentStatus === "Pagado");
  if (tab === 3) data = data.filter((o) => o.fulfillmentStatus === "Entregado");
  const q = search.toLowerCase();
  if (q) data = data.filter((o) => o.id.includes(q) || o.customerName.toLowerCase().includes(q));

  const handleExport = () => {
    downloadCsv([
      ["Pedido", "Fecha", "Cliente", "Email", "Pago", "Logística", "Total"],
      ...data.map((o) => [
        o.id, o.createdAt, o.customerName, o.customerEmail,
        o.paymentStatus, o.fulfillmentStatus, o.total,
      ]),
    ], `pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`${data.length} pedido(s) exportado(s)`, "success");
  };

  const columns = [
    {
      field: "id",
      headerName: "Pedido",
      renderCell: (row) => <span className="pedido-id mono">#{row.id}</span>,
    },
    {
      field: "date",
      headerName: "Fecha",
      renderCell: (row) => <span className="text-tertiary nowrap">{orderDateLabel(row.createdAt)}</span>,
    },
    {
      field: "customer",
      headerName: "Cliente",
      width: "26%",
      renderCell: (row) => (
        <Box className="customer-cell">
          <Avatar className="customer-cell__avatar">{row.customerName.charAt(0)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="customer-cell__name">{row.customerName}</Typography>
            <Typography className="customer-cell__email">{row.customerEmail}</Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: "payment",
      headerName: "Pago",
      align: "center",
      renderCell: (row) => <StatusBadge status={row.paymentStatus} />,
    },
    {
      field: "fulfill",
      headerName: "Logística",
      align: "center",
      renderCell: (row) => <StatusBadge status={row.fulfillmentStatus} />,
    },
    {
      field: "total",
      headerName: "Total",
      align: "right",
      renderCell: (row) => <span className="pedido-total">{money(row.total)}</span>,
    },
    {
      field: "actions",
      headerName: "",
      align: "right",
      width: 56,
      renderCell: (row) => (
        <IconButton size="small" onClick={() => navigate(`/pedidos/${row.id}`)} aria-label="ver">
          <VisibilityIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const toolbar = (
    <>
      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setFiltros({ tab: v })} variant="scrollable" scrollButtons={false}>
          {TABS.map((t) => (
            <Tab key={t} label={t} />
          ))}
        </Tabs>
      </Box>
      <Box className="table-toolbar">
        <TextField
          size="small"
          placeholder="Buscar por # pedido o cliente…"
          value={search}
          onChange={(e) => setFiltros({ search: e.target.value })}
          className="table-toolbar__search"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {/* «Filtros avanzados» no abría nada. Los filtros de esta pantalla son
            las pestañas y la búsqueda; un botón que promete más y no lo da es
            peor que no estar. El contador dice qué se está viendo. */}
        <span className="pedidos-count">
          {data.length} de {listOrders().length} pedido(s)
        </span>
      </Box>
    </>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Pedidos"
        subtitle="Gestiona las compras, pagos y envíos."
        actions={
          <>
            <Button variant="secondary" startIcon={<GetAppIcon />} onClick={handleExport}>
              Exportar CSV
            </Button>
            {/* ⭐ El alta manual de pedidos NO existe: `pedidosApi` no exporta
                `createOrder`, y el único alta real del sistema es convertir una
                cotización del CRM (ver el encabezado de pedidosApi). Se dice. */}
            <Tooltip title="El alta manual de pedidos no existe como operación: el único alta real del sistema es convertir una cotización desde el CRM.">
              <span>
                <Button variant="primary" disabled>Crear pedido manual</Button>
              </span>
            </Tooltip>
          </>
        }
      />

      <DataTable
        toolbar={toolbar}
        columns={columns}
        data={data}
        // ⭐ Sin casillas: en esta pantalla la selección no disparaba ninguna
        // acción masiva (auditoría §7.7), y en mobile se llevaba la primera línea
        // de cada tarjeta. Una casilla que no lleva a ninguna acción es ruido.
        onRowClick={(row) => navigate(`/pedidos/${row.id}`)}
        emptyMessage="No hay pedidos en esta vista."
      />
    </Box>
  );
};

export default Pedidos;
