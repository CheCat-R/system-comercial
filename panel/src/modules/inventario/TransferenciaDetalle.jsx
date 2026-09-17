import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { getTransfer, sendTransfer, receiveTransfer, cancelTransfer } from "./api/inventoryApi";
import { TRANSFER_STATUS, TRANSFER_STEPS } from "./lib/transfers";
import { formatDateTime } from "./lib/time";
import "./TransferenciaDetalle.css";

const TransferenciaDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivedQty, setReceivedQty] = useState({});

  const transfer = getTransfer(id);

  if (!transfer) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró la transferencia #{id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/inventario/transferencias")}>Volver</Button>
      </Box>
    );
  }

  const stepIndex = TRANSFER_STEPS.indexOf(transfer.status);
  const isCancelled = transfer.status === "cancelada";

  const openReceive = () => {
    const defaults = {};
    transfer.lines.forEach((l) => { defaults[l.skuId] = l.qtySent; });
    setReceivedQty(defaults);
    setReceiveOpen(true);
  };

  const handleSend = () => {
    try {
      sendTransfer(transfer.id);
      setTick((t) => t + 1);
      showToast("Transferencia enviada — resta del depósito de origen", "success");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const handleReceive = () => {
    const lines = transfer.lines.map((l) => ({ skuId: l.skuId, qtyReceived: Number(receivedQty[l.skuId] ?? l.qtySent) }));
    const { hasDifference } = receiveTransfer(transfer.id, lines);
    setReceiveOpen(false);
    setTick((t) => t + 1);
    showToast(
      hasDifference
        ? "Transferencia recibida con diferencias — revisá si corresponde un ajuste en origen"
        : "Transferencia recibida sin diferencias",
      hasDifference ? "warning" : "success"
    );
  };

  const handleCancel = () => {
    cancelTransfer(transfer.id);
    setTick((t) => t + 1);
    showToast("Transferencia cancelada", "info");
  };

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`Transferencia ${transfer.id}`}
        subtitle={(
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <span>{transfer.originName}</span>
            <ArrowForwardOutlinedIcon sx={{ fontSize: 15, color: "var(--text-tertiary)" }} />
            <span>{transfer.destName}</span>
          </Box>
        )}
        badges={isCancelled ? <StatusBadge tone="danger" label="Cancelada" /> : null}
        below={!isCancelled && (
          <Box className="inv-pipeline">
            {TRANSFER_STEPS.map((step, i) => (
              <span key={step} className={`inv-pipeline__step ${i < stepIndex ? "inv-pipeline__step--done" : i === stepIndex ? "inv-pipeline__step--current" : ""}`}>
                {TRANSFER_STATUS[step].label}
              </span>
            ))}
          </Box>
        )}
        onBack={() => navigate("/inventario/transferencias")}
        backLabel="Volver a transferencias"
        actions={(
          <>
            {transfer.status === "borrador" && (
              <>
                <Button variant="danger" onClick={handleCancel}>Cancelar</Button>
                <Button variant="primary" onClick={handleSend}>Enviar</Button>
              </>
            )}
            {transfer.status === "en_transito" && (
              <Button variant="primary" onClick={openReceive}>Recibir</Button>
            )}
          </>
        )}
      />

      <Card className="entity-card">
        <Typography variant="h6" className="card-title">Líneas</Typography>
        <table className="line-table inv-transfer-lines-table">
          <thead>
            <tr><th>SKU</th><th>Enviado</th><th>Recibido</th></tr>
          </thead>
          <tbody>
            {transfer.lines.map((l) => (
              <tr key={l.skuId}>
                <td>{l.name} <span className="mono text-tertiary">({l.sku})</span></td>
                <td>{l.qtySent}</td>
                <td>{l.qtyReceived == null ? "—" : l.qtyReceived}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="entity-card mt-3">
        <Typography variant="h6" className="card-title">Historial</Typography>
        <Typography variant="body2" color="text.secondary">Creada {formatDateTime(transfer.createdAt)} por {transfer.createdBy}.</Typography>
        {transfer.sentAt && <Typography variant="body2" color="text.secondary">Enviada {formatDateTime(transfer.sentAt)}.</Typography>}
        {transfer.receivedAt && <Typography variant="body2" color="text.secondary">Recibida {formatDateTime(transfer.receivedAt)}.</Typography>}
      </Card>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Registrar recepción"
        subtitle="Confirmá la cantidad recibida por línea — puede ser menor a la enviada."
        actions={
          <>
            <Button variant="ghost" onClick={() => setReceiveOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleReceive}>Confirmar recepción</Button>
          </>
        }
      >
        <table className="line-table inv-transfer-lines-table">
          <thead>
            <tr><th>SKU</th><th>Enviado</th><th>Recibido</th></tr>
          </thead>
          <tbody>
            {transfer.lines.map((l) => (
              <tr key={l.skuId}>
                <td>{l.name}</td>
                <td>{l.qtySent}</td>
                <td>
                  <input
                    type="number"
                    value={receivedQty[l.skuId] ?? l.qtySent}
                    onChange={(e) => setReceivedQty((q) => ({ ...q, [l.skuId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </Box>
  );
};

export default TransferenciaDetalle;
