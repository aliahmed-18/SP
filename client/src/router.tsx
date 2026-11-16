import { createBrowserRouter } from 'react-router';
import { ComingSoonPage } from '@/features/common/ComingSoonPage';
import { NotFoundPage } from '@/features/common/NotFoundPage';
import { HomePage } from '@/features/home/HomePage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  // Built in Phase 2:
  { path: '/login', element: <ComingSoonPage title="Log in" /> },
  { path: '/register', element: <ComingSoonPage title="Create account" /> },
  { path: '/join/:code', element: <ComingSoonPage title="Join a lecture" /> },
  { path: '*', element: <NotFoundPage /> },
]);
