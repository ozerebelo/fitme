/** Inline icon set. Stroke-based, 24×24, sized by the parent's font size. */

type IconProps = { className?: string };

const base = (className?: string): string =>
  `h-6 w-6 ${className ?? ""}`.trim();

const Svg = ({ children, className }: IconProps & { children: React.ReactNode }) => (
  <svg
    className={base(className)}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </Svg>
);

export const FoodIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
    <path d="M7 13v8" />
    <path d="M17 3c-1.5 2-2 3.5-2 6s.7 3 2 3 2-.5 2-3-.5-4-2-6Z" />
    <path d="M17 12v9" />
  </Svg>
);

export const DumbbellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5v11" />
    <path d="M3.5 9v6" />
    <path d="M17.5 6.5v11" />
    <path d="M20.5 9v6" />
    <path d="M6.5 12h11" />
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M4.2 7.5 6.8 9" />
    <path d="M17.2 15 19.8 16.5" />
    <path d="M4.2 16.5 6.8 15" />
    <path d="M17.2 9 19.8 7.5" />
    <circle cx="12" cy="12" r="3.5" />
  </Svg>
);

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12" />
    <path d="M18 6 6 18" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Svg>
);

export const TimerIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2" />
    <path d="M9 2h6" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
);

export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M8 15a4 4 0 0 1 8 0" />
    <path d="m12 15 2.5-4" />
  </Svg>
);

export const TrophyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3" />
    <path d="M17 6h3v1a3 3 0 0 1-3 3" />
    <path d="M12 14v3" />
    <path d="M8.5 20h7" />
    <path d="M10 17h4v3h-4z" />
  </Svg>
);

export const BarcodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6v12" />
    <path d="M6.5 6v12" />
    <path d="M10 6v12" />
    <path d="M14 6v12" />
    <path d="M17.5 6v12" />
    <path d="M21 6v12" />
  </Svg>
);

export const DropletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" />
  </Svg>
);

export const BrainIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.5 2.5 0 0 0-1.5 4.5A2.5 2.5 0 0 0 7 16a2.5 2.5 0 0 0 2.5 2.5V4.5Z" />
    <path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.5 2.5 0 0 1 1.5 4.5A2.5 2.5 0 0 1 17 16a2.5 2.5 0 0 1-2.5 2.5V4.5Z" />
    <path d="M12 4v16" />
  </Svg>
);

/* --------------------------------- Money ---------------------------------- */

export const WalletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2" />
    <path d="M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5Z" />
    <path d="M16.5 13.5h.01" />
  </Svg>
);

export const CoinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </Svg>
);

export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5v17l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2v-17l-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2Z" />
    <path d="M9 9h6" />
    <path d="M9 13h4" />
  </Svg>
);

export const PieIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
    <path d="M15 3.6A9 9 0 0 1 20.4 9H15V3.6Z" />
  </Svg>
);

export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </Svg>
);

export const RepeatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V8a3 3 0 0 1 3-3h10l-2.5-2.5" />
    <path d="M20 15v1a3 3 0 0 1-3 3H7l2.5 2.5" />
  </Svg>
);

export const TrendUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17.5 9.5 11l4 4L21 7.5" />
    <path d="M15.5 7.5H21v5.5" />
  </Svg>
);

export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9.5 12 4l9 5.5" />
    <path d="M5 10v8" />
    <path d="M10 10v8" />
    <path d="M14 10v8" />
    <path d="M19 10v8" />
    <path d="M3 20h18" />
  </Svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M15 6.5 17.5 9" />
  </Svg>
);
