"use client";

import { MeshGradient } from "@paper-design/shaders-react";

export default function HeaderBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-[0.55]">
        <MeshGradient
          colors={["#0a0a0f", "#1f1635", "#3b1d52", "#0f0f17", "#0a0a0f"]}
          speed={0.18}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-background" />
      <div className="absolute inset-0 bg-background/55" />
    </div>
  );
}
