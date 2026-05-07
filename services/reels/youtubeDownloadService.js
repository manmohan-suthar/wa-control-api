import path from "path";
import fs from "fs";
import ytDlp from "yt-dlp-exec";
import ffmpeg from "fluent-ffmpeg";

const downloadsDir = path.join(process.cwd(), "uploads", "reel-temp");
if (!fs.existsSync(downloadsDir))
  fs.mkdirSync(downloadsDir, { recursive: true });

/**
 * Clean YouTube URL to remove playlist parameters
 * Extracts only the video ID to avoid playlist mode
 */
function cleanYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    const videoId = parsed.searchParams.get("v");

    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  } catch (e) {
    return url;
  }
}

/**
 * Download YouTube video using yt-dlp
 * @param {string} url - YouTube video URL
 * @param {string} filenameHint - Base filename for the output
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} Path to downloaded video file
 */
export async function downloadYouTube(
  url,
  filenameHint = "video",
  onProgress = null,
) {
  try {
    // Clean URL to remove playlist parameters
    const cleanUrl = cleanYouTubeUrl(url);
    console.log(`[📥 DOWNLOAD] (yt-dlp) Starting download: ${cleanUrl}`);

    const safeFilename = filenameHint.replace(/[^a-z0-9]/gi, "_");
    const outPath = path.join(
      downloadsDir,
      `${safeFilename}_${Date.now()}.mp4`,
    );

    console.log(`[📥 DOWNLOAD] (yt-dlp) Output path: ${outPath}`);

    // Optionally clean old downloads to avoid using previously downloaded AV1/VP9 files
    if ((process.env.CLEAN_OLD_DOWNLOADS || "false").toLowerCase() === "true") {
      try {
        const clipsDir = path.join(process.cwd(), "uploads", "reel-clips");
        if (fs.existsSync(downloadsDir))
          fs.rmSync(downloadsDir, { recursive: true, force: true });
        if (fs.existsSync(clipsDir))
          fs.rmSync(clipsDir, { recursive: true, force: true });
        fs.mkdirSync(downloadsDir, { recursive: true });
        console.log(
          "[🧹 CLEAN] Removed old downloads in uploads/reel-temp and uploads/reel-clips",
        );
      } catch (e) {
        console.warn(
          "[🧹 CLEAN] Failed to clean old download folders:",
          e?.message || e,
        );
      }
    }

    // Prefer H.264 (avc1) MP4 + M4A(AAC) to avoid AV1/VP9/webm
    const preferredFormat =
      "bestvideo[vcodec*=avc1][ext=mp4]+bestaudio[ext=m4a]/best[vcodec*=avc1][ext=mp4]";
    let downloadedWithPreferred = false;

    try {
      await ytDlp(cleanUrl, {
        output: outPath,
        format: preferredFormat,
        mergeOutputFormat: "mp4",
        noPlaylist: true,
      });
      downloadedWithPreferred = true;
      console.log(
        "[📥 DOWNLOAD] (yt-dlp) Downloaded using preferred MP4/H264 format",
      );
    } catch (e) {
      console.warn(
        `[⚠️ DOWNLOAD] Preferred MP4/H264 format not available, falling back: ${e?.message || e}`,
      );
      // Fallback to bestvideo+bestaudio
      await ytDlp(cleanUrl, {
        output: outPath,
        format: "bestvideo+bestaudio/best",
        mergeOutputFormat: "mp4",
        noPlaylist: true,
      });
    }

    // Optionally re-encode to widely compatible codecs (H.264 + AAC)
    // Controlled via env var RECODE_TO_H264 (default: true) — set to "false" to skip.
    const shouldRecode =
      (process.env.RECODE_TO_H264 || "true").toLowerCase() !== "false";

    // Helper: probe file codecs and decide if conversion is needed
    async function needsRecode(file) {
      return new Promise((res) => {
        ffmpeg.ffprobe(file, (err, metadata) => {
          if (err || !metadata) return res(true);
          const video = (metadata.streams || []).find(
            (s) => s.codec_type === "video",
          );
          const audio = (metadata.streams || []).find(
            (s) => s.codec_type === "audio",
          );

          if (!video || !audio) return res(true);

          const vcodec = (video.codec_name || "").toLowerCase();
          const aprefix = (audio.codec_name || "").toLowerCase();
          const pix = (video.pix_fmt || "").toLowerCase();

          const videoOk = vcodec.includes("h264") || vcodec.includes("avc1");
          const audioOk = aprefix.includes("aac") || aprefix.includes("mp4a");
          const pixOk = pix === "yuv420p" || pix === "yuv420p10le";

          // If container isn't mp4, prefer recode
          const containerOk = path.extname(file).toLowerCase() === ".mp4";

          const needs = !(videoOk && audioOk && pixOk && containerOk);
          res(needs);
        });
      });
    }

    if (shouldRecode) {
      const recodeNeeded = await needsRecode(outPath);
      if (recodeNeeded && !downloadedWithPreferred) {
        const recodedPath = outPath.replace(/\.mp4$/i, "_h264.mp4");
        console.log(
          `[🔁 TRANScode] Converting to H.264+AAC with faststart: ${recodedPath}`,
        );

        await new Promise((resolve, reject) => {
          ffmpeg(outPath)
            .videoCodec("libx264")
            .audioCodec("aac")
            .format("mp4")
            .outputOptions([
              "-preset fast",
              "-movflags +faststart",
              "-pix_fmt yuv420p",
            ])
            .on("start", (cmd) => console.log(`[ffmpeg] start: ${cmd}`))
            .on("progress", (p) =>
              console.log(`[ffmpeg] progress: ${JSON.stringify(p)}`),
            )
            .on("end", () => {
              try {
                fs.renameSync(recodedPath, outPath);
              } catch (e) {
                // If rename fails, try copy
                try {
                  fs.copyFileSync(recodedPath, outPath);
                  fs.unlinkSync(recodedPath);
                } catch (ex) {}
              }
              console.log(
                `[✅ TRANScode] Conversion finished and replaced output`,
              );
              resolve();
            })
            .on("error", (err) => reject(err))
            .save(recodedPath);
        });
      } else {
        console.log(
          "[🔁 TRANScode] No conversion needed — file already compatible",
        );
      }
    }

    // Verify file exists
    if (!fs.existsSync(outPath)) {
      throw new Error("Downloaded file not found");
    }

    const fileSize = fs.statSync(outPath).size;
    console.log(
      `[✅ DOWNLOAD] (yt-dlp) Complete! File: ${outPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`,
    );

    if (onProgress) {
      onProgress({
        stage: "downloading",
        message: "Download complete",
        path: outPath,
      });
    }

    return outPath;
  } catch (err) {
    console.error(`[❌ DOWNLOAD] (yt-dlp) Error: ${err?.message || err}`);
    throw new Error(
      `YouTube download failed: ${err?.message || "Unknown error"}`,
    );
  }
}
