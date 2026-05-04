import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-navy text-white border-navy hover:bg-navy-800 hover:border-navy-800",
  accent:
    "bg-accent text-white border-accent hover:bg-accent-ink hover:border-accent-ink",
  ghost: "bg-transparent text-text2 border-transparent hover:bg-neutral-soft",
  danger: "bg-white text-danger border-danger hover:bg-danger-soft",
  outline:
    "bg-white text-text2 border-line hover:bg-neutral-soft hover:border-text3/40",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[12.5px]",
  md: "h-9 px-3 text-[13px]",
  lg: "h-10 px-4 text-sm",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium tracking-tight transition-colors disabled:opacity-60 disabled:pointer-events-none";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
};

type LinkButtonProps = CommonProps & {
  /** Render as a Next Link styled identically to a button. */
  href: string;
  /** Open in a new tab. */
  external?: boolean;
};

type NativeButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
  };

type Props = LinkButtonProps | NativeButtonProps;

/**
 * Button — single source of truth for clickable affordances.
 *
 * Polymorphic: pass `href` to render as a Next `Link` styled identically.
 * That lets page actions navigate without nesting an `<a>` inside a
 * `<button>` (which is invalid HTML and silently broken in many
 * browsers).
 *
 * Variants follow the prototype palette: `primary`=navy,
 * `accent`=municipal blue, `outline` / `ghost` for secondary,
 * `danger` for destructive.
 */
export function Button(props: Props) {
  const variant = props.variant ?? "outline";
  const size = props.size ?? "md";
  const cls = `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${props.className ?? ""}`;
  const inner = (
    <>
      {props.leading ? <span className="-ml-0.5 text-current">{props.leading}</span> : null}
      <span>{props.children}</span>
      {props.trailing ? <span className="-mr-0.5 text-current">{props.trailing}</span> : null}
    </>
  );

  if ("href" in props && props.href) {
    const { href, external } = props;
    if (external) {
      return (
        <a href={href} className={cls} target="_blank" rel="noreferrer">
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    leading: _l,
    trailing: _t,
    className: _c,
    children: _ch,
    ...rest
  } = props as NativeButtonProps;
  void _v;
  void _s;
  void _l;
  void _t;
  void _c;
  void _ch;
  return (
    <button {...rest} className={cls}>
      {inner}
    </button>
  );
}
