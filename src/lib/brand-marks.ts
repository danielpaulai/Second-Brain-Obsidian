/** Real brand marks (fetched via Brandfetch → /public/logos) + official accent
 *  colors, used anywhere the app shows an app/source logo. */
export type BrandInfo = { name: string; logo: string | null; color: string };

export const BRANDS: Record<string, BrandInfo> = {
  gmail: { name: "Gmail", logo: "/logos/gmail.svg", color: "#EA4335" },
  slack: { name: "Slack", logo: "/logos/slack.svg", color: "#7C3AED" },
  notion: { name: "Notion", logo: "/logos/notion.svg", color: "#C9C9C6" },
  zoom: { name: "Zoom", logo: "/logos/zoom.png", color: "#2D8CFF" },
  linkedin: { name: "LinkedIn", logo: "/logos/linkedin.svg", color: "#0A66C2" },
  calendar: { name: "Google Calendar", logo: null, color: "#4285F4" },
};

/** Map a Zapier selected_api ("GoogleMailV2CLIAPI") or a display name to a brand key. */
export function brandKey(input?: string): string | null {
  const s = (input || "").toLowerCase();
  if (s.includes("mail")) return "gmail";
  if (s.includes("slack")) return "slack";
  if (s.includes("notion")) return "notion";
  if (s.includes("zoom")) return "zoom";
  if (s.includes("calendar")) return "calendar";
  if (s.includes("linkedin")) return "linkedin";
  return null;
}
