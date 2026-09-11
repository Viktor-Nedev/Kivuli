import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker, resetServiceWorker } from './lib/swRegister';

const el = document.getElementById('root');
if (!el) throw new Error('Root element missing from index.html');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline support: the app shell plus the last station reading. Registered
// after render so it never competes with the first paint, and guarded so a
// browser without service workers simply gets the ordinary online app.
registerServiceWorker();

// The recovery for a cached broken build, reachable from a phone's remote
// console where adding `?nosw` to a URL is awkward.
declare global {
  interface Window {
    kivuliReset?: () => Promise<void>;
  }
}
window.kivuliReset = resetServiceWorker;
