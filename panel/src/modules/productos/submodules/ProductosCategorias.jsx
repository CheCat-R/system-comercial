import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import CatalogoGenerico from "./CatalogoGenerico";

/** Categorías y sus subcategorías. "Tradicionales" puede existir en Alfajores y en Galletitas: la unicidad es por par. */
const ProductosCategorias = () => {
  const [tab, setTab] = useState(0);
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, pt: 2 }}>
        <Tab label="Categorías" />
        <Tab label="Subcategorías" />
      </Tabs>
      {tab === 0
        ? <CatalogoGenerico tipo="categorias" titulo="Categorías" singular="Categoría" subtitulo="El primer nivel de clasificación del catálogo." />
        : <CatalogoGenerico tipo="subcategorias" titulo="Subcategorías" singular="Subcategoría" conCategoria subtitulo="El segundo nivel, dentro de una categoría." />}
    </Box>
  );
};

export default ProductosCategorias;
