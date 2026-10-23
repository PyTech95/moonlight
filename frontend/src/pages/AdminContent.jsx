import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RotateCcw, Save, Plus, Trash2, ArrowUp, ArrowDown, ImagePlus, History, Search, FileText, List } from 'lucide-react';
import { toast } from 'sonner';
import { PortalHeading } from '../components/PortalLayout';
import { api, errorText } from '../lib/api';
import { useContent, imageUrl } from '../lib/cms';
import { PAGES, DEFAULTS, COLLECTIONS, ICON_NAMES, COLORS, ZONES } from '../lib/siteContent';

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- One input, any field type ---------- */
const ImageInput = ({ value, onChange, id }) => {
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/admin/content/image', fd);
      onChange(data.path);
      toast.success('Picture uploaded. Save to publish it.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cms-image">
      {value ? <img src={imageUrl(value)} alt="" /> : <span className="cms-image-empty">No picture</span>}
      <div>
        <label className="button outlined small cms-upload" htmlFor={id}>
          <ImagePlus size={15} /> {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </label>
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} data-testid={`${id}-file`} />
        {value && (
          <button type="button" className="text-link" onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

const Input = ({ field, value, onChange, id }) => {
  const type = field.type;
  if (type === 'textarea')
    return <textarea id={id} rows={Math.min(8, Math.max(3, Math.ceil(String(value || '').length / 90)))} value={value ?? ''} onChange={(e) => onChange(e.target.value)} data-testid={id} />;
  if (type === 'image') return <ImageInput id={id} value={value} onChange={onChange} />;
  if (type === 'list')
    return (
      <textarea
        id={id}
        rows={Math.min(10, Math.max(3, (value || []).length + 1))}
        value={(value || []).join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        onBlur={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        placeholder="One item per line"
        data-testid={id}
      />
    );
  if (type === 'icon')
    return (
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        {ICON_NAMES.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    );
  if (type === 'color')
    return (
      <select id={id} value={value || 'sage'} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        {COLORS.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    );
  if (type === 'zone')
    return (
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        {ZONES.map((z) => (
          <option key={z.slug} value={z.slug}>
            {z.name}
          </option>
        ))}
      </select>
    );
  if (type === 'toggle')
    return (
      <label className="cms-toggle">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} data-testid={id} /> Yes
      </label>
    );
  if (type === 'number') return <input id={id} type="number" step="0.5" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} data-testid={id} />;
  if (type === 'items') return <ItemsInput field={field} value={value || []} onChange={onChange} id={id} />;
  return <input id={id} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} data-testid={id} />;
};

const move = (list, i, d) => {
  const next = [...list];
  const [it] = next.splice(i, 1);
  next.splice(Math.max(0, Math.min(next.length, i + d)), 0, it);
  return next;
};

const ItemsInput = ({ field, value, onChange, id }) => {
  const blank = Object.fromEntries(field.fields.map((sub) => [sub.key, sub.type === 'list' ? [] : '']));
  return (
    <div className="cms-items">
      {value.map((item, i) => (
        <div className="cms-item" key={i}>
          <div className="cms-item-bar">
            <strong>
              {i + 1}. {item[field.fields[0].key] || 'Untitled'}
            </strong>
            <span>
              <button type="button" aria-label="Move up" onClick={() => onChange(move(value, i, -1))} disabled={i === 0}>
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label="Move down" onClick={() => onChange(move(value, i, 1))} disabled={i === value.length - 1}>
                <ArrowDown size={14} />
              </button>
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </span>
          </div>
          {field.fields.map((sub) => (
            <div className="field" key={sub.key}>
              <label htmlFor={`${id}-${i}-${sub.key}`}>{sub.label}</label>
              <Input field={sub} id={`${id}-${i}-${sub.key}`} value={item[sub.key]} onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, [sub.key]: v } : it)))} />
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="button outlined small" onClick={() => onChange([...value, clone(blank)])}>
        <Plus size={15} /> Add
      </button>
    </div>
  );
};

/* ---------- Page editor ---------- */
const PageEditor = ({ page, data, draft, setDraft, onReset }) => {
  const current = (key) => (key in draft ? draft[key] : key in data.values ? data.values[key] : DEFAULTS[key]);
  return (
    <div className="cms-page" data-testid={`cms-page-${page.id}`}>
      <div className="cms-page-head">
        <div>
          <h2>{page.label}</h2>
          {page.help && <p className="muted small">{page.help}</p>}
        </div>
        <a className="text-link" href={page.path} target="_blank" rel="noreferrer" data-testid="cms-view-page">
          View page <ArrowUpRight size={15} />
        </a>
      </div>
      {page.groups.map((group) => (
        <section className="cms-group" key={group.label}>
          <h3>{group.label}</h3>
          {group.help && <p className="muted small">{group.help}</p>}
          {group.fields.map((field) => {
            const id = `cms-${field.key.replace(/[^a-z0-9]+/gi, '-')}`;
            const overridden = field.key in data.values;
            const changed = field.key in draft;
            return (
              <div className={`field cms-field ${changed ? 'changed' : ''}`} key={field.key}>
                <div className="cms-field-label">
                  <label htmlFor={id}>{field.label}</label>
                  <span>
                    {changed ? <em className="status yellow">Unsaved</em> : overridden ? <em className="status sage">Edited</em> : <em className="status">Default</em>}
                    {overridden && !changed && (
                      <button type="button" className="text-link" onClick={() => onReset(field.key)} data-testid={`${id}-reset`}>
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </span>
                </div>
                {field.help && <p className="cms-help">{field.help}</p>}
                <Input
                  field={field}
                  id={id}
                  value={current(field.key)}
                  onChange={(value) =>
                    setDraft((d) => {
                      const next = { ...d };
                      const saved = field.key in data.values ? data.values[field.key] : DEFAULTS[field.key];
                      if (same(value, saved)) delete next[field.key];
                      else next[field.key] = value;
                      return next;
                    })
                  }
                />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
};

/* ---------- List (collection) editor ---------- */
const CollectionEditor = ({ name, data, version, onSaved }) => {
  const spec = COLLECTIONS[name];
  const stored = data.collections[name];
  const [items, setItems] = useState(() => clone(stored ?? spec.defaults));
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setItems(clone(data.collections[name] ?? spec.defaults));
    setIndex(0);
  }, [name, data.collections, spec.defaults]);
  const dirty = !same(items, stored ?? spec.defaults);
  const visible = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (!query || spec.title(item).toLowerCase().includes(query.toLowerCase())) && (!zone || item.zone === zone));
  const item = items[index];
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const clean = items.map((it) =>
        Object.fromEntries(Object.entries(it).map(([k, v]) => [k, Array.isArray(v) ? v.map((s) => (typeof s === 'string' ? s.trim() : s)).filter((s) => s !== '') : v])),
      );
      const { data: res } = await api.put(`/admin/content/collections/${name}`, { items: reset ? null : clean, version });
      onSaved(res);
      toast.success(reset ? `${spec.label} restored to the original list.` : `${spec.label} saved. Live on the website.`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cms-page" data-testid={`cms-list-${name}`}>
      <div className="cms-page-head">
        <div>
          <h2>{spec.label}</h2>
          <p className="muted small">
            {items.length} items · {stored ? 'edited list' : 'original list'}
          </p>
        </div>
        <span className="cms-actions">
          {stored && (
            <button type="button" className="text-link" onClick={() => window.confirm(`Restore the original ${spec.label.toLowerCase()} list?`) && save(true)} disabled={busy}>
              <RotateCcw size={14} /> Restore original
            </button>
          )}
          <button type="button" className="button primary small" onClick={() => save(false)} disabled={busy || !dirty} data-testid="cms-list-save">
            <Save size={15} /> {busy ? 'Saving…' : dirty ? 'Save list' : 'Saved'}
          </button>
        </span>
      </div>
      <div className="cms-list">
        <div className="cms-list-index">
          <div className="cms-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" data-testid="cms-list-search" />
          </div>
          {name === 'areas' && (
            <select value={zone} onChange={(e) => setZone(e.target.value)} data-testid="cms-zone-filter">
              <option value="">All zones</option>
              {ZONES.map((z) => (
                <option key={z.slug} value={z.slug}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          <ul>
            {visible.map(({ item: it, i }) => (
              <li key={i}>
                <button type="button" className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
                  {spec.title(it) || 'Untitled'}
                  {name === 'areas' && it.page && <em> · page</em>}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button outlined small"
            onClick={() => {
              setItems([...items, clone({ ...spec.blank, ...(zone ? { zone } : {}) })]);
              setIndex(items.length);
            }}
            data-testid="cms-list-add"
          >
            <Plus size={15} /> Add
          </button>
        </div>
        <div className="cms-list-detail">
          {item ? (
            <>
              <div className="cms-item-bar">
                <strong>{spec.title(item) || 'Untitled'}</strong>
                <span>
                  {spec.path && (
                    <a className="text-link" href={spec.path(item)} target="_blank" rel="noreferrer">
                      View <ArrowUpRight size={13} />
                    </a>
                  )}
                  <button type="button" aria-label="Move up" onClick={() => { setItems(move(items, index, -1)); setIndex(Math.max(0, index - 1)); }} disabled={index === 0}>
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => { setItems(move(items, index, 1)); setIndex(Math.min(items.length - 1, index + 1)); }} disabled={index === items.length - 1}>
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => {
                      if (!window.confirm(`Delete “${spec.title(item)}”?`)) return;
                      setItems(items.filter((_, j) => j !== index));
                      setIndex(Math.max(0, index - 1));
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              {spec.fields.map((field) => {
                const id = `cms-${name}-${field.key}`;
                return (
                  <div className="field" key={field.key}>
                    <label htmlFor={id}>{field.label}</label>
                    <Input field={field} id={id} value={item[field.key]} onChange={(v) => setItems(items.map((it, j) => (j === index ? { ...it, [field.key]: v } : it)))} />
                  </div>
                );
              })}
            </>
          ) : (
            <p className="muted">Choose an item on the left, or add a new one.</p>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- History ---------- */
const HistoryView = ({ history }) => (
  <div className="cms-page" data-testid="cms-history">
    <div className="cms-page-head">
      <h2>Change history</h2>
    </div>
    {history.length ? (
      <ul className="cms-history">
        {history.map((h) => (
          <li key={h.id}>
            <strong>{h.key}</strong> {h.reset ? 'reset to default' : h.kind === 'collection' ? 'list updated' : 'updated'}
            <span>
              {h.actor_name || 'Admin'} · {new Date(h.at).toLocaleString('en-IN')}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">No changes yet.</p>
    )}
  </div>
);

const SearchPagesStatus = () => {
  const [state, setState] = useState(null);
  const load = () => api.get('/admin/site/build').then(({ data }) => setState(data)).catch(() => {});
  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);
  if (!state || state.status === 'not_configured') return null;
  const refresh = async () => {
    try {
      const { data } = await api.post('/admin/site/build');
      toast.success(data.message);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <p className="cms-build" data-testid="cms-build-status">
      Google & AI pages: {state.status === 'running' ? 'refreshing now…' : state.last_finished ? `last refreshed ${new Date(state.last_finished).toLocaleString('en-IN')}` : 'refresh automatically ~1 minute after you save'}
      {state.last_result && state.status !== 'running' ? ` · ${state.last_result}` : ''}{' '}
      <button type="button" className="text-link" onClick={refresh}>
        Refresh now
      </button>
    </p>
  );
};

export const AdminContent = () => {
  const site = useContent();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState('page:home');
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const load = () =>
    api
      .get('/admin/content')
      .then(({ data: res }) => setData(res))
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const warn = (e) => {
      if (Object.keys(draft).length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  const applied = (res) => {
    setData((prev) => ({ ...prev, ...res }));
    site.reload();
    load();
  };
  const saveDraft = async () => {
    setBusy(true);
    try {
      const values = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Array.isArray(v) && v.every((s) => typeof s === 'string') ? v.map((s) => s.trim()).filter(Boolean) : v]));
      const { data: res } = await api.patch('/admin/content', { values, version: data.version });
      setDraft({});
      applied(res);
      toast.success(`${Object.keys(values).length} change${Object.keys(values).length === 1 ? '' : 's'} saved. Live on the website.`);
    } catch (e) {
      toast.error(errorText(e));
      if (e.response?.status === 409) load();
    } finally {
      setBusy(false);
    }
  };
  const reset = async (key) => {
    try {
      const { data: res } = await api.patch('/admin/content', { values: { [key]: null }, version: data.version });
      applied(res);
      toast.success('Restored the original text.');
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const editedCount = useMemo(() => (data ? Object.keys(data.values).length : 0), [data]);
  if (error)
    return (
      <p role="alert" className="error-message">
        {error}
      </p>
    );
  if (!data) return <div className="loading-screen">Loading website content…</div>;
  const [kind, id] = section.split(':');
  const page = PAGES.find((p) => p.id === id);
  const pending = Object.keys(draft).length;
  return (
    <>
      <PortalHeading
        eyebrow="YOUR WEBSITE, YOUR WORDS"
        title="Website content"
        subtitle={`Edit every page’s text, pictures, lists and Google titles. ${editedCount} fields edited so far; everything else shows the original text.`}
        action={
          <button className="button primary" onClick={saveDraft} disabled={!pending || busy} data-testid="cms-save">
            <Save size={16} /> {busy ? 'Saving…' : pending ? `Save ${pending} change${pending === 1 ? '' : 's'}` : 'All saved'}
          </button>
        }
      />
      <SearchPagesStatus />
      <div className="cms-shell">
        <nav className="cms-nav" aria-label="Website content sections">
          <span className="cms-nav-label">
            <FileText size={13} /> Pages
          </span>
          {PAGES.map((p) => (
            <button key={p.id} type="button" className={section === `page:${p.id}` ? 'active' : ''} onClick={() => setSection(`page:${p.id}`)} data-testid={`cms-nav-${p.id}`}>
              {p.label}
              {p.groups.some((g) => g.fields.some((f) => f.key in draft)) && <i className="cms-dot" />}
            </button>
          ))}
          <span className="cms-nav-label">
            <List size={13} /> Lists
          </span>
          {Object.entries(COLLECTIONS).map(([name, spec]) => (
            <button key={name} type="button" className={section === `list:${name}` ? 'active' : ''} onClick={() => setSection(`list:${name}`)} data-testid={`cms-nav-list-${name}`}>
              {spec.label}
            </button>
          ))}
          <span className="cms-nav-label">
            <History size={13} /> Log
          </span>
          <button type="button" className={section === 'history:' ? 'active' : ''} onClick={() => setSection('history:')} data-testid="cms-nav-history">
            Change history
          </button>
        </nav>
        <div className="cms-main">
          {kind === 'page' && page && <PageEditor page={page} data={data} draft={draft} setDraft={setDraft} onReset={reset} />}
          {kind === 'list' && <CollectionEditor name={id} data={data} version={data.version} onSaved={applied} />}
          {kind === 'history' && <HistoryView history={data.history || []} />}
        </div>
      </div>
    </>
  );
};
