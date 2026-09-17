import { useState } from "react";
import Box from "@mui/material/Box";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
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
  listCarriers, listMethods, createCarrier, updateCarrier, toggleCarrierActive,
  createMethod, updateMethod, toggleMethodActive,
} from "./api/logisticaApi";
import "./Transportistas.css";

const Transportistas = () => {
  const { showToast } = useToast();
  const [, setTick] = useState(0);

  const [carrierModal, setCarrierModal] = useState(null);
  const [methodModal, setMethodModal] = useState(null);

  const carriers = listCarriers();

  const saveCarrier = () => {
    if (!carrierModal.name?.trim()) return showToast("Poné un nombre al transportista", "warning");
    if (carrierModal.id) updateCarrier(carrierModal.id, carrierModal);
    else createCarrier(carrierModal);
    setCarrierModal(null);
    setTick((t) => t + 1);
    showToast(carrierModal.id ? "Transportista actualizado" : "Transportista creado", "success");
  };

  const saveMethod = () => {
    if (!methodModal.name?.trim()) return showToast("Poné un nombre al método", "warning");
    if (methodModal.id) updateMethod(methodModal.id, methodModal);
    else createMethod(methodModal);
    setMethodModal(null);
    setTick((t) => t + 1);
    showToast(methodModal.id ? "Método actualizado" : "Método creado", "success");
  };

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Transportistas"
        subtitle="Quién ejecuta el traslado físico, y con qué métodos."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setCarrierModal({ name: "", contactPhone: "" })}>Nuevo transportista</Button>}
      />

      {carriers.map((carrier) => (
        <Accordion key={carrier.id} defaultExpanded className="surface" disableGutters>
          {/* Ver Sucursales.jsx: AccordionSummary ya renderiza un <button> — los controles van
              en el mismo Box "primer hijo" pero afuera de ese botón, nunca anidados. */}
          <Box className="log-carrier-header">
            <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />} className="log-carrier-header__summary">
              <Box className="log-carrier-summary__title">
                <Typography className="log-carrier-summary__name">{carrier.name}</Typography>
                <Typography className="log-carrier-summary__contact">{carrier.contactPhone}</Typography>
              </Box>
            </AccordionSummary>
            <Box className="log-carrier-header__actions" onClick={(e) => e.stopPropagation()}>
              <StatusBadge status={carrier.isActive ? "activo" : "inactivo"} />
              <Switch size="small" checked={carrier.isActive} onChange={() => { toggleCarrierActive(carrier.id); setTick((t) => t + 1); }} />
              <Button variant="ghost" size="small" startIcon={<EditOutlinedIcon />} onClick={() => setCarrierModal(carrier)}>Editar</Button>
            </Box>
          </Box>
          <AccordionDetails>
            {listMethods(carrier.id).map((method) => (
              <Box key={method.id} className="log-method-row">
                <Box>
                  <Typography className="log-method-row__name">{method.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{method.etaDays} día{method.etaDays === 1 ? "" : "s"} hábil{method.etaDays === 1 ? "" : "es"} estimado</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <StatusBadge status={method.isActive ? "activo" : "inactivo"} />
                  <Switch size="small" checked={method.isActive} onChange={() => { toggleMethodActive(method.id); setTick((t) => t + 1); }} />
                  <Button variant="ghost" size="small" startIcon={<EditOutlinedIcon />} onClick={() => setMethodModal(method)}>Editar</Button>
                </Box>
              </Box>
            ))}
            <Button
              variant="ghost" size="small" startIcon={<AddIcon />} sx={{ mt: 1.5 }}
              onClick={() => setMethodModal({ carrierId: carrier.id, name: "", etaDays: 3 })}
            >
              Nuevo método
            </Button>
          </AccordionDetails>
        </Accordion>
      ))}

      <Modal
        open={Boolean(carrierModal)}
        onClose={() => setCarrierModal(null)}
        title={carrierModal?.id ? "Editar transportista" : "Nuevo transportista"}
        actions={<><Button variant="ghost" onClick={() => setCarrierModal(null)}>Cancelar</Button><Button variant="primary" onClick={saveCarrier}>Guardar</Button></>}
      >
        {carrierModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={carrierModal.name} onChange={(e) => setCarrierModal({ ...carrierModal, name: e.target.value })} />
            <TextField label="Teléfono de contacto" size="small" fullWidth value={carrierModal.contactPhone} onChange={(e) => setCarrierModal({ ...carrierModal, contactPhone: e.target.value })} />
          </Box>
        )}
      </Modal>

      <Modal
        open={Boolean(methodModal)}
        onClose={() => setMethodModal(null)}
        title={methodModal?.id ? "Editar método" : "Nuevo método"}
        actions={<><Button variant="ghost" onClick={() => setMethodModal(null)}>Cancelar</Button><Button variant="primary" onClick={saveMethod}>Guardar</Button></>}
      >
        {methodModal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={methodModal.name} onChange={(e) => setMethodModal({ ...methodModal, name: e.target.value })} />
            <TextField label="Días hábiles estimados" type="number" size="small" fullWidth value={methodModal.etaDays} onChange={(e) => setMethodModal({ ...methodModal, etaDays: e.target.value })} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Transportistas;
