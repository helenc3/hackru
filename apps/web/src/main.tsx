import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from './ui/primitives';
import '@radix-ui/themes/styles.css';
import { App } from './app/App';
import './app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('VibeQuest root element is missing.');

createRoot(root).render(
  <StrictMode>
    <Theme accentColor="plum" radius="large"><App /></Theme>
  </StrictMode>,
);
