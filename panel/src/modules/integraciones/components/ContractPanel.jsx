/**
 * Qué entra y qué sale de un puerto.
 *
 * **El contrato está en el modelo del panel, no en el del proveedor.** Un
 * adaptador traduce en los dos sentidos; si un proveedor no puede devolver todo
 * lo que dice `output`, no puede implementar este puerto — antes que un objeto a
 * medias, no se conecta.
 */
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

const TYPE_HINT = {
  money: "Importe en pesos, entero",
  date: "Fecha ISO",
  list: "Lista",
  object: "Objeto anidado",
  boolean: "Sí / no",
  decimal: "Número con decimales",
  number: "Número entero",
  string: "Texto",
};

const FieldList = ({ fields }) => (
  <Box className="in-fields">
    {Object.entries(fields).map(([name, type]) => (
      <Tooltip key={name} title={TYPE_HINT[type] || type}>
        <div className="in-field">
          <code>{name}</code>
          <em>{type}</em>
        </div>
      </Tooltip>
    ))}
  </Box>
);

const ContractPanel = ({ port }) => (
  <Card className="entity-card">
    <Box className="card-title-row">
      <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>Qué entra y qué sale</Typography>
      <Typography variant="caption" className="text-tertiary">
        En el modelo del panel — el adaptador traduce
      </Typography>
    </Box>

    <Box className="in-contract">
      <div className="in-contract__side">
        <span className="in-label">
          <ArrowUpwardIcon sx={{ fontSize: 13 }} /> Entra (del panel al proveedor)
        </span>
        <FieldList fields={port.input} />
      </div>

      <div className="in-contract__side">
        <span className="in-label">
          <ArrowDownwardIcon sx={{ fontSize: 13 }} /> Sale (lo que el núcleo espera de vuelta)
        </span>
        <FieldList fields={port.output} />
      </div>
    </Box>

    <p className="in-note__text">
      Un proveedor que no pueda devolver todos los campos de la derecha
      <strong> no puede implementar este puerto</strong>. Lo verifica
      <code className="in-code"> assertProviderContracts() </code> al cargar el módulo, no la UI.
    </p>
  </Card>
);

export default ContractPanel;
