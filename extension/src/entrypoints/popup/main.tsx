import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../../ui/app-context';
import { PopupApp } from '../../ui/popup/PopupApp';
import '../../ui/styles/base.css';
import '../../ui/popup/popup.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <PopupApp />
    </AppProvider>
  </StrictMode>,
);
