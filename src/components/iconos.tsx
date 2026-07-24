// Iconos propios en SVG (guía §3.4): se montan una vez como <symbol> y se
// referencian con <use>. Copiados tal cual del mockup palpito.html.

export function Icono({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function IconosDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <symbol id="i-logo" viewBox="0 0 48 48">
          <path d="M3 27h7l4-11 5 20 5-27 4 18h4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M32 27l7-9 7 9" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity=".5" />
          <circle cx="39" cy="18" r="3.4" fill="currentColor" />
        </symbol>
        <symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M19.1 4.9l-1.9 1.9M6.8 17.2l-1.9 1.9" />
        </symbol>
        <symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </symbol>
        <symbol id="i-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </symbol>
        <symbol id="i-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </symbol>
        <symbol id="i-back" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </symbol>
        <symbol id="i-slip" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" />
          <path d="M9 8h6M9 12h6" />
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </symbol>
        <symbol id="i-juego" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20l5.5-5.5" />
          <path d="M13.5 3.5c3-1 6 0 7 1s2 4 1 7l-4.5 4.5-1.5-4-4-1.5 2-7z" />
          <path d="M11 13l-3.5 1 1 3.5" />
        </symbol>
        <symbol id="i-lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M16.2 16.2L21 21" />
        </symbol>
        <symbol id="i-inicio" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
        </symbol>
        <symbol id="i-vivo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M5.5 8.5a9 9 0 0 0 0 7M18.5 8.5a9 9 0 0 1 0 7M8.5 11a4.5 4.5 0 0 0 0 2M15.5 11a4.5 4.5 0 0 1 0 2" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        </symbol>
        <symbol id="d-futbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.2l3.6 2.6-1.4 4.3H9.8L8.4 9.8 12 7.2z" />
          <path d="M12 3v4.2M20.5 9.6l-4.9.2M17.3 19.6l-3.1-5.5M6.7 19.6l3.1-5.5M3.5 9.6l4.9.2" />
        </symbol>
        <symbol id="d-beis" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6c2.2 1.8 3.4 4 3.4 6.4s-1.2 4.6-3.4 6.4M18.4 5.6c-2.2 1.8-3.4 4-3.4 6.4s1.2 4.6 3.4 6.4" />
        </symbol>
        <symbol id="d-basket" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c3.4 3.4 3.4 9.4 0 12.8M18.4 5.6c-3.4 3.4-3.4 9.4 0 12.8" />
        </symbol>
        <symbol id="d-tenis" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M4.5 5.5c3 2.5 4.3 6.5 3.4 10.6M19.5 5.5c-3 2.5-4.3 6.5-3.4 10.6" />
        </symbol>
        <symbol id="d-nfl" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M4 12c0-4.4 3.6-8 8-8 4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8z" transform="rotate(-20 12 12)" />
          <path d="M9.5 12h5M12 10v4" />
        </symbol>
        <symbol id="d-hockey" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4v9c0 3 2 5 5 5h3" />
          <path d="M20 4v9c0 3-2 5-5 5h-1" />
          <ellipse cx="12" cy="20" rx="3.5" ry="1.6" />
        </symbol>
        <symbol id="d-mma" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M5 9h9a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9z" />
          <path d="M5 12H3.6A1.6 1.6 0 0 1 2 10.4V9.6C2 8.7 2.7 8 3.6 8H5" />
          <path d="M8 9V6.5A1.5 1.5 0 0 1 9.5 5h4A1.5 1.5 0 0 1 15 6.5V9" />
        </symbol>
        <symbol id="d-voley" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c-3 4-3 10 0 18M3.6 8.2c4.6.6 9 3.6 11.6 8.4M20.4 8.2c-4.6.6-9 3.6-11.6 8.4" />
        </symbol>
        <symbol id="d-golf" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M9 21V3l9 4.5L9 12" />
          <circle cx="6.5" cy="19.5" r="1.8" />
        </symbol>
        <symbol id="d-esports" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4z" />
          <path d="M7.5 11v2.4M6.3 12.2h2.4" />
          <circle cx="16.4" cy="11.6" r=".9" fill="currentColor" />
          <circle cx="18.2" cy="13.4" r=".9" fill="currentColor" />
        </symbol>
        <symbol id="d-f1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M2 14h4l2-3h7l3 3h4v2h-3.2a2.3 2.3 0 0 1-4.6 0H9.8a2.3 2.3 0 0 1-4.6 0H2v-2z" />
        </symbol>
        <symbol id="d-hipica" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M4 20c0-4 2-7 5-8l1.5-4 3 1.5 3-3.5 1.5 3.5c1.5 1 2 3 1.5 5" />
          <path d="M6 20h13" />
        </symbol>
      </defs>
    </svg>
  );
}
