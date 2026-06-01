"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  DepthOfField,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Stars, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceRadial,
  forceX,
  forceY,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import gsap from "gsap";
import { getPresentationSheet, types } from "@/lib/theatre";
import type { BrainGraph as GraphData } from "@/lib/vault";
import { usePresentation } from "@/lib/presentation-store";
import { sounds } from "@/lib/sounds";

type Props = { data: GraphData | null; highlights?: string[] };

type N = SimulationNodeDatum & {
  id: string;
  group: number;
  val: number;
  z?: number;
};
type L = SimulationLinkDatum<N> & { source: string | N; target: string | N };

const PALETTE = [
  new THREE.Color("#9ca7c4"),
  new THREE.Color("#a8b3a0"),
  new THREE.Color("#c4a89c"),
  new THREE.Color("#b4a8c4"),
  new THREE.Color("#a0bcb0"),
  new THREE.Color("#c4b89c"),
  new THREE.Color("#b89cb4"),
  new THREE.Color("#9cb4c4"),
];

/** Lay out nodes via d3 in 3D space (we tilt out of plane on z via val + jitter). */
function useLayout(data: GraphData | null) {
  return useMemo(() => {
    if (!data) return { nodes: [] as N[], links: [] as L[] };
    const nodes: N[] = data.nodes.map((n) => ({
      id: n.id,
      group: n.group,
      val: n.val,
    }));
    const links: L[] = data.links.map((l) => ({ ...l }));

    const sim = forceSimulation<N>(nodes)
      .force(
        "link",
        forceLink<N, L>(links)
          .id((d) => d.id)
          .distance(30)
          .strength(0.1)
      )
      .force(
        "charge",
        forceManyBody<N>()
          .strength((d) => -130 - d.val * 30)
          .distanceMax(400)
      )
      .force("centerX", forceX<N>(0).strength(0.04))
      .force("centerY", forceY<N>(0).strength(0.04))
      .force("radial", forceRadial<N>(150, 0, 0).strength(0.02))
      .force(
        "collide",
        forceCollide<N>().radius((d) => Math.max(2, d.val * 2.4)).iterations(2)
      )
      .alphaDecay(0.04)
      .stop();

    for (let i = 0; i < 280; i++) sim.tick();

    // Give each node a stable z offset (out-of-plane) for depth
    for (const n of nodes) {
      n.z = (Math.sin(hash(n.id) * 12.9898) * 18 + Math.cos(hash(n.id) * 4.5) * 10);
    }
    return { nodes, links };
  }, [data]);
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs((h % 1000) / 1000);
}

export default function PresentationGraph({ data, highlights = [] }: Props) {
  const { firing } = usePresentation();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 360], fov: 55, near: 1, far: 4000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#06060c"]} />
        <fog attach="fog" args={["#06060c", 350, 900]} />
        <ambientLight intensity={0.18} />
        <pointLight position={[0, 0, 200]} intensity={0.6} color="#c4b5fd" />
        <Stars
          radius={300}
          depth={120}
          count={3500}
          factor={3}
          saturation={0.4}
          fade
          speed={0.4}
        />
        {/* Full camera control: drag = orbit, wheel = zoom, right-drag = pan.
            Slow auto-rotate when idle so the scene never feels frozen.
            Suspended during cinematic burst so GSAP can drive the camera. */}
        <OrbitControls
          ref={controlsRef as any}
          enableDamping
          dampingFactor={0.08}
          enableZoom
          enableRotate
          enablePan
          rotateSpeed={0.45}
          zoomSpeed={0.7}
          panSpeed={0.7}
          minDistance={60}
          maxDistance={1400}
          target={[0, 0, 0]}
          enabled={firing.length === 0}
          autoRotate={firing.length === 0}
          autoRotateSpeed={0.18}
          makeDefault
        />
        <Scene data={data} highlights={highlights} firing={firing} controlsRef={controlsRef} />
        <EffectComposer multisampling={4}>
          <Bloom
            intensity={1.4}
            luminanceThreshold={0.12}
            luminanceSmoothing={0.4}
            mipmapBlur
            radius={0.8}
          />
          <DepthOfField focusDistance={0.012} focalLength={0.04} bokehScale={3} />
          <ChromaticAberration
            offset={[0.0008, 0.0012] as any}
            blendFunction={BlendFunction.NORMAL}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.18} darkness={0.78} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

function Scene({
  data,
  highlights,
  firing,
  controlsRef,
}: {
  data: GraphData | null;
  highlights: string[];
  firing: string[];
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { nodes, links } = useLayout(data);
  const groupRef = useRef<THREE.Group>(null!);
  const linksRef = useRef<THREE.LineSegments>(null!);
  const camera = useThree((s) => s.camera);
  const firingSet = useMemo(() => new Set(firing), [firing]);
  const highlightSet = useMemo(() => new Set(highlights), [highlights]);

  /* --- Build instanced sphere mesh --- */
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const fireFlash = useRef<Map<string, number>>(new Map());

  // Initial transform + color
  useEffect(() => {
    if (!meshRef.current || nodes.length === 0) return;
    nodes.forEach((n, i) => {
      const r = Math.max(0.7, n.val * 0.55);
      dummy.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      const c = PALETTE[n.group % PALETTE.length];
      meshRef.current.setColorAt(i, c);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [nodes, dummy]);

  /* --- Fire flash: when a note enters `firing`, flash white + scale-up --- */
  useEffect(() => {
    for (const id of firing) fireFlash.current.set(id, performance.now());
  }, [firing]);

  /* --- Theatre.js-driven camera flythrough — keyframes are editable live in
        the Studio (⌘+\). The actual values fed to the timeline below come
        from `cinematic` object which the Studio can scrub. --- */
  const cinematicObj = useMemo(() => {
    const sheet = getPresentationSheet();
    // `reconfigure: true` lets HMR re-mounts update the object config in place
    // instead of throwing "object already exists with different config" errors.
    return sheet.object(
      "camera arc",
      {
        flyDistance: types.number(110, { range: [40, 300] }),
        flyDuration: types.number(1.4, { range: [0.3, 4] }),
        holdDuration: types.number(1.8, { range: [0, 5] }),
        returnDuration: types.number(2.2, { range: [0.3, 5] }),
      },
      { reconfigure: true }
    );
  }, []);

  const lastFireKey = useRef("");
  useEffect(() => {
    if (firing.length === 0) return;
    const key = firing.join("|");
    if (key === lastFireKey.current) return;
    lastFireKey.current = key;

    // Find centroid of cited notes
    const cited = nodes.filter((n) => firingSet.has(n.id));
    if (cited.length === 0) return;
    const cx = cited.reduce((a, n) => a + (n.x ?? 0), 0) / cited.length;
    const cy = cited.reduce((a, n) => a + (n.y ?? 0), 0) / cited.length;
    const cz = cited.reduce((a, n) => a + (n.z ?? 0), 0) / cited.length;

    sounds.cinematicWhoosh();

    const { flyDistance, flyDuration, holdDuration, returnDuration } =
      cinematicObj.value as any;

    const startPos = camera.position.clone();
    // Snapshot OrbitControls target so we can restore it after the timeline
    const startTarget = controlsRef.current
      ? controlsRef.current.target.clone()
      : null;

    const tl = gsap.timeline({
      onComplete: () => {
        if (controlsRef.current && startTarget) {
          controlsRef.current.target.copy(startTarget);
        }
      },
    });
    tl.to(camera.position, {
      x: cx + 30,
      y: cy + 20,
      z: cz + flyDistance,
      duration: flyDuration,
      ease: "power3.inOut",
      onUpdate: () => {
        camera.lookAt(cx, cy, cz);
        if (controlsRef.current) controlsRef.current.target.set(cx, cy, cz);
      },
    })
      .to({ k: 1 }, { k: 0, duration: holdDuration })
      .to(camera.position, {
        x: startPos.x,
        y: startPos.y,
        z: startPos.z,
        duration: returnDuration,
        ease: "power2.inOut",
        onUpdate: () => {
          camera.lookAt(0, 0, 0);
          if (controlsRef.current) controlsRef.current.target.set(0, 0, 0);
        },
      });
  }, [firing, firingSet, nodes, camera, cinematicObj, controlsRef]);

  /* --- Per-frame: micro group breathing (very subtle, doesn't fight OrbitControls)
        + flash animation. Camera is fully under user control now. --- */
  const t0 = useRef(performance.now());
  useFrame(() => {
    if (!meshRef.current || !groupRef.current) return;
    const now = performance.now();
    const elapsed = (now - t0.current) / 1000;

    // Subtle group breath — barely perceptible, just so it never feels frozen
    groupRef.current.rotation.y = Math.sin(elapsed * 0.05) * 0.03;
    groupRef.current.rotation.x = Math.cos(elapsed * 0.04) * 0.02;

    let needsUpdate = false;
    let colorNeedsUpdate = false;

    nodes.forEach((n, i) => {
      const baseR = Math.max(0.7, n.val * 0.55);
      const startedAt = fireFlash.current.get(n.id);
      const isHighlight = highlightSet.has(n.id) || firingSet.has(n.id);
      let scale = baseR;
      let color: THREE.Color | null = null;

      if (startedAt) {
        const dt = (now - startedAt) / 1000;
        if (dt < 2.5) {
          // Pulse curve: snap up then slowly settle
          const k = dt < 0.3 ? dt / 0.3 : Math.max(0, 1 - (dt - 0.3) / 2.2);
          scale = baseR * (1 + k * 3.5);
          color = tmpColor.copy(PALETTE[n.group % PALETTE.length]).lerp(new THREE.Color("#ffffff"), k);
          needsUpdate = true;
          colorNeedsUpdate = true;
        } else {
          fireFlash.current.delete(n.id);
        }
      } else if (isHighlight) {
        scale = baseR * 1.6;
      }

      dummy.position.set(n.x ?? 0, n.y ?? 0, n.z ?? 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      if (color) meshRef.current.setColorAt(i, color);
    });

    if (needsUpdate) meshRef.current.instanceMatrix.needsUpdate = true;
    if (colorNeedsUpdate && meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
  });

  /* --- Build link geometry (static lines) --- */
  const linkGeometry = useMemo(() => {
    const positions = new Float32Array(links.length * 6);
    const idMap = new Map(nodes.map((n) => [n.id, n] as const));
    let i = 0;
    for (const l of links) {
      const sId = typeof l.source === "object" ? (l.source as N).id : l.source;
      const tId = typeof l.target === "object" ? (l.target as N).id : l.target;
      const s = idMap.get(sId);
      const t = idMap.get(tId);
      if (!s || !t) continue;
      positions[i++] = s.x ?? 0;
      positions[i++] = s.y ?? 0;
      positions[i++] = s.z ?? 0;
      positions[i++] = t.x ?? 0;
      positions[i++] = t.y ?? 0;
      positions[i++] = t.z ?? 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [links, nodes]);

  if (nodes.length === 0) return null;

  return (
    <group ref={groupRef}>
      <lineSegments ref={linksRef} geometry={linkGeometry}>
        <lineBasicMaterial
          color={"#5a5a72"}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      <instancedMesh
        ref={meshRef}
        args={[undefined as any, undefined as any, nodes.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          emissiveIntensity={1.3}
          emissive={"#ffffff"}
          toneMapped={false}
          roughness={0.4}
          metalness={0.1}
        />
      </instancedMesh>
    </group>
  );
}

/** Public hook: trigger a cinematic burst on a set of note titles. */
export function useFireCinematic() {
  const fire = usePresentation((s) => s.fire);
  const clearFiring = usePresentation((s) => s.clearFiring);
  return (ids: string[]) => {
    fire(ids);
    // GSAP-style decay handled inside frame loop; clear after burst window.
    gsap.delayedCall(3, () => clearFiring());
  };
}
