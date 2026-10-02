import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerModules } from './modules';
import { iniciarActualizaciones } from '@core/pwa/actualizacion.js';

// Global stylesheets. Order matters: reset -> design tokens -> base -> utilities.
import '@styles/reset.css';
import '@styles/tokens.css';
import '@styles/global.css';
import '@styles/utilities.css';

// Composition root: register every feature module BEFORE the router reads the
// registry to build routes and navigation. This is the app's bootstrap step.
registerModules();

// Registra el service worker y vigila las versiones nuevas (avisa; no recarga solo).
iniciarActualizaciones();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
