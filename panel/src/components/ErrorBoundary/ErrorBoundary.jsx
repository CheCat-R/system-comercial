/**
 * ⭐ La red de contención del panel.
 *
 * Antes de esto, un error de render en cualquiera de las 204 pantallas dejaba la
 * aplicación **en blanco**: sin mensaje, sin forma de volver y sin rastro para
 * quien lo reporta. Era el único hallazgo de la auditoría que calificaba como
 * riesgo y no como acabado.
 *
 * ── ⭐ Dónde se pone importa más que qué muestra ────────────────────────
 *
 * Va **dentro** del layout, envolviendo el `<Outlet>`: si envolviera la
 * aplicación entera, un error en una pantalla se llevaría puestos el sidebar y
 * la navbar, y la persona quedaría sin ningún lugar adonde ir. Acá el shell
 * sobrevive, y el error queda contenido en el rectángulo donde ocurrió.
 *
 * Se remonta al cambiar de ruta (`resetKey`): quedarse mostrando el error de la
 * pantalla anterior después de navegar sería un segundo error encima del primero.
 */
import { Component } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import Button from "../Button/Button";
import "./ErrorBoundary.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Sin backend no hay dónde reportarlo; queda en la consola, que es el único
    // lugar donde hoy alguien puede encontrarlo (§10 de la spec de Seguridad).
    if (import.meta.env?.DEV) console.error("[panel] error de render:", error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <Box className="page fade-in">
        <Card className="entity-card eb-card">
          <span className="eb-icon"><ReportProblemOutlinedIcon /></span>

          <Typography variant="h6" className="card-title" sx={{ mb: 0 }}>
            Esta pantalla se rompió
          </Typography>

          <Typography variant="body2" className="text-secondary">
            El resto del panel sigue funcionando: podés navegar a otra sección desde el menú. Lo que
            estabas mirando no se pudo dibujar, pero <strong>no se perdió ningún dato</strong> — el
            error ocurrió al mostrar, no al guardar.
          </Typography>

          <Box className="eb-detail">
            <span className="eb-detail__label">Qué falló</span>
            <code className="eb-detail__code">{error.message || String(error)}</code>
          </Box>

          {info?.componentStack && (
            <details className="eb-stack">
              <summary>Ver el detalle técnico</summary>
              <pre>{info.componentStack.trim()}</pre>
            </details>
          )}

          <Box className="eb-actions">
            <Button variant="ghost" onClick={() => window.history.back()}>Volver</Button>
            <Button variant="primary" onClick={() => this.setState({ error: null, info: null })}>
              Reintentar
            </Button>
          </Box>

          <Typography variant="caption" className="text-tertiary">
            «Reintentar» vuelve a dibujar la pantalla. Si el error se repite, es porque la causa sigue
            ahí: recargar la página entera reinicia los datos en memoria de esta sesión.
          </Typography>
        </Card>
      </Box>
    );
  }
}

export default ErrorBoundary;
