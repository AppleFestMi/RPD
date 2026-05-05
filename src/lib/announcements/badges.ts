import type { BadgeTone } from "@/components/ui/Badge";
import type { AnnouncementPriority, AnnouncementStatus } from "./types";

export function priorityTone(p: AnnouncementPriority): BadgeTone {
  switch (p) {
    case "urgent":
      return "danger";
    case "important":
      return "warn";
    case "normal":
      return "neutral";
  }
}

export function statusTone(s: AnnouncementStatus): BadgeTone {
  switch (s) {
    case "published":
      return "ok";
    case "draft":
      return "info";
    case "archived":
      return "neutral";
  }
}
