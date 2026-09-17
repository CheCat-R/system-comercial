/**
 * Catálogo de integraciones (§9.1).
 *
 * Una fila por **puerto**, no por proveedor: lo primero que hay que poder ver es
 * *qué capacidad está conectada y a qué*. Al arrancar, todas dicen "Simulado" —
 * que es la verdad, y decirla es la mitad del valor de esta pantalla.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";

import HubOutlinedIcon from "@mui/icons-material/HubOutlined";

import PageHeader from "../../components/PageHeader/PageHeader";
import Button from "../../components/Button/Button";
import StatusBadge from "../../components/StatusBadge/StatusBadge";

import HealthStrip from "./components/HealthStrip";
import PortCard from "./components/PortCard";
import { getCatalog, getSummary, getHealthAlerts, getBrokenProviderContracts } from "./api/integrationsApi";
import "./Integraciones.css";

const Integraciones = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const catalog = useMemo(() => getCatalog({ search }), [search]);
  const summary = useMemo(() => getSummary(), []);
  const alerts = useMemo(() => getHealthAlerts(), []);
  const broken = useMemo(() => getBrokenProviderContracts(), []);

  return (
    <Box className="page fade-in">
      <PageHeader
        title="Integraciones"
        subtitle="Servicios externos conectados sin acoplarlos al núcleo. Un puerto es una capacidad que declara el panel; quién la cumple es configuración."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate("/integraciones/webhooks")}>Entrantes</Button>
            <Button variant="secondary" onClick={() => navigate("/integraciones/trafico")}>Consola de tráfico</Button>
          </>
        )}
      />

      {/* ------------------------------------------------------- resumen */}
      <Box className="in-summary">
        <div className="in-summary__item">
          <strong>{summary.ports}</strong>
          <span>puertos en {summary.categories} categorías</span>
        </div>
        <div className="in-summary__item">
          <strong>{summary.wired}</strong>
          <span>ya consumidos por el núcleo</span>
        </div>
        <div className="in-summary__item">
          <strong>{summary.providers}</strong>
          <span>proveedores definidos</span>
        </div>
        <div className="in-summary__item">
          <strong>{summary.local}</strong>
          <span>corriendo local</span>
        </div>
        <div className="in-summary__item">
          <strong>{summary.calls}</strong>
          <span>llamadas en esta sesión</span>
        </div>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Ningún puerto tiene proveedor: cada uno corre con la implementación local de su módulo, que es exactamente como funciona el panel hoy.">
          <span className="in-chip in-chip--ok">Todo simulado</span>
        </Tooltip>
      </Box>

      <HealthStrip alerts={alerts} />

      {broken.length > 0 && (
        <Card className="entity-card in-broken">
          <strong>{broken.length} proveedor(es) con contrato incompleto</strong>
          <span>No se ofrecen para conectar. {broken.join(" · ")}</span>
        </Card>
      )}

      {/* -------------------------------------------------- la explicación */}
      <Card className="entity-card in-explain">
        <HubOutlinedIcon />
        <div>
          <strong>Todavía no hay ninguna integración concreta, y está bien.</strong>
          <span>
            Este módulo define la <strong>frontera</strong>: qué capacidades pueden delegarse afuera,
            qué entra y qué sale de cada una, y con qué contrato. Cada puerto corre hoy con la
            implementación local de su módulo — la misma de siempre — y esa implementación
            <strong> la pasa el módulo, no Integraciones</strong>. Por eso desconectar un proveedor
            nunca puede romper el panel: no hay nada que desconectar que el módulo no tenga.
          </span>
        </div>
      </Card>

      <Box className="table-tabs">
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small" placeholder="Buscar capacidad…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
        />
      </Box>

      {/* ------------------------------------------------- por categoría */}
      {catalog.length === 0 ? (
        <Card className="entity-card">
          <Typography variant="body2" className="text-tertiary">Nada coincide con esa búsqueda.</Typography>
        </Card>
      ) : (
        catalog.map((cat) => (
          <Card className="entity-card" key={cat.key}>
            <Box className="card-title-row">
              <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>{cat.label}</Typography>
              <Typography variant="caption" className="text-tertiary">{cat.hint}</Typography>
            </Box>

            <Box className="in-ports">
              {cat.connections.map((c) => (
                <PortCard
                  key={c.portKey}
                  connection={c}
                  onOpen={() => navigate(`/integraciones/${encodeURIComponent(c.portKey)}`)}
                />
              ))}
            </Box>
          </Card>
        ))
      )}

      <Typography variant="caption" className="text-tertiary">
        Un puerto <strong>consumido</strong> ya lo llama un módulo del núcleo; uno
        <strong> declarado</strong> existe en el catálogo con su contrato pero todavía no lo usa
        nadie. Los dos se pueden conectar; sólo el primero cambia algo hoy.
      </Typography>

      {summary.syncOnly > 0 && (
        <Card className="entity-card in-note">
          <StatusBadge tone="warning" label="Ojo" showDot={false} />
          <span>
            {summary.syncOnly} puerto(s) están marcados <strong>síncronos</strong>: los consume una
            pantalla al renderizar, así que no pueden esperar una llamada de red. No es una limitación
            del mock — dice algo verdadero: la comisión de una pasarela no se consulta al pintar un
            reporte, es un dato que produjo el cobro y tiene que quedar guardado en el pedido.
          </span>
        </Card>
      )}
    </Box>
  );
};

export default Integraciones;
