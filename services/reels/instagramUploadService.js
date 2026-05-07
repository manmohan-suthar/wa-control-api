import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// Uses existing Meta Instagram Graph API flow.
// Expects `accessToken` and `igUserId` (instagram business account ID)

export async function uploadReel({ filePath, caption, accessToken, igUserId }) {
  // 1) upload video file to uploads folder (we already have local path)
  // 2) upload via Instagram Graph API: create container then publish
  // Following flow: POST /{igUserId}/media?media_type=REELS&video_url={public_url}&caption=...

  // For this SaaS we will upload the file to an internal route that serves /uploads
  // Build public URL
  const publicUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/uploads/${path.relative(process.cwd() + "/uploads", filePath).replace(/\\/g, "/")}`;

  // Create container
  const createRes = await fetch(
    `https://graph.facebook.com/v17.0/${igUserId}/media`,
    {
      method: "POST",
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: publicUrl,
        caption: caption || "",
        access_token: accessToken,
      }),
    },
  );
  const createJson = await createRes.json();
  if (!createJson || !createJson.id)
    throw new Error(`Create container failed: ${JSON.stringify(createJson)}`);

  // Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v17.0/${igUserId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: createJson.id,
        access_token: accessToken,
      }),
    },
  );
  const pubJson = await publishRes.json();
  if (!pubJson || !pubJson.id)
    throw new Error(`Publish failed: ${JSON.stringify(pubJson)}`);

  // Get permalink
  const metaRes = await fetch(
    `https://graph.facebook.com/v17.0/${pubJson.id}?fields=permalink&access_token=${accessToken}`,
  );
  const metaJson = await metaRes.json();

  return { mediaId: pubJson.id, permalink: metaJson?.permalink };
}
