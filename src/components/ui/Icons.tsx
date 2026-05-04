/**
 * Inline SVG icon set — single-stroke, currentColor.
 *
 * Mirrors the prototype's Lucide-inspired icons so the production app has
 * a coherent icon vocabulary without an extra dependency. Each icon takes
 * `size` (default 16) and inherits color from the surrounding text.
 *
 * If we later switch to lucide-react, the import paths in components stay
 * stable: re-export from this file.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Shield: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
    </Base>
  ),
  Home: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </Base>
  ),
  Calendar: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Base>
  ),
  Megaphone: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 11v2a2 2 0 002 2h2l8 4V5L7 9H5a2 2 0 00-2 2z" />
      <path d="M19 8a4 4 0 010 8" />
    </Base>
  ),
  Phone: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 4h3l2 5-2 1a12 12 0 006 6l1-2 5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
    </Base>
  ),
  Users: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 19c0-3 3-5 6.5-5s6.5 2 6.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21.5 18c0-2-1.8-3.5-4.5-3.5" />
    </Base>
  ),
  Inbox: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 13l3-8h12l3 8" />
      <path d="M3 13v5a2 2 0 002 2h14a2 2 0 002-2v-5h-6l-2 2h-4l-2-2z" />
    </Base>
  ),
  Award: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13l-2 8 5-3 5 3-2-8" />
    </Base>
  ),
  Bell: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 004 0" />
    </Base>
  ),
  BookOpen: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 5h6a3 3 0 013 3v12a2 2 0 00-2-2H3z" />
      <path d="M21 5h-6a3 3 0 00-3 3v12a2 2 0 012-2h7z" />
    </Base>
  ),
  Briefcase: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
    </Base>
  ),
  Car: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 16l1.5-5A2 2 0 018.4 9.5h7.2A2 2 0 0117.5 11l1.5 5" />
      <rect x="3" y="16" width="18" height="4" rx="1.5" />
      <circle cx="7.5" cy="20" r="1" />
      <circle cx="16.5" cy="20" r="1" />
    </Base>
  ),
  Star: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5l2.6 5.4 5.9.9-4.2 4.1 1 5.9L12 17l-5.3 2.8 1-5.9L3.5 9.8l5.9-.9z" />
    </Base>
  ),
  IdCard: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="2.5" />
      <path d="M5 17c.8-1.5 2.4-2.5 4-2.5s3.2 1 4 2.5M14 10h5M14 13h4" />
    </Base>
  ),
  Settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Base>
  ),
  Activity: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </Base>
  ),
  Clock: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  ),
  Wrench: (p: IconProps) => (
    <Base {...p}>
      <path d="M14.7 6.3a4 4 0 105 5L19 13l-7 7a2.8 2.8 0 11-4-4l7-7z" />
    </Base>
  ),
  Plus: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  ),
  Printer: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 9V4h12v5" />
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <rect x="6" y="14" width="12" height="6" />
    </Base>
  ),
  Menu: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  ),
  X: (p: IconProps) => (
    <Base {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  ),
  ChevronRight: (p: IconProps) => (
    <Base {...p}>
      <path d="M9 6l6 6-6 6" />
    </Base>
  ),
  Swap: (p: IconProps) => (
    <Base {...p}>
      <path d="M7 7h12l-3-3M17 17H5l3 3" />
    </Base>
  ),
  FileText: (p: IconProps) => (
    <Base {...p}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h6" />
    </Base>
  ),
};

export type IconName = keyof typeof Icon;
