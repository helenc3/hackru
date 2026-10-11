import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Speak Your Way root element is missing.');

// Read-only component gallery for visual review; lazy so it stays out of the game's load path.
const Gallery = window.location.pathname === '/__gallery'
  ? lazy(() => import('./city/gallery/Gallery').then((module) => ({ default: module.Gallery }))) : null;

createRoot(root).render(
  <StrictMode>
    {Gallery ? <Suspense fallback={null}><Gallery /></Suspense> : <App />}
  </StrictMode>,
);
