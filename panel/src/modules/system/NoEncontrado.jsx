/**
 * 404 — la dirección no existe.
 *
 * ⭐ Antes esto era `<Navigate to="/" replace />`: escribir mal una URL te
 * depositaba en el Dashboard **sin decir nada**, y quedabas convencido de que
 * habías hecho clic en el lugar equivocado. Un redirect silencioso convierte un
 * error del sistema en una duda de la persona.
 *
 * Vive dentro del layout, así que el menú sigue estando: la salida es obvia.
 */
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";

import Button from "../../components/Button/Button";
import { useUI } from "../../context/UIContext";
import "./NoEncontrado.css";

const NoEncontrado = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleCommandPalette } = useUI();

  return (
    <Box className="page fade-in">
      <Card className="entity-card nf-card">
        <span className="nf-icon"><TravelExploreOutlinedIcon /></span>

        <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
          Esa dirección no existe
        </Typography>

        <Typography variant="body2" className="text-secondary">
          No hay ninguna pantalla en <code className="nf-path">{location.pathname}</code>. Puede que el
          enlace esté mal escrito, que venga de una versión anterior del panel, o que la sección se
          haya movido de lugar.
        </Typography>

        <Box className="nf-actions">
          <Button variant="ghost" onClick={() => navigate(-1)}>Volver</Button>
          <Button variant="secondary" onClick={() => navigate("/")}>Ir al inicio</Button>
          <Button variant="primary" onClick={toggleCommandPalette}>Buscar en el panel</Button>
        </Box>

        <Typography variant="caption" className="text-tertiary">
          También podés abrir la búsqueda con <kbd className="nf-kbd">Ctrl</kbd> +
          <kbd className="nf-kbd">K</kbd> desde cualquier pantalla.
        </Typography>
      </Card>
    </Box>
  );
};

export default NoEncontrado;
