import { useState } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import UndoOutlinedIcon from "@mui/icons-material/UndoOutlined";

import Button from "../../components/Button/Button";
import EntityHeader from "../../components/EntityHeader/EntityHeader";
import Permitido from "../seguridad/components/Permitido";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import FiscalDocumentView from "./components/FiscalDocumentView";
import EmitirNotaModal from "./components/EmitirNotaModal";
import { getDocument, getIssuer, voidDocument } from "./api/billingApi";
import { DOC_TYPES, DOC_STATUS } from "./lib/fiscal";
import { formatDateTime } from "./lib/time";
import "./ComprobanteDetalle.css";

const ComprobanteDetalle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [emitOpen, setEmitOpen] = useState(false);

  const doc = getDocument(id);
  const issuer = getIssuer();

  if (!doc) {
    return (
      <Box className="page fade-in">
        <Typography>No se encontró el comprobante {id}.</Typography>
        <Button variant="ghost" onClick={() => navigate("/facturacion")}>Volver</Button>
      </Box>
    );
  }

  const isFactura = doc.docType === "factura";
  const canVoid = isFactura && doc.status === "emitido" && !doc.relatedNotes.some((n) => n.status === "emitido");

  const handleVoid = () => {
    try {
      voidDocument(doc.id);
      setTick((t) => t + 1);
      showToast("Comprobante anulado", "info");
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  const timeline = [
    { label: `${DOC_TYPES[doc.docType]?.label} emitida`, at: doc.issueDate },
    { label: `CAE ${doc.cae} obtenido`, at: doc.issueDate },
    ...doc.relatedNotes.map((n) => ({ label: `${DOC_TYPES[n.docType]?.label} ${n.letter} ${n.fullNumber} emitida`, at: n.issueDate })),
    ...(doc.status === "anulado" ? [{ label: "Comprobante anulado", at: doc.issueDate }] : []),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <Box className="page fade-in">
      <EntityHeader
        title={`${DOC_TYPES[doc.docType]?.short} ${doc.letter} ${doc.fullNumber}`}
        subtitle={(
          <>
            {doc.customerName}
            {doc.orderId && <> · <RouterLink to={`/pedidos/${doc.orderId}`} className="mono">Pedido #{doc.orderId}</RouterLink></>}
          </>
        )}
        badges={<StatusBadge {...DOC_STATUS[doc.status]} />}
        onBack={() => navigate("/facturacion")}
        backLabel="Volver a comprobantes"
        actions={(
          <>
          <Button variant="ghost" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => showToast("La descarga de PDF es una simulación en esta versión.", "info")}>
            Descargar PDF
          </Button>
          {isFactura && doc.status === "emitido" && (
            <Button variant="secondary" startIcon={<UndoOutlinedIcon />} onClick={() => setEmitOpen(true)}>
              Emitir NC / ND
            </Button>
          )}
            {canVoid && (
              <Permitido permiso="facturacion.anular">
                <Button variant="danger" startIcon={<BlockOutlinedIcon />} onClick={handleVoid}>Anular</Button>
              </Permitido>
            )}
          </>
        )}
      />

      <Box className="cbte-detalle__grid">
        <Card className="entity-card">
          <FiscalDocumentView doc={doc} issuer={issuer} />
        </Card>

        <Box className="cbte-detalle__side">
          <Card className="entity-card">
            <Typography variant="h6" className="card-title">Historial</Typography>
            <Box className="order-timeline">
              {timeline.map((ev, i) => (
                <Box key={i} className={`timeline-item ${i === timeline.length - 1 ? "timeline-item--last" : ""}`}>
                  <span className="timeline-dot timeline-dot--accent" />
                  <Box className="timeline-content">
                    <Typography variant="body2" fontWeight={600}>{ev.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDateTime(ev.at)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>

          {doc.docType === "nota_credito" && (
            <Card className="entity-card">
              <Typography variant="h6" className="card-title">Devolución</Typography>
              <Typography variant="body2" color="text.secondary">
                Esta nota de crédito reversa el IVA de la factura. El movimiento de dinero (reembolso al
                cliente) se gestiona y aprueba desde Finanzas.
              </Typography>
            </Card>
          )}
        </Box>
      </Box>

      <EmitirNotaModal
        open={emitOpen}
        onClose={() => setEmitOpen(false)}
        onEmitted={(d) => { setEmitOpen(false); navigate(`/facturacion/${d.id}`); }}
      />
    </Box>
  );
};

export default ComprobanteDetalle;
