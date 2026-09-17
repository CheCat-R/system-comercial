import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import Modal from "../../../components/Modal/Modal";
import Permitido from "../../seguridad/components/Permitido";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { listInvoicesForNote, emitNote } from "../api/billingApi";
import { DOC_TYPES } from "../lib/fiscal";
import { money } from "../lib/time";

const RATES = [
  { value: 0.21, label: "21 %" },
  { value: 0.105, label: "10,5 %" },
  { value: 0.27, label: "27 %" },
  { value: 0, label: "No gravado" },
];

const EmitirNotaModal = ({ open, onClose, onEmitted }) => {
  const { showToast } = useToast();
  const invoices = useMemo(() => (open ? listInvoicesForNote() : []), [open]);

  const [sourceId, setSourceId] = useState("");
  const [docType, setDocType] = useState("nota_credito");
  const [scope, setScope] = useState("total");
  const [netAmount, setNetAmount] = useState("");
  const [taxRate, setTaxRate] = useState(0.21);
  const [reason, setReason] = useState("");

  const source = invoices.find((d) => d.id === sourceId) || null;
  const isPartial = docType === "nota_debito" || scope === "parcial";
  const previewTotal = isPartial
    ? Math.round(Number(netAmount) || 0) * (1 + (Number(taxRate) || 0))
    : source?.total || 0;

  const reset = () => {
    setSourceId(""); setDocType("nota_credito"); setScope("total");
    setNetAmount(""); setTaxRate(0.21); setReason("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleEmit = () => {
    try {
      const doc = emitNote(sourceId, {
        docType,
        scope: docType === "nota_debito" ? "parcial" : scope,
        reason,
        netAmount: isPartial ? netAmount : undefined,
        taxRate,
      });
      showToast(`${DOC_TYPES[docType].label} ${doc.letter} ${doc.fullNumber} emitida`, "success");
      reset();
      onEmitted(doc);
    } catch (err) {
      showToast(err.message, "warning");
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Emitir nota de crédito / débito"
      subtitle="La factura se emite automáticamente al pagar el pedido; sólo las notas se cargan a mano."
      actions={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          <Permitido permiso="facturacion.emitir_nota">
            <Button variant="primary" onClick={handleEmit} disabled={!sourceId || (isPartial && !netAmount)}>
              Emitir
            </Button>
          </Permitido>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Factura de origen</Typography>
          <Select
            size="small" fullWidth displayEmpty value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <MenuItem value="" disabled>Elegí una factura…</MenuItem>
            {invoices.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {DOC_TYPES[d.docType].short} {d.letter} {d.fullNumber} · {d.customerName} · {money(d.total)}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">Tipo</Typography>
            <ToggleButtonGroup
              size="small" exclusive value={docType}
              onChange={(_, v) => v && setDocType(v)}
            >
              <ToggleButton value="nota_credito">Nota de crédito</ToggleButton>
              <ToggleButton value="nota_debito">Nota de débito</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {docType === "nota_credito" && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Alcance</Typography>
              <ToggleButtonGroup
                size="small" exclusive value={scope}
                onChange={(_, v) => v && setScope(v)}
              >
                <ToggleButton value="total">Total</ToggleButton>
                <ToggleButton value="parcial">Parcial</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}
        </Box>

        {isPartial && (
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <TextField
              size="small" type="number" label="Importe neto"
              value={netAmount} onChange={(e) => setNetAmount(e.target.value)}
              sx={{ maxWidth: 180 }}
            />
            <Select size="small" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} sx={{ minWidth: 140 }}>
              {RATES.map((r) => <MenuItem key={r.value} value={r.value}>IVA {r.label}</MenuItem>)}
            </Select>
          </Box>
        )}

        <TextField
          size="small" fullWidth multiline minRows={2} label="Motivo"
          value={reason} onChange={(e) => setReason(e.target.value)}
        />

        {source && (
          <Box sx={{ display: "flex", justifyContent: "space-between", p: 2, borderRadius: "var(--radius-sm)", background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)" }}>
            <Typography variant="body2" color="text.secondary">Total del comprobante</Typography>
            <Typography variant="body2" className="mono" fontWeight={600}>{money(previewTotal)}</Typography>
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default EmitirNotaModal;
