import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";

import "./SystemInfo.css";

function CustomTabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`system-tabpanel-${index}`}
      aria-labelledby={`system-tab-${index}`}
      {...other}
      className="system-info-tabpanel"
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const SystemInfo = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Box className="page fade-in">
      <Box className="page-header__text">
        <h1 className="page-title">Arquitectura del sistema</h1>
        <p className="page-subtitle">
          Reglas fundacionales, modelo de dominio y estructura de la plataforma CheCAT.
        </p>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="system architecture tabs"
          className="system-info-tabs"
        >
          <Tab label="Principios & Capas" />
          <Tab label="Modelo de Dominio" />
          <Tab label="Roles & Permisos" />
        </Tabs>
      </Box>

      {/* TAB 1: Principios y Capas */}
      <CustomTabPanel value={tabValue} index={0}>
        <Accordion defaultExpanded className="custom-accordion">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">1. Principios de Arquitectura</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <ul className="system-info-list">
              <li>
                <strong>Separación de Catálogo e Inventario:</strong> El Catálogo (Producto) es comercial y de marketing. El Inventario (Stock físico) pertenece a los depósitos. Se vinculan a través de la Variante (SKU).
              </li>
              <li>
                <strong>Separación de Ventas y Pedidos:</strong> Los Pedidos son las transacciones ejecutadas (B2C/B2B). Las Ventas incluyen los canales, cotizaciones y fuerza de venta.
              </li>
              <li>
                <strong>Multi-sucursal Nativo:</strong> Toda entidad operativa (Stock, Pedido, Usuario) debe contemplar el contexto de la Sucursal o Depósito al que pertenece.
              </li>
              <li>
                <strong>Arquitectura Orientada a Eventos:</strong> Los módulos no se acoplan estrictamente. Un evento como <code>Pedido_Pagado</code> dispara acciones asíncronas en Inventario, Logística y Finanzas.
              </li>
            </ul>
          </AccordionDetails>
        </Accordion>

        <Accordion defaultExpanded className="custom-accordion">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">2. Capas y Módulos del Sistema</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box className="modules-grid">
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Decisión & Analítica</Typography>
                <Typography variant="body2">Dashboard Central, Data & Analytics.</Typography>
              </Box>
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Comercial & Marketing</Typography>
                <Typography variant="body2">Tienda/CMS, Catálogo (Master Data), Marketing.</Typography>
              </Box>
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Transaccional</Typography>
                <Typography variant="body2">Ventas, Pedidos, Clientes/CRM.</Typography>
              </Box>
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Supply Chain</Typography>
                <Typography variant="body2">Inventario, Abastecimiento, Logística & Fulfillment.</Typography>
              </Box>
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Financiera</Typography>
                <Typography variant="body2">Finanzas, Facturación.</Typography>
              </Box>
              <Box className="module-card">
                <Typography variant="subtitle2" className="module-category">Infraestructura</Typography>
                <Typography variant="body2">Automatizaciones, Organización, Configuración, Integraciones.</Typography>
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      </CustomTabPanel>

      {/* TAB 2: Modelo de Dominio */}
      <CustomTabPanel value={tabValue} index={1}>
        <Box className="domain-grid">
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Variante (SKU)</Typography>
            <Typography variant="body2">El centro físico del sistema. Lo que realmente se almacena, vende y despacha.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Producto</Typography>
            <Typography variant="body2">Entidad de agrupación y marketing para las variantes.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Pedido (Order)</Typography>
            <Typography variant="body2">Contrato comercial principal. Genera pagos, envíos y comprobantes.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Cliente (Customer)</Typography>
            <Typography variant="body2">Centro relacional (LTV, historial, segmentos).</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Registro de Inventario</Typography>
            <Typography variant="body2">Relación exacta entre Variante + Depósito + Cantidad.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Movimiento de Inventario</Typography>
            <Typography variant="body2">Bitácora inmutable (Kardex) de ingresos y salidas físicas.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Envío (Shipment)</Typography>
            <Typography variant="body2">Paquete físico a despachar asociado al proceso de Fulfillment.</Typography>
          </Box>
          <Box className="domain-card">
            <Typography variant="subtitle1" className="domain-title">Comprobante Fiscal</Typography>
            <Typography variant="body2">Representación legal/tributaria de la transacción comercial.</Typography>
          </Box>
        </Box>
      </CustomTabPanel>

      {/* TAB 3: Roles & Permisos */}
      <CustomTabPanel value={tabValue} index={2}>
        <Box className="rbac-info-box">
          <Typography variant="body1" sx={{ mb: 2 }}>
            El acceso se evalúa mediante la fórmula estricta: <br/>
            <Chip label="[Módulo] : [Recurso] : [Acción] @ [Alcance/Scope]" color="primary" sx={{ mt: 1, fontWeight: 'bold' }} />
          </Typography>
        </Box>

        <Accordion defaultExpanded className="custom-accordion">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Roles Principales</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <ul className="system-info-list">
              <li><strong>Propietario / Super Admin:</strong> Acceso irrestricto global.</li>
              <li><strong>Administrador General:</strong> Control operativo global (sin facturación de la plataforma SaaS).</li>
              <li><strong>Gerente de Sucursal:</strong> Control total, pero limitado al <i>Alcance</i> de su propia sucursal.</li>
              <li><strong>Vendedor:</strong> Crea cotizaciones y pedidos. (Alcance: Propios o de su sucursal).</li>
              <li><strong>Operador de Depósito:</strong> Ajusta stock y prepara envíos. <i>No puede editar precios ni catálogo.</i></li>
              <li><strong>Agente de Soporte (CX):</strong> Solo lectura global, creación de RMA (devoluciones). <i>No aprueba reembolsos.</i></li>
              <li><strong>Marketing:</strong> Control de Catálogo, Promociones y Tienda. Sin acceso a stock o finanzas.</li>
              <li><strong>Finanzas:</strong> Aprueba reembolsos, conciliación, facturación.</li>
            </ul>
          </AccordionDetails>
        </Accordion>

        <Accordion defaultExpanded className="custom-accordion">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Reglas Críticas de Seguridad</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <ul className="system-info-list">
              <li><strong>Exportación aislada:</strong> El permiso <code>exportar</code> es el más restringido del sistema. Poder "Ver" no implica poder extraer la base de datos.</li>
              <li><strong>Separación Comercial/Física:</strong> El rol Depósito altera cantidades físicas, nunca precios.</li>
              <li><strong>Regla del Reembolso (Separación de intereses):</strong> CX solicita la devolución, Depósito recibe y valida el paquete, Finanzas aprueba el movimiento de dinero final. Ningún rol individual puede hacer el flujo completo.</li>
            </ul>
          </AccordionDetails>
        </Accordion>
      </CustomTabPanel>
    </Box>
  );
};

export default SystemInfo;
