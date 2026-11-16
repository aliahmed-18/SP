import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { LoadingState } from '@/components/brand/brand';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { NotFoundPage } from '@/features/common/NotFoundPage';
import { HomePage } from '@/features/home/HomePage';
import { JoinPage } from '@/features/student/JoinPage';
import { StudentPage } from '@/features/student/StudentPage';

// Instructor screens are split out so phones only download the student code (weak campus Wi-Fi).
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('@/features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const HostPage = lazy(() =>
  import('@/features/session-instructor/HostPage').then((m) => ({ default: m.HostPage })),
);
const PresentPage = lazy(() =>
  import('@/features/present/PresentPage').then((m) => ({ default: m.PresentPage })),
);

const page = (node: ReactNode) => <Suspense fallback={<LoadingState />}>{node}</Suspense>;
const instructor = (node: ReactNode) => page(<RequireAuth>{node}</RequireAuth>);

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/login', element: page(<LoginPage />) },
  { path: '/register', element: page(<RegisterPage />) },
  { path: '/dashboard', element: instructor(<DashboardPage />) },
  { path: '/join/:code', element: <JoinPage /> },
  { path: '/s/:code', element: <StudentPage /> },
  { path: '/s/:code/host', element: instructor(<HostPage />) },
  { path: '/s/:code/present', element: instructor(<PresentPage />) },
  { path: '*', element: <NotFoundPage /> },
]);
