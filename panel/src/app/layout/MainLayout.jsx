import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Sidebar from "../../components/Sidebar/Sidebar";
import Navbar from "../../components/Navbar/Navbar";
import AppBreadcrumbs from "../../components/Breadcrumbs/AppBreadcrumbs";
import { EntityLabelProvider } from "../../components/Breadcrumbs/EntityLabelContext";
import CommandPalette from "../../components/CommandPalette/CommandPalette";
import NotificationCenter from "../../components/NotificationCenter/NotificationCenter";
import ChatDock from "../../components/ChatDock/ChatDock";
import ErrorBoundary from "../../components/ErrorBoundary/ErrorBoundary";
import { UIProvider } from "../../context/UIContext";

import "./MainLayout.css";

const MainLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <UIProvider>
      <Box className="main-layout-wrapper">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        <Box component="main" className="main-layout-container">
          <Navbar onMenuOpen={() => setMobileOpen(true)} />

          {/* ⭐ Salta el menú de ~40 ítems que hay antes del contenido. Es el
              primer elemento enfocable de la página y sólo se ve al tabular. */}
          <a href="#contenido" className="skip-link">Saltar al contenido</a>

          <Box className="main-content" id="contenido">
            {/* La miga y la pantalla comparten contexto: la pantalla de detalle
                registra cómo se llama la entidad y la miga lo lee, sin que
                ninguna de las dos importe a la otra. */}
            <EntityLabelProvider>
              <AppBreadcrumbs />

              {/* ⭐ La red va acá adentro, no envolviendo la app: si envolviera
                  todo, un error en una pantalla se llevaría puestos el menú y la
                  navbar, y no quedaría ningún lugar adonde ir. */}
              <ErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </EntityLabelProvider>
          </Box>
        </Box>

        {/* Componentes Globales Inyectados en el Shell */}
        <CommandPalette />
        <NotificationCenter />
        <ChatDock />
      </Box>
    </UIProvider>
  );
};

export default MainLayout;