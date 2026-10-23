import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import './App.css';
import './school.css';
import './auth.css';
import { lazy, Suspense } from 'react';
import { AuthProvider, OrganizationProvider, BookingProvider } from './lib/context';
import { ContentProvider } from './lib/cms';
import { RouteManifest } from './lib/routes';
import { PublicLayout } from './components/PublicLayout';
import Home from './pages/Home';
import Services from './pages/Services';
import SportsPage from './pages/Sports';
import Information, { NotFound } from './pages/Information';
import Assessment from './pages/Assessment';
import Locations, { ZonePage } from './pages/Locations';
import HomeTutor from './pages/HomeTutor';

// Portal and account screens load only when someone signs in, keeping the public website light.
const PortalLayout = lazy(() => import('./components/PortalLayout').then((m) => ({ default: m.PortalLayout })));
const Login = lazy(() => import('./pages/Login'));
const Parent = lazy(() => import('./pages/Parent'));
const Staff = lazy(() => import('./pages/Staff'));
const Admin = lazy(() => import('./pages/Admin'));
const School = lazy(() => import('./pages/School'));
const AccountAccess = lazy(() => import('./pages/AccountAccess'));
const AccountSecurity = lazy(() => import('./pages/AccountSecurity'));
const PaymentComplete = lazy(() => import('./pages/PaymentComplete'));

const RouteEffects = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    // Public pages set their own title and description (useSeo); this covers the portal and account pages.
    if (pathname.startsWith('/portal') || ['/login', '/accept-invite', '/forgot-password', '/reset-password', '/security-setup'].includes(pathname)) {
      document.title = 'Your secure workspace | Moonlight Neurocare';
    }
  }, [pathname]);
  return null;
};
const Loading = () => (
  <div className="loading-screen" role="status">
    Loading…
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrganizationProvider>
          <ContentProvider>
            <BookingProvider>
              <RouteEffects />
              <RouteManifest />
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/therapies" element={<Services />} />
                    <Route path="/therapies/:slug" element={<Services />} />
                    <Route path="/home-tutor-gurugram" element={<HomeTutor />} />
                    <Route path="/home-tutor" element={<Navigate to="/home-tutor-gurugram" replace />} />
                    <Route path="/sports" element={<SportsPage />} />
                    <Route path="/sports/:slug" element={<SportsPage />} />
                    <Route path="/locations" element={<Locations />} />
                    <Route path="/locations/:area" element={<Locations />} />
                    <Route path="/locations/:area/:therapy" element={<Locations />} />
                    <Route path="/areas/:zone" element={<ZonePage />} />
                    <Route path="/book-assessment" element={<Assessment />} />
                    {[
                      'about',
                      'our-approach',
                      'for-parents',
                      'fees',
                      'center',
                      'resources',
                      'contact',
                      'faqs',
                      'what-to-expect',
                      'international/families-visiting-india',
                      'international/dubai-to-gurugram',
                      'locations/gurugram-sector-37c',
                    ].map((path) => (
                      <Route key={path} path={`/${path}`} element={<Information />} />
                    ))}
                    <Route path="/policies/:policy" element={<Information />} />
                    <Route path="/payment-complete" element={<PaymentComplete />} />
                    <Route path="/appointment" element={<Navigate to="/book-assessment" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route path="/login" element={<Login />} />
                  <Route path="/accept-invite" element={<AccountAccess mode="invite" />} />
                  <Route path="/forgot-password" element={<AccountAccess mode="forgot" />} />
                  <Route path="/reset-password" element={<AccountAccess mode="reset" />} />
                  <Route path="/security-setup" element={<AccountSecurity />} />
                  <Route path="/portal/:role" element={<PortalLayout />}>
                    <Route path=":view" element={<PortalPage />} />
                    <Route index element={<PortalPage />} />
                  </Route>
                </Routes>
              </Suspense>
              <Toaster position="bottom-right" richColors closeButton />
            </BookingProvider>
          </ContentProvider>
        </OrganizationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
const PortalPage = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith('/portal/parent')) return <Parent />;
  if (pathname.startsWith('/portal/staff')) return <Staff />;
  if (pathname.startsWith('/portal/school')) return <School />;
  return <Admin />;
};
export default App;
