/**
 * The Showup mark: a screen with a translucent person standing in front of it,
 * which is what the webcam overlay does. Inline SVG so it stays sharp and needs
 * no request; decorative, since the name is written next to it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 80" fill="none" aria-hidden className={className}>
      {/* Screen, with a hint of shared content */}
      <rect x="4" y="4" width="88" height="58" rx="9" fill="#a855f7" fillOpacity="0.1" stroke="#a855f7" strokeWidth="4" />
      <rect x="16" y="16" width="32" height="5" rx="2.5" fill="#a855f7" fillOpacity="0.55" />
      <rect x="16" y="26" width="22" height="5" rx="2.5" fill="#a855f7" fillOpacity="0.35" />
      <rect x="16" y="36" width="27" height="5" rx="2.5" fill="#a855f7" fillOpacity="0.25" />
      {/* The see-through presenter */}
      <circle cx="64" cy="31" r="10" fill="#d8b4fe" fillOpacity="0.75" />
      <path d="M45 58c0-13 8-20 19-20s19 7 19 20z" fill="#d8b4fe" fillOpacity="0.75" />
      {/* Stand */}
      <rect x="43" y="62" width="10" height="7" fill="#a855f7" />
      <rect x="32" y="69" width="32" height="6" rx="3" fill="#a855f7" />
    </svg>
  );
}
