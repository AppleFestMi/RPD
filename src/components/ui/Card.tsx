import type { ReactNode } from "react";

/**
 * Card — the dominant surface in the design language.
 *
 * Mirrors the prototype's white card with a 14px radius, hairline border,
 * and a subtle two-stop shadow. Composed via Card + CardHeader + CardBody
 * + CardFooter so server components can pass children naturally.
 */
export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag
      className={
        "rounded-lg border border-line bg-white shadow-[0_1px_0_rgba(15,29,51,0.04),0_1px_2px_rgba(15,29,51,0.06)] " +
        className
      }
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  meta,
  action,
  icon,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 " + className
      }
    >
      <div className="flex items-center gap-2">
        {icon ? <span className="text-text3">{icon}</span> : null}
        <h3 className="text-[13.5px] font-semibold tracking-tight">{title}</h3>
      </div>
      <div className="flex items-center gap-3 text-[12px] text-text3">
        {meta}
        {action}
      </div>
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={"p-4 " + className}>{children}</div>;
}

export function CardFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-3 border-t border-line/70 px-4 py-2.5 text-[12.5px] text-text3 " +
        className
      }
    >
      {children}
    </div>
  );
}
