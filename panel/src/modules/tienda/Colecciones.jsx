/**
 * Colecciones — el punto de acople entre contenido y catálogo.
 * "Productos destacados" es una fila de esta tabla, no un módulo aparte.
 */
import { useState, useMemo, useCallback } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import DataTable from "../../components/DataTable/DataTable";
import StatusBadge from "../../components/StatusBadge/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import CollectionEditor from "./components/CollectionEditor";
import { listCollections, updateCollection, deleteCollection } from "./api/tiendaApi";
import "./Tienda.css";

const TABS = [
  { label: "Todas", filter: {} },
  { label: "Manuales", filter: { mode: "manual" } },
  { label: "Por reglas", filter: { mode: "rules" } },
];

const Colecciones = () => {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [modal, setModal] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => listCollections(TABS[tab].filter), [tab, version]);

  const handleDelete = () => {
    const result = deleteCollection(activeRow.id);
    setAnchor(null);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    refresh();
    showToast("Colección eliminada", "success");
  };

  const columns = [
    {
      field: "name", headerName: "Colección",
      renderCell: (c) => (
        <Box className="st-pagecell">
          <span>
            <strong>
              {c.name}
              {c.system && (
                <Tooltip title="Colección de sistema: no se puede eliminar.">
                  <LockOutlinedIcon sx={{ fontSize: 13, ml: 0.5, verticalAlign: "-2px", color: "var(--text-tertiary)" }} />
                </Tooltip>
              )}
            </strong>
            <em className="mono">/coleccion/{c.slug}</em>
          </span>
        </Box>
      ),
    },
    {
      field: "mode", headerName: "Cómo se arma", align: "center",
      renderCell: (c) => <StatusBadge tone={c.mode === "manual" ? "neutral" : "info"} label={c.mode === "manual" ? "Manual" : "Por reglas"} showDot={false} />,
    },
    {
      field: "productCount", headerName: "Productos", align: "right",
      renderCell: (c) => (
        <span className={c.productCount === 0 ? "text-danger" : ""} style={{ fontWeight: 600 }}>
          {c.productCount}
        </span>
      ),
    },
    {
      field: "usedInPages", headerName: "Usada en",
      renderCell: (c) =>
        c.usedInPages.length ? (
          <span className="text-tertiary">{c.usedInPages.map((p) => p.title).join(", ")}</span>
        ) : <span className="text-tertiary">—</span>,
    },
    {
      field: "status", headerName: "Estado", align: "center",
      renderCell: (c) => <StatusBadge status={c.status} />,
    },
    {
      field: "actions", headerName: "", align: "right", width: 48,
      renderCell: (c) => (
        <IconButton
          size="small" aria-label="acciones"
          onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); setActiveRow(c); }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Colecciones"
        subtitle="Qué productos van en cada bloque. Curadas a mano o resueltas por reglas contra el catálogo."
        actions={
          <Button variant="primary" startIcon={<AddIcon />} onClick={() => setModal({})}>
            Nueva colección
          </Button>
        }
      />

      <Box className="table-tabs">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
        </Tabs>
      </Box>

      <DataTable
        columns={columns} data={rows}
        onRowClick={(c) => setModal({ collection: c })}
        emptyMessage="No hay colecciones con este filtro."
      />

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setModal({ collection: activeRow }); setAnchor(null); }}>Editar</MenuItem>
        <MenuItem
          onClick={() => {
            updateCollection(activeRow.id, { status: activeRow.status === "activa" ? "borrador" : "activa" });
            setAnchor(null); refresh(); showToast("Estado actualizado", "success");
          }}
        >
          {activeRow?.status === "activa" ? "Pasar a borrador" : "Activar"}
        </MenuItem>
        <MenuItem disabled={activeRow?.system} onClick={handleDelete}>Eliminar</MenuItem>
      </Menu>

      {modal && (
        <CollectionEditor
          collection={modal.collection}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); showToast("Colección guardada", "success"); }}
        />
      )}
    </Box>
  );
};

export default Colecciones;
