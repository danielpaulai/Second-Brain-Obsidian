import { create } from "zustand";

/** Which connected-app brands the Operator agent is actively touching right now.
 *  The chat panel sets it from in-flight tool calls; the Connected-apps grid reads
 *  it to light the matching card. */
type OperatorActivity = {
  active: string[];
  setActive: (brands: string[]) => void;
};

export const useOperatorActivity = create<OperatorActivity>((set) => ({
  active: [],
  setActive: (brands) => set((s) => (sameSet(s.active, brands) ? s : { active: brands })),
}));

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}
