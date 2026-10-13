import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { PublicLayout } from './layouts/PublicLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { BusinessesPage } from './features/businesses/BusinessesPage';
import { BusinessDetailsPage } from './features/businesses/BusinessDetailsPage';
import { DashboardPage, DashboardPlaceholder } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'BooklyPro · Tu tiempo, bien elegido';
  }, [pathname]);
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route
          path="businesses/:businessId"
          element={<BusinessDetailsPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="appointments"
            element={<DashboardPlaceholder kind="appointments" />}
          />
          <Route
            path="businesses"
            element={<DashboardPlaceholder kind="businesses" />}
          />
        </Route>
      </Route>
    </Routes>
  );
}
