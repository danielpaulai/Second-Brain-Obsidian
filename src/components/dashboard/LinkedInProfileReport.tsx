"use client";

import {
  LinkedinLogo,
  MapPin,
  UsersThree,
  Briefcase,
  GraduationCap,
  Sparkle,
  ArrowSquareOut,
  EnvelopeSimple,
  Warning,
  type Icon as PhIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";

const LI = "#0A66C2";

type Profile = {
  name: string;
  headline: string;
  title: string;
  company: string;
  location: string;
  linkedinUrl: string;
  email: string;
  pictureUrl: string;
  about: string;
  followers: number | null;
  connections: number | null;
  experience: { title: string; company: string; duration: string; location: string }[];
  education: { school: string; degree: string; field: string; years: string }[];
  skills: string[];
};

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export default function LinkedInProfileReport({
  data,
}: {
  data: { configured?: boolean; found?: boolean; profile?: Profile | null; note?: string };
}) {
  if (!data?.found || !data.profile) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/55">
        <Warning size={15} weight="fill" className="text-amber-300/80" />
        {data?.configured === false ? "LinkedIn scraping isn't configured (set APIFY_TOKEN)." : data?.note || "No profile found."}
      </div>
    );
  }
  const p = data.profile;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-2xl border border-white/[0.14] bg-white/[0.05] shadow-[0_18px_50px_-26px_rgba(0,0,0,0.85)] backdrop-blur-xl backdrop-saturate-150"
    >
      {/* banner + identity */}
      <div className="relative px-4 pb-3 pt-4" style={{ background: `linear-gradient(180deg, ${LI}22, transparent 70%)` }}>
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/70">
          <LinkedinLogo size={11} weight="fill" style={{ color: "#5fa8ec" }} /> Profile
        </div>
        <div className="flex items-start gap-3">
          {p.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.pictureUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/15" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[16px] font-bold text-white" style={{ background: `${LI}33`, boxShadow: `inset 0 0 0 2px ${LI}55` }}>
              {initials(p.name)}
            </div>
          )}
          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[15px] font-bold leading-tight text-white">{p.name}</h3>
              {p.linkedinUrl && (
                <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-white/40 transition hover:text-cyan-300" title="Open on LinkedIn">
                  <ArrowSquareOut size={13} weight="bold" />
                </a>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white/70">{p.headline || p.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
              {p.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} weight="fill" /> {p.location}
                </span>
              )}
              {p.followers != null && (
                <span className="flex items-center gap-1">
                  <UsersThree size={11} weight="fill" /> {compact(p.followers)} followers
                </span>
              )}
              {p.connections != null && <span>{compact(p.connections)} connections</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3.5 px-4 pb-4 pt-1">
        {p.about && (
          <Section icon={Sparkle} title="About" color="#22d3ee">
            <p className="line-clamp-5 text-[12.5px] leading-relaxed text-white/75">{p.about}</p>
          </Section>
        )}

        {p.experience.length > 0 && (
          <Section icon={Briefcase} title="Experience" color="#a78bfa">
            <div className="space-y-2.5">
              {p.experience.map((e, i) => (
                <div key={i} className="relative pl-4">
                  <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "#a78bfa" }} />
                  <div className="text-[12.5px] font-medium text-white/90">{e.title}</div>
                  <div className="text-[11.5px] text-white/55">
                    {[e.company, e.duration].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {p.education.length > 0 && (
          <Section icon={GraduationCap} title="Education" color="#34d399">
            <div className="space-y-2">
              {p.education.map((e, i) => (
                <div key={i}>
                  <div className="text-[12.5px] font-medium text-white/90">{e.school}</div>
                  <div className="text-[11.5px] text-white/55">{[e.degree, e.field, e.years].filter(Boolean).join(" · ")}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {p.skills.length > 0 && (
          <Section icon={Sparkle} title="Skills" color="#f59e0b">
            <div className="flex flex-wrap gap-1.5">
              {p.skills.map((s, i) => (
                <span key={i} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/70">
                  {s}
                </span>
              ))}
            </div>
          </Section>
        )}

        {p.email && (
          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-[11.5px] text-cyan-300/80 transition hover:text-cyan-200">
            <EnvelopeSimple size={13} weight="fill" /> {p.email}
          </a>
        )}
      </div>
    </motion.div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: PhIcon; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
        <Icon size={12} weight="fill" /> {title}
      </div>
      {children}
    </div>
  );
}
