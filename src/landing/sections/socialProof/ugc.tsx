/**
 * ugc — customers' stories as 9:16 frames: progress bars, avatar with a story ring, name · city · age,
 * a clean caption sticker that pops in, the reply bar. A story without a photo becomes a type-only
 * story on the flat colour of its block (no mesh of lights: core D60, V40).
 * Desktop: a spotlight reel — the first photo story plays large in the middle (product-lit ring, its
 * bar filling, a soft halo behind it) and the others step down in size on both sides.
 * Mobile: a snap strip led by that story.
 */
import type { ReactElement } from "react";
import { Container, Icon, Picture, RichText, SectionShell, cssVars, editAttr, frameRegions, pictureCrop, reveal, round, seededRotation } from "../../primitives";
import type { RenderContext, ResolvedAsset, SectionBg } from "../../types";
import { coverOf } from "../reviews/frames";
import { say } from "../reviews/parts";
import { UI, fillIn } from "./copy";
import { Avatar, CtaRow, Header, titleId } from "./parts";
import type { Props, StoryData } from "./schema";

/**
 * Color blocks for type-only stories, in turn: never the section's own color, and never the dark
 * block on a dark page's neutral sections (it would melt into them).
 */
function textTones(ctx: RenderContext, bg: SectionBg): SectionBg[] {
  const darkPage = ctx.doc.theme.palette.base === "dark" && (bg === "base" || bg === "soft" || bg === "surface");
  const tones = (["accent", "pop", "dark"] as const).filter((t) => t !== bg && !(darkPage && t === "dark"));
  return tones.length ? tones : ["accent"];
}

const STORY = 9 / 16;
/** The story chrome: the header (progress, avatar, name) ends ~11% down, the reply bar starts ~89% down. */
const FACE_CLEAR = 0.135;

/**
 * Full-bleed only when every face starts below the story header (the top third of a head box is
 * hair or a veil, which the header may brush). Otherwise the photo is shown the way the app shows a
 * photo that is not 9:16: a shared-post card in the middle over its own blurred light.
 */
function storyLayout(asset: ResolvedAsset): { post: boolean; ratio: number } {
  const aspect = asset.width > 0 && asset.height > 0 ? asset.width / asset.height : 0.8;
  const ratio = round(Math.min(1.25, Math.max(0.8, aspect)), 3);
  if (asset.subjectKind !== "person") return { post: false, ratio };
  const crop = pictureCrop(asset, { frame: { shape: "rounded", ratio: STORY, maxZoom: 1 } });
  const faceTop = Math.min(...frameRegions(asset, STORY, crop).heads.map((h) => h.y + h.h / 3), 1);
  return { post: faceTop < FACE_CLEAR, ratio };
}

/** Post card geometry (frame fractions): 86% wide, centred a touch above the middle. */
const POST_W = 0.86;
const POST_CY = 0.47;

/**
 * Where the caption sticker sits (top edge, frame fraction): the first calm band below the faces
 * that covers no head, no hands and no product (else the least covering one); a shared post wears
 * it across the card's lower edge.
 */
function captionY(asset: ResolvedAsset | null, post: { ratio: number } | null): number {
  if (post) return round(POST_CY + (POST_W * STORY) / post.ratio / 2 - 0.035, 3);
  if (!asset) return 0.58;
  let best = { y: 0.58, cost: Infinity };
  for (const y of [0.58, 0.5, 0.66, 0.42, 0.74, 0.3, 0.22, 0.15]) {
    const cost = coverOf(asset, { ratio: STORY, maxZoom: 1 }, { y, h: 0.08, x: 0.1, w: 0.8 });
    if (cost < 0.05) return y;
    if (cost < best.cost - 1e-6) best = { y, cost };
  }
  return best.y;
}

function StoryFrame({
  ctx,
  id,
  story,
  i,
  tone,
  lead,
}: {
  ctx: RenderContext;
  id: string;
  story: StoryData;
  i: number;
  tone: SectionBg;
  lead: boolean;
}): ReactElement {
  const asset = ctx.asset(story.image);
  const r = ctx.rng(`${id}:story${i}`);
  // 1–3 segments, the current one part-way through — a story caught mid-play
  const segs = 1 + Math.floor(r() * 3);
  const cur = Math.floor(r() * segs);
  const played = (0.3 + r() * 0.5).toFixed(2);
  const base = `stories.${i}`;
  const first = story.name.trim().split(/\s+/)[0] ?? story.name;
  const meta = [story.city.trim(), story.when.trim()].filter(Boolean);
  // caption stickers sit a touch askew on archetypes that tilt (straight ones return 0)
  const capRot = seededRotation(ctx, `${id}:cap${i}`, 0.7);
  const layout = asset ? storyLayout(asset) : null;
  const post = layout?.post ? layout : null;
  const sizes = lead ? "(min-width: 56rem) 21rem, 64vw" : "(min-width: 56rem) 15rem, 64vw";
  return (
    <figure
      className="lp-sp__story"
      data-text={asset ? undefined : ""}
      data-bg={asset ? undefined : tone}
      data-tone={i % 3}
      data-lead={lead ? "" : undefined}
      data-post={post ? "" : undefined}
      style={post ? cssVars({ "--post-ar": post.ratio }) : undefined}
      aria-label={fillIn(say(ctx, UI.storyOf), { name: story.name })}
    >
      {asset && post ? (
        <>
          {/* the post's own light fills the story behind it */}
          <span className="lp-sp__blur" aria-hidden="true">
            <Picture asset={asset} sizes="6rem" alt="" />
          </span>
          <Picture
            asset={asset}
            sizes={sizes}
            ratio={post.ratio}
            frame={{ shape: "rounded", ratio: post.ratio }}
            className="lp-sp__post"
            alt={asset.alt || ctx.product.name}
          />
        </>
      ) : asset ? (
        <Picture
          asset={asset}
          sizes={sizes}
          ratio="9/16"
          // no zoom: the sticker and the post decision are placed from this exact crop
          frame={{ shape: "rounded", ratio: STORY, maxZoom: 1 }}
          className="lp-sp__shot"
          alt={asset.alt || ctx.product.name}
        />
      ) : null}
      <span className="lp-sp__scrim" aria-hidden="true" />
      <span className="lp-sp__prog" aria-hidden="true">
        {Array.from({ length: segs }, (_, k) => (
          <span key={k} className="lp-sp__seg" data-state={k < cur ? "done" : k === cur ? "now" : undefined}>
            <span className="lp-sp__fill" style={k === cur ? cssVars({ "--p": played }) : undefined} />
          </span>
        ))}
      </span>
      <span className="lp-sp__who">
        <span className="lp-sp__ring">
          <Avatar name={story.name} />
        </span>
        <span className="lp-sp__id">
          <span className="lp-sp__cname" {...editAttr(ctx, `${base}.name`)}>
            {story.name}
          </span>
          {meta.length ? <RichText className="lp-sp__csub" text={meta.join(" · ")} ctx={ctx} decorate={false} /> : null}
        </span>
      </span>
      {story.caption.trim() ? (
        <figcaption
          className="lp-sp__cap"
          style={cssVars({ "--cap-rot": capRot ? `${capRot}deg` : undefined, "--cap-y": asset ? captionY(asset, post) : undefined })}
          {...reveal("stamp", 360)}
        >
          <span className="lp-sp__cap-t" dir="auto" {...editAttr(ctx, `${base}.caption`)}>
            <RichText text={story.caption} ctx={ctx} decorate={false} />
          </span>
        </figcaption>
      ) : null}
      <span className="lp-sp__reply" aria-hidden="true">
        <span className="lp-sp__field">{fillIn(say(ctx, UI.reply), { name: first })}</span>
        <Icon name="heart" size="1.4em" />
      </span>
    </figure>
  );
}

export function UgcView({ id, ctx, data, bg }: Props): ReactElement {
  const tones = textTones(ctx, bg);
  const n = data.stories.length;
  // the first story with a photo leads: first in the mobile strip, centre stage on desktop
  const lead = Math.max(
    0,
    data.stories.findIndex((s) => ctx.asset(s.image)),
  );
  const ordered = [lead, ...data.stories.map((_, i) => i).filter((i) => i !== lead)];
  // desktop slot of the lead (middle, or just before it on even counts); the others keep their order around it
  const mid = Math.floor((n - 1) / 2);
  // type-only stories take the color blocks in turn, counted in reading order
  let textIndex = 0;
  const toneOf = new Map<number, SectionBg>();
  for (const i of ordered) if (!ctx.asset(data.stories[i]!.image)) toneOf.set(i, tones[textIndex++ % tones.length]!);
  return (
    <SectionShell id={id} ctx={ctx} type="socialProof" variant="ugc" bg={bg} labelledBy={titleId(id)}>
      <Container>
        <Header ctx={ctx} data={data} id={id} align="split" />
      </Container>
      <ul className="lp-sp__reel" role="list" data-count={n} data-stagger="90">
        {ordered.map((i, k) => {
          const slot = k === 0 ? mid : k - 1 < mid ? k - 1 : k;
          return (
            <li
              key={i}
              className="lp-sp__cell"
              data-d={Math.min(2, Math.abs(slot - mid))}
              style={cssVars({ "--o": String(slot) })}
              {...reveal(k === 0 ? "scale-in" : "rise")}
            >
              <StoryFrame ctx={ctx} id={id} story={data.stories[i]!} i={i} tone={toneOf.get(i) ?? "accent"} lead={k === 0} />
            </li>
          );
        })}
      </ul>
      <Container>
        <CtaRow ctx={ctx} data={data} />
      </Container>
    </SectionShell>
  );
}
