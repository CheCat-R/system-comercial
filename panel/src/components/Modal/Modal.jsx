import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import CloseIcon from "@mui/icons-material/Close";

import "./Modal.css";

/**
 * Componente Modal Reutilizable para ABMs, confirmaciones o detalles
 * @param {boolean} open - Estado de visibilidad
 * @param {function} onClose - Handler para cerrar el modal
 * @param {string} title - Título del diálogo
 * @param {string} subtitle - Subtítulo descriptivo opcional
 * @param {ReactNode} children - Contenido o formulario del modal
 * @param {ReactNode} actions - Botones de acción del footer (SaveButton, CancelButton, etc.)
 * @param {string} maxWidth - Tamaño máximo del diálogo ("xs" | "sm" | "md" | "lg")
 */
const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  maxWidth = "sm",
  fullWidth = true,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      disableRestoreFocus
      slotProps={{
        paper: { className: "custom-modal-paper" },
        backdrop: {
          style: { backgroundColor: "var(--bg-overlay)", backdropFilter: "blur(3px)" },
        },
      }}
    >
      <Box className="custom-modal-title-box">
        <Box>
          <Typography variant="h6" className="custom-modal-title">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" className="custom-modal-subtitle">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="cerrar" onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent className="custom-modal-content">{children}</DialogContent>

      {actions && <DialogActions className="custom-modal-actions">{actions}</DialogActions>}
    </Dialog>
  );
};

export default Modal;
