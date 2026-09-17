import { useState } from "react";
import Box from "@mui/material/Box";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import PageHeader from "../../components/PageHeader/PageHeader";
import Permitido from "../seguridad/components/Permitido";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { listRates, listCarriers, listMethods, listZones, createRate, updateRate, deleteRate } from "./api/logisticaApi";
import { money } from "./lib/time";
import "./Tarifas.css";

const emptyRate = () => ({ carrierId: "", methodId: "", zoneId: "", weightFrom: 0, weightTo: 3, cost: "" });

const Tarifas = () => {
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [carrierFilter, setCarrierFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);

  const rows = listRates({ carrierId: carrierFilter || undefined, zoneId: zoneFilter || undefined }).map((r) => ({ ...r, id: r.id }));

  const save = () => {
    if (!modal.carrierId || !modal.methodId || !modal.zoneId || !modal.cost) {
      return showToast("Completá transportista, método, zona y costo", "warning");
    }
    if (modal.id) updateRate(modal.id, modal);
    else createRate(modal);
    setModal(null);
    setTick((t) => t + 1);
    showToast(modal.id ? "Tarifa actualizada" : "Tarifa creada", "success");
  };

  const columns = [
    { field: "carrierName", headerName: "Transportista" },
    { field: "methodName", headerName: "Método" },
    { field: "zoneName", headerName: "Zona" },
    { field: "weightRange", headerName: "Peso (kg)", align: "right", renderCell: (row) => `${row.weightFrom} – ${row.weightTo}` },
    { field: "cost", headerName: "Costo", align: "right", renderCell: (row) => money(row.cost) },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (row) => (
        <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(row); }} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const toolbar = (
    <Box className="table-toolbar">
      <Box className="table-toolbar__filters">
        <Select size="small" displayEmpty value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}>
          <MenuItem value="">Todos los transportistas</MenuItem>
          {listCarriers().map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
          <MenuItem value="">Todas las zonas</MenuItem>
          {listZones().map((z) => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
        </Select>
      </Box>
    </Box>
  );

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Tarifas"
        subtitle="Costo por Transportista × Método × Zona × rango de peso — se calcula, no se tipea a mano."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal(emptyRate())}>Nueva tarifa</Button>}
      />

      <DataTable toolbar={toolbar} columns={columns} data={rows} emptyMessage="No hay tarifas que coincidan con los filtros." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal(activeRow); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => { deleteRate(activeRow.id); setTick((t) => t + 1); setAnchor(null); showToast("Tarifa eliminada", "info"); }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? "Editar tarifa" : "Nueva tarifa"}
        maxWidth="sm"
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Permitido permiso="logistica.tarifas">
  <Button variant="primary" onClick={save}>Guardar</Button>
</Permitido></>}
      >
        {modal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Select size="small" fullWidth displayEmpty value={modal.carrierId} onChange={(e) => setModal({ ...modal, carrierId: e.target.value, methodId: "" })}>
              <MenuItem value="" disabled>Transportista…</MenuItem>
              {listCarriers().map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
            <Select size="small" fullWidth displayEmpty value={modal.methodId} disabled={!modal.carrierId} onChange={(e) => setModal({ ...modal, methodId: e.target.value })}>
              <MenuItem value="" disabled>Método…</MenuItem>
              {listMethods(modal.carrierId).map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
            </Select>
            <Select size="small" fullWidth displayEmpty value={modal.zoneId} onChange={(e) => setModal({ ...modal, zoneId: e.target.value })}>
              <MenuItem value="" disabled>Zona…</MenuItem>
              {listZones().map((z) => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
            </Select>
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Peso desde (kg)" type="number" size="small" fullWidth value={modal.weightFrom} onChange={(e) => setModal({ ...modal, weightFrom: e.target.value })} />
              <TextField label="Peso hasta (kg)" type="number" size="small" fullWidth value={modal.weightTo} onChange={(e) => setModal({ ...modal, weightTo: e.target.value })} />
            </Box>
            <TextField label="Costo" type="number" size="small" fullWidth value={modal.cost} onChange={(e) => setModal({ ...modal, cost: e.target.value })} />
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Tarifas;
