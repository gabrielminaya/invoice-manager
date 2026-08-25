import type { SVGProps } from "react";

/**
 * Iconos en línea (Lucide, trazo 1.75). Se dibujan como SVG en el bundle para
 * no depender de una librería ni de una petición extra en el arranque de la PWA.
 */
const PATHS = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9.5 21v-6h5v6"],
  invoice: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6", "M9 17h4"],
  users: ["M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1", "M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7", "M21 20v-1a4 4 0 0 0-3-3.87", "M16.5 4.13a4 4 0 0 1 0 7.75"],
  repeat: ["M17 2l4 4-4 4", "M3 11V9a4 4 0 0 1 4-4h14", "M7 22l-4-4 4-4", "M21 13v2a4 4 0 0 1-4 4H3"],
  settings: ["M4 6h16", "M4 12h16", "M4 18h16", "M9 6v0", "M15 12v0", "M7 18v0"],
  plus: ["M12 5v14", "M5 12h14"],
  chevronRight: ["M9 6l6 6-6 6"],
  chevronLeft: ["M15 6l-6 6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  print: ["M6 9V3h12v6", "M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1", "M6 14h12v7H6z"],
  check: ["M20 6 9 17l-5-5"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18", "M12 7.5V12l3 2"],
  alert: ["M12 3 2.5 20h19z", "M12 10v4", "M12 17.5v0"],
  play: ["M6 4l14 8-14 8z"],
  pause: ["M8 4v16", "M16 4v16"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 14h10l1-14", "M10 11v6", "M14 11v6"],
  copy: ["M9 9V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-4", "M4 10a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "M21 21l-4.3-4.3"],
  wallet: ["M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M3 10h18", "M16.5 14.5v0"],
  download: ["M12 3v12", "M7.5 10.5 12 15l4.5-4.5", "M4 20h16"],
  bolt: ["M13 2 4 14h6l-1 8 9-12h-6z"],
  building: ["M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15", "M15 11h3a2 2 0 0 1 2 2v8", "M8 8h3", "M8 12h3", "M8 16h3", "M3 21h18"],
  offline: ["M3 3l18 18", "M8.5 16.5a5 5 0 0 1 7 0", "M5 13a10 10 0 0 1 4-2.5", "M15 10.5A10 10 0 0 1 19 13", "M2 8.8A15 15 0 0 1 12 5c1.5 0 3 .2 4.4.7", "M12 20v0"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
