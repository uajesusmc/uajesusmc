import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ProveedorApp } from './estado';
import './estilos.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProveedorApp>
      <App />
    </ProveedorApp>
  </React.StrictMode>,
);
