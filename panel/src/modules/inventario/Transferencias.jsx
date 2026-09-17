import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import { listTransfers, listWarehouses, listSkus, createTransfer } from "./api/inventoryApi";
import { TRANSFER_STATUS } from "./lib/transfers";
import { formatDateTime } from "./lib/time";
import "./Transferencias.css";

const emptyLine = () => ({ skuId: "", qtySent: "" });

const Transferencias = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [originId, setOriginId] = useState("");
  const [destId, setDestId] = useState("");
  const [lines, setLines] = useState([emptyLine()]);

  const warehouses = listWarehouses();
  const skus = listSkus();
  const rows = listTransfers().map((t) => ({ ...t, id: t.id }));

  useEffect(() => {
    const prefill = location.state;
    if (prefill?.originId || prefill?.skuId) {
      setOriginId(prefill.originId || "");
      setLines([{ skuId: prefill.skuId || "", qtySent: "" }]);
      setCreateOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setOriginId(""); setDestId(""); setLines([emptyLine()]);
    setCreateOpen(true);
  };

  const updateLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const handleSave = () => {
    try {
      const transfer = createTransfer({ originId, destId, lines });
      setCreateOpen(false);
      setTick((t) => t + 1);
      showToast("Transferencia creada en borrador", "success");
      navigate(`/inventario/transferencias/${transfer.id}`);
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const columns = [
    {
      field: "route",
      headerName: "Transferencia",
      width: "34%",
      renderCell: (row) => (
        <Box className="inv-transfer-route">
          <span>{row.originName}</span>
          <ArrowForwardOutlinedIcon />
          <span>{row.destName}</span>
        </Box>
      ),
    },
    { field: "lines", headerName: "Líneas", align: "right", renderCell: (row) => row.lines.length },
    {
      field: "status",
      headerName: "Estado",
      align: "center",
      renderCell: (row) => <StatusBadge {...TRANSFER_STATUS[row.status]} />,
    },
    { field: "sentAt", headerName: "Enviada", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.sentAt)}</span> },
    { field: "receivedAt", headerName: "Recibida", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.receivedAt)}</span> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Transferencias"
        subtitle="Movimientos de stock entre depósitos."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={openCreate}>Nueva transferencia</Button>}
      />

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => navigate(`/inventario/transferencias/${row.id}`)}
        emptyMessage="Todavía no se registraron transferencias."
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva transferencia"
        subtitle="Queda en Borrador hasta que la envíes — recién ahí resta del depósito de origen."
        maxWidth="md"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>Guardar borrador</Button>
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Select size="small" fullWidth displayEmpty value={originId} onChange={(e) => setOriginId(e.target.value)}>
              <MenuItem value="" disabled>Depósito origen…</MenuItem>
              {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
            <ArrowForwardOutlinedIcon sx={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <Select size="small" fullWidth displayEmpty value={destId} onChange={(e) => setDestId(e.target.value)}>
              <MenuItem value="" disabled>Depósito destino…</MenuItem>
              {warehouses.filter((w) => w.id !== originId).map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box component="span" className="form-label">Líneas</Box>
            {lines.map((line, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1 }}>
                <Select size="small" displayEmpty value={line.skuId} onChange={(e) => updateLine(i, { skuId: e.target.value })} sx={{ flex: 2 }}>
                  <MenuItem value="" disabled>SKU…</MenuItem>
                  {skus.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
                <TextField
                  size="small"
                  type="number"
                  placeholder="Cantidad"
                  value={line.qtySent}
                  onChange={(e) => updateLine(i, { qtySent: e.target.value })}
                  sx={{ flex: 1 }}
                />
                <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="quitar línea">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button variant="ghost" size="small" startIcon={<AddIcon />} onClick={addLine} sx={{ alignSelf: "flex-start" }}>
              Agregar línea
            </Button>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
};

export default Transferencias;
