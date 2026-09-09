import { useEffect, useRef } from 'react';
import { MOD } from '../lib/util.js';

const SIZES = {
  mobile: { w: '390px', label: '390 × 844' },
  tablet: { w: '834px', label: '834 × 1112' },
  desktop: { w: '100%', label: '' }
};

/* allow-top-navigation is deliberately absent so a demo cannot navigate the
 * whole app away. See README for why allow-same-origin has to be here. */
const SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-downloads',
  'allow-pointer-lock',
  'allow-presentation'
].join(' ');

export default function Stage({ src, viewport, nonce, menuOpen, onCloseMenu, actions }) {
  const size = SIZES[viewport] || SIZES.desktop;
  const framed = viewport !== 'desktop';
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onCloseMenu();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen, onCloseMenu]);

  return (
    <div className={'stage' + (framed ? ' framed' : '')}>
      <div className="frame" style={{ width: size.w }}>
        <iframe
          key={nonce}
          src={src}
          title="Demo preview"
          sandbox={SANDBOX}
          allow="clipboard-write; fullscreen"
          referrerPolicy="no-referrer"
        />
      </div>

      {framed && (
        <div className="dims">
          <span>{size.label}</span>
        </div>
      )}

      {menuOpen && (
        <div className="menu" ref={menuRef} role="menu">
          <button role="menuitem" onClick={actions.rename}>
            <span>Rename</span>
            <span className="key">F2</span>
          </button>
          <button role="menuitem" onClick={actions.tags}>
            <span>Edit tags</span>
            <span className="key">T</span>
          </button>
          <button role="menuitem" onClick={actions.duplicate}>
            <span>Duplicate</span>
            <span className="key">{MOD}D</span>
          </button>
          <button role="menuitem" onClick={actions.export}>
            <span>Export</span>
            <span className="key">{MOD}E</span>
          </button>
          <button role="menuitem" className="danger" onClick={actions.remove}>
            <span>Delete</span>
            <span className="key">⌫</span>
          </button>
        </div>
      )}
    </div>
  );
}
