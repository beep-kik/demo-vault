import { useEffect, useRef, useState } from 'react';

export default function ImportModal({ open, initialTab, initialContent, busy, onClose, onPaste, onFiles }) {
  const [tab, setTab] = useState('paste');
  const [html, setHtml] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [hot, setHot] = useState(false);

  const areaRef = useRef(null);
  const fileRef = useRef(null);
  const dirRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab || 'paste');
    setHtml(initialContent || '');
    setTitle('');
    setTags('');
    setHot(false);
    const t = setTimeout(() => areaRef.current && areaRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [open, initialTab, initialContent]);

  if (!open) return null;

  const submitPaste = () => {
    if (!html.trim() || busy) return;
    onPaste(html, {
      title: title.trim() || undefined,
      tags: tags.split(/[,\s]+/).filter(Boolean)
    });
  };

  const tagList = tags.split(/[,\s]+/).filter(Boolean);

  return (
    <div className="scrim mid" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add a demo"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitPaste();
          }
        }}
      >
        <div className="modal-head">
          <button className={'tab' + (tab === 'paste' ? ' on' : '')} onClick={() => setTab('paste')}>
            Paste
          </button>
          <button className={'tab' + (tab === 'upload' ? ' on' : '')} onClick={() => setTab('upload')}>
            Upload
          </button>
        </div>

        <div className="modal-body">
          {tab === 'paste' ? (
            <>
              <textarea
                ref={areaRef}
                className="ta"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<!doctype html> …"
                spellCheck={false}
              />
              <div className="field">
                <label htmlFor="dv-name">name</label>
                <input
                  id="dv-name"
                  className="text-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Taken from <title> if left blank"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label htmlFor="dv-tags">tags</label>
                <input
                  id="dv-tags"
                  className="text-input"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="landing dashboard wip"
                  spellCheck={false}
                />
              </div>
              {tagList.length > 0 && (
                <div className="tag-list">
                  {tagList.map((t) => (
                    <span key={t} className="chip on" style={{ pointerEvents: 'none' }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              className="drop"
              style={hot ? { borderColor: 'var(--accent)' } : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                setHot(true);
              }}
              onDragLeave={() => setHot(false)}
              onDrop={(e) => {
                e.preventDefault();
                setHot(false);
                onFiles({ dataTransfer: e.dataTransfer });
              }}
            >
              <b>Drop files here</b>
              <div className="sub">
                .html · a folder · .zip
                <br />
                A Demo Vault backup restores everything inside it.
              </div>
              <div className="drop-btns">
                <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>
                  Choose files
                </button>
                <button className="btn" onClick={() => dirRef.current && dirRef.current.click()}>
                  Choose folder
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) onFiles({ fileList: e.target.files });
                  e.target.value = '';
                }}
              />
              <input
                ref={dirRef}
                type="file"
                hidden
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  if (e.target.files && e.target.files.length) onFiles({ fileList: e.target.files });
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>

        <div className="modal-foot">
          <div className="hint">
            {tab === 'paste'
              ? 'Saved to this browser only. Export all writes a zip you can restore later.'
              : 'Folders keep their structure, so relative css, js and images still resolve.'}
          </div>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {tab === 'paste' && (
            <button className="btn primary" onClick={submitPaste} disabled={!html.trim() || busy}>
              {busy ? 'Saving…' : 'Save demo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
