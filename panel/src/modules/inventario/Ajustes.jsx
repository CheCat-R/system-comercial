import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { listAdjustments, getAdjustment, createAdjustment, listWarehouses, listSkus, valueOfAdjustment } from "./api/inventoryApi";
// ⭐ El grado de esta operación lo declara el catálogo de permisos, no esta
// pantalla; acá sólo se muestra lo que ya está decidido (§2.10).
import { GradeNotice } from "../seguridad/components/ReasonDialog";
import { escalate, THRESHOLDS } from "../seguridad/api/securityApi";
import { ADJUSTMENT_REASONS } from "./lib/movements";
import { formatDateTime } from "./lib/time";
import "./Ajustes.css";

const emptyLine = () => ({ skuId: "", delta: "", note: "" });

const Ajustes = () => {
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [, setTick] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState("correccion_conteo");
  const [reasonDetail, setReasonDetail] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [detailId, setDetailId] = useState(null);

  const warehouses = listWarehouses();
  const skus = listSkus();
  const rows = listAdjustments().map((a) => ({ ...a, id: a.id }));
  const detail = detailId ? getAdjustment(detailId) : null;

  useEffect(() => {
    const wh = params.get("warehouseId");
    const sku = params.get("skuId");
    if (wh || sku) {
      setWarehouseId(wh || "");
      setLines([{ skuId: sku || "", delta: "", note: "" }]);
      setCreateOpen(true);
      setParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setWarehouseId("");
    setReason("correccion_conteo");
    setReasonDetail("");
    setLines([emptyLine()]);
    setCreateOpen(true);
  };

  const updateLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  // ⭐ La valorización se calcula mientras se escribe: la pantalla dice **antes
  // de guardar** si este ajuste se aplica o si va a quedar esperando una firma.
  const cleanLines = lines.filter((l) => l.skuId && Number(l.delta)).map((l) => ({ ...l, delta: Number(l.delta) }));
  const adjustmentValue = valueOfAdjustment(cleanLines);
  const action = escalate("ajuste", adjustmentValue > THRESHOLDS.ajuste.amount);

  const handleSave = () => {
    try {
      createAdjustment({ warehouseId, reason, detail: reasonDetail, lines: cleanLines });
      setCreateOpen(false);
      setTick((t) => t + 1);
      showToast("Ajuste registrado", "success");
    } catch (err) {
      if (err.queued) {
        setCreateOpen(false);
        setTick((t) => t + 1);
        showToast(err.message, "info");
        return;
      }
      showToast(err.message, "warning");
    }
  };

  const columns = [
    { field: "at", headerName: "Fecha", renderCell: (row) => <span className="text-tertiary nowrap">{formatDateTime(row.at)}</span> },
    { field: "warehouseName", headerName: "Depósito" },
    { field: "reason", headerName: "Motivo", renderCell: (row) => ADJUSTMENT_REASONS[row.reason] || row.reason },
    { field: "lines", headerName: "Líneas", align: "right", renderCell: (row) => row.lines.length },
    {
      field: "netQty",
      headerName: "Neto",
      align: "right",
      renderCell: (row) => (
        <span className={`inv-adj-net ${row.netQty >= 0 ? "inv-adj-net--pos" : "inv-adj-net--neg"}`}>
          {row.netQty > 0 ? `+${row.netQty}` : row.netQty}
        </span>
      ),
    },
    { field: "createdBy", headerName: "Autor", renderCell: (row) => <span className="text-secondary">{row.createdBy}</span> },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Ajustes"
        subtitle="Correcciones manuales de stock — rotura, vencimiento, merma o corrección de conteo."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={openCreate}>Nuevo ajuste</Button>}
      />

      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => setDetailId(row.id)}
        emptyMessage="Todavía no se registraron ajustes."
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo ajuste de stock"
        subtitle="Una vez guardado, el ajuste queda en el kardex y no se puede editar."
        maxWidth="md"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Permitido permiso="inventario.ajustar">
              <Button variant="primary" onClick={handleSave}>Guardar ajuste</Button>
            </Permitido>
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Select size="small" fullWidth displayEmpty value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <MenuItem value="" disabled>Depósito…</MenuItem>
              {warehouses.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
            <Select size="small" fullWidth value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(ADJUSTMENT_REASONS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2" className="form-label" sx={{ mb: 0 }}>Líneas</Typography>
            {lines.map((line, i) => (
              <Box key={i} className="inv-adj-line">
                <Select size="small" displayEmpty value={line.skuId} onChange={(e) => updateLine(i, { skuId: e.target.value })}>
                  <MenuItem value="" disabled>SKU…</MenuItem>
                  {skus.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
                <TextField
                  size="small"
                  type="number"
                  placeholder="± cantidad"
                  value={line.delta}
                  onChange={(e) => updateLine(i, { delta: e.target.value })}
                />
                <TextField
                  size="small"
                  placeholder="Nota (opcional)"
                  value={line.note}
                  onChange={(e) => updateLine(i, { note: e.target.value })}
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

          {/* ⭐ El motivo tipificado dice la categoría, no el hecho: «Rotura» no
              le sirve a nadie dentro de seis meses. El kardex se queda con el
              código y la auditoría con la frase. */}
          <TextField
            multiline
            minRows={2}
            fullWidth
            size="small"
            label="Qué pasó"
            placeholder="Escribilo para quien lo lea dentro de seis meses: «se mojaron 3 cajas por una filtración en el depósito norte»."
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
          />

          <GradeNotice
            action={action}
            extra={cleanLines.length > 0 && (
              <Box className="sec-row">
                <span className="sec-chip">
                  valorizado en ${Math.round(adjustmentValue).toLocaleString("es-AR")}
                </span>
                <span className="sec-chip">
                  umbral: {THRESHOLDS.ajuste.label}
                </span>
              </Box>
            )}
          />
        </Box>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={detail?.id}
        subtitle={detail ? `${detail.warehouseName} · ${ADJUSTMENT_REASONS[detail.reason]} · ${formatDateTime(detail.at)}` : ""}
      >
        {detail && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {detail.lines.map((l, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: "space-between", gap: 2, borderBottom: "1px solid var(--border-subtle)", pb: 1.5 }}>
                <Box>
                  <Typography variant="body2">{l.name}</Typography>
                  {l.note && <Typography variant="caption" color="text.secondary">{l.note}</Typography>}
                </Box>
                <span className={`inv-adj-net ${l.delta >= 0 ? "inv-adj-net--pos" : "inv-adj-net--neg"}`}>
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </span>
              </Box>
            ))}
            <Typography variant="caption" color="text.secondary">Registrado por {detail.createdBy}.</Typography>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Ajustes;
