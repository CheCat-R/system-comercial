import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import AddIcon from "@mui/icons-material/Add";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { listPhysicalCounts, createPhysicalCount, listWarehouses, listSkus } from "./api/inventoryApi";
import { COUNT_STATUS, SCOPE_LABELS } from "./lib/physicalCounts";
import { formatDateTime } from "./lib/time";
import "./InventarioFisico.css";

const categories = [...new Set(listSkus().map((s) => s.category))];

const InventarioFisico = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [modal, setModal] = useState(null);

  const rows = listPhysicalCounts().map((c) => ({ ...c, id: c.id }));

  const openCreate = () => setModal({ warehouseId: "", scope: "total", scopeValue: "" });

  const handleCreate = () => {
    try {
      const count = createPhysicalCount(modal);
      setModal(null);
      setTick((t) => t + 1);
      showToast("Conteo planificado", "success");
      navigate(`/inventario/fisico/${count.id}`);
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const columns = [
    { field: "id", headerName: "Conteo", renderCell: (row) => <span className="mono">{row.id}</span> },
    { field: "warehouseName", headerName: "Depósito" },
    { field: "scope", headerName: "Alcance", renderCell: (row) => `${SCOPE_LABELS[row.scope]}${row.scopeValue ? ` · ${row.scopeValue}` : ""}` },
    { field: "lines", headerName: "SKUs", align: "right", renderCell: (row) => row.lines.length },
    { field: "diffCount", headerName: "Diferencias", align: "right", renderCell: (row) => (row.status === "planificado" || row.status === "en_conteo" ? "—" : row.diffCount) },
    { field: "createdAt", headerName: "Fecha", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.createdAt)}</span> },
    { field: "createdBy", headerName: "Responsable", renderCell: (row) => <span className="text-secondary">{row.createdBy}</span> },
    { field: "status", headerName: "Estado", align: "center", renderCell: (row) => <StatusBadge {...COUNT_STATUS[row.status]} /> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Inventario físico"
        subtitle="Conteos totales o cíclicos — las diferencias generan ajustes automáticos al cerrar."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={openCreate}>Planificar conteo</Button>}
      />

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/inventario/fisico/${row.id}`)}
        emptyMessage="Todavía no se planificó ningún conteo."
      />

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title="Planificar conteo"
        subtitle="Al confirmar se congela el stock de sistema de los SKUs incluidos."
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" onClick={handleCreate}>Planificar</Button></>}
      >
        {modal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Select size="small" fullWidth displayEmpty value={modal.warehouseId} onChange={(e) => setModal({ ...modal, warehouseId: e.target.value })}>
              <MenuItem value="" disabled>Depósito…</MenuItem>
              {listWarehouses().map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
            <Select size="small" fullWidth value={modal.scope} onChange={(e) => setModal({ ...modal, scope: e.target.value, scopeValue: "" })}>
              {Object.entries(SCOPE_LABELS).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
            </Select>
            {modal.scope === "categoria" && (
              <Select size="small" fullWidth displayEmpty value={modal.scopeValue} onChange={(e) => setModal({ ...modal, scopeValue: e.target.value })}>
                <MenuItem value="" disabled>Categoría…</MenuItem>
                {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            )}
            {modal.scope === "muestra" && (
              <TextField
                size="small" fullWidth type="number" label="Cantidad de SKUs a muestrear"
                value={modal.scopeValue} onChange={(e) => setModal({ ...modal, scopeValue: e.target.value })}
              />
            )}
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default InventarioFisico;
