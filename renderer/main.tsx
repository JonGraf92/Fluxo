import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './design-system/tokens.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Elemento #root não encontrado.');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
