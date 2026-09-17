import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";

/**
 * Edita mínimo/seguridad de una fila SKU × Depósito. `rows`: una (edición simple) o varias
 * (edición en lote, ej. desde selección múltiple en Stock).
 *
 * El padre desmonta este componente entre aperturas (`rows.length === 0` ⇒ `return null`), así
 * que el estado inicial derivado de `rows` alcanza sin efecto — cada apertura es un montaje nuevo.
 */
const StockMinMaxEditor = ({ open, onClose, rows = [], onSave }) => {
  const [minStock, setMinStock] = useState(() => (rows.length === 1 ? rows[0].minStock : 0));
  const [safetyStock, setSafetyStock] = useState(() => (rows.length === 1 ? rows[0].safetyStock : 0));

  if (rows.length === 0) return null;
  const isBulk = rows.length > 1;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar mínimo y seguridad"
      subtitle={isBulk ? `${rows.length} filas seleccionadas` : `${rows[0].name} · ${rows[0].warehouseName}`}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave({ minStock: Number(minStock), safetyStock: Number(safetyStock) })}>
            Guardar
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {isBulk && (
          <Typography variant="body2" color="text.secondary">
            Se va a pisar el mínimo y la seguridad de las {rows.length} filas seleccionadas con los
            valores que cargues acá.
          </Typography>
        )}
        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField
            label="Stock mínimo"
            type="number"
            size="small"
            fullWidth
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
          <TextField
            label="Stock de seguridad"
            type="number"
            size="small"
            fullWidth
            value={safetyStock}
            onChange={(e) => setSafetyStock(e.target.value)}
          />
        </Box>
      </Box>
    </Modal>
  );
};

export default StockMinMaxEditor;
