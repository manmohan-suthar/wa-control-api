import path from "path";
import fs from "fs";
import { Innertube } from "youtubei.js";

const downloadsDir = path.join(process.cwd(), "uploads", "reel-temp");
if (!fs.existsSync(downloadsDir))
  fs.mkdirSync(downloadsDir, { recursive: true });

export async function downloadYouTube(url, filenameHint = "video", onProgress = null) {
  try {
    console.log(`[📥 DOWNLOAD] (innertube) Fetching info for: ${url}`);
    const yt = await Innertube.create();
    const info = await yt.getInfo(url);

    // Choose best video+audio format (Innertube provides a download stream)
    const stream = await yt.download(info.video_details?.id || info.id || info.videoId, {
      type: "video+audio",
      quality: "best",
      format: "mp4",
    });

    const outPath = path.join(
      downloadsDir,
      `${filenameHint.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.mp4`,
    );

    console.log(`[📥 DOWNLOAD] (innertube) Output path: ${outPath}`);

    const file = fs.createWriteStream(outPath);
    let downloadedBytes = 0;

    for await (const chunk of stream) {
      if (!chunk) continue;
      file.write(chunk);
      downloadedBytes += chunk.length;
      if (onProgress) onProgress({ stage: "downloading", bytes: downloadedBytes });
      console.log(`[📥 DOWNLOAD] (innertube) Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
    }

    await new Promise((res, rej) => file.end(() => res()));

    console.log(`[✅ DOWNLOAD] (innertube) Complete! File saved: ${outPath}`);
    if (onProgress) onProgress({ stage: "downloaded", path: outPath });
    return outPath;
  } catch (err) {
    console.error(`[❌ DOWNLOAD] (innertube) Error: ${err?.message || err}`);
    // Provide guidance for common failures
    if ((err && err.message && err.message.includes("410")) || err?.statusCode === 410) {
      throw new Error("Status code: 410 — video unavailable or requires authentication/cookies. Try setting YOUTUBE_COOKIES env var or use an authenticated Innertube session.");
    }
    throw err;
  }
}
