/**
 * Meeting-note writer (v2 — Sybill structured-summary aware).
 *
 * Builds an Obsidian-flavoured markdown note from a normalised meeting object,
 * and writes it to `<VAULT_PATH>/Meetings/YYYY-MM-DD Title.md`.
 *
 * Idempotent: the file's frontmatter carries `meeting_id` + `source`. If a file
 * already exists with the same id, we skip (preserves your manual edits).
 *
 * Normalised meeting shape:
 *   {
 *     source: "granola" | "sybill",
 *     id: string,
 *     title: string,
 *     startedAt: string,         // ISO
 *     endedAt: string,           // ISO
 *     durationMin: number | null,
 *     type: string | null,       // EXTERNAL / INTERNAL (Sybill)
 *     category: string | null,   // prospect_discovery, customer_checkin, etc. (Sybill)
 *     attendees: string[],
 *     summary: string,           // Outcome (Sybill) or AI summary (Granola)
 *     bullets: string[],         // Key Takeaways (Sybill) or key points (Granola)
 *     painPoints: string[],      // Sybill only
 *     faq: { question, answer }[], // Sybill only
 *     actionItems: string[],
 *     transcript: string,
 *     recordingUrl: string|null,
 *     sourceUrl: string|null,
 *     dealName: string|null,
 *     dealStage: string|null,
 *   }
 */

import fs from "node:fs/promises";
import path from "node:path";

export const MEETINGS_FOLDER = "Meetings";

/** Make a title safe for a filename — keeps it readable in Obsidian. */
export function sanitizeTitle(raw, fallback = "untitled-meeting") {
  if (!raw) return fallback;
  const cleaned = String(raw)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 90) || fallback;
}

export function dateKey(iso) {
  return new Date(iso || Date.now()).toISOString().slice(0, 10);
}

function fmList(arr) {
  if (!arr || arr.length === 0) return "[]";
  return "\n" + arr.map((x) => `  - ${String(x).replace(/"/g, '\\"')}`).join("\n");
}

function escFM(s) {
  if (!s) return '""';
  const str = String(s);
  if (/[":#@`]/.test(str)) return JSON.stringify(str);
  return `"${str}"`;
}

/** Build the markdown body from a normalised meeting. */
export function renderMeetingNote(m) {
  const day = dateKey(m.startedAt || m.endedAt);
  const time = m.startedAt ? new Date(m.startedAt).toTimeString().slice(0, 5) : "";
  const durationStr = m.durationMin ? `${m.durationMin} min` : "";
  const subhead = [day, time, durationStr, m.source].filter(Boolean).join(" · ");

  const tags = ["meeting", m.source];
  if (m.dealName) tags.push("deal");
  if (m.attendees && m.attendees.some((a) => /client|customer/i.test(a))) {
    tags.push("client");
  }
  if (m.category) tags.push(m.category);
  if (m.type === "EXTERNAL") tags.push("external");
  else if (m.type === "INTERNAL") tags.push("internal");

  const fm = `---
date: ${day}
source: ${m.source}
meeting_id: ${escFM(m.id)}
title: ${escFM(m.title)}
started_at: ${escFM(m.startedAt || "")}
ended_at: ${escFM(m.endedAt || "")}${m.type ? `\ntype: ${escFM(m.type)}` : ""}${m.category ? `\ncategory: ${escFM(m.category)}` : ""}
attendees: ${fmList(m.attendees)}
tags: ${fmList(tags)}${m.dealName ? `\ndeal: ${escFM(m.dealName)}` : ""}${m.dealStage ? `\ndeal_stage: ${escFM(m.dealStage)}` : ""}${m.recordingUrl ? `\nrecording: ${escFM(m.recordingUrl)}` : ""}${m.sourceUrl ? `\nsource_url: ${escFM(m.sourceUrl)}` : ""}
---`;

  const lines = [];
  lines.push(fm);
  lines.push("");
  lines.push(`# ${m.title || "Untitled meeting"}`);
  lines.push(`*${subhead}*`);
  lines.push("");

  if (m.attendees && m.attendees.length > 0) {
    lines.push(`**Attendees:** ${m.attendees.join(", ")}`);
    lines.push("");
  }

  if (m.summary && m.summary.trim()) {
    lines.push("## Summary");
    lines.push("");
    lines.push(m.summary.trim());
    lines.push("");
  }

  if (m.bullets && m.bullets.length > 0) {
    lines.push("## Key takeaways");
    lines.push("");
    for (const b of m.bullets) lines.push(`- ${b}`);
    lines.push("");
  }

  if (m.painPoints && m.painPoints.length > 0) {
    lines.push("## Pain points");
    lines.push("");
    for (const p of m.painPoints) lines.push(`- ${p}`);
    lines.push("");
  }

  if (m.faq && m.faq.length > 0) {
    lines.push("## Q&A");
    lines.push("");
    for (const f of m.faq) {
      lines.push(`**${f.question}**`);
      lines.push("");
      lines.push(f.answer);
      lines.push("");
    }
  }

  if (m.actionItems && m.actionItems.length > 0) {
    lines.push("## Action items");
    lines.push("");
    for (const a of m.actionItems) lines.push(`- [ ] ${a}`);
    lines.push("");
  }

  if (m.recordingUrl) {
    lines.push("## Recording");
    lines.push("");
    lines.push(`[Open recording](${m.recordingUrl})`);
    lines.push("");
  }

  if (m.transcript && m.transcript.trim()) {
    lines.push("## Transcript");
    lines.push("");
    lines.push("> [!quote]- Full transcript");
    const inner = m.transcript.trim().split("\n").map((l) => `> ${l}`).join("\n");
    lines.push(inner);
    lines.push("");
  }

  if (m.sourceUrl) {
    lines.push("---");
    lines.push(`*[Open in ${m.source}](${m.sourceUrl})*`);
  }

  return lines.join("\n");
}

/**
 * Resolve the final filename + path for a meeting note. Handles collisions
 * by appending `(meeting_id-prefix)` suffix so same-day same-title meetings
 * don't clobber each other.
 */
async function resolveTargetPath(vaultPath, meeting) {
  const day = dateKey(meeting.startedAt || meeting.endedAt);
  const cleanTitle = sanitizeTitle(meeting.title);
  const baseDir = path.join(vaultPath, MEETINGS_FOLDER);
  await fs.mkdir(baseDir, { recursive: true });

  const baseName = `${day} ${cleanTitle}.md`;
  const baseFull = path.join(baseDir, baseName);

  try {
    const existing = await fs.readFile(baseFull, "utf8");
    const idMatch = existing.match(/^meeting_id:\s*"?([^"\n]+)"?/m);
    if (idMatch && idMatch[1].trim() === meeting.id) {
      return { fullPath: baseFull, exists: true, sameMeeting: true };
    }
    const idSuffix = String(meeting.id).slice(0, 8).replace(/[^\w-]/g, "");
    const altName = `${day} ${cleanTitle} (${idSuffix}).md`;
    const altFull = path.join(baseDir, altName);
    try {
      const altExisting = await fs.readFile(altFull, "utf8");
      const altIdMatch = altExisting.match(/^meeting_id:\s*"?([^"\n]+)"?/m);
      if (altIdMatch && altIdMatch[1].trim() === meeting.id) {
        return { fullPath: altFull, exists: true, sameMeeting: true };
      }
    } catch {
      return { fullPath: altFull, exists: false, sameMeeting: false };
    }
    return { fullPath: altFull, exists: true, sameMeeting: false };
  } catch {
    return { fullPath: baseFull, exists: false, sameMeeting: false };
  }
}

/**
 * Write the meeting note. Returns `{ written, path, skipped }`.
 */
export async function writeMeetingNote(vaultPath, meeting) {
  if (!vaultPath) throw new Error("VAULT_PATH not provided");
  if (!meeting?.id) throw new Error("meeting.id required");

  const { fullPath, exists, sameMeeting } = await resolveTargetPath(
    vaultPath,
    meeting
  );

  if (exists && sameMeeting) {
    return { written: false, skipped: true, path: fullPath };
  }
  if (exists && !sameMeeting) {
    return {
      written: false,
      skipped: true,
      path: fullPath,
      error: "filename collision with a different note — refused",
    };
  }

  const body = renderMeetingNote(meeting);
  await fs.writeFile(fullPath, body, "utf8");
  return { written: true, skipped: false, path: fullPath };
}
