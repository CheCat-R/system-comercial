import Button from "../Button";

/** @deprecated Usar <Button variant="ghost">. Se mantiene por compatibilidad. */
const CancelButton = ({ children = "Cancelar", ...props }) => (
  <Button variant="ghost" {...props}>
    {children}
  </Button>
);

export default CancelButton;
