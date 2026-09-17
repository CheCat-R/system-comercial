import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Avatar from "@mui/material/Avatar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";

import SearchIcon from "@mui/icons-material/Search";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import EqualizerOutlinedIcon from "@mui/icons-material/EqualizerOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import useVistaGuardada from "../../hooks/useVistaGuardada";
import Button from "../../components/Button/Button";
import StatCard from "../../components/Cards/StatCard/StatCard";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import WarehousePicker from "./components/WarehousePicker";
import StockLevelBadge from "./components/StockLevelBadge";
import StockMinMaxEditor from "./components/StockMinMaxEditor";
import { getStockLevels, getStockGroupedBySku, getPortfolioSummary, setThresholds, setThresholdsBulk } from "./api/inventoryApi";
import { money } from "./lib/time";
import "./Stock.css";

const STATUS_TABS = [
  { key: "", label: "Todos" },
  { key: "bajo_minimo", label: "Bajo mínimo" },
  { key: "critico", label: "Crítico" },
  { key: "agotado", label: "Agotado" },
];

const Stock = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [location, setLocation] = useState({ branchId: null, warehouseId: null });
  const { filtros, setFiltros } = useVistaGuardada("stock", { search: "", tab: 0 });
  const { search, tab: statusTab } = filtros;
  const [grouped, setGrouped] = useState(false);
  const [selected, setSelected] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [editorRows, setEditorRows] = useState([]);
  const [breakdownRow, setBreakdownRow] = useState(null);

  const summary = getPortfolioSummary();

  const filters = useMemo(
    () => ({ ...location, search, status: STATUS_TABS[statusTab].key || undefined }),
    [location, search, statusTab]
  );

  const rows = grouped ? getStockGroupedBySku(filters) : getStockLevels(filters);

  const rowId = (r) => (grouped ? r.skuId : `${r.skuId}::${r.warehouseId}`);
  const rowsWithId = rows.map((r) => ({ ...r, id: rowId(r) }));

  const kpis = [
    { title: "Valor total de inventario", value: money(summary.totalValue), icon: <Inventory2OutlinedIcon /> },
    { title: "SKUs bajo mínimo", value: String(summary.belowMin), icon: <WarningAmberOutlinedIcon /> },
    { title: "SKUs agotados", value: String(summary.outOfStock), icon: <ErrorOutlineOutlinedIcon /> },
    { title: "Unidades reservadas", value: String(summary.totalReserved), icon: <EqualizerOutlinedIcon /> },
  ];

  const handleMenuOpen = (e, row) => { setAnchor(e.currentTarget); setActiveRow(row); };
  const handleMenuClose = () => { setAnchor(null); setActiveRow(null); };

  const saveThresholds = ({ minStock, safetyStock }) => {
    if (editorRows.length === 1) {
      setThresholds(editorRows[0].skuId, editorRows[0].warehouseId, { minStock, safetyStock });
    } else {
      setThresholdsBulk(editorRows.map((r) => ({ skuId: r.skuId, warehouseId: r.warehouseId })), { minStock, safetyStock });
    }
    setEditorRows([]);
    setSelected([]);
    showToast("Mínimo y seguridad actualizados", "success");
  };

  const baseColumns = [
    {
      field: "name",
      headerName: "Producto",
      width: "26%",
      renderCell: (row) => (
        <Box className="inv-sku-cell">
          <Avatar variant="rounded" className="inv-sku-cell__thumb">{row.name.charAt(0)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="inv-sku-cell__name">{row.name}</Typography>
            <Typography className="inv-sku-cell__sku mono">{row.sku}</Typography>
          </Box>
        </Box>
      ),
    },
  ];

  const groupedExtraColumns = [
    {
      field: "breakdown",
      headerName: "Depósitos",
      renderCell: (row) => (
        <span className="text-tertiary">{row.breakdown.length} depósito{row.breakdown.length === 1 ? "" : "s"}</span>
      ),
    },
  ];

  const warehouseColumn = {
    field: "warehouseName",
    headerName: "Depósito",
    renderCell: (row) => (
      <Box>
        <Typography className="inv-warehouse-cell__name">{row.warehouseName}</Typography>
        <Typography className="inv-warehouse-cell__branch">{row.branchName}</Typography>
      </Box>
    ),
  };

  const numericColumns = [
    { field: "onHand", headerName: "On hand", align: "right", renderCell: (row) => <span className="inv-num">{row.onHand}</span> },
    { field: "reserved", headerName: "Reservado", align: "right", renderCell: (row) => <span className="inv-num">{row.reserved || "—"}</span> },
    { field: "available", headerName: "Disponible", align: "right", renderCell: (row) => <span className="inv-available">{row.available}</span> },
  ];

  const ungroupedThresholdColumns = [
    { field: "minStock", headerName: "Mínimo", align: "right", renderCell: (row) => <span className="inv-num">{row.minStock}</span> },
    { field: "safetyStock", headerName: "Seguridad", align: "right", renderCell: (row) => <span className="inv-num">{row.safetyStock}</span> },
  ];

  const statusColumn = {
    field: "status",
    headerName: "Estado",
    align: "center",
    renderCell: (row) => <StockLevelBadge status={row.status} size="sm" />,
  };

  const actionsColumn = {
    field: "actions",
    headerName: "",
    align: "right",
    width: 56,
    renderCell: (row) => (
      <IconButton size="small" onClick={(e) => handleMenuOpen(e, row)} aria-label="acciones">
        <MoreVertIcon fontSize="small" />
      </IconButton>
    ),
  };

  const columns = grouped
    ? [...baseColumns, ...groupedExtraColumns, ...numericColumns, statusColumn]
    : [...baseColumns, warehouseColumn, ...numericColumns, ...ungroupedThresholdColumns, statusColumn, actionsColumn];

  const toolbar = (
    <>
      <Box className="table-tabs">
        <Tabs value={statusTab} onChange={(_, v) => setFiltros({ tab: v })} variant="scrollable" scrollButtons={false}>
          {STATUS_TABS.map((t) => <Tab key={t.key} label={t.label} />)}
        </Tabs>
      </Box>
      <Box className="table-toolbar">
        <TextField
          size="small"
          placeholder="Buscar por nombre o SKU…"
          value={search}
          onChange={(e) => setFiltros({ search: e.target.value })}
          className="table-toolbar__search"
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        />
        <Box className="table-toolbar__filters">
          <WarehousePicker value={location} onChange={setLocation} />
        </Box>
        <Button
          variant={grouped ? "primary" : "secondary"}
          size="small"
          startIcon={grouped ? <ViewListOutlinedIcon /> : <LayersOutlinedIcon />}
          onClick={() => { setGrouped((g) => !g); setSelected([]); }}
        >
          {grouped ? "Ver por depósito" : "Agrupar por SKU"}
        </Button>
      </Box>
    </>
  );

  const bulkToolbar = (
    <Box className="inv-bulk-bar">
      <Typography variant="body2">
        <strong>{selected.length}</strong> {selected.length === 1 ? "fila seleccionada" : "filas seleccionadas"}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="ghost" size="small" onClick={() => setSelected([])}>Deseleccionar</Button>
        <Button
          variant="primary"
          size="small"
          startIcon={<TuneOutlinedIcon />}
          onClick={() => setEditorRows(rowsWithId.filter((r) => selected.includes(r.id)))}
        >
          Editar mínimos
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader title="Inventario" subtitle="Stock disponible y reservado por sucursal y depósito." />

      <Grid container spacing={2.5}>
        {kpis.map((k) => (
          <Grid key={k.title} size={{ xs: 12, sm: 6, lg: 3 }}>
            <StatCard {...k} />
          </Grid>
        ))}
      </Grid>

      <DataTable
        toolbar={!grouped && selected.length > 0 ? bulkToolbar : toolbar}
        columns={columns}
        data={rowsWithId}
        selectable={!grouped}
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowClick={(row) => (grouped ? setBreakdownRow(row) : undefined)}
        emptyMessage="No hay stock que coincida con los filtros."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={handleMenuClose}>
        <MenuItem onClick={() => { navigate(`/inventario/movimientos?skuId=${activeRow.skuId}`); handleMenuClose(); }}>
          <ListItemIcon><HistoryOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ver movimientos</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { navigate(`/inventario/ajustes?skuId=${activeRow.skuId}&warehouseId=${activeRow.warehouseId}`); handleMenuClose(); }}>
          <ListItemIcon><Inventory2OutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Ajustar stock</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { navigate("/inventario/transferencias", { state: { skuId: activeRow.skuId, originId: activeRow.warehouseId } }); handleMenuClose(); }}>
          <ListItemIcon><SwapHorizOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Transferir</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setEditorRows([{ ...activeRow, id: rowId(activeRow) }]); handleMenuClose(); }}>
          <ListItemIcon><TuneOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Editar mínimo y seguridad</ListItemText>
        </MenuItem>
      </Menu>

      <StockMinMaxEditor
        open={editorRows.length > 0}
        onClose={() => setEditorRows([])}
        rows={editorRows}
        onSave={saveThresholds}
      />

      <Modal
        open={Boolean(breakdownRow)}
        onClose={() => setBreakdownRow(null)}
        title={breakdownRow?.name}
        subtitle={`${breakdownRow?.sku} · desglose por depósito`}
      >
        {breakdownRow && (
          <table className="line-table inv-breakdown-table">
            <thead>
              <tr><th>Depósito</th><th>On hand</th><th>Reservado</th><th>Disponible</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {breakdownRow.breakdown.map((b) => (
                <tr key={b.warehouseId}>
                  <td>{b.warehouseName}</td>
                  <td>{b.onHand}</td>
                  <td>{b.reserved || "—"}</td>
                  <td>{b.available}</td>
                  <td><StockLevelBadge status={b.status} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </Box>
  );
};

export default Stock;
