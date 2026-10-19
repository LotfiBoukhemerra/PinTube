import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '../../ui/app-context';
import { DashboardApp } from '../../ui/dashboard/DashboardApp';
import '../../ui/styles/base.css';
import '../../ui/dashboard/dashboard.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <DashboardApp />
    </AppProvider>
  </StrictMode>,
);
