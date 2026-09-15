import { createHash } from "node:crypto";
import { env } from "@/lib/env.server";

/**
 * Signed Cloudinary upload (server-only — never import from client code).
 * Signed rather than an unsigned upload preset because the API key/secret
 * are already sitting in this app's own env, so there's no need to also go
 * create/manage an unsigned preset in the Cloudinary dashboard, and a signed
 * upload can't be spammed by someone else who finds the cloud name.
 *
 * `dataUrl` is a `data:image/...;base64,...` URI — Cloudinary's upload API
 * accepts that directly as the `file` field, no multipart/binary handling
 * needed.
 */
export async function uploadImageToCloudinary(dataUrl: string, folder: string): Promise<string> {
  const cloudName = env("CLOUDINARY_CLOUD_NAME");
  const apiKey = env("CLOUDINARY_API_KEY");
  const apiSecret = env("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary isn't configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Only params that are actually sent AND meant to be verified go into the
  // signature — alphabetical order, exactly as Cloudinary requires.
  const paramsToSign = { folder, timestamp };
  const toSign = Object.entries(paramsToSign)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new FormData();
  form.set("file", dataUrl);
  form.set("api_key", apiKey);
  form.set("timestamp", String(timestamp));
  form.set("folder", folder);
  form.set("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || "Cloudinary upload failed.");
  }
  return json.secure_url;
}
