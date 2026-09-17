import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import Button from "../Button";

/** @deprecated Usar <Button variant="ghost" color="error">. Se mantiene por compatibilidad. */
const DeleteButton = ({ children = "Eliminar", ...props }) => (
  <Button variant="ghost" color="error" startIcon={<DeleteOutlineIcon />} {...props}>
    {children}
  </Button>
);

export default DeleteButton;
