import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";

import StatusBadge from "../../../components/StatusBadge/StatusBadge";
import "./SupplierHeader.css";

const SupplierHeader = ({ supplier, actions }) => (
  <Box className="entity-card sup-header">
    <Box className="sup-header__identity">
      <Avatar variant="rounded" className="sup-header__avatar">
        <BusinessOutlinedIcon />
      </Avatar>
      <Box>
        <Box className="sup-header__name-row">
          <Typography variant="h5" fontWeight={700}>{supplier.name}</Typography>
          <StatusBadge status={supplier.isActive ? "activo" : "inactivo"} />
        </Box>
        <Box className="sup-header__meta">
          <span><strong>CUIT:</strong> {supplier.taxId}</span>
          <span><strong>Contacto:</strong> {supplier.contactName}</span>
          <span><strong>Email:</strong> {supplier.email}</span>
          <span><strong>Tel:</strong> {supplier.phone}</span>
          <span><strong>Lead time:</strong> {supplier.leadTimeDays} días</span>
          <span><strong>Condiciones:</strong> {supplier.paymentTerms}</span>
        </Box>
      </Box>
    </Box>
    <Box sx={{ display: "flex", gap: 1.5, flexShrink: 0 }}>{actions}</Box>
  </Box>
);

export default SupplierHeader;
