import { useState } from "react";
import Box from "@mui/material/Box";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import Typography from "@mui/material/Typography";

import DataTable from "../../../components/DataTable/DataTable";
import Modal from "../../../components/Modal/Modal";
import Toolbar from "../../../components/Toolbar/Toolbar";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import DeleteButton from "../../../components/Button/DeleteButton/DeleteButton";
import SaveButton from "../../../components/Button/SaveButton/SaveButton";
import CancelButton from "../../../components/Button/CancelButton/CancelButton";
import InputField from "../../../components/Form/InputField/InputField";
import SelectField from "../../../components/Form/SelectField/SelectField";
import { useToast } from "../../../components/Toast/ToastContext";

const initialCategories = [
  { id: 1, name: "Computación", slug: "computacion", count: 42, status: "Activo" },
  { id: 2, name: "Electrónica", slug: "electronica", count: 35, status: "Activo" },
  { id: 3, name: "Audio", slug: "audio", count: 18, status: "Activo" },
  { id: 4, name: "Periféricos", slug: "perifericos", count: 29, status: "Activo" },
  { id: 5, name: "Accesorios", slug: "accesorios", count: 14, status: "Activo" },
];

const ProductosCategorias = () => {
  const { showToast } = useToast();
  const [categories, setCategories] = useState(initialCategories);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [openModal, setOpenModal] = useState(false);

  const [formData, setFormData] = useState({ name: "", slug: "", status: "Activo" });

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveCategory = () => {
    if (!formData.name) {
      showToast("Ingresa el nombre de la categoría", "warning");
      return;
    }

    const newCat = {
      id: Date.now(),
      name: formData.name,
      slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, "-"),
      count: 0,
      status: formData.status,
    };

    setCategories([newCat, ...categories]);
    showToast(`Categoría "${formData.name}" registrada exitosamente`, "success");
    setOpenModal(false);
    setFormData({ name: "", slug: "", status: "Activo" });
  };

  const handleDeleteCategory = (id, name) => {
    setCategories(categories.filter((c) => c.id !== id));
    showToast(`Categoría "${name}" eliminada`, "info");
  };

  const columns = [
    { field: "name", headerName: "Categoría", width: "35%" },
    { field: "slug", headerName: "Slug URL", width: "25%" },
    { field: "count", headerName: "Cantidad de Productos", width: "20%", renderCell: (row) => `${row.count} prod.` },
    { field: "status", headerName: "Estado", width: "10%", renderCell: (row) => <StatusBadge status={row.status} /> },
    {
      field: "actions",
      headerName: "Acciones",
      align: "right",
      width: "10%",
      renderCell: (row) => (
        <DeleteButton size="small" onClick={() => handleDeleteCategory(row.id, row.name)}>
          Eliminar
        </DeleteButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Categorías de Productos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Organiza la jerarquía y taxonomía de tu tienda online.
        </Typography>
      </Box>

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        searchPlaceholder="Buscar categoría..."
        onAddClick={() => setOpenModal(true)}
        addText="Nueva Categoría"
        selectedCount={selectedIds.length}
        onBulkDelete={() => {
          setCategories(categories.filter((c) => !selectedIds.includes(c.id)));
          setSelectedIds([]);
          showToast("Categorías seleccionadas eliminadas", "info");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredCategories}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
              emptyState={{
          icon: <CategoryOutlinedIcon />,
          title: "Todavía no hay categorías",
          description: "La categoría es el corte principal del catálogo: ordena la tienda y es una dimensión de Analytics.",
        }}
/>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Crear Nueva Categoría"
        actions={
          <>
            <CancelButton onClick={() => setOpenModal(false)} />
            <SaveButton onClick={handleSaveCategory} />
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <InputField
            label="Nombre de Categoría"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ej. Monitores"
            required
          />
          <InputField
            label="Slug URL"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="ej. monitores"
          />
          <SelectField
            label="Estado"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={["Activo", "Inactivo"]}
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default ProductosCategorias;
