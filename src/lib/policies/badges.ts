import type { BadgeTone } from "@/components/ui/Badge";
import type { PolicyStatus } from "./types";

export function policyStatusTone(s: PolicyStatus): BadgeTone {
  switch (s) {
    case "published":
      return "ok";
    case "draft":
      return "info";
    case "archived":
      return "neutral";
  }
}
