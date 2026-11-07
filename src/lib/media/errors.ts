/** Upload rejections with stable codes (admin UI maps them; `message` is safe to show). */
export type MediaErrorCode =
  | "too_large"
  | "too_many_pixels"
  | "too_small"
  | "unsupported"
  | "corrupt"
  | "invalid_video"
  | "video_codec"
  | "video_track"
  | "busy"
  /** DES-R14 (R2): a `keepPng` upload that is not a PNG of ≤ 1200 × 630 and ≤ 300 KB */
  | "png_too_large";

const MESSAGES: Record<MediaErrorCode, string> = {
  too_large: "File is too large (images ≤ 15 MB, videos ≤ 25 MB).",
  too_many_pixels: "Image resolution is too high (max 40 megapixels).",
  too_small: "Image is too small (min 32 × 32 px).",
  unsupported: "Unsupported file type. Use JPEG, PNG, WebP or AVIF images, or MP4/WebM videos.",
  corrupt: "The file could not be decoded — it may be damaged.",
  invalid_video: "The video could not be read (MP4 H.264 or WebM expected).",
  video_codec: "This video uses HEVC (H.265), which many phones cannot play. Export it as MP4 (H.264) and upload again.",
  video_track:
    "This video carries a GPS/telemetry data track that cannot be removed safely. Export it again as a plain MP4 (H.264) and upload it.",
  busy: "The server is busy with other uploads. Try again in a few seconds.",
  png_too_large: "Keep this PNG within 1200 × 630 px and 300 KB.",
};

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode) {
    super(MESSAGES[code]);
    this.name = "MediaError";
    this.code = code;
  }
}
