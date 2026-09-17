import { useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import WarehousePicker from "./components/WarehousePicker";
import MovementBadge from "./components/MovementBadge";
import { getMovements, getSku } from "./api/inventoryApi";
import { getOrderIdForReceipt } from "../abastecimiento/api/supplyApi";
import { MOVEMENT_TYPES, refLabel } from "./lib/movements";
import { formatDateTime } from "./lib/time";
import "./Movimientos.css";

// La Recepción no tiene ruta propia (vive dentro del detalle de la OC en Abastecimiento) —
// por eso resuelve a la Orden de Compra que la originó en vez de a sí misma.
const REF_ROUTE = {
  order: (id) => `/pedidos/${id}`,
  transfer: (id) => `/inventario/transferencias/${id}`,
  receipt: (id) => {
    const orderId = getOrderIdForReceipt(id);
    return orderId ? `/abastecimiento/ordenes-compra/${orderId}` : null;
  },
};

const Movimientos = () => {
  const [params, setParams] = useSearchParams();
  const skuId = params.get("skuId") || "";
  const [location, setLocation] = useState({ branchId: null, warehouseId: null });
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");

  const skuFilterLabel = skuId ? getSku(skuId)?.name : null;

  const rows = useMemo(
    () => getMovements({ skuId: skuId || undefined, warehouseId: location.warehouseId, search, type: type || undefined })
      .map((m) => ({ ...m, id: m.id })),
    [skuId, location, search, type]
  );

  const columns = [
    {
      field: "at",
      headerName: "Fecha",
      renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.at)}</span>,
    },
    {
      field: "name",
      headerName: "Producto",
      width: "22%",
      renderCell: (row) => (
        <Box>
          <Typography variant="body2">{row.name}</Typography>
          <Typography variant="caption" className="mono text-tertiary">{row.sku}</Typography>
        </Box>
      ),
    },
    { field: "warehouseName", headerName: "Depósito", renderCell: (row) => <span className="text-secondary">{row.warehouseName}</span> },
    { field: "type", headerName: "Tipo", renderCell: (row) => <MovementBadge type={row.type} /> },
    {
      field: "qty",
      headerName: "Cantidad",
      align: "right",
      renderCell: (row) => (
        <span className={`inv-mov-qty ${row.qty > 0 ? "inv-mov-qty--pos" : row.qty < 0 ? "inv-mov-qty--neg" : "inv-mov-qty--neutral"}`}>
          {row.qty > 0 ? `+${row.qty}` : row.qty}
        </span>
      ),
    },
    {
      field: "balanceAfter",
      headerName: "Saldo",
      align: "right",
      renderCell: (row) => (
        <span className="inv-num">{row.balanceAfter}{row.counter === "reserved" ? " reserv." : ""}</span>
      ),
    },
    {
      field: "ref",
      headerName: "Referencia",
      renderCell: (row) => {
        if (!row.refType) return <span className="text-tertiary">—</span>;
        const routeFn = REF_ROUTE[row.refType];
        const label = `${refLabel(row.refType)} #${row.refId}`;
        const url = routeFn ? routeFn(row.refId) : null;
        return url ? (
          <RouterLink to={url} className="inv-mov-ref mono">{label}</RouterLink>
        ) : (
          <span className="text-tertiary mono">{label}</span>
        );
      },
    },
  ];

  const toolbar = (
    <Box className="table-toolbar">
      <TextField
        size="small"
        placeholder="Buscar por nombre o SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="table-toolbar__search"
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
      />
      <Box className="table-toolbar__filters">
        <WarehousePicker value={location} onChange={setLocation} />
        <Select size="small" displayEmpty value={type} onChange={(e) => setType(e.target.value)}>
          <MenuItem value="">Todos los tipos</MenuItem>
          {Object.entries(MOVEMENT_TYPES).map(([key, t]) => (
            <MenuItem key={key} value={key}>{t.label}</MenuItem>
          ))}
        </Select>
        {skuId && (
          <Button variant="ghost" size="small" startIcon={<CloseIcon />} onClick={() => setParams({})}>
            {skuFilterLabel || "SKU"}
          </Button>
        )}
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader title="Movimientos" subtitle="Kardex de inventario — bitácora inmutable de cada cambio de stock." />
      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay movimientos que coincidan con los filtros." />
    </Box>
  );
};

export default Movimientos;
