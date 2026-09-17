import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import AudienceBuilder from "./components/AudienceBuilder";
import { listAudiences, createAudience, updateAudience, deleteAudience } from "./api/marketingApi";
import { describeBase, describeFilters } from "./lib/audiences";

const EMPTY = { name: "", base: { type: "all" }, filters: [], exclusions: {} };

const Audiencias = () => {
  const { showToast } = useToast();
  const [modal, setModal] = useState(null); // null | { draft, id? }
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const rows = listAudiences().map((a) => ({ ...a, id: a.id }));

  const handleSave = () => {
    const d = modal.draft;
    if (!d.name?.trim()) return showToast("Poné un nombre", "warning");
    if (modal.id) updateAudience(modal.id, d);
    else createAudience(d);
    showToast(modal.id ? "Audiencia actualizada" : "Audiencia creada", "success");
    setModal(null);
    refresh();
  };

  const columns = [
    { field: "name", headerName: "Audiencia", renderCell: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { field: "base", headerName: "Base", renderCell: (r) => <span className="text-tertiary">{describeBase(r.base)}</span> },
    { field: "filters", headerName: "Filtros", renderCell: (r) => <span className="text-tertiary">{describeFilters(r.filters)}</span> },
    { field: "memberCount", headerName: "Miembros", align: "right", renderCell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{r.memberCount}</span> },
    {
      field: "usedBy", headerName: "Campañas", renderCell: (r) => r.usedBy.length
        ? <span className="text-tertiary">{r.usedBy.map((c) => c.name).join(", ")}</span>
        : <span className="text-tertiary">—</span>,
    },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (r) => <IconButton size="small" onClick={(e) => { setAnchor(e.currentTarget); setActiveRow(r); }} aria-label="acciones"><MoreVertIcon fontSize="small" /></IconButton>,
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Audiencias"
        subtitle="Segmento del CRM + filtros de comportamiento de marketing. La segmentación se gestiona en Clientes."
        actions={
          <>
            <Button variant="secondary" component={RouterLink} to="/clientes/segmentos">Ver segmentos (CRM)</Button>
            <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({ draft: EMPTY })}>Nueva audiencia</Button>
          </>
        }
      />

      <DataTable columns={columns} data={rows} onRowClick={(r) => setModal({ draft: r, id: r.id })} emptyMessage="No hay audiencias." />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ draft: activeRow, id: activeRow.id }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem onClick={() => { deleteAudience(activeRow.id); setAnchor(null); refresh(); showToast("Audiencia eliminada", "info"); }}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <Modal
          open
          onClose={() => setModal(null)}
          title={modal.id ? "Editar audiencia" : "Nueva audiencia"}
          maxWidth="md"
          actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button variant="primary" onClick={handleSave}>Guardar</Button></>}
        >
          <Box sx={{ pt: 1 }}>
            <AudienceBuilder value={modal.draft} onChange={(draft) => setModal((m) => ({ ...m, draft }))} />
          </Box>
        </Modal>
      )}
    </Box>
  );
};

export default Audiencias;
