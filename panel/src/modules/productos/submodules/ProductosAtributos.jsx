import { useState } from "react";
import Box from "@mui/material/Box";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
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

const initialAttributes = [
  { id: 1, name: "Color", terms: "Negro, Blanco, Azul, Rojo, Plateado" },
  { id: 2, name: "Talle / Tamaño", terms: "S, M, L, XL, XXL" },
  { id: 3, name: "Almacenamiento", terms: "128GB, 256GB, 512GB, 1TB" },
  { id: 4, name: "Memoria RAM", terms: "8GB, 16GB, 32GB, 64GB" },
];

const ProductosAtributos = () => {
  const { showToast } = useToast();
  const [attributes, setAttributes] = useState(initialAttributes);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", terms: "" });

  const filteredAttributes = attributes.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveAttribute = () => {
    if (!formData.name) {
      showToast("Ingresa el nombre del atributo", "warning");
      return;
    }

    const newAttr = {
      id: Date.now(),
      name: formData.name,
      terms: formData.terms || "Predeterminado",
    };

    setAttributes([newAttr, ...attributes]);
    showToast(`Atributo "${formData.name}" creado`, "success");
    setOpenModal(false);
    setFormData({ name: "", terms: "" });
  };

  const columns = [
    { field: "name", headerName: "Atributo", width: "30%" },
    {
      field: "terms",
      headerName: "Valores / Términos",
      width: "50%",
      renderCell: (row) => (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {row.terms.split(",").map((term) => (
            <Chip key={term} label={term.trim()} size="small" variant="outlined" />
          ))}
        </Box>
      ),
    },
    {
      field: "actions",
      headerName: "Acciones",
      align: "right",
      width: "20%",
      renderCell: (row) => (
        <DeleteButton size="small" onClick={() => setAttributes(attributes.filter((a) => a.id !== row.id))}>
          Eliminar
        </DeleteButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Atributos de Productos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Define variaciones de productos (ej. Color, Talle, Capacidad).
        </Typography>
      </Box>

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        searchPlaceholder="Buscar atributo..."
        onAddClick={() => setOpenModal(true)}
        addText="Nuevo Atributo"
        selectedCount={selectedIds.length}
        onBulkDelete={() => {
          setAttributes(attributes.filter((a) => !selectedIds.includes(a.id)));
          setSelectedIds([]);
        }}
      />

      <DataTable
        columns={columns}
        data={filteredAttributes}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
              emptyState={{
          icon: <TuneOutlinedIcon />,
          title: "Todavía no hay atributos",
          description: "Un atributo (talle, color) define las variantes de un producto, y cada combinación es un SKU distinto en Inventario.",
        }}
/>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Crear Nuevo Atributo"
        actions={
          <>
            <CancelButton onClick={() => setOpenModal(false)} />
            <SaveButton onClick={handleSaveAttribute} />
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <InputField
            label="Nombre del Atributo"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ej. Material"
            required
          />
          <InputField
            label="Valores (Separados por coma)"
            value={formData.terms}
            onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
            placeholder="ej. Aluminio, Cuero, Plástico"
          />
        </Box>
      </Modal>
    </Box>
  );
};

export default ProductosAtributos;
