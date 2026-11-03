import { createBrowserRouter } from 'react-router';

import Home from '@/pages/home';
import NotFound from '@/pages/not-found';

// Phase 1 adds the app shell, auth pages and guards.
export const router = createBrowserRouter([
    { path: '/', element: <Home /> },
    { path: '*', element: <NotFound /> },
]);
