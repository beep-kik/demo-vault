import { useEffect, useRef } from 'react';
import { Density, Plus, Search, Star, Theme } from './Icons.jsx';
import { formatBytes, formatDate, MOD } from '../lib/util.js';

function Row({ project, selected, onSelect, onStar, accent, starOff }) {
  const ref = useRef(null);

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={'row' + (selected ? ' on' : '')}
      onClick={() => onSelect(project.id)}
    >
      <div className="row-body">
        <div className="row-name">{project.title}</div>
        <div className="row-meta">
          <span className={'badge' + (project.kind === 'multi' ? ' multi' : '')}>
            {project.kind === 'multi' ? 'multi' : 'single'}
          </span>
          <span>{formatBytes(project.size)}</span>
          <span className="dot">·</span>
          <span>{formatDate(project.updatedAt)}</span>
        </div>
      </div>
      <button
        className="star"
        title={project.favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation();
          onStar(project.id);
        }}
      >
        <Star on={!!project.favorite} color={accent} off={starOff} />
      </button>
    </div>
  );
}

export default function Sidebar({
  query,
  onQuery,
  searchRef,
  tags,
  tag,
  onTag,
  visible,
  total,
  selectedId,
  onSelect,
  onStar,
  storage,
  onExportAll,
  onImport,
  theme,
  onTheme,
  density,
  onDensity,
  listRef,
  accent,
  starOff
}) {
  const pct = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <aside className="sidebar">
      <div className="search-wrap">
        <div className="search">
          <Search />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search demos"
            aria-label="Search demos"
            spellCheck={false}
          />
          <span className="kbd">{MOD}K</span>
        </div>
      </div>

      <div className="chips dv-nobar">
        {tags.map((t) => (
          <button
            key={t}
            className={'chip' + (tag === t ? ' on' : '')}
            onClick={() => onTag(t)}
            aria-pressed={tag === t}
          >
            {t === '★' ? '★ favorites' : t}
          </button>
        ))}
      </div>

      <div className="list dv-scroll" role="listbox" aria-label="Saved demos" ref={listRef} tabIndex={-1}>
        {visible.length === 0 ? (
          <div className="list-empty">
            {total === 0 ? 'Nothing saved yet.' : 'No demo matches that filter.'}
          </div>
        ) : (
          visible.map((p) => (
            <Row
              key={p.id}
              project={p}
              selected={p.id === selectedId}
              onSelect={onSelect}
              onStar={onStar}
              accent={accent}
              starOff={starOff}
            />
          ))
        )}
      </div>

      <div className="foot">
        <div className="foot-line">
          <span>
            {storage ? formatBytes(storage.usage) : '—'}
            {storage && storage.quota ? ' / ' + formatBytes(storage.quota) : ''}
          </span>
          <span className="count">
            {visible.length === total ? total : visible.length + ' / ' + total} demos
          </span>
        </div>
        <div className="bar">
          <i style={{ width: Math.max(pct, pct > 0 ? 1.5 : 0) + '%' }} />
        </div>
        <div className="foot-actions">
          <button className="btn-ghost grow" onClick={onImport} title={`Add a demo  ${MOD}O`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus /> Add demo
            </span>
          </button>
          <button className="btn-ghost grow" onClick={onExportAll} title={`Export everything  ${MOD}⇧E`}>
            Export all ↓
          </button>
          <button
            className="btn-ghost sq"
            onClick={onDensity}
            title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
          >
            <Density />
          </button>
          <button
            className="btn-ghost sq"
            onClick={onTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            <Theme dark={theme === 'dark'} />
          </button>
        </div>
      </div>
    </aside>
  );
}
