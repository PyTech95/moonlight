import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, mediaUrl } from './api';
import { DEFAULTS, COLLECTIONS, ICONS, ZONES } from './siteContent';

const ContentContext = createContext(null);

// Turn a stored image value into a URL: uploaded paths go through the public media endpoint,
// full URLs and site files (/moonlight-logo.webp) are used as they are.
export const imageUrl = (value) => (!value ? '' : /^(https?:)?\/\//.test(value) || value.startsWith('/') ? value : mediaUrl(value));

const csv = (value) =>
  (Array.isArray(value) ? value : String(value || '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);

export const ContentProvider = ({ children }) => {
  const [state, setState] = useState({ values: {}, collections: {}, version: 0, ready: false });
  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/public/content');
      setState({ values: data.values || {}, collections: data.collections || {}, version: data.version || 0, ready: true });
    } catch {
      setState((s) => ({ ...s, ready: true })); // defaults keep the site usable if the API is down
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (state.ready && typeof window !== 'undefined') window.__CONTENT_READY__ = true;
  }, [state.ready]);

  const value = useMemo(() => {
    const raw = (key) => (Object.prototype.hasOwnProperty.call(state.values, key) ? state.values[key] : DEFAULTS[key]);
    const collection = (name) => {
      const stored = state.collections[name];
      return Array.isArray(stored) ? stored : COLLECTIONS[name].defaults;
    };
    const withIcon = (item) => ({ ...item, Icon: ICONS[item.icon] || ICONS.Sparkles, color: item.color || 'sage' });
    const therapies = collection('therapies').map(withIcon);
    const sports = collection('sports').map((item) => ({
      ...withIcon(item),
      schedule: (item.schedule || []).map((row) => (Array.isArray(row) ? row : String(row).split('|').map((s) => s.trim()))),
    }));
    const areas = collection('areas').map((area) => ({ ...area, near: area.near || [], index_therapies: area.index_therapies || [] }));
    return {
      ready: state.ready,
      version: state.version,
      reload,
      raw,
      t: (key, vars) => {
        let text = raw(key);
        text = text == null ? '' : String(text);
        if (vars) Object.entries(vars).forEach(([k, v]) => (text = text.replaceAll(`{${k}}`, v)));
        return text;
      },
      list: (key) => (Array.isArray(raw(key)) ? raw(key) : []).filter((v) => v !== '' && v != null),
      items: (key) => (Array.isArray(raw(key)) ? raw(key) : []),
      img: (key) => imageUrl(raw(key)),
      csv,
      therapies,
      sports,
      faqs: collection('faqs'),
      areas,
      pageAreas: areas.filter((a) => a.page),
      zones: ZONES,
    };
  }, [state, reload]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
};

export const useContent = () => useContext(ContentContext);

// Renders text with line breaks ("\n") as separate lines.
export const Lines = ({ text }) =>
  String(text || '')
    .split('\n')
    .map((line, i, all) => (
      <span key={i}>
        {line}
        {i < all.length - 1 && <br />}
      </span>
    ));
