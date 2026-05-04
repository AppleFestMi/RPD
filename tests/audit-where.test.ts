import { describe, expect, it } from "vitest";
import { buildWhere } from "@/app/(authed)/admin/audit/where";

describe("audit filter where-builder", () => {
  it("returns an empty filter when no fields are set", () => {
    expect(buildWhere({})).toEqual({});
  });

  it("composes only the supplied predicates", () => {
    const where = buildWhere({ result: "denied", eventType: "permission.denied" });
    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        { result: "denied" },
        { eventType: "permission.denied" },
      ]),
    });
  });

  it("includes time bounds when given valid ISO strings", () => {
    const where = buildWhere({
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-05-31T23:59:59.000Z",
    });
    const conds = (where as { AND: Array<Record<string, unknown>> }).AND;
    expect(conds).toEqual(
      expect.arrayContaining([
        { createdAt: { gte: new Date("2026-05-01T00:00:00.000Z") } },
        { createdAt: { lte: new Date("2026-05-31T23:59:59.000Z") } },
      ]),
    );
  });
});
