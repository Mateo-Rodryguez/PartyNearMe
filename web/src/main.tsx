import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './app.css';
import { analytics } from '#lib/analytics.js';
import { prefs } from '#lib/prefs.js';
import { session } from '#lib/session.js';
import { router } from './routes.js';

session.start();
prefs.start();
// Usage stats (lib/analytics.ts): how long the tab was used, and the last batch as it closes.
analytics.visible();
document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? analytics.hidden() : analytics.visible()));
addEventListener('pagehide', () => analytics.flush());

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
