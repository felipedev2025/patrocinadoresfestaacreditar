import React from "react";
import {
  AbsoluteFill,
  Img,
  Series,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { bestGrid, buildScenes, type Scene } from "./scenes";
import type { ReelProps, ReelSponsor, TemplateStyle } from "./types";

// ------------------------------------------------------------------
// Utilitários de layout: tudo é calculado a partir da resolução real do
// painel, respeitando a margem de segurança — logotipos nunca são cortados
// ou deformados (objectFit: contain dentro de caixas calculadas).
// ------------------------------------------------------------------

type Theme = {
  bg: string;
  bg2: string;
  accent: string;
  text: string;
  muted: string;
  font: string;
  dark: boolean;
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function alpha(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function isDark(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

function useTheme(props: ReelProps): Theme {
  const { event, config, style } = props;
  const font = `${config.fontFamily ?? event.fontFamily}, Inter, "Helvetica Neue", Arial, sans-serif`;
  const accent = config.accentColor ?? event.accent;
  if (style === "INSTITUCIONAL") {
    const bg = config.backgroundColor ?? "#F6F5F2";
    return { bg, bg2: "#FFFFFF", accent, text: "#1A1A22", muted: "#5A5A66", font, dark: false };
  }
  const bg = config.backgroundColor ?? event.primary;
  const dark = isDark(bg);
  return {
    bg,
    bg2: event.secondary,
    accent,
    text: dark ? event.text : "#111111",
    muted: dark ? alpha(event.text, 0.72) : "#444444",
    font,
    dark,
  };
}

function useSafeArea(props: ReelProps) {
  const { width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const m = (props.format.safeMarginPct / 100) * base;
  return { width, height, base, margin: m, innerW: width - 2 * m, innerH: height - 2 * m, ultrawide: width / height > 2.4 };
}

/** Opacidade de entrada/saída de cada cena (transição cruzada para o fundo). */
function useSceneFade(frames: number, t: number) {
  const frame = useCurrentFrame();
  if (t <= 0) return 1;
  return interpolate(frame, [0, t, frames - t, frames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// ------------------------------------------------------------------
// Fundos por estilo
// ------------------------------------------------------------------

const Particles: React.FC<{ color: string; count: number; seed: string }> = ({ color, count, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const base = Math.min(width, height);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {Array.from({ length: count }).map((_, i) => {
        const x = random(`${seed}-x-${i}`) * width;
        const speed = 0.3 + random(`${seed}-s-${i}`) * 0.9;
        const size = base * (0.002 + random(`${seed}-r-${i}`) * 0.006);
        const y = height - ((random(`${seed}-y-${i}`) * height + (frame / fps) * speed * base * 0.08) % (height + 40));
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(frame / (12 + i % 9) + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity: twinkle * 0.8,
              boxShadow: `0 0 ${size * 4}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const Background: React.FC<{ style: TemplateStyle; theme: Theme; particles: boolean }> = ({ style, theme, particles }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  if (style === "INSTITUCIONAL") {
    return (
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.bg2} 0%, ${theme.bg} 100%)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.max(6, height * 0.012), background: theme.accent }} />
        {particles ? <Particles color={alpha(theme.accent, 0.5)} count={24} seed="inst" /> : null}
      </AbsoluteFill>
    );
  }

  if (style === "FESTIVAL") {
    const a = 50 + Math.sin(t * 0.6) * 25;
    const b = 50 + Math.cos(t * 0.45) * 25;
    return (
      <AbsoluteFill style={{ background: theme.bg, overflow: "hidden" }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${a}% ${b}%, ${alpha(theme.accent, 0.45)} 0%, transparent 45%),
              radial-gradient(circle at ${100 - a}% ${100 - b}%, ${alpha(theme.bg2, 0.9)} 0%, transparent 55%)`,
          }}
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              bottom: -height * 0.2,
              width: Math.max(width, height) * 0.08,
              height: Math.max(width, height) * 1.4,
              transformOrigin: "50% 100%",
              transform: `translateX(-50%) rotate(${Math.sin(t * 0.5 + i * 2.1) * 35 + (i - 1) * 25}deg)`,
              background: `linear-gradient(to top, ${alpha(theme.accent, 0.35)}, transparent 75%)`,
              filter: "blur(18px)",
            }}
          />
        ))}
        <Particles color={theme.accent} count={70} seed="fest" />
      </AbsoluteFill>
    );
  }

  // ELEGANTE / GRADE / MASTER: fundo escuro com iluminação dourada suave
  const sweep = ((t * 12) % 160) - 30;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, ${theme.bg2} 0%, ${theme.bg} 70%)`, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(105deg, transparent ${sweep}%, ${alpha(theme.accent, 0.12)} ${sweep + 10}%, transparent ${sweep + 22}%)`,
        }}
      />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 ${Math.min(width, height) * 0.35}px rgba(0,0,0,0.65)` }} />
      {particles || style === "MASTER" ? <Particles color={alpha(theme.accent, 0.9)} count={style === "MASTER" ? 50 : 28} seed="eleg" /> : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// Componentes de conteúdo
// ------------------------------------------------------------------

const LogoBox: React.FC<{
  src: string;
  w: number;
  h: number;
  plate: boolean;
  theme: Theme;
  glow?: boolean;
}> = ({ src, w, h, plate, theme, glow }) => {
  const pad = plate ? Math.min(w, h) * 0.1 : 0;
  return (
    <div
      style={{
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.min(w, h) * 0.08,
        background: plate ? "#FFFFFF" : "transparent",
        boxShadow: glow
          ? `0 0 ${Math.min(w, h) * 0.25}px ${alpha(theme.accent, 0.55)}, 0 0 0 ${Math.max(2, Math.min(w, h) * 0.01)}px ${alpha(theme.accent, 0.8)}`
          : plate
            ? "0 20px 60px rgba(0,0,0,0.35)"
            : "none",
        padding: pad,
        boxSizing: "border-box",
      }}
    >
      <Img src={src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  );
};

const Title: React.FC<{ children: React.ReactNode; size: number; theme: Theme; color?: string; weight?: number; spacing?: number }> = ({
  children,
  size,
  theme,
  color,
  weight = 800,
  spacing = 0.08,
}) => (
  <div
    style={{
      fontFamily: theme.font,
      fontSize: size,
      fontWeight: weight,
      color: color ?? theme.text,
      letterSpacing: `${spacing}em`,
      textAlign: "center",
      lineHeight: 1.15,
      textTransform: "uppercase",
      maxWidth: "100%",
    }}
  >
    {children}
  </div>
);

const IntroScene: React.FC<{ props: ReelProps; theme: Theme; frames: number }> = ({ props, theme, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const pop = spring({ frame, fps, config: { damping: 14 } });
  const logoH = sa.innerH * (sa.ultrawide ? 0.55 : 0.36);
  return (
    <AbsoluteFill style={{ opacity, alignItems: "center", justifyContent: "center", padding: sa.margin, gap: sa.base * 0.03, flexDirection: "column" }}>
      {props.event.logo ? (
        <div style={{ transform: `scale(${0.7 + pop * 0.3})`, width: sa.innerW * 0.6, height: logoH, display: "flex", justifyContent: "center" }}>
          <Img src={props.event.logo} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      ) : (
        <Title size={sa.base * 0.1} theme={theme} weight={props.config.titleWeight}>
          {props.event.name}
        </Title>
      )}
      <div style={{ opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateRight: "clamp" }) }}>
        <Title size={sa.base * 0.045} theme={theme} color={theme.accent} weight={600} spacing={0.25}>
          {[props.event.edition, props.event.year].filter(Boolean).join(" · ")}
        </Title>
      </div>
      <div
        style={{
          width: interpolate(frame, [15, 45], [0, sa.innerW * 0.3], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }),
          height: Math.max(2, sa.base * 0.004),
          background: theme.accent,
        }}
      />
      <div style={{ opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" }) }}>
        <Title size={sa.base * 0.035} theme={theme} color={theme.muted} weight={500} spacing={0.18}>
          Nossos patrocinadores
        </Title>
      </div>
    </AbsoluteFill>
  );
};

const CategoryScene: React.FC<{ props: ReelProps; theme: Theme; frames: number; title: string; color: string }> = ({
  props,
  theme,
  frames,
  title,
  color,
}) => {
  const frame = useCurrentFrame();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const spread = interpolate(frame, [0, frames], [0.12, 0.22]);
  return (
    <AbsoluteFill style={{ opacity, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: sa.base * 0.02 }}>
      <div style={{ width: sa.innerW * 0.18, height: Math.max(2, sa.base * 0.004), background: color }} />
      <Title size={sa.base * 0.075} theme={theme} weight={props.config.titleWeight} spacing={spread}>
        {title}
      </Title>
      <div style={{ width: sa.innerW * 0.18, height: Math.max(2, sa.base * 0.004), background: color }} />
    </AbsoluteFill>
  );
};

function useLogoMotion(animation: ReelSponsor["animation"], frames: number) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  const drift = interpolate(frame, [0, frames], [1, 1.045]); // movimento discreto contínuo
  switch (animation) {
    case "zoom":
      return { transform: `scale(${(0.55 + enter * 0.45) * drift})` };
    case "slide":
      return { transform: `translateX(${(1 - enter) * width * 0.15}px) scale(${drift})` };
    case "spotlight":
      return { transform: `scale(${(0.8 + enter * 0.2) * drift})`, filter: `brightness(${0.6 + enter * 0.4})` };
    default:
      return { transform: `scale(${drift})` };
  }
}

const SponsorScene: React.FC<{ props: ReelProps; theme: Theme; frames: number; sponsor: ReelSponsor; headline: boolean }> = ({
  props,
  theme,
  frames,
  sponsor,
  headline,
}) => {
  const frame = useCurrentFrame();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const motion = useLogoMotion(sponsor.highlight ? "spotlight" : sponsor.animation, frames);
  const box = props.config.logoBox * Math.min(1.25, Math.max(0.45, sponsor.scale)) * (sponsor.highlight ? 1.12 : 1);
  const headerH = sa.innerH * 0.14;
  const footerH = props.config.showSponsorNames ? sa.innerH * 0.12 : 0;
  const logoH = Math.min(sa.innerH - headerH - footerH, sa.innerH * box);
  const logoW = Math.min(sa.innerW * (sa.ultrawide ? 0.5 : 0.85), logoH * 2.2);
  const nameOpacity = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity, padding: sa.margin, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ height: headerH, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        {headline ? (
          <Title size={sa.base * 0.04} theme={theme} color={theme.accent} weight={600} spacing={0.2}>
            {sponsor.category ?? props.config.headline ?? props.event.headline}
          </Title>
        ) : null}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...motion }}>
        <LogoBox src={sponsor.logo} w={logoW} h={logoH} plate={props.config.logoPlate && theme.dark} theme={theme} glow={sponsor.highlight} />
      </div>
      {props.config.showSponsorNames ? (
        <div style={{ height: footerH, display: "flex", alignItems: "center", opacity: nameOpacity }}>
          <Title size={sa.base * 0.045} theme={theme} weight={props.config.titleWeight} spacing={0.06}>
            {sponsor.name}
          </Title>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const GridScene: React.FC<{ props: ReelProps; theme: Theme; frames: number; title: string | null; sponsors: ReelSponsor[] }> = ({
  props,
  theme,
  frames,
  title,
  sponsors,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const headerH = title ? sa.innerH * 0.14 : 0;
  const areaW = sa.innerW;
  const areaH = sa.innerH - headerH;
  const g = bestGrid(sponsors.length, areaW, areaH);
  const gap = sa.base * 0.02;
  const cellW = (areaW - gap * (g.cols - 1)) / g.cols;
  const cellH = Math.min((areaH - gap * (g.rows - 1)) / g.rows, cellW / 1.3);
  return (
    <AbsoluteFill style={{ opacity, padding: sa.margin, flexDirection: "column" }}>
      {title ? (
        <div style={{ height: headerH, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Title size={sa.base * 0.045} theme={theme} color={theme.accent} weight={700} spacing={0.18}>
            {title}
          </Title>
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${g.cols}, ${cellW}px)`,
          gridAutoRows: `${cellH}px`,
          gap,
          justifyContent: "center",
          alignContent: "center",
        }}
      >
        {sponsors.map((s, i) => {
          const enter = spring({ frame: frame - i * 3, fps, config: { damping: 15 } });
          return (
            <div key={s.id} style={{ transform: `scale(${0.6 + enter * 0.4})`, opacity: enter, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <LogoBox
                src={s.logo}
                w={cellW}
                h={props.config.showSponsorNames ? cellH * 0.8 : cellH}
                plate={props.config.logoPlate && theme.dark}
                theme={theme}
              />
              {props.config.showSponsorNames ? (
                <div
                  style={{
                    fontFamily: theme.font,
                    color: theme.muted,
                    fontSize: Math.max(14, cellH * 0.09),
                    marginTop: cellH * 0.04,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: cellW,
                  }}
                >
                  {s.name}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Vídeo individual: evento → agradecimento → logotipo → mensagem final. */
const IndividualScene: React.FC<{ props: ReelProps; theme: Theme; frames: number; sponsor: ReelSponsor }> = ({ props, theme, frames, sponsor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const appear = (start: number, len = 18) =>
    interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const logoIn = spring({ frame: frame - Math.round(fps * 1.2), fps, config: { damping: 14, stiffness: 100 } });
  const drift = interpolate(frame, [0, frames], [1, 1.05]);
  const premium = sponsor.highlight || props.style === "MASTER";
  const logoH = sa.innerH * (premium ? 0.5 : 0.44) * Math.min(1.2, Math.max(0.5, sponsor.scale));
  const logoW = Math.min(sa.innerW * (sa.ultrawide ? 0.45 : 0.85), logoH * 2.2);
  const outStart = frames - Math.round(fps * 2.2);
  const thanks = appear(outStart, 20);
  return (
    <AbsoluteFill style={{ opacity, padding: sa.margin, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: sa.base * 0.025 }}>
      <div style={{ opacity: appear(0) }}>
        <Title size={sa.base * 0.05} theme={theme} weight={props.config.titleWeight} spacing={0.12}>
          {props.event.name} {props.event.year}
        </Title>
      </div>
      <div style={{ opacity: appear(Math.round(fps * 0.5)) }}>
        <Title size={sa.base * 0.032} theme={theme} color={theme.accent} weight={600} spacing={0.2}>
          {props.config.headline ?? props.event.headline}
        </Title>
      </div>
      <div style={{ transform: `scale(${(0.6 + logoIn * 0.4) * drift})`, opacity: logoIn, margin: `${sa.base * 0.02}px 0` }}>
        <LogoBox src={sponsor.logo} w={logoW} h={logoH} plate={props.config.logoPlate && theme.dark} theme={theme} glow={premium} />
      </div>
      {props.config.showSponsorNames ? (
        <div style={{ opacity: appear(Math.round(fps * 1.8)) }}>
          <Title size={sa.base * 0.042} theme={theme} weight={props.config.titleWeight} spacing={0.05}>
            {sponsor.name}
          </Title>
        </div>
      ) : null}
      <div style={{ opacity: thanks, transform: `translateY(${(1 - thanks) * sa.base * 0.02}px)` }}>
        <div style={{ fontFamily: theme.font, fontSize: sa.base * 0.034, color: theme.muted, textAlign: "center", fontStyle: "italic" }}>
          {props.config.closing ?? props.event.thankYou}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const OutroScene: React.FC<{ props: ReelProps; theme: Theme; frames: number }> = ({ props, theme, frames }) => {
  const frame = useCurrentFrame();
  const sa = useSafeArea(props);
  const opacity = useSceneFade(frames, props.config.transitionFrames);
  const rise = interpolate(frame, [0, 25], [sa.base * 0.03, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ opacity, padding: sa.margin, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: sa.base * 0.03, transform: `translateY(${rise}px)` }}
    >
      <Title size={sa.base * 0.06} theme={theme} weight={props.config.titleWeight} spacing={0.1}>
        Obrigado!
      </Title>
      <div style={{ fontFamily: theme.font, fontSize: sa.base * 0.036, color: theme.muted, textAlign: "center", maxWidth: sa.innerW * 0.8 }}>
        {props.config.closing ?? props.event.thankYou}
      </div>
      {props.event.logo ? (
        <div style={{ height: sa.innerH * 0.22, width: sa.innerW * 0.4, display: "flex", justifyContent: "center", marginTop: sa.base * 0.02 }}>
          <Img src={props.event.logo} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      ) : (
        <Title size={sa.base * 0.04} theme={theme} color={theme.accent} weight={700}>
          {props.event.name} {props.event.year}
        </Title>
      )}
    </AbsoluteFill>
  );
};

function renderScene(scene: Scene, props: ReelProps, theme: Theme) {
  switch (scene.type) {
    case "intro":
      return <IntroScene props={props} theme={theme} frames={scene.frames} />;
    case "category":
      return <CategoryScene props={props} theme={theme} frames={scene.frames} title={scene.title} color={scene.color} />;
    case "sponsor":
      return <SponsorScene props={props} theme={theme} frames={scene.frames} sponsor={scene.sponsor} headline={props.config.layout !== "byCategory"} />;
    case "grid":
      return <GridScene props={props} theme={theme} frames={scene.frames} title={scene.title} sponsors={scene.sponsors} />;
    case "individual":
      return <IndividualScene props={props} theme={theme} frames={scene.frames} sponsor={scene.sponsor} />;
    case "outro":
      return <OutroScene props={props} theme={theme} frames={scene.frames} />;
  }
}

export const SponsorReel: React.FC<ReelProps> = (props) => {
  const theme = useTheme(props);
  const scenes = buildScenes(props);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Background style={props.style} theme={theme} particles={props.config.particles} />
      <Series>
        {scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.frames}>
            {renderScene(scene, props, theme)}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
