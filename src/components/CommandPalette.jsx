import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from './Icons.jsx';
import { formatBytes } from '../lib/util.js';

/** Subsequence match, so "nfl" finds "Neon Fitness Landing". */
function score(haystack, needle) {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const direct = h.indexOf(n);
  if (direct >= 0) return 1000 - direct;
  let i = 0;
  let hits = 0;
  for (const ch of n) {
    const at = h.indexOf(ch, i);
    if (at < 0) return -1;
    i = at + 1;
    hits++;
  }
  return hits;
}

export default function CommandPalette({ open, projects, commands, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setCursor(0);
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  const items = useMemo(() => {
    const cmds = commands
      .map((c) => ({ ...c, type: 'command', s: q ? score(c.label, q) : 0 }))
      .filter((c) => c.s >= 0);

    const demos = projects
      .map((p) => ({
        type: 'demo',
        id: p.id,
        label: p.title,
        tail: formatBytes(p.size) + (p.tags && p.tags.length ? '  ' + p.tags.join(' ') : ''),
        s: q ? Math.max(score(p.title, q), score((p.tags || []).join(' '), q)) : 0
      }))
      .filter((d) => d.s >= 0);

    if (!q) return [...demos.slice(0, 8), ...cmds];
    return [...demos, ...cmds].sort((a, b) => b.s - a.s).slice(0, 40);
  }, [q, projects, commands]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.pal-item.on');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const run = (item) => {
    onClose();
    onPick(item);
  };

  return (
    <div className="scrim top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="pal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[cursor]) run(items[cursor]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="pal-input">
          <Search style={{ opacity: 0.55 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Jump to a demo, or run a command"
            spellCheck={false}
          />
        </div>

        <div className="pal-list dv-scroll" ref={listRef}>
          {items.length === 0 ? (
            <div className="pal-empty">No match.</div>
          ) : (
            items.map((item, i) => (
              <button
                key={item.type + ':' + (item.id || item.label)}
                className={'pal-item' + (i === cursor ? ' on' : '')}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(item)}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {item.label}
                </span>
                <span className="tail">{item.tail || (item.type === 'command' ? item.key || '' : '')}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
