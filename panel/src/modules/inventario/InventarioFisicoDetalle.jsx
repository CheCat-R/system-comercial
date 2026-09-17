import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";


import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import { useToast } from "../../components/Toast/ToastContext";
import {
  getPhysicalCount, startPhysicalCount, updateCountLines, submitCountForReview, closePhysicalCount, getSku,
} from "./api/inventoryApi";
import { COUNT_STATUS, COUNT_STEPS, SCOPE_LABELS } from "./lib/physicalCounts";
import { formatDateTime, money } from "./lib/time";
import "./InventarioFisicoDetalle.css";

const InventarioFisicoDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [draft, setDraft] = useState({});

  const count = getPhysicalCount(id);

  if (!count) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró el conteo {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/inventario/fisico")}>Volver</Button>
      </Box>
    );
  }

  const stepIndex = COUNT_STEPS.indexOf(count.status);

  const handleStart = () => {
    startPhysicalCount(count.id);
    setTick((t) => t + 1);
    showToast("Conteo iniciado — cargá las cantidades contadas", "success");
  };

  const setLineDraft = (skuId, value) => setDraft((d) => ({ ...d, [skuId]: value }));

  const saveDraft = () => {
    const updates = Object.entries(draft).map(([skuId, qtyContada]) => ({ skuId, qtyContada }));
    if (updates.length > 0) updateCountLines(count.id, updates);
    return updates.length > 0;
  };

  const handleSaveProgress = () => {
    const saved = saveDraft();
    setDraft({});
    setTick((t) => t + 1);
    if (saved) showToast("Progreso guardado", "success");
  };

  const handleSubmitForReview = () => {
    saveDraft();
    setDraft({});
    try {
      submitCountForReview(count.id);
      setTick((t) => t + 1);
      showToast("Conteo enviado a revisión", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleClose = () => {
    const result = closePhysicalCount(count.id);
    setTick((t) => t + 1);
    showToast(
      result.adjustmentId ? `Conteo cerrado — se generó el ajuste ${result.adjustmentId}` : "Conteo cerrado sin diferencias",
      "success"
    );
  };

  const diffLines = count.lines.filter((l) => l.diff);
  const unitsDiff = diffLines.reduce((s, l) => s + Math.abs(l.diff), 0);
  const valueDiff = diffLines.reduce((s, l) => s + l.diff * (getSku(l.skuId)?.cost || 0), 0);

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`Conteo ${count.id}`}
        subtitle={`${count.warehouseName} · ${SCOPE_LABELS[count.scope]}${count.scopeValue ? ` · ${count.scopeValue}` : ""}`}
        below={(
          <Box className="inv-pipeline">
            {COUNT_STEPS.map((step, i) => (
              <span key={step} className={`inv-pipeline__step ${i < stepIndex ? "inv-pipeline__step--done" : i === stepIndex ? "inv-pipeline__step--current" : ""}`}>
                {COUNT_STATUS[step].label}
              </span>
            ))}
          </Box>
        )}
        onBack={() => navigate("/inventario/fisico")}
        backLabel="Volver a inventario físico"
        actions={(
          <>
            {count.status === "planificado" && <Button variant="primary" onClick={handleStart}>Iniciar conteo</Button>}
            {count.status === "en_conteo" && (
              <>
                <Button variant="secondary" onClick={handleSaveProgress}>Guardar progreso</Button>
                <Button variant="primary" onClick={handleSubmitForReview}>Enviar a revisión</Button>
              </>
            )}
            {count.status === "revision" && <Button variant="primary" onClick={handleClose}>Cerrar conteo</Button>}
          </>
        )}
      />

      {count.status === "revision" || count.status === "cerrado" ? (
        <Card className="entity-card">
          <Typography variant="h6" className="card-title">Resumen de diferencias</Typography>
          <Box className="inv-count-summary">
            <Box className="inv-count-summary__item">
              <span className="inv-count-summary__label">SKUs con diferencia</span>
              <span className="inv-count-summary__value">{diffLines.length} / {count.lines.length}</span>
            </Box>
            <Box className="inv-count-summary__item">
              <span className="inv-count-summary__label">Unidades de diferencia</span>
              <span className="inv-count-summary__value">{unitsDiff}</span>
            </Box>
            <Box className="inv-count-summary__item">
              <span className="inv-count-summary__label">Valor de la diferencia</span>
              <span className="inv-count-summary__value">{money(valueDiff)}</span>
            </Box>
          </Box>
          {count.status === "cerrado" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {count.adjustmentId ? (
                <>Se generó el ajuste <RouterLink to="/inventario/ajustes" className="mono">{count.adjustmentId}</RouterLink> automáticamente al cerrar.</>
              ) : (
                "No hubo diferencias — no se generó ningún ajuste."
              )}
            </Typography>
          )}
        </Card>
      ) : null}

      <Card className="entity-card mt-3">
        <Typography variant="h6" className="card-title">
          {count.status === "en_conteo" ? "Cargar conteo" : "Líneas"}
        </Typography>
        <table className="line-table inv-count-table">
          <thead>
            <tr><th>SKU</th><th>Sistema</th><th>Contado</th><th>Diferencia</th></tr>
          </thead>
          <tbody>
            {count.lines.map((l) => (
              <tr key={l.skuId}>
                <td>{l.name} <span className="mono text-tertiary">({l.sku})</span></td>
                <td>{l.qtySistema}</td>
                <td>
                  {count.status === "en_conteo" ? (
                    <input
                      type="number"
                      value={draft[l.skuId] ?? (l.qtyContada ?? "")}
                      onChange={(e) => setLineDraft(l.skuId, e.target.value)}
                    />
                  ) : (
                    l.qtyContada ?? "—"
                  )}
                </td>
                <td>
                  {l.diff == null ? (
                    <span className="text-tertiary">—</span>
                  ) : (
                    <span className={`inv-count-diff ${l.diff === 0 ? "inv-count-diff--zero" : l.diff > 0 ? "inv-count-diff--pos" : "inv-count-diff--neg"}`}>
                      {l.diff > 0 ? `+${l.diff}` : l.diff}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="entity-card mt-3">
        <Typography variant="h6" className="card-title">Historial</Typography>
        <Typography variant="body2" color="text.secondary">Planificado {formatDateTime(count.createdAt)} por {count.createdBy}.</Typography>
        {count.startedAt && <Typography variant="body2" color="text.secondary">Conteo iniciado {formatDateTime(count.startedAt)}.</Typography>}
        {count.reviewedAt && <Typography variant="body2" color="text.secondary">Enviado a revisión {formatDateTime(count.reviewedAt)}.</Typography>}
        {count.closedAt && <Typography variant="body2" color="text.secondary">Cerrado {formatDateTime(count.closedAt)}.</Typography>}
      </Card>
    </Box>
  );
};

export default InventarioFisicoDetalle;
