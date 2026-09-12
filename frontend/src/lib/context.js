import { createContext, useContext, useEffect, useState } from 'react';
import { api, setCsrf } from './api';

const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/auth/me').then(({data}) => {setUser(data); setCsrf(data.csrf);}).catch(() => {}).finally(() => setLoading(false)); }, []);
  const accept = data => { setUser(data); setCsrf(data.csrf); };
  const logout = async () => { await api.post('/auth/logout'); setUser(null); setCsrf(''); };
  return <AuthContext.Provider value={{ user, loading, accept, logout }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);

const OrganizationContext = createContext(null);
export const OrganizationProvider = ({children}) => {
  const [organization, setOrganization] = useState(null);
  const [error, setError] = useState(false);
  const reload = () => api.get('/public/settings').then(({data}) => {setOrganization(data); setError(false);}).catch(() => setError(true));
  useEffect(() => { reload(); }, []);
  return <OrganizationContext.Provider value={{organization, reload, error}}>{children}</OrganizationContext.Provider>;
};
export const useOrganization = () => useContext(OrganizationContext);

const BookingContext = createContext(null);
export const BookingProvider = ({children}) => {
  const [open, setOpen] = useState(false);
  return <BookingContext.Provider value={{open, setOpen, openBooking:()=>setOpen(true), closeBooking:()=>setOpen(false)}}>{children}</BookingContext.Provider>;
};
export const useBooking = () => useContext(BookingContext);