// Inline SVG icons: viewBox 0 0 24 24, stroke currentColor, 1.8 wide, round caps and joins, no
// fill. Colour comes from currentColor, never hardcoded. The map's own markers are drawn from
// these too (js/layers.js, badge()), white on a coloured disc.

const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 4.5 9-4.5" opacity=".6"/>'),
  train: svg('<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>'),
  bus: svg('<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v2.5M16 18v2.5M8 6.5h8"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>'),
  cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 18z"/>'),
  rain: svg('<path d="M7 14.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.5 1.4 3.4 3.4 0 0 1 .6 6.6z"/><path d="m8 18-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5"/>'),
  storm: svg('<path d="M7 14.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.5 1.4 3.4 3.4 0 0 1 .6 6.6z"/><path d="m12.5 14-2.5 4h3l-2 4"/>'),
  partly: svg('<path d="M9 4.5v1M4.6 6.3l.7.7M3 10.5h1M13.4 6.3l-.7.7"/><path d="M6.3 12.4A3.5 3.5 0 1 1 12.4 9"/><path d="M9.5 20a3.5 3.5 0 0 1-.5-7 4.8 4.8 0 0 1 9.2 1.3A3 3 0 0 1 18 20z"/>'),
  haze: svg('<path d="M4 9h12M6 13h14M4 17h10"/>'),
  car: svg('<path d="M5 16h14v-4l-2-5H7l-2 5z"/><path d="M5 12h14M6 16v2.5M18 16v2.5"/><circle cx="8" cy="13.8" r=".6"/><circle cx="16" cy="13.8" r=".6"/>'),
  parking: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 16.5v-9h3a2.7 2.7 0 0 1 0 5.4h-3"/>'),
  taxi: svg('<path d="M10 4h4l.6 2.5"/><path d="M5 17h14v-4.5l-2-5H7l-2 5z"/><path d="M5 12.5h14M6 17v2M18 17v2"/><circle cx="8" cy="14.8" r=".6"/><circle cx="16" cy="14.8" r=".6"/>'),
  stand: svg('<path d="M6 21V4h8.5a3.5 3.5 0 0 1 0 7H6"/><path d="M4 21h6"/>'),
  camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  download: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.8 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  north: svg('<path d="M12 3 7 20l5-3.5 5 3.5z"/>'),
  locate: svg('<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>'),
  cube: svg('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  bike: svg('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16 9.5 9h6L18 16M12 16 9.5 9M14.5 6.5h2.5"/>'),
  sign: svg('<rect x="3" y="4" width="18" height="10" rx="2"/><path d="M8 14v7M16 14v7M7 8h10M7 11h6"/>'),
  warning: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  light: svg('<rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>'),
  thermometer: svg('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>'),
  drop: svg('<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>'),
  humidity: svg('<path d="M8 4s4 4.5 4 7.5a4 4 0 0 1-8 0C4 8.5 8 4 8 4z"/><path d="M17 10s3 3.3 3 5.5a3 3 0 0 1-6 0c0-2.2 3-5.5 3-5.5z"/>'),
  wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>'),
  arrow: svg('<path d="M12 21V4M6 10l6-6 6 6"/>'),
  air: svg('<path d="M4 7h9M4 12h14M4 17h9"/><circle cx="17" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>'),
  uv: svg('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>'),
  heat: svg('<path d="M12 21a6 6 0 0 0 6-6c0-3-2-5-3.2-6.6-.5 2-1.6 3-2.8 3.6.4-2.8-1-5.8-3-8C9.4 7.5 6 10.3 6 15a6 6 0 0 0 6 6z"/>'),
  bolt: svg('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>'),
  flood: svg('<path d="M3 15c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M3 19.5c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/><path d="M6 11V7l6-4 6 4v4"/>'),
  radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.4 5.6"/><circle cx="12" cy="12" r=".8"/>'),
  plug: svg('<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>'),
  area: svg('<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  chevron: svg('<path d="m9 5 7 7-7 7"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  tour: svg('<path d="M4 20c4-1 5-4 6-8s3-7 10-8"/><path d="m15.5 2.5 4.5 1.5-1.5 4.5"/>'),
  me: svg('<circle cx="12" cy="12" r="5"/>'),
};

export function icon(name) {
  return icons[name] || "";
}
