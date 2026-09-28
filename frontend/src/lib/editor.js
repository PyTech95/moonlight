import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorText } from './api';
import { useAuth, useOrganization } from './context';

const EditorContext = createContext(null);

export const LiveEditorProvider = ({ children }) => {
  const { user } = useAuth() || {};
  const { organization, reload } = useOrganization() || {};
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [editing, setEditing] = useState(() => localStorage.getItem('ml_live_editor') === '1');
  const [content, setContent] = useState({});
  const [busy, setBusy] = useState({});

  useEffect(() => { setContent(organization?.content || {}); }, [organization]);

  // Auto-open the editor for admins arriving with ?edit=1 and remember the preference.
  useEffect(() => {
    if (isAdmin && new URLSearchParams(location.search).get('edit') === '1') {
      setEditing(true);
      localStorage.setItem('ml_live_editor', '1');
    }
  }, [isAdmin, location.search]);

  const enable = useCallback(() => { setEditing(true); localStorage.setItem('ml_live_editor', '1'); }, []);
  const disable = useCallback(() => { setEditing(false); localStorage.setItem('ml_live_editor', '0'); }, []);
  const getText = useCallback((key, fallback = '') => (content[key] ?? fallback), [content]);

  const saveText = useCallback(async (key, value) => {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const { data } = await api.patch('/admin/content', { key, value });
      setContent(data.content || {});
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  }, []);

  const showEditing = editing && isAdmin;
  return (
    <EditorContext.Provider value={{ isAdmin, editing: showEditing, enable, disable, content, getText, saveText, busy, reloadOrg: reload }}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => useContext(EditorContext) || { isAdmin: false, editing: false, getText: (k, f) => f, busy: {} };
