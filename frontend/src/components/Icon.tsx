const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3V3zm11 0h7v4h-7V3zm0 7h7v11h-7V10zM3 13h7v8H3v-8z",
  employees: "M17 20a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm2 10h5v-1a3 3 0 0 0-3-3h-1m0-3a3 3 0 1 0 0-6",
  attendance: "M12 3v9l4 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  exceptions: "M12 3l9 16H3l9-16zM12 10v4M12 17v.01",
  leave: "M8 3v3M16 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  biometric: "M12 3a4 4 0 0 1 4 4v4a4 4 0 1 1-8 0V7a4 4 0 0 1 4-4zM6 11a6 6 0 0 0 12 0M12 17v4",
  payroll: "M3 7h18v12H3V7zm4 12v2m10-2v2M3 11h18",
  kra: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z",
  assets: "M4 7l8-4 8 4v10l-8 4-8-4V7zm8-4v18M4 7l8 4 8-4",
  policies: "M6 3h9l3 3v15H6V3zm9 0v3h3M9 12h6M9 16h6",
  queries: "M12 21a9 9 0 1 0-6-15.7M3 21l1.5-4.5",
  exit: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  access: "M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6l8-4z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  close: "M18 6L6 18M6 6l12 12",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16",
  menu: "M3 6h18M3 12h18M3 18h18",
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
