import { useState } from "react";
import Box from "@mui/material/Box";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
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

const initialBrands = [
  { id: 1, name: "Dell", slug: "dell", count: 12, status: "Activo" },
  { id: 2, name: "Samsung", slug: "samsung", count: 24, status: "Activo" },
  { id: 3, name: "Sony", slug: "sony", count: 8, status: "Activo" },
  { id: 4, name: "LG", slug: "lg", count: 15, status: "Activo" },
  { id: 5, name: "Keychron", slug: "keychron", count: 6, status: "Activo" },
  { id: 6, name: "Logitech", slug: "logitech", count: 19, status: "Activo" },
];

const ProductosMarcas = () => {
  const { showToast } = useToast();
  const [brands, setBrands] = useState(initialBrands);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [openModal, setOpenModal] = useState(false);

  const [formData, setFormData] = useState({ name: "", slug: "", status: "Activo" });

  const filteredBrands = brands.filter(
    (b) =>
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveBrand = () => {
    if (!formData.name) {
      showToast("Ingresa el nombre de la marca", "warning");
      return;
    }

    const newBrand = {
      id: Date.now(),
      name: formData.name,
      slug: formData.slug || formData.name.toLowerCase().replace(/\s+/g, "-"),
      count: 0,
      status: formData.status,
    };

    setBrands([newBrand, ...brands]);
    showToast(`Marca "${formData.name}" registrada exitosamente`, "success");
    setOpenModal(false);
    setFormData({ name: "", slug: "", status: "Activo" });
  };

  const handleDeleteBrand = (id, name) => {
    setBrands(brands.filter((b) => b.id !== id));
    showToast(`Marca "${name}" eliminada`, "info");
  };

  const columns = [
    { field: "name", headerName: "Nombre de Marca", width: "35%" },
    { field: "slug", headerName: "Slug URL", width: "25%" },
    { field: "count", headerName: "Productos Asociados", width: "20%", renderCell: (row) => `${row.count} prod.` },
    { field: "status", headerName: "Estado", width: "10%", renderCell: (row) => <StatusBadge status={row.status} /> },
    {
      field: "actions",
      headerName: "Acciones",
      align: "right",
      width: "10%",
      renderCell: (row) => (
        <DeleteButton size="small" onClick={() => handleDeleteBrand(row.id, row.name)}>
          Eliminar
        </DeleteButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Gestión de Marcas
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Administra las marcas comerciales de los productos en tu catálogo e-commerce.
        </Typography>
      </Box>

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        searchPlaceholder="Buscar marca..."
        onAddClick={() => setOpenModal(true)}
        addText="Nueva Marca"
        selectedCount={selectedIds.length}
        onBulkDelete={() => {
          setBrands(brands.filter((b) => !selectedIds.includes(b.id)));
          setSelectedIds([]);
          showToast("Marcas seleccionadas eliminadas", "info");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredBrands}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
              emptyState={{
          icon: <SellOutlinedIcon />,
          title: "Todavía no hay marcas",
          description: "Una marca agrupa productos de un mismo fabricante y se usa como filtro en la tienda y en el catálogo.",
        }}
/>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Crear Nueva Marca"
        actions={
          <>
            <CancelButton onClick={() => setOpenModal(false)} />
            <SaveButton onClick={handleSaveBrand} />
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <InputField
            label="Nombre de Marca"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ej. Apple"
            required
          />
          <InputField
            label="Slug URL"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="ej. apple"
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

export default ProductosMarcas;
