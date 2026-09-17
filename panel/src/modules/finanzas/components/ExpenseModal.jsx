import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { createExpense, updateExpense } from "../api/financeApi";
import { EXPENSE_CATEGORIES } from "../lib/finance";

const RECURRENCES = [
  { value: "unico", label: "Único" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];
const CENTERS = [
  { value: "global", label: "Toda la empresa" },
  { value: "DEP-01", label: "Depósito Palermo" },
  { value: "DEP-04", label: "Depósito Central" },
];

const EMPTY = { category: "servicios", description: "", amount: "", recurrence: "unico", costCenter: "global", account: "banco", paid: false };

const ExpenseModal = ({ expense, onClose, onSaved }) => {
  const { showToast } = useToast();
  const editing = Boolean(expense);
  const [form, setForm] = useState(() =>
    expense ? { ...expense, amount: String(expense.amount), paid: expense.status === "pagado" } : EMPTY
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.description.trim() || !Number(form.amount)) {
      showToast("Completá el concepto y el monto", "warning");
      return;
    }
    const payload = {
      category: form.category, description: form.description, amount: form.amount,
      recurrence: form.recurrence, costCenter: form.costCenter, account: form.account,
      status: form.paid ? "pagado" : "pendiente",
    };
    const saved = editing ? updateExpense(expense.id, payload) : createExpense(payload);
    showToast(editing ? "Gasto actualizado" : "Gasto registrado", "success");
    onSaved(saved);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar gasto" : "Nuevo gasto"}
      actions={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}>Guardar</Button></>}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, pt: 1 }}>
        <TextField size="small" fullWidth label="Concepto" value={form.description} onChange={set("description")} />
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Select size="small" value={form.category} onChange={set("category")} sx={{ minWidth: 160 }}>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
          <TextField size="small" type="number" label="Monto" value={form.amount} onChange={set("amount")} sx={{ maxWidth: 160 }} />
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Select size="small" value={form.recurrence} onChange={set("recurrence")} sx={{ minWidth: 140 }}>
            {RECURRENCES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </Select>
          <Select size="small" value={form.costCenter} onChange={set("costCenter")} sx={{ minWidth: 190 }}>
            {CENTERS.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
          </Select>
          <Select size="small" value={form.account} onChange={set("account")} sx={{ minWidth: 120 }}>
            <MenuItem value="banco">Banco</MenuItem>
            <MenuItem value="caja">Caja</MenuItem>
          </Select>
        </Box>
        <FormControlLabel
          control={<Checkbox size="small" checked={form.paid} onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))} />}
          label="Ya está pagado"
        />
      </Box>
    </Modal>
  );
};

export default ExpenseModal;
