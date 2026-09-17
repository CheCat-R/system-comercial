import { useState } from "react";
import Box from "@mui/material/Box";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";

import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import Modal from "../../components/Modal/Modal";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";
import {
  listBranches, listWarehouses, createBranch, updateBranch, toggleBranchActive,
  createWarehouse, updateWarehouse, toggleWarehouseActive,
} from "./api/inventoryApi";
import "./Sucursales.css";

const WAREHOUSE_TYPES = { venta: "Venta", reserva: "Reserva", transito: "Tránsito" };

const Sucursales = () => {
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [branchModal, setBranchModal] = useState(null); // { id?, name, address }
  const [whModal, setWhModal] = useState(null); // { id?, branchId, name, type }

  const branches = listBranches();
  const warehousesOf = (branchId) => listWarehouses(branchId);

  const saveBranch = () => {
    if (!branchModal.name?.trim()) return showToast("Poné un nombre a la sucursal", "warning");
    if (branchModal.id) updateBranch(branchModal.id, branchModal);
    else createBranch(branchModal);
    setBranchModal(null);
    setTick((t) => t + 1);
    showToast(branchModal.id ? "Sucursal actualizada" : "Sucursal creada", "success");
  };

  const saveWarehouse = () => {
    if (!whModal.name?.trim()) return showToast("Poné un nombre al depósito", "warning");
    if (whModal.id) updateWarehouse(whModal.id, whModal);
    else createWarehouse(whModal);
    setWhModal(null);
    setTick((t) => t + 1);
    showToast(whModal.id ? "Depósito actualizado" : "Depósito creado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Sucursales y Depósitos"
        subtitle="Estructura física del inventario. Cada depósito pertenece a una sucursal."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setBranchModal({ name: "", address: "" })}>Nueva sucursal</Button>}
      />

      {branches.map((branch) => (
        <Accordion key={branch.id} defaultExpanded className="surface" disableGutters>
          {/* Accordion envuelve a su primer hijo en un <h3> y trata TODO lo que sigue como el
              contenido colapsable — por eso el summary y las acciones van juntos en un solo Box
              (primer hijo), y no como hermanos sueltos: si no, "Editar"/el switch desaparecerían
              al colapsar. AccordionSummary ya renderiza su propio <button>, así que el switch y el
              botón "Editar" van AFUERA de él (mismo Box, pero no descendientes del botón del
              summary) para no anidar <button> dentro de <button>. */}
          <Box className="inv-branch-header">
            <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />} className="inv-branch-header__summary">
              <Box className="inv-branch-summary__title">
                <Typography className="inv-branch-summary__name">{branch.name}</Typography>
                <Typography className="inv-branch-summary__address">{branch.address}</Typography>
              </Box>
            </AccordionSummary>
            <Box className="inv-branch-header__actions" onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={branch.isActive ? "activa" : "inactiva"} />
              <Switch size="small" checked={branch.isActive} onChange={() => { toggleBranchActive(branch.id); setTick((t) => t + 1); }} />
              <Button variant="ghost" size="small" startIcon={<EditOutlinedIcon />} onClick={() => setBranchModal(branch)}>Editar</Button>
            </Box>
          </Box>
          <AccordionDetails>
            {warehousesOf(branch.id).map((w) => (
              <Box key={w.id} className="inv-wh-row">
                <Box>
                  <Typography className="inv-wh-row__name">{w.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{WAREHOUSE_TYPES[w.type] || w.type}</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <StatusBadge status={w.isActive ? "activo" : "inactivo"} />
                  <Switch size="small" checked={w.isActive} onChange={() => { toggleWarehouseActive(w.id); setTick((t) => t + 1); }} />
                  <Button variant="ghost" size="small" startIcon={<EditOutlinedIcon />} onClick={() => setWhModal(w)}>Editar</Button>
                </Box>
              </Box>
            ))}
            <Button
              variant="ghost"
              size="small"
              startIcon={<AddIcon />}
              sx={{ mt: 1.5 }}
              onClick={() => setWhModal({ branchId: branch.id, name: "", type: "venta" })}
            >
              Nuevo depósito
            </Button>
          </AccordionDetails>
        </Accordion>
      ))}

      <Modal
        open={Boolean(branchModal)}
        onClose={() => setBranchModal(null)}
        title={branchModal?.id ? "Editar sucursal" : "Nueva sucursal"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setBranchModal(null)}>Cancelar</Button>
            <Button variant="primary" onClick={saveBranch}>Guardar</Button>
          </>
        }
      >
        {branchModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={branchModal.name} onChange={(e) => setBranchModal({ ...branchModal, name: e.target.value })} />
            <TextField label="Dirección" size="small" fullWidth value={branchModal.address} onChange={(e) => setBranchModal({ ...branchModal, address: e.target.value })} />
          </Box>
        )}
      </Modal>

      <Modal
        open={Boolean(whModal)}
        onClose={() => setWhModal(null)}
        title={whModal?.id ? "Editar depósito" : "Nuevo depósito"}
        subtitle={whModal ? `Sucursal: ${branches.find((b) => b.id === whModal.branchId)?.name || ""}` : ""}
        actions={
          <>
            <Button variant="ghost" onClick={() => setWhModal(null)}>Cancelar</Button>
            <Button variant="primary" onClick={saveWarehouse}>Guardar</Button>
          </>
        }
      >
        {whModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={whModal.name} onChange={(e) => setWhModal({ ...whModal, name: e.target.value })} />
            <Select size="small" fullWidth value={whModal.type} onChange={(e) => setWhModal({ ...whModal, type: e.target.value })}>
              {Object.entries(WAREHOUSE_TYPES).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
            </Select>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Sucursales;
