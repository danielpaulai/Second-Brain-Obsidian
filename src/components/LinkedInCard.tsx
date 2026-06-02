"use client";

import {
  ThumbsUp,
  ChatCircle,
  Repeat,
  PaperPlaneTilt,
  GlobeHemisphereWest,
  Heart,
  HandsClapping,
} from "@phosphor-icons/react";
import type { LinkedInPost } from "@/lib/linkedin-data";

/**
 * A LinkedIn post card — a faithful, compact rendition of a real feed post (per the
 * reference): author header, caption, image, reaction counts, and the action bar. Used in
 * the stage "scrape" slideshow, so it's intentionally light (reads as a real LinkedIn card
 * flying past on the dark stage).
 */
export default function LinkedInCard({ post }: { post: LinkedInPost }) {
  const reactions = post.reactions.reduce((s, r) => s + r.count, 0);
  return (
    <div className="w-[380px] overflow-hidden rounded-xl bg-white text-[#1d2226] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] ring-1 ring-black/5">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-3">
        <img
          src={post.author.avatar}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="h-12 w-12 shrink-0 rounded-full bg-zinc-200 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1 text-[14px] font-semibold leading-tight">
            <span className="truncate">{post.author.name}</span>
            <span className="text-[12px] font-normal text-black/50">· You</span>
          </div>
          <div className="truncate text-[12px] leading-tight text-black/60">{post.author.headline}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-black/50">
            <span>{post.postedAgo}</span>
            <span>·</span>
            <GlobeHemisphereWest size={12} weight="fill" className="text-black/40" />
          </div>
        </div>
      </div>

      {/* Caption */}
      <div className="px-3 py-2 text-[13px] leading-snug">
        <p className="line-clamp-4 whitespace-pre-line">{post.content}</p>
      </div>

      {/* Image */}
      {post.image && (
        <img
          src={post.image}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => (e.currentTarget.style.display = "none")}
          className="max-h-[170px] w-full bg-zinc-100 object-cover"
        />
      )}

      {/* Reaction + comment counts */}
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2 text-[12px] text-black/55">
        <span className="flex items-center gap-1">
          <span className="flex -space-x-1">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#378fe9] ring-1 ring-white">
              <ThumbsUp size={9} weight="fill" className="text-white" />
            </span>
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#df704d] ring-1 ring-white">
              <Heart size={9} weight="fill" className="text-white" />
            </span>
            <span className="grid h-4 w-4 place-items-center rounded-full bg-[#6dae4f] ring-1 ring-white">
              <HandsClapping size={9} weight="fill" className="text-white" />
            </span>
          </span>
          <span className="tabular-nums">{reactions}</span>
        </span>
        <span className="tabular-nums">
          {post.comments} comments · {post.shares} reposts
        </span>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-around border-t border-black/10 py-1 text-[13px] font-semibold text-black/55">
        <Action icon={ThumbsUp} label="Like" />
        <Action icon={ChatCircle} label="Comment" />
        <Action icon={Repeat} label="Repost" />
        <Action icon={PaperPlaneTilt} label="Send" />
      </div>
    </div>
  );
}

function Action({ icon: Icon, label }: { icon: typeof ThumbsUp; label: string }) {
  return (
    <span className="flex items-center gap-1.5 px-2 py-1">
      <Icon size={16} weight="regular" />
      {label}
    </span>
  );
}
