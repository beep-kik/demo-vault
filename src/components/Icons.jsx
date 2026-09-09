export const Search = (p) => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flex: 'none', opacity: 0.5 }} {...p}>
    <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M9.2 9.2 12.4 12.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const Star = ({ on, color, off }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 14 14"
    fill={on ? color : 'none'}
    stroke={on ? color : off}
    strokeWidth="1.2"
  >
    <path
      d="M7 1.6l1.62 3.3 3.63.53-2.63 2.56.62 3.61L7 9.9l-3.24 1.7.62-3.61L1.75 5.43l3.63-.53z"
      strokeLinejoin="round"
    />
  </svg>
);

export const Reload = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M12 7a5 5 0 1 1-1.6-3.66" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path
      d="M12.2 1.4v3h-3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const External = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M5.5 2.5H2.4v9.1h9.1V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path
      d="M8 2.4h3.6V6M11.4 2.6 6.6 7.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Dots = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
    <circle cx="3" cy="7" r="1.15" />
    <circle cx="7" cy="7" r="1.15" />
    <circle cx="11" cy="7" r="1.15" />
  </svg>
);

export const Plus = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M7 2.6v8.8M2.6 7h8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const Theme = ({ dark }) =>
  dark ? (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M11.6 8.3A5 5 0 0 1 5.7 2.4a4.9 4.9 0 1 0 5.9 5.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.7" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 .9v1.5M7 11.6v1.5M13.1 7h-1.5M2.4 7H.9M11.3 2.7l-1 1M3.7 10.3l-1 1M11.3 11.3l-1-1M3.7 3.7l-1-1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );

export const Density = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
    <path
      d="M2 3.2h10M2 7h10M2 10.8h10"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);
