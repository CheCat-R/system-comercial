import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";

import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { listZones, createZone, updateZone } from "./api/logisticaApi";
import "./Zonas.css";

const Zonas = () => {
  const { showToast } = useToast();
  const [, setTick] = useState(0);
  const [modal, setModal] = useState(null);

  const rows = listZones().map((z) => ({ ...z, id: z.id }));

  const save = () => {
    if (!modal.name?.trim()) return showToast("Poné un nombre a la zona", "warning");
    if (modal.id) updateZone(modal.id, modal);
    else createZone(modal);
    setModal(null);
    setTick((t) => t + 1);
    showToast(modal.id ? "Zona actualizada" : "Zona creada", "success");
  };

  const columns = [
    { field: "name", headerName: "Zona", width: "20%", renderCell: (row) => <strong>{row.name}</strong> },
    {
      field: "keywords", headerName: "Palabras clave (para resolver la dirección)",
      renderCell: (row) => (
        <Box className="log-zone-keywords">
          {row.keywords.map((k) => <span key={k} className="tag-chip">{k}</span>)}
        </Box>
      ),
    },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (row) => (
        <IconButton size="small" onClick={() => setModal(row)} aria-label="editar">
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Zonas"
        subtitle="Agrupación geográfica usada para resolver la dirección de un pedido y tarifar el envío."
        actions={<Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({ name: "", keywords: [] })}>Nueva zona</Button>}
      />

      <DataTable columns={columns} data={rows} emptyMessage="Todavía no hay zonas configuradas." />

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? "Editar zona" : "Nueva zona"}
        subtitle="La última zona de la lista actúa como catch-all si ninguna palabra clave matchea."
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" onClick={save}>Guardar</Button></>}
      >
        {modal && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Nombre" size="small" fullWidth value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} />
            <Box>
              <Typography variant="body2" className="form-label">Palabras clave</Typography>
              <Autocomplete
                multiple freeSolo size="small" options={[]} value={modal.keywords}
                onChange={(_, next) => setModal({ ...modal, keywords: next.map((k) => String(k).trim()).filter(Boolean) })}
                renderValue={(vals, getItemProps) =>
                  vals.map((option, index) => {
                    const { key, ...itemProps } = getItemProps({ index });
                    return <Chip key={key} variant="outlined" size="small" label={option} {...itemProps} />;
                  })
                }
                renderInput={(params) => <TextField {...params} placeholder="Ej. CABA, Ciudad Autónoma…" />}
              />
            </Box>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Zonas;
