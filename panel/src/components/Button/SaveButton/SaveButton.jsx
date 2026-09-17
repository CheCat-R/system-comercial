import CheckIcon from "@mui/icons-material/Check";
import Button from "../Button";

/** @deprecated Usar <Button variant="primary">. Se mantiene por compatibilidad. */
const SaveButton = ({ children = "Guardar", ...props }) => (
  <Button variant="primary" startIcon={<CheckIcon />} {...props}>
    {children}
  </Button>
);

export default SaveButton;
