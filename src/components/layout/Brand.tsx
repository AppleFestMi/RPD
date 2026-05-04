/**
 * Brand mark — RPD shield + wordmark, used in the sidebar and on
 * unauthenticated screens (login, activation). Matches the prototype.
 */
export function BrandShield({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.125}
      viewBox="0 0 32 36"
      fill="none"
      aria-hidden="true"
      className="flex-none"
    >
      <path
        d="M16 1 L29 5 V17 C29 25 23 31 16 34 C9 31 3 25 3 17 V5 Z"
        fill="#0f1d33"
        stroke="#6ea6ff"
        strokeWidth="1.2"
      />
      <path
        d="M16 8 L24 11 V17 C24 22 20.5 25.5 16 27 C11.5 25.5 8 22 8 17 V11 Z"
        fill="none"
        stroke="#6ea6ff"
        strokeWidth="1"
        opacity="0.7"
      />
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontFamily="Inter, system-ui"
        fontSize="9"
        fontWeight="700"
        fill="#fff"
        letterSpacing="0.5"
      >
        RPD
      </text>
    </svg>
  );
}

export function BrandLockup({
  variant = "dark",
}: {
  /** "dark" = on the navy sidebar; "light" = on a white card. */
  variant?: "dark" | "light";
}) {
  const t1 = variant === "dark" ? "text-white" : "text-ink";
  const t2 = variant === "dark" ? "text-[#8ea2bf]" : "text-text3";
  return (
    <div className="flex items-center gap-2.5">
      <BrandShield />
      <div className="flex flex-col leading-tight">
        <span className={"text-[13px] font-bold tracking-[0.04em] " + t1}>Richmond PD</span>
        <span className={"text-[10.5px] font-medium tracking-[0.12em] uppercase " + t2}>
          Internal Ops
        </span>
      </div>
    </div>
  );
}
