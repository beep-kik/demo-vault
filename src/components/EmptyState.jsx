import { MOD } from '../lib/util.js';

export default function EmptyState({ onPaste, onUpload, onFolder }) {
  return (
    <div className="empty">
      <div>
        <h1>Your demos live here</h1>
        <p>
          Drop the HTML previews cluttering your Downloads folder into Demo Vault once, and open any
          of them again in two keystrokes.
        </p>
      </div>

      <div className="empty-ways">
        <button className="way" onClick={onPaste}>
          <b>Paste markup</b>
          <span>
            Straight from your editor.
            <br />
            {MOD}V works anywhere.
          </span>
        </button>
        <button className="way" onClick={onUpload}>
          <b>Drop files</b>
          <span>
            One .html or fifty.
            <br />
            .zip archives too.
          </span>
        </button>
        <button className="way" onClick={onFolder}>
          <b>Pick a folder</b>
          <span>
            Keeps css, js and
            <br />
            images working.
          </span>
        </button>
      </div>
    </div>
  );
}
