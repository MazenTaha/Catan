import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts';
import './styles/index.css';
import { App } from './App';
import { startFrameWatch } from './state/frameWatch';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
startFrameWatch();
