/**
 * Persistent boundary notice.
 *
 * Renders the same wording defined in DATA_BOUNDARIES.md. Compose into
 * forms, attachment dialogs, and the application footer.
 */
export function BoundaryNotice({ variant = "footer" }: { variant?: "footer" | "form" }) {
  const className =
    variant === "footer"
      ? "border-t border-line bg-white px-6 py-3 text-[11.5px] leading-snug text-text3"
      : "rounded-md border border-warn-soft bg-warn-soft/50 px-3 py-2 text-[12px] leading-snug text-text2";

  return (
    <div className={className}>
      <strong className="text-text2">Administrative coordination only.</strong>{" "}
      Do not enter CAD, RMS, evidence, body camera, HR/payroll, LEIN, NCIC, CJIS-regulated
      criminal justice information, criminal history, case reports, victim/witness data,
      juvenile data, intelligence records, or active investigative material.
    </div>
  );
}
