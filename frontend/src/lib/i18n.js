import { createContext, useContext, useState } from 'react';

const translations={
 en:{'nav.today':'Today','nav.care-plan':'Care Plan','nav.messages':'Messages','nav.account':'Account','nav.practice':'Home practice','nav.children':'Children'},
 hi:{'nav.today':'आज','nav.care-plan':'देखभाल योजना','nav.messages':'संदेश','nav.account':'खाता','nav.practice':'घर पर अभ्यास','nav.children':'बच्चे'},
};
const LanguageContext=createContext(null);
export const LanguageProvider=({children})=>{const [language,setLanguage]=useState(()=>localStorage.getItem('moonlight-language')||'en');const change=value=>{localStorage.setItem('moonlight-language',value);setLanguage(value);};const t=(key,fallback)=>translations[language]?.[key]||fallback||key;return <LanguageContext.Provider value={{language,setLanguage:change,t,reviewStatus:language==='hi'?'Navigation translated; clinical Hindi review pending.':'Approved source language.'}}>{children}</LanguageContext.Provider>;};
export const useLanguage=()=>useContext(LanguageContext);