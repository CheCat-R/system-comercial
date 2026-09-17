/**
 * Campo de búsqueda con lupa.
 *
 * ⚠ **Nota de la Fase B**: la auditoría lo marcó como código muerto ("cero
 * imports") y estuvo mal. La medición buscó `components/SearchBar`, y `Toolbar`
 * lo importa con una ruta relativa entre hermanos (`../SearchBar/SearchBar`),
 * así que no aparecía. Se llegó a borrar y hubo que restaurarlo: el build lo
 * cantó al instante, que es exactamente para lo que sirve tener build.
 *
 * Lección medible: contar imports por prefijo de ruta subestima el uso de
 * cualquier componente que sólo consuman sus hermanos.
 */
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import SearchIcon from "@mui/icons-material/Search";

import "./SearchBar.css";

const SearchBar = ({
  value = "",
  onChange,
  placeholder = "Buscar…",
  width,
  size = "small",
  fullWidth = false,
}) => (
  <TextField
    size={size}
    fullWidth={fullWidth}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className="search-bar"
    sx={width ? { width } : undefined}
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" />
          </InputAdornment>
        ),
      },
    }}
  />
);

export default SearchBar;
