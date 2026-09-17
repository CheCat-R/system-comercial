/**
 * ⭐ El encabezado de una pantalla de **detalle**.
 *
 * El panel tenía dos encabezados: `PageHeader` (70 pantallas de listado) y la
 * clase suelta `entity-header` (12 pantallas de detalle). No era deriva —el
 * detalle necesita cosas que un listado no: un botón de volver, la identidad de
 * la entidad, su estado— pero **uno era componente y el otro no**, así que las
 * 12 copiaban la misma estructura JSX a mano.
 *
 * El costo se paga al cambiar: agregarle un menú de acciones o un breadcrumb al
 * detalle significaba tocar doce archivos. Ahora las dos primitivas son
 * hermanas.
 *
 * ── Composición ────────────────────────────────────────────────────────
 *
 *   <EntityHeader
 *     onBack={() => navigate("/pedidos")}
 *     title={`Pedido #${order.id}`}
 *     subtitle="03-sept, 08:15 · Depósito Palermo"
 *     eyebrow={<span className="mono">SKU-1</span>}
 *     badges={<StatusBadge status={order.paymentStatus} />}
 *     actions={<Button …>Confirmar pago</Button>}
 *   />
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import "./EntityHeader.css";

const EntityHeader = ({
  title,
  subtitle,
  eyebrow,
  badges,
  below,
  actions,
  onBack,
  backLabel = "Volver",
}) => (
  <Box className="entity-header">
    <Box className="entity-header__main">
      {onBack && (
        <Tooltip title={backLabel}>
          <IconButton className="entity-back" onClick={onBack} aria-label={backLabel}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Box className="entity-header__id">
        <Box className="entity-header__line">
          <Typography variant="h4" className="entity-title">{title}</Typography>
          {eyebrow && <span className="entity-sku">{eyebrow}</span>}
          {/* Los badges van **en la línea del título**, no debajo: el estado de
              una entidad es parte de cómo se la nombra ("Pedido #10253, pagado"),
              no un dato secundario. */}
          {badges && <Box className="entity-header__badges">{badges}</Box>}
        </Box>

        {subtitle && (
          <Typography variant="body2" component="div" className="entity-header__subtitle">
            {subtitle}
          </Typography>
        )}

        {/* ⭐ `below` existe porque cinco de las nueve pantallas de detalle tienen
            un **pipeline de estados** debajo de la identidad. No entra en
            `subtitle` (no es texto) ni en `badges` (no va en la misma línea):
            forzarlo en cualquiera de los dos habría sido inventarle un lugar. */}
        {below}
      </Box>
    </Box>

    {actions && <Box className="entity-actions">{actions}</Box>}
  </Box>
);

export default EntityHeader;
