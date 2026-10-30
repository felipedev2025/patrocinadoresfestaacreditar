import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { SponsorReel } from "./SponsorReel";
import { buildScenes, totalFrames } from "./scenes";
import { DEFAULT_TEMPLATE_CONFIG, type ReelProps } from "./types";

export const COMPOSITION_ID = "SponsorReel";

/** Duração, resolução e FPS são derivados das props (formato do painel + patrocinadores). */
export const calculateReelMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: Math.max(1, totalFrames(buildScenes(props))),
  width: props.format.width,
  height: props.format.height,
  fps: props.format.fps,
});

const defaultProps: ReelProps = {
  mode: "collective",
  style: "ELEGANTE",
  config: DEFAULT_TEMPLATE_CONFIG,
  event: {
    name: "Evento",
    edition: null,
    year: new Date().getFullYear(),
    primary: "#0B0B12",
    secondary: "#1C1C2B",
    accent: "#E09B12",
    text: "#FFFFFF",
    logo: null,
    headline: "AGRADECEMOS AO NOSSO PATROCINADOR",
    thankYou: "Obrigado por fazer parte desta história!",
    fontFamily: "Inter",
  },
  sponsors: [],
  format: { width: 1920, height: 1080, fps: 30, safeMarginPct: 5 },
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={SponsorReel}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
    calculateMetadata={calculateReelMetadata}
  />
);
