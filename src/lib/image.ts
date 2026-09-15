/**
 * Downscale + JPEG-compress an uploaded image file into a data URL before it
 * goes to Cloudinary (see `uploadMenuItemImage`) — keeps a multi-MB phone
 * photo from being uploaded (and billed/stored) at full resolution. Keeps
 * the longest side at or below `maxDimension` and re-encodes as JPEG
 * regardless of source format.
 */
/**
 * Insert a Cloudinary delivery transformation (e.g. a small cropped
 * thumbnail) into an already-uploaded image URL, so the browser downloads a
 * right-sized image instead of the full upload. A no-op for anything that
 * isn't a Cloudinary `.../upload/...` URL — including the legacy inline
 * `data:` URLs some items may still have from before Cloudinary was wired
 * up — so it's always safe to call.
 */
export function cloudinaryThumb(url: string, transform = "w_120,h_120,c_fill,g_auto,f_auto,q_auto"): string {
  const marker = "/upload/";
  const i = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || i === -1) return url;
  const cut = i + marker.length;
  return `${url.slice(0, cut)}${transform}/${url.slice(cut)}`;
}

export function resizeImageToDataUrl(file: File, maxDimension = 640, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Image processing isn't supported here."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
