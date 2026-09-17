import { useState } from "react";
import Box from "@mui/material/Box";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import Typography from "@mui/material/Typography";
import Rating from "@mui/material/Rating";

import DataTable from "../../../components/DataTable/DataTable";
import Toolbar from "../../../components/Toolbar/Toolbar";
import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import DeleteButton from "../../../components/Button/DeleteButton/DeleteButton";
import { useToast } from "../../../components/Toast/ToastContext";

const initialReviews = [
  {
    id: 1,
    product: "Notebook Dell XPS 13",
    customer: "Juan Carlos R.",
    rating: 5,
    comment: "Excelente velocidad y materiales de primera calidad. 100% recomendado.",
    date: "2024-02-10",
    status: "Aprobado",
  },
  {
    id: 2,
    product: "Smartphone Samsung Galaxy S24",
    customer: "Laura M.",
    rating: 4,
    comment: "Muy buen teléfono, la batería dura todo el día.",
    date: "2024-02-12",
    status: "Aprobado",
  },
  {
    id: 3,
    product: "Auriculares Sony WH-1000XM5",
    customer: "Martín G.",
    rating: 5,
    comment: "La cancelación de ruido es impresionante.",
    date: "2024-02-14",
    status: "Aprobado",
  },
  {
    id: 4,
    product: "Monitor LG UltraGear 27\"",
    customer: "Pedro S.",
    rating: 2,
    comment: "Vino con un píxel quemado, tramitando garantía.",
    date: "2024-02-15",
    status: "En revisión",
  },
];

const ProductosValoraciones = () => {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState(initialReviews);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const filteredReviews = reviews.filter(
    (r) =>
      r.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.comment.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteReview = (id) => {
    setReviews(reviews.filter((r) => r.id !== id));
    showToast("Valoración eliminada", "info");
  };

  const columns = [
    { field: "product", headerName: "Producto", width: "25%" },
    { field: "customer", headerName: "Cliente", width: "20%" },
    {
      field: "rating",
      headerName: "Puntuación",
      width: "15%",
      renderCell: (row) => <Rating value={row.rating} readOnly size="small" />,
    },
    { field: "comment", headerName: "Comentario / Reseña", width: "25%" },
    { field: "status", headerName: "Estado", width: "10%", renderCell: (row) => <StatusBadge status={row.status} /> },
    {
      field: "actions",
      headerName: "Acciones",
      align: "right",
      width: "10%",
      renderCell: (row) => (
        <DeleteButton size="small" onClick={() => handleDeleteReview(row.id)}>
          Eliminar
        </DeleteButton>
      ),
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Valoraciones y Reseñas
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Modera los comentarios y opiniones dejadas por los compradores.
        </Typography>
      </Box>

      <Toolbar
        searchValue={searchTerm}
        onSearchChange={(e) => setSearchTerm(e.target.value)}
        searchPlaceholder="Buscar por producto o cliente..."
        selectedCount={selectedIds.length}
        onBulkDelete={() => {
          setReviews(reviews.filter((r) => !selectedIds.includes(r.id)));
          setSelectedIds([]);
          showToast("Reseñas seleccionadas eliminadas", "info");
        }}
      />

      <DataTable
        columns={columns}
        data={filteredReviews}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
              emptyState={{
          icon: <StarBorderOutlinedIcon />,
          title: "Todavía no hay valoraciones",
          description: "Las valoraciones llegan desde la tienda cuando un cliente puntúa un producto: no se cargan a mano desde el panel.",
        }}
/>
    </Box>
  );
};

export default ProductosValoraciones;
