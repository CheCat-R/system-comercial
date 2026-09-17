import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";

import SearchBar from "../SearchBar/SearchBar";
import AddButton from "../Button/AddButton/AddButton";
import DeleteButton from "../Button/DeleteButton/DeleteButton";

import "./Toolbar.css";

/**
 * Componente Toolbar Reutilizable con Buscador, Filtros, Botón Agregar y Acciones Masivas
 * @param {string} searchValue - Valor de la búsqueda
 * @param {function} onSearchChange - Handler de cambio en la búsqueda
 * @param {string} searchPlaceholder - Placeholder del buscador
 * @param {string} filterValue - Valor del filtro de estado
 * @param {function} onFilterChange - Handler del filtro de estado
 * @param {Array} filterOptions - Opciones de filtro [{ label: "Todos", value: "" }, ...]
 * @param {function} onAddClick - Handler para el botón agregar
 * @param {string} addText - Texto del botón agregar (default: "Agregar")
 * @param {number} selectedCount - Cantidad de filas seleccionadas
 * @param {function} onBulkDelete - Handler para eliminar selección en lote
 * @param {ReactNode} bulkActions - Acciones personalizadas de lote adicionales
 */
const Toolbar = ({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filterValue = "",
  onFilterChange,
  filterOptions = [],
  onAddClick,
  addText = "Agregar",
  selectedCount = 0,
  onBulkDelete,
  bulkActions,
}) => {
  // Si hay elementos seleccionados, mostramos la barra de acciones masivas
  if (selectedCount > 0) {
    return (
      <Box className="toolbar-bulk-bar">
        <Typography variant="body2" className="toolbar-bulk-text">
          {selectedCount} {selectedCount === 1 ? "registro seleccionado" : "registros seleccionados"}
        </Typography>

        <Box className="toolbar-bulk-actions">
          {bulkActions}
          {onBulkDelete && (
            <DeleteButton size="small" onClick={onBulkDelete}>
              Eliminar Selección ({selectedCount})
            </DeleteButton>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box className="toolbar-container">
      <Box className="toolbar-left">
        {onSearchChange && (
          <SearchBar
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            width={320}
          />
        )}

        {filterOptions.length > 0 && onFilterChange && (
          <TextField
            select
            size="small"
            value={filterValue}
            onChange={onFilterChange}
            className="toolbar-select-field"
            sx={{ minWidth: 180 }}
            slotProps={{ select: { displayEmpty: true } }}
          >
            {filterOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      <Box className="toolbar-right">
        {onAddClick && <AddButton onClick={onAddClick}>{addText}</AddButton>}
      </Box>
    </Box>
  );
};

export default Toolbar;
