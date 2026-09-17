import { useState } from "react";
import Box from "@mui/material/Box";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";

import DataTable from "../../../components/DataTable/DataTable";
import Modal from "../../../components/Modal/Modal";
import Toolbar from "../../../components/Toolbar/Toolbar";
import DeleteButton from "../../../components/Button/DeleteButton/DeleteButton";
import SaveButton from "../../../components/Button/SaveButton/SaveButton";
import CancelButton from "../../../components/Button/CancelButton/CancelButton";
import InputField from "../../../components/Form/InputField/InputField";
import { useToast } from "../../../components/Toast/ToastContext";

const initialTags = [
  { id: 1, name: "Oferta", color: "#ef4444", count: 18 },
  { id: 2, name: "Nuevo", color: "#10b981", count: 25 },
  { id: 3, name: "Más Vendido", color: "#f59e0b", count: 14 },
  { id: 4, name: "Envío Gratis", color: "#3b82f6", count: 32 },
  { id: 5, name: "CyberMonday", color: "#8b5cf6", count: 9 },
];

const ProductosEtiquetas = () => {
  const { showToast } = useToast();
  const [tags, setTags] = useState(initialTags);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", color: "#3b82f6" });

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveTag = () => {
    if (!formData.name) {
      showToast("Ingresa el nombre de la etiqueta", "warning");
      return;
    }

    const newTag = {
      id: Date.now(),
      name: formData.name,
      color: formData.color,
      count: 0,
    };

    setTags([newTag, ...tags]);
    showToast(`Etiqueta "${formData.name}" creada`, "success");
    setOpenModal(false);
    setFormData({ name: "", color: "#3b82f6" });
  };

  const columns = [
    {
      field: "name",
      headerName: "Etiqueta",
      width: "40%",
      renderCell: (row) => (
        <Chip
          label={row.name}
          size="small"
          sx={{ bgcolor: row.color, color: "#fff", fontWeight: 700 }}
        />
      ),
    },
    { field: "count", headerName: "Productos Asociados", width: "40%", renderCell: (row) => `${row.count} prod.` },
    {
      field: "actions",
      headerName: "Acciones",
      align: "right",
      width: "20%",
      renderCell: (row) => (
        <DeleteButton size="small" onClick={() => setTags(tags.filter((t) => t.id !== row.id))}>
          Eliminar
        </DeleteButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Etiquetas de Productos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Etiquetas promocionales y destacadas (ej: Oferta, Nuevo, Envío Gratis).
        </Typography>
      </Box>

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        searchPlaceholder="Buscar etiqueta..."
        onAddClick={() => setOpenModal(true)}
        addText="Nueva Etiqueta"
        selectedCount={selectedIds.length}
        onBulkDelete={() => {
          setTags(tags.filter((t) => !selectedIds.includes(t.id)));
          setSelectedIds([]);
        }}
      />

      <DataTable
        columns={columns}
        data={filteredTags}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
              emptyState={{
          icon: <LocalOfferOutlinedIcon />,
          title: "Todavía no hay etiquetas",
          description: "Las etiquetas cruzan categorías: «nuevo», «outlet», «edición limitada». Se usan para armar colecciones en la tienda.",
        }}
/>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Crear Nueva Etiqueta"
        actions={
          <>
            <CancelButton onClick={() => setOpenModal(false)} />
            <SaveButton onClick={handleSaveTag} />
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <InputField
            label="Nombre de Etiqueta"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ej. Outlet"
            required
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default ProductosEtiquetas;
