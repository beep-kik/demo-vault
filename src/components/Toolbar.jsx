import { Dots, External, Reload } from './Icons.jsx';
import { MOD } from '../lib/util.js';

const VIEWPORTS = [
  { id: 'mobile', title: 'Mobile  390 × 844', w: 9, h: 14, r: 2 },
  { id: 'tablet', title: 'Tablet  834 × 1112', w: 13, h: 15, r: 2 },
  { id: 'desktop', title: 'Desktop  fill', w: 16, h: 11, r: 1.5 }
];

export default function Toolbar({
  project,
  title,
  onTitle,
  onCommitTitle,
  titleRef,
  path,
  viewport,
  onViewport,
  onReload,
  onOpenTab,
  menuOpen,
  onMenu
}) {
  const disabled = !project;

  return (
    <div className="toolbar">
      <input
        ref={titleRef}
        className="title-input"
        value={title}
        disabled={disabled}
        onChange={(e) => onTitle(e.target.value)}
        onBlur={onCommitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.blur();
          }
        }}
        aria-label="Demo name"
        spellCheck={false}
      />
      <span className="path" title={path}>
        {path}
      </span>

      <div className="spacer" />

      <div className="vp-group" role="group" aria-label="Preview width">
        {VIEWPORTS.map((v) => (
          <button
            key={v.id}
            className={'vp' + (viewport === v.id ? ' on' : '')}
            title={v.title}
            aria-pressed={viewport === v.id}
            onClick={() => onViewport(v.id)}
          >
            <i style={{ width: v.w, height: v.h, borderRadius: v.r }} />
            <span className="sr">{v.title}</span>
          </button>
        ))}
      </div>

      <button className="icon-btn" title="Reload  ⌥R" onClick={onReload} disabled={disabled}>
        <Reload />
        <span className="sr">Reload preview</span>
      </button>
      <button
        className="icon-btn"
        title={`Open in new tab  ${MOD}⏎`}
        onClick={onOpenTab}
        disabled={disabled}
      >
        <External />
        <span className="sr">Open in new tab</span>
      </button>
      <button
        className={'icon-btn' + (menuOpen ? ' on' : '')}
        title="More"
        onClick={onMenu}
        disabled={disabled}
        aria-expanded={menuOpen}
      >
        <Dots />
        <span className="sr">More actions</span>
      </button>
    </div>
  );
}
