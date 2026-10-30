"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import { SponsorReel } from "@/remotion/SponsorReel";
import { buildScenes, totalFrames } from "@/remotion/scenes";
import type { ReelProps } from "@/remotion/types";

/**
 * Prévia no navegador usando EXATAMENTE a mesma composição que o worker renderiza no servidor.
 * O arquivo final, porém, é sempre gerado no servidor (MP4 H.264).
 */
export function ReelPreview({ props, className = "", controls = true }: { props: ReelProps; className?: string; controls?: boolean }) {
  const duration = useMemo(() => Math.max(1, totalFrames(buildScenes(props))), [props]);
  return (
    <div className={`overflow-hidden rounded-xl bg-black ring-1 ring-white/10 ${className}`}>
      <Player
        component={SponsorReel}
        inputProps={props}
        durationInFrames={duration}
        compositionWidth={props.format.width}
        compositionHeight={props.format.height}
        fps={props.format.fps}
        style={{ width: "100%", aspectRatio: `${props.format.width} / ${props.format.height}` }}
        controls={controls}
        autoPlay
        loop
        acknowledgeRemotionLicense
      />
    </div>
  );
}
