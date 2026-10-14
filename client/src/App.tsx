import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { PublicLayout } from './layouts/PublicLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { BusinessesPage } from './features/businesses/BusinessesPage';
import { BusinessDetailsPage } from './features/businesses/BusinessDetailsPage';
import {
  BusinessList,
  BusinessOverview,
  OwnerBusinessLayout,
} from './features/owner/BusinessPages';
import { ServicesPage, EmployeesPage } from './features/owner/CatalogPages';
import { SchedulesPage } from './features/owner/SchedulesPage';
import { OwnerAppointmentsPage } from './features/owner/OwnerAppointmentsPage';
import { CustomerOverview } from './features/appointments/CustomerOverview';
import { AppointmentsPage } from './features/appointments/AppointmentsPage';
import { AppointmentDetailsPage } from './features/appointments/AppointmentDetailsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { BookingPage } from './features/booking/BookingPage';
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
        <Route path="businesses/:businessId/book" element={<BookingPage />} />
        <Route
          path="businesses/:businessId"
          element={<BusinessDetailsPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<CustomerOverview />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route
            path="appointments/:appointmentId"
            element={<AppointmentDetailsPage />}
          />
          <Route path="businesses" element={<BusinessList />} />
          <Route
            path="businesses/:businessId"
            element={<OwnerBusinessLayout />}
          >
            <Route index element={<BusinessOverview />} />
            <Route path="services" element={<ServicesPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="appointments" element={<OwnerAppointmentsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
