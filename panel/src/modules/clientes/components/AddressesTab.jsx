import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddLocationAltOutlinedIcon from "@mui/icons-material/AddLocationAltOutlined";

import Modal from "../../../components/Modal/Modal";
import Button from "../../../components/Button/Button";
import { useToast } from "../../../components/Toast/ToastContext";
import { saveAddress, deleteAddress, setDefaultAddress } from "../api/clientsApi";
import "./AddressesTab.css";

const EMPTY = {
  label: "", line1: "", line2: "", city: "", state: "", zip: "",
  country: "Argentina", isDefaultShipping: false, isDefaultBilling: false,
};

const AddressCard = ({ addr, onEdit, onDefault, onDelete }) => {
  const [anchor, setAnchor] = useState(null);
  return (
    <Card className="addr-card">
      <Box className="addr-card__head">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PlaceOutlinedIcon fontSize="small" sx={{ color: "var(--text-tertiary)" }} />
          <Typography variant="subtitle2" fontWeight={700}>{addr.label}</Typography>
        </Box>
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <MenuItem onClick={() => { setAnchor(null); onEdit(addr); }}>Editar</MenuItem>
          <MenuItem onClick={() => { setAnchor(null); onDefault(addr.id, "shipping"); }} disabled={addr.isDefaultShipping}>
            Marcar como envío predeterminado
          </MenuItem>
          <MenuItem onClick={() => { setAnchor(null); onDefault(addr.id, "billing"); }} disabled={addr.isDefaultBilling}>
            Marcar como facturación predeterminada
          </MenuItem>
          <MenuItem onClick={() => { setAnchor(null); onDelete(addr.id); }} sx={{ color: "error.main" }}>
            Eliminar
          </MenuItem>
        </Menu>
      </Box>

      <div className="addr-card__badges">
        {addr.isDefaultShipping && <span className="tier-badge tier-badge--success tier-badge--sm">Envío</span>}
        {addr.isDefaultBilling && <span className="tier-badge tier-badge--info tier-badge--sm">Facturación</span>}
      </div>

      <Typography variant="body2" color="text.secondary">
        {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {[addr.city, addr.state, addr.zip].filter(Boolean).join(", ")}
      </Typography>
      <Typography variant="body2" color="text.secondary">{addr.country}</Typography>
    </Card>
  );
};

const AddressesTab = ({ account, onChange }) => {
  const { showToast } = useToast();
  const addresses = account.addresses || [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const startNew = () => { setForm(EMPTY); setOpen(true); };
  const startEdit = (addr) => { setForm(addr); setOpen(true); };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.label.trim() || !form.line1.trim() || !form.city.trim()) {
      showToast("Completá etiqueta, dirección y ciudad", "warning");
      return;
    }
    onChange(saveAddress(account.id, form));
    setOpen(false);
    showToast(form.id ? "Dirección actualizada" : "Dirección agregada", "success");
  };

  const handleDefault = (id, kind) => {
    onChange(setDefaultAddress(account.id, id, kind));
    showToast(`Predeterminada de ${kind === "billing" ? "facturación" : "envío"} actualizada`, "success");
  };

  const handleDelete = (id) => {
    onChange(deleteAddress(account.id, id));
    showToast("Dirección eliminada", "info");
  };

  return (
    <Box className="addr-tab">
      {addresses.length === 0 && (
        <p className="addr-tab__empty">Esta cuenta no tiene direcciones cargadas.</p>
      )}

      <Box className="addr-grid">
        {addresses.map((addr) => (
          <AddressCard
            key={addr.id}
            addr={addr}
            onEdit={startEdit}
            onDefault={handleDefault}
            onDelete={handleDelete}
          />
        ))}
        <button type="button" className="addr-add" onClick={startNew}>
          <AddLocationAltOutlinedIcon />
          <span>Agregar dirección</span>
        </button>
      </Box>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Editar dirección" : "Nueva dirección"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSave}>Guardar</Button>
          </>
        }
      >
        <Box className="addr-form">
          <TextField label="Etiqueta (Casa, Depósito…)" size="small" fullWidth value={form.label} onChange={set("label")} />
          <TextField label="Dirección" size="small" fullWidth value={form.line1} onChange={set("line1")} />
          <TextField label="Piso / Depto / Referencia" size="small" fullWidth value={form.line2} onChange={set("line2")} />
          <Box className="addr-form__row">
            <TextField label="Ciudad" size="small" fullWidth value={form.city} onChange={set("city")} />
            <TextField label="Provincia" size="small" fullWidth value={form.state} onChange={set("state")} />
          </Box>
          <Box className="addr-form__row">
            <TextField label="Código postal" size="small" fullWidth value={form.zip} onChange={set("zip")} />
            <TextField label="País" size="small" fullWidth value={form.country} onChange={set("country")} />
          </Box>
        </Box>
      </Modal>
    </Box>
  );
};

export default AddressesTab;
