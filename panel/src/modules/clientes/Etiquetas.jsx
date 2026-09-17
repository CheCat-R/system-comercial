import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";

import MoreVertIcon from "@mui/icons-material/MoreVert";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import Modal from "../../components/Modal/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import { getAllTags, setTagColor, renameTag, mergeTags, deleteTag } from "./api/clientsApi";
import "./Etiquetas.css";

const TONES = ["accent", "info", "success", "warning", "danger", "neutral"];

const Etiquetas = () => {
  const { showToast } = useToast();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const tags = getAllTags();

  const [anchor, setAnchor] = useState(null);
  const [active, setActive] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: "rename" | "merge", tag, value }

  const openMenu = (e, tag) => { setAnchor(e.currentTarget); setActive(tag); };
  const closeMenu = () => setAnchor(null);

  const doColor = (name, color) => { setTagColor(name, color); refresh(); };

  const submitDialog = () => {
    const { kind, tag, value } = dialog;
    if (kind === "rename") {
      if (!value.trim()) return showToast("Escribí el nuevo nombre", "warning");
      renameTag(tag.name, value);
      showToast(`«${tag.name}» ahora es «${value.trim().toLowerCase()}»`, "success");
    } else {
      if (!value || value === tag.name) return showToast("Elegí otra etiqueta destino", "warning");
      mergeTags(tag.name, value);
      showToast(`«${tag.name}» fusionada en «${value}»`, "success");
    }
    setDialog(null);
    refresh();
  };

  const columns = [
    {
      field: "name",
      headerName: "Etiqueta",
      width: "40%",
      renderCell: (t) => <span className={`tag-chip tag-chip--${t.color}`}>{t.name}</span>,
    },
    {
      field: "color",
      headerName: "Color",
      renderCell: (t) => (
        <Select
          size="small"
          value={t.color}
          onChange={(e) => doColor(t.name, e.target.value)}
          className="etq-color-select"
        >
          {TONES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </Select>
      ),
    },
    { field: "usageCount", headerName: "Cuentas", align: "right", renderCell: (t) => t.usageCount },
    {
      field: "actions", headerName: "", align: "right", width: 56,
      renderCell: (t) => (
        <IconButton size="small" onClick={(e) => openMenu(e, t)} aria-label="acciones">
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box className="page fade-in" key={tick}>
      <PageHeader
        title="Etiquetas"
        subtitle="Marcadores manuales de cuentas — renombrar, fusionar, recolorear."
      />

      <Card className="entity-card" sx={{ p: 0 }}>
        <DataTable columns={columns} data={tags} emptyMessage="Todavía no hay etiquetas." />
      </Card>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
        <MenuItem onClick={() => { setDialog({ kind: "rename", tag: active, value: active.name }); closeMenu(); }}>
          Renombrar
        </MenuItem>
        <MenuItem
          disabled={tags.length < 2}
          onClick={() => { setDialog({ kind: "merge", tag: active, value: "" }); closeMenu(); }}
        >
          Fusionar en…
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => { deleteTag(active.name); closeMenu(); refresh(); showToast(`Etiqueta «${active.name}» eliminada`, "info"); }}
        >
          Eliminar
        </MenuItem>
      </Menu>

      <Modal
        open={Boolean(dialog)}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "rename" ? "Renombrar etiqueta" : "Fusionar etiqueta"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button variant="primary" onClick={submitDialog}>
              {dialog?.kind === "rename" ? "Renombrar" : "Fusionar"}
            </Button>
          </>
        }
      >
        {dialog?.kind === "rename" && (
          <TextField
            label="Nuevo nombre"
            size="small"
            fullWidth
            autoFocus
            value={dialog.value}
            onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            sx={{ mt: 1 }}
          />
        )}
        {dialog?.kind === "merge" && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Todas las cuentas con <strong>«{dialog.tag.name}»</strong> pasarán a la etiqueta elegida.
              «{dialog.tag.name}» se elimina.
            </Typography>
            <Select
              size="small"
              fullWidth
              displayEmpty
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            >
              <MenuItem value="" disabled>Elegí la etiqueta destino…</MenuItem>
              {tags.filter((t) => t.name !== dialog.tag.name).map((t) => (
                <MenuItem key={t.name} value={t.name}>{t.name} ({t.usageCount})</MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </Modal>
    </Box>
  );
};

export default Etiquetas;
