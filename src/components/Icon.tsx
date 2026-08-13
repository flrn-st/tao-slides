interface IconProps {
  name: string
  size?: number
  className?: string
}

const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6',
  duplicate: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  present: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  zoomIn: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zm-7-3v6M8 10h6',
  zoomOut: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM8 10h6',
  text: 'M4 7V4h16v3M9 20h6M12 4v16',
  image: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm4 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM21 15l-5-5L5 21',
  line: 'M4 20 20 4',
  shape: 'M12 2l4 7-4 7-4-7 4-7zM12 16v6M8 22h8',
  bold: 'M6 4h8a4 4 0 0 1 0 8H6V4zm0 8h9a4 4 0 0 1 0 8H6v-8z',
  italic: 'M19 4h-9M14 20H5M15 4 9 20',
  underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  strike: 'M6 12h12M12 8c-1.5-.7-3-1-4.4-.4-1.3.5-1.6 1.8-.7 2.6M9 20c2 .5 4 .3 5.6-.8 1.5-1 1.9-2.3 1.4-3.6',
  fill: 'M12 3c3 3 6 5.5 6 9a6 6 0 0 1-12 0c0-3.5 3-6 6-9zm0 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19 14h3M22 17h-3',
  border: 'M4 4h16a0 0 0 0 1 0 0v16a0 0 0 0 1 0 0H4a0 0 0 0 1 0 0V4a0 0 0 0 1 0 0zM8 8h8v8H8z',
  shadow: 'M4 13a9 9 0 0 1 9-9c0 5-4 9-9 9zm2 1c0 .5.4 1 1 1v.5a3.5 3.5 0 0 0 3.5 3.5v.5c0 .6.4 1 1 1v2',
  notes: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zm4 3h8M8 11h8M8 14h5',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  close: 'M18 6 6 18M6 6l12 12',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm6 15 6-6 6 6',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M5 12l7 7 7-7',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  file: 'M6 2h8l4 4v16H6V2zm7 0v5h5',
  link: 'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zm3 0V7a3 3 0 0 1 6 0v4',
  alignLeft: 'M4 6h16M4 10h10M4 14h10M4 18h16',
  alignCenter: 'M4 6h16M8 10h8M8 14h8M4 18h16',
  alignRight: 'M4 6h16M10 10h10M10 14h10M4 18h16',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  bullet: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  fit: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M3 12h18',
  layers: 'M12 3 4 8l8 5 8-5-8-5zM4 12l8 5 8-5M4 16l8 5 8-5',
  check: 'm5 13 4 4L19 7',
  sparkle: 'M12 3l1.8 5.3L19 10l-5.2 1.7L12 17l-1.8-5.3L5 10l5.2-1.7L12 3zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15zM5 16l.7 2 2 .7-2 .7L5 21.5l-.7-2-2-.7 2-.7L5 16z',
  format: 'M4 7V4h16v3M9 20h6M12 4v16M3 12h2m14 0h2M3 16h2m14 0h2M3 20h2m14 0h2M6 12h2m8 0h2',
  copy: 'M8 8h12v12H8zM4 16H3V3h13v1',
  linkOff: 'M14 6h3a5 5 0 0 1 4.6 3M9 18H6a5 5 0 0 1-4.6-3M10 14l4-4',
  paperclip: 'M9 12h6m-6 4h4M14 6.5 8.5 12 14 17.5',
  table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
}

export default function Icon({ name, size = 18, className }: IconProps) {
  const d = PATHS[name] ?? PATHS.sparkle
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  )
}