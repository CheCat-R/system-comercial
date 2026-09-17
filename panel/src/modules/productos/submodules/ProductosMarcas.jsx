import CatalogoGenerico from "./CatalogoGenerico";

const ProductosMarcas = () => (
  <CatalogoGenerico
    tipo="marcas" titulo="Marcas" singular="Marca"
    subtitulo="Entidades con id, no texto suelto: renombrar no rompe nada y las reglas de marca sobreviven al cambio de nombre."
  />
);

export default ProductosMarcas;
