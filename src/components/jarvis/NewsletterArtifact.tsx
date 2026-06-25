"use client";

import { useState } from "react";
import { DownloadSimple, Copy, Check, EnvelopeSimple } from "@phosphor-icons/react";
import type { NewsletterArtifactData } from "@/lib/jarvis-events";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "newsletter";

/**
 * Renders the finished, light-themed HTML newsletter inside an isolated iframe (so
 * its email styles never collide with the dark app), with copy-HTML + download.
 */
export default function NewsletterArtifact({ data }: { data: NewsletterArtifactData }) {
  const [copied, setCopied] = useState(false);

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(data.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(data.subject)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const btn =
    "flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11.5px] font-medium text-white/75 transition hover:border-rose-300/40 hover:text-white";

  return (
    <div className="flex h-full flex-col">
      {/* subject bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/85">
            <EnvelopeSimple size={12} weight="fill" /> Newsletter
          </div>
          <div className="truncate text-[13px] font-semibold text-white/90">{data.subject}</div>
          {data.preview && <div className="truncate text-[11px] text-white/40">{data.preview}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={copyHtml} className={btn} title="Copy the HTML">
            {copied ? <Check size={13} weight="bold" /> : <Copy size={13} weight="bold" />} HTML
          </button>
          <button onClick={download} className={btn} title="Download as .html">
            <DownloadSimple size={13} weight="bold" /> Download
          </button>
        </div>
      </div>

      {/* the email, rendered isolated on its own light canvas */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <iframe
          title="Newsletter preview"
          srcDoc={data.html}
          sandbox="allow-same-origin"
          className="h-full w-full rounded-xl border border-white/10 bg-white shadow-[0_18px_50px_-26px_rgba(0,0,0,0.7)]"
        />
      </div>
    </div>
  );
}
