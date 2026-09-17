import AddIcon from "@mui/icons-material/Add";
import Button from "../Button";

/** @deprecated Usar <Button variant="primary" startIcon={<AddIcon/>}>. Se mantiene por compatibilidad. */
const AddButton = ({ children = "Agregar", ...props }) => (
  <Button variant="primary" startIcon={<AddIcon />} {...props}>
    {children}
  </Button>
);

export default AddButton;
