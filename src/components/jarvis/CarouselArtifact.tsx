"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { CaretLeft, CaretRight, Copy, Check, Sparkle, ArrowsOut, ArrowsIn, DownloadSimple, FileText, FilePdf, FileZip } from "@phosphor-icons/react";
import { zipSync } from "fflate";
import type { CarouselArtifactData } from "@/lib/jarvis-events";
import { cn } from "@/lib/utils";

/**
 * The carousel host — a cinematic, premium slide deck. A floating slide on an
 * accent-tinted stage (ambient bloom + floor glow + gradient-glass frame),
 * stories-style segmented progress, glassy spring-loaded controls, a refined
 * filmstrip, a polished caption dock, plus full-screen + download-all. All chrome
 * lives OFF the artwork.
 */

const KIND_TAG: Record<string, string> = { hook: "HOOK", body: "BUILD", cta: "CALL TO ACTION" };
const ACCENT: Record<string, string> = { hook: "#d946ef", body: "#a78bfa", cta: "#34d399" };

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 80 : -80, scale: 0.88, rotateY: dir >= 0 ? 12 : -12 }),
  center: { opacity: 1, x: 0, scale: 1, rotateY: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -80 : 80, scale: 0.88, rotateY: dir >= 0 ? -12 : 12 }),
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "carousel";
const pad = (n: number) => String(n).padStart(2, "0");

export default function CarouselArtifact({ data }: { data: CarouselArtifactData }) {
  const [[i, dir], setPos] = useState<[number, number]>([0, 0]);
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  const n = data.slides.length;
  const slide = data.slides[i];
  const accent = ACCENT[slide?.kind ?? "body"] ?? "#a78bfa";
  const hasVisuals = data.slides.some((s) => s.image);

  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v));
  const go = (d: number) => setPos(([p]) => [clamp(p + d), d]);
  const jump = (to: number) => setPos(([p]) => [clamp(to), to >= p ? 1 : -1]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -400) go(1);
    else if (info.offset.x > 70 || info.velocity.x > 400) go(-1);
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(data.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const downloadAll = () => {
    const files: Record<string, Uint8Array> = {};
    data.slides.forEach((s, idx) => {
      if (!s.image || !s.image.startsWith("data:")) return;
      const b64 = s.image.split(",")[1] ?? "";
      try {
        files[`slide-${idx + 1}.png`] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        /* skip */
      }
    });
    if (Object.keys(files).length === 0) return;
    save(zipSync(files), "zip");
  };

  // PDF deck — one slide per page at the image's native size. pdf-lib is loaded
  // lazily so it never weighs down the rest of the panel.
  const downloadPdf = async () => {
    const slides = data.slides.filter((s) => s.image?.startsWith("data:"));
    if (!slides.length) return;
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (const s of slides) {
      try {
        const bytes = Uint8Array.from(atob(s.image!.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
        const png = await doc.embedPng(bytes);
        const page = doc.addPage([png.width, png.height]);
        page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
      } catch {
        /* skip a bad slide */
      }
    }
    save(await doc.save(), "pdf");
  };

  const save = (bytes: Uint8Array, ext: "zip" | "pdf") => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: ext === "pdf" ? "application/pdf" : "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(data.topic)}-carousel.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ----- the cinematic slide stage ----- */
  const stage = (large: boolean) => (
    <div className={cn("relative flex min-h-0 flex-1 flex-col items-center gap-3.5", large ? "px-6 py-5" : "px-3 py-3")} style={{ perspective: 1600 }}>
      {/* ambient bloom — breathes, tinted to the active slide */}
      <motion.div
        className="pointer-events-none absolute inset-8 rounded-[40%]"
        style={{ background: `radial-gradient(60% 55% at 50% 38%, ${accent}4d, transparent 72%)`, filter: "blur(40px)" }}
        animate={{ opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <NavButton side="left" onClick={() => go(-1)} disabled={i === 0} />

        <div className={cn("relative aspect-[4/5] h-full w-auto", large ? "max-h-[80vh]" : "max-h-[438px]")}>
          {/* floor glow — the slide reads as a floating object */}
          <div
            className="pointer-events-none absolute -bottom-4 left-1/2 h-8 w-[82%] -translate-x-1/2 rounded-[50%]"
            style={{ background: accent, opacity: 0.4, filter: "blur(22px)" }}
          />
          <AnimatePresence custom={dir} mode="popLayout" initial={false}>
            <motion.div
              key={i}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 280, damping: 30 }, opacity: { duration: 0.22 }, scale: { duration: 0.32 } }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={onDragEnd}
              className="absolute inset-0 cursor-grab overflow-hidden rounded-[22px] active:cursor-grabbing"
              style={{
                background: slide?.image ? "rgba(6,9,18,0.92)" : `radial-gradient(130% 90% at 18% -8%, ${accent}28, rgba(6,9,18,0.96) 60%)`,
                boxShadow: `0 50px 130px -30px ${accent}8c, 0 18px 50px -28px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.12)`,
              }}
            >
              {slide?.image ? (
                <motion.img
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  src={slide.image}
                  alt={slide.title}
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col justify-center p-7">
                  <div className="mb-4 h-1 w-12 rounded-full" style={{ background: accent, boxShadow: `0 0 14px ${accent}` }} />
                  <h3 className="text-[27px] font-bold leading-[1.08] tracking-tight text-white">{slide?.title}</h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-white/72">{slide?.body}</p>
                </div>
              )}
              {/* glass edge: hairline ring + a whisper of top light */}
              <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/12" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-[22px] bg-gradient-to-b from-white/[0.06] to-transparent" />
            </motion.div>
          </AnimatePresence>
        </div>

        <NavButton side="right" onClick={() => go(1)} disabled={i === n - 1} />
      </div>

      {/* controls — OFF the picture: kind pill · segmented progress · counter */}
      <div className="flex w-full max-w-[420px] shrink-0 items-center gap-3">
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur"
          style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}
        >
          {KIND_TAG[slide?.kind ?? "body"]}
        </span>
        <div className="flex flex-1 items-center gap-1.5">
          {data.slides.map((_, k) => (
            <button key={k} onClick={() => jump(k)} className="group h-1.5 flex-1 overflow-hidden rounded-full bg-white/12" aria-label={`Slide ${k + 1}`}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: accent, boxShadow: k === i ? `0 0 10px ${accent}` : "none" }}
                initial={false}
                animate={{ width: k <= i ? "100%" : "0%", opacity: k <= i ? 1 : 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </button>
          ))}
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/45">
          {pad(i + 1)} <span className="text-white/25">/ {pad(n)}</span>
        </span>
      </div>
    </div>
  );

  /* ----- premium filmstrip ----- */
  const filmstrip = (
    <div
      className="flex shrink-0 items-center gap-2.5 overflow-x-auto border-t border-white/8 px-4 py-3"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 16px), transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 16px, #000 calc(100% - 16px), transparent)" }}
    >
      {data.slides.map((s, k) => {
        const a = ACCENT[s.kind] ?? "#a78bfa";
        const on = k === i;
        return (
          <motion.button
            key={k}
            onClick={() => jump(k)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.94 }}
            className={cn("relative aspect-[4/5] h-14 shrink-0 overflow-hidden rounded-lg border transition", on ? "" : "opacity-45 hover:opacity-90")}
            style={{ borderColor: on ? a : "rgba(255,255,255,0.10)", boxShadow: on ? `0 6px 22px -8px ${a}99, 0 0 0 1.5px ${a}` : "none" }}
          >
            {s.image ? (
              <img src={s.image} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1" style={{ background: `radial-gradient(120% 90% at 20% 0%, ${a}33, rgba(6,9,18,0.96) 65%)` }}>
                <span className="line-clamp-3 text-[7px] font-semibold leading-tight text-white/75">{s.title}</span>
              </div>
            )}
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 font-mono text-[7px] text-white/70">{k + 1}</span>
          </motion.button>
        );
      })}
    </div>
  );

  /* ----- caption dock ----- */
  const caption = (
    <div className="shrink-0 border-t border-white/8 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
          Post caption
        </span>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] text-white/30">{data.caption.length} chars</span>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={copyCaption}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] backdrop-blur transition",
              copied ? "border-emerald-400/40 text-emerald-300" : "border-white/10 bg-white/[0.03] text-white/55 hover:border-fuchsia-300/40 hover:text-white"
            )}
          >
            {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy caption"}
          </motion.button>
        </div>
      </div>
      <p data-lenis-prevent className="max-h-[64px] overflow-y-auto whitespace-pre-line text-[12.5px] leading-relaxed text-white/60">
        {data.caption}
      </p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 26 }} className="flex h-full flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/80">
            <Sparkle size={11} weight="fill" />
            Deliverable · Carousel
          </div>
          <div className="mt-0.5 truncate text-[15.5px] font-semibold tracking-tight text-white">{data.topic}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/55 backdrop-blur">
            {n} slides{hasVisuals ? " · visual" : ""}
          </span>
          <GlassBtn label="Full screen" onClick={() => setFull(true)}>
            <ArrowsOut size={15} weight="bold" />
          </GlassBtn>
          <DownloadMenu onPdf={downloadPdf} onZip={downloadAll} />
        </div>
      </div>

      {data.grounding.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/8 px-4 py-1.5 text-[9.5px] text-white/35">
          <FileText size={10} className="text-white/30" />
          Grounded in {Array.from(new Set(data.grounding)).slice(0, 3).join(", ")}
        </div>
      )}

      {stage(false)}
      {filmstrip}
      {caption}

      {/* fullscreen */}
      {full &&
        typeof document !== "undefined" &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex flex-col bg-[#02040a]/97 backdrop-blur-2xl"
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `radial-gradient(60% 50% at 50% 42%, ${accent}1f, transparent 70%)` }}
            />
            <div className="relative flex shrink-0 items-center justify-between px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300/80">Carousel · {n} slides</div>
                <div className="truncate text-[16px] font-semibold tracking-tight text-white">{data.topic}</div>
              </div>
              <div className="flex items-center gap-2">
                <DownloadMenu onPdf={downloadPdf} onZip={downloadAll} variant="pill" />
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setFull(false)} className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[12px] text-white/70 backdrop-blur transition hover:border-white/25 hover:text-white">
                  <ArrowsIn size={14} weight="bold" /> Close
                </motion.button>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1">{stage(true)}</div>
            <div className="relative mx-auto w-full max-w-3xl">{filmstrip}</div>
          </motion.div>,
          document.body
        )}
    </motion.div>
  );
}

function DownloadMenu({ onPdf, onZip, variant = "glass" }: { onPdf: () => void; onZip: () => void; variant?: "glass" | "pill" }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white";
  return (
    <div className="relative">
      {variant === "pill" ? (
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[12px] text-white/70 backdrop-blur transition hover:border-white/25 hover:text-white">
          <DownloadSimple size={14} weight="bold" /> Download
        </motion.button>
      ) : (
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setOpen((v) => !v)} title="Download" className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 backdrop-blur transition hover:border-fuchsia-300/40 hover:bg-white/10 hover:text-white">
          <DownloadSimple size={15} weight="bold" />
        </motion.button>
      )}
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-[calc(100%+6px)] z-[96] w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0b0e16]/95 p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            >
              <button onClick={() => { setOpen(false); onPdf(); }} className={item}>
                <FilePdf size={15} weight="duotone" className="text-rose-300/80" /> PDF deck
              </button>
              <button onClick={() => { setOpen(false); onZip(); }} className={item}>
                <FileZip size={15} weight="duotone" className="text-amber-300/80" /> PNG slides (.zip)
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function GlassBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 backdrop-blur transition hover:border-fuchsia-300/40 hover:bg-white/10 hover:text-white"
    >
      {children}
    </motion.button>
  );
}

function NavButton({ side, onClick, disabled }: { side: "left" | "right"; onClick: () => void; disabled: boolean }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.08 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "absolute z-10 grid h-11 w-11 place-items-center rounded-full border border-white/12 bg-black/40 text-white/65 backdrop-blur-xl transition hover:border-white/35 hover:bg-black/60 hover:text-white disabled:pointer-events-none disabled:opacity-15",
        side === "left" ? "left-0.5" : "right-0.5"
      )}
      style={{ boxShadow: "0 10px 30px -12px rgba(0,0,0,0.8)" }}
    >
      <Icon size={18} weight="bold" />
    </motion.button>
  );
}
