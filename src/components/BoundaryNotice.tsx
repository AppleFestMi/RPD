/**
 * Persistent boundary notice.
 *
 * Identical wording in every variant — see docs/DATA_BOUNDARIES.md. The
 * `footer` variant is the app-shell footer; `form` is for inline use
 * above note/attachment fields; `panel` is a card-style block for
 * stand-alone screens (login, activation).
 */
type Variant = "footer" | "form" | "panel";

const COPY = (
  <>
    <strong className="text-text2">Administrative coordination only.</strong>{" "}
    Do not enter CAD, RMS, evidence, body camera, HR/payroll, LEIN, NCIC, CJIS-regulated
    criminal justice information, criminal history, case reports, victim/witness data,
    juvenile data, intelligence records, or active investigative material.
  </>
);

export function BoundaryNotice({ variant = "footer" }: { variant?: Variant }) {
  if (variant === "panel") {
    return (
      <div className="rounded-md border border-warn/30 bg-warn-soft/40 px-3.5 py-2.5 text-[12px] leading-snug text-text2">
        {COPY}
      </div>
    );
  }
  if (variant === "form") {
    return (
      <div className="rounded-md border border-warn/30 bg-warn-soft/50 px-3 py-2 text-[12px] leading-snug text-text2">
        {COPY}
      </div>
    );
  }
  // footer
  return (
    <div className="border-t border-line bg-white px-6 py-3 text-[11.5px] leading-snug text-text3">
      {COPY}
    </div>
  );
}
