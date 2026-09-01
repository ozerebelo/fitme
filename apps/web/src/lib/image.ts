/**
 * Client-side image preparation for photo meal logging.
 *
 * Photos are downscaled in the browser before they go anywhere. A modern phone
 * camera produces a 4–12 MB image; the model gains nothing from that resolution
 * for portion estimation, and shipping it costs the user latency, data and
 * tokens. Resizing locally also means the full-resolution original never leaves
 * the device.
 */

export interface PreparedImage {
  /** Base64 JPEG payload (no data: prefix), for the vision request. */
  base64: string;
  mediaType: "image/jpeg";
  /** Small data URL kept alongside the diary entry. */
  thumbnail: string;
  width: number;
  height: number;
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    img.src = url;
  });

const drawScaled = (
  img: HTMLImageElement,
  maxEdge: number,
  quality: number,
): { dataUrl: string; width: number; height: number } => {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(img, 0, 0, width, height);

  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
};

/**
 * `maxEdge` of 1024 keeps the image comfortably inside the vision model's
 * native resolution while staying small on the wire.
 */
export const prepareImage = async (
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<PreparedImage> => {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file is not an image.");
  }
  const img = await loadImage(file);
  const full = drawScaled(img, opts.maxEdge ?? 1024, opts.quality ?? 0.82);
  const thumb = drawScaled(img, 256, 0.6);

  return {
    base64: full.dataUrl.split(",")[1] ?? "",
    mediaType: "image/jpeg",
    thumbnail: thumb.dataUrl,
    width: full.width,
    height: full.height,
  };
};
