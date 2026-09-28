import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, ImageIcon, Check } from 'lucide-react';
import { useEditor } from '../lib/editor';

export const Editable = ({ k, as: Tag = 'span', fallback = '', className = '', multiline = false, ...rest }) => {
  const { editing, getText, saveText, busy } = useEditor();
  const value = getText(k, fallback);
  const ref = useRef(null);

  if (!editing) return <Tag className={className} {...rest}>{value}</Tag>;

  const commit = () => {
    const text = ref.current.innerText.replace(/\u00a0/g, ' ').trim();
    if (text !== String(value || '').trim()) saveText(k, text);
  };
  return (
    <Tag
      ref={ref}
      className={`${className} ml-editable ${busy[k] ? 'ml-saving' : ''}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ml-key={k}
      title="Click to edit · click away to save"
      onBlur={commit}
      onKeyDown={e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      {...rest}
    >{value}</Tag>
  );
};

export const LiveEditorBar = () => {
  const { isAdmin, editing, enable, disable } = useEditor();
  if (!isAdmin) return null;
  if (!editing) return (
    <button className="ml-editor-launch" data-testid="live-editor-launch" onClick={enable}>
      <Pencil size={16} /> Edit website
    </button>
  );
  return (
    <div className="ml-editor-bar" data-testid="live-editor-bar" role="region" aria-label="Live website editor">
      <span className="ml-editor-status"><span className="ml-editor-dot" /> Live editor on — click any text to edit</span>
      <div className="ml-editor-tools">
        <Link className="ml-editor-images" to="/portal/admin/media" data-testid="live-editor-images"><ImageIcon size={15} /> Manage images</Link>
        <button className="ml-editor-done" data-testid="live-editor-done" onClick={disable}><Check size={15} /> Done</button>
      </div>
    </div>
  );
};
