import { createContext, useContext, useEffect, useState } from 'react';
import { api, setCsrf } from './api';

const AuthContext=createContext(null);
const OrganizationContext=createContext(null);
const BookingContext=createContext(null);

export const AuthProvider=({children})=>{
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true);
 const apply=data=>{setCsrf(data?.csrf);setUser(data?.id?data:null);return data;};
 const refreshMe=async()=>{try{const {data}=await api.get('/auth/me');return apply(data);}catch{apply(null);return null;}finally{setLoading(false);}};
 useEffect(()=>{refreshMe();},[]); // eslint-disable-line react-hooks/exhaustive-deps
 const accept=async role=>{const {data}=await api.post('/auth/demo',{role});return apply(data);};
 const login=async(email,password)=>{const {data}=await api.post('/auth/login',{email,password});if(!data.mfa_required)apply(data);return data;};
 const verifyMfa=async(challenge_token,code)=>{const {data}=await api.post('/auth/mfa/verify-login',{challenge_token,code});return apply(data);};
 const acceptInvitation=async payload=>{const {data}=await api.post('/auth/invitations/accept',payload);return apply(data);};
 const logout=async()=>{await api.post('/auth/logout');apply(null);};
 return <AuthContext.Provider value={{user,loading,accept,login,verifyMfa,acceptInvitation,refreshMe,logout}}>{children}</AuthContext.Provider>;
};
export const useAuth=()=>useContext(AuthContext);

export const OrganizationProvider=({children})=>{
 const [organization,setOrganization]=useState(null),[error,setError]=useState('');
 const reload=async()=>{setError('');try{const {data}=await api.get('/public/settings');setOrganization(data);return data;}catch(error){setError(error.response?.data?.detail||'Center information is temporarily unavailable.');return null;}};
 useEffect(()=>{reload();},[]); // eslint-disable-line react-hooks/exhaustive-deps
 return <OrganizationContext.Provider value={{organization,error,reload}}>{children}</OrganizationContext.Provider>;
};
export const useOrganization=()=>useContext(OrganizationContext);

export const BookingProvider=({children})=>{const [open,setOpen]=useState(false);return <BookingContext.Provider value={{open,setOpen,openBooking:()=>setOpen(true)}}>{children}</BookingContext.Provider>;};
export const useBooking=()=>useContext(BookingContext);