import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts';
// The Hall & Chart kit first, so Tailwind utilities (later) can adjust its classes.
import './ui/hall/hall.css';
import './styles/index.css';
import { App } from './App';
import { startFrameWatch } from './state/frameWatch';
import { fillMissingKeyCodes } from './state/host';

fillMissingKeyCodes();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
startFrameWatch();
