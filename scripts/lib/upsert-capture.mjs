/**
 * POSTs a normalised meeting to /api/capture/meeting so the server can extract
 * durable commitments and write them as memories. Idempotent server-side via
 * the processed_meetings table.
 */

export async function postCapture({
  appUrl,
  cronSecret,
  meeting,
}) {
  if (!appUrl) throw new Error("APP_URL not set");
  if (!cronSecret) throw new Error("CRON_SECRET not set");

  const url = `${appUrl.replace(/\/$/, "")}/api/capture/meeting`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      meetingId: `${meeting.source}-${meeting.id}`,
      meetingTitle: meeting.title,
      meetingDate: (meeting.startedAt || meeting.endedAt || "").slice(0, 10),
      transcript: meeting.transcript || "",
      meetingEndedAt: meeting.endedAt,
    }),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { ok: false, error: `non-json response (${res.status})` };
  }
  return { status: res.status, body };
}
