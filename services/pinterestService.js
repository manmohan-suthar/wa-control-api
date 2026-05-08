import axios from "axios";

const PINTEREST_HOST =
  process.env.PINTEREST_RAPIDAPI_HOST ||
  "unofficial-pinterest-api.p.rapidapi.com";
const PINTEREST_KEY =
  process.env.PINTEREST_RAPIDAPI_KEY ||
  "6a973fc0acmsh7664582b4d7010ep1aaeb2jsn5016b6a1802b";

function normalizePinterestVideoUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videosIndex = parts.indexOf("videos");

    if (videosIndex !== -1) {
      if (parts[videosIndex + 1]) {
        parts[videosIndex + 1] = "mc";
      }

      const hlsIndex = parts.indexOf("hls");
      if (hlsIndex !== -1) {
        parts[hlsIndex] = "720p";
      }

      parsed.pathname = `/${parts.join("/")}`;
    }

    return parsed.toString().replace(/\.m3u8(\?.*)?$/i, ".mp4$1");
  } catch (error) {
    return url;
  }
}

function pickVideoEntry(videoList = {}) {
  const preferredKeys = ["V_HLSV4", "V_HLSV3_MOBILE", "V_HLSV3", "V_HLS"];

  for (const key of preferredKeys) {
    const entry = videoList?.[key];
    if (entry?.url) return entry;
  }

  const firstEntry = Object.values(videoList || {}).find((entry) => entry?.url);
  return firstEntry || null;
}

function pickImageUrl(item) {
  const imageMap = item?.images || {};
  const preferredKeys = ["orig", "736x", "474x", "236x", "170x"];

  for (const key of preferredKeys) {
    const image = imageMap?.[key];
    if (image?.url) return image.url;
  }

  return item?.thumbnail || item?.image_small_url || null;
}

function mapPinterestItem(item) {
  const videoNode = item?.videos || {};
  const videoEntry = pickVideoEntry(videoNode?.video_list || videoNode || {});
  const rawVideoUrl = videoEntry?.url || null;

  return {
    id: String(item?.id || item?.node_id || ""),
    nodeId: item?.node_id || null,
    title: item?.title || item?.grid_title || "Untitled Pin",
    description: item?.description || "",
    thumbnail: videoEntry?.thumbnail || pickImageUrl(item),
    videoUrl: rawVideoUrl,
    downloadUrl: rawVideoUrl ? normalizePinterestVideoUrl(rawVideoUrl) : null,
    duration: videoEntry?.duration || null,
    width: videoEntry?.width || null,
    height: videoEntry?.height || null,
    domain: item?.domain || "",
    createdAt: item?.created_at || null,
    sourceUrl: item?.link || item?.utm_link || null,
    pinner: {
      username: item?.access?.pinner?.username || "",
      fullName: item?.access?.pinner?.full_name || "",
      followerCount: item?.access?.pinner?.follower_count || 0,
      imageUrl:
        item?.access?.pinner?.image_large_url ||
        item?.access?.pinner?.image_medium_url ||
        item?.access?.pinner?.image_small_url ||
        null,
    },
    board: {
      name: item?.board?.name || "",
      url: item?.board?.url || "",
      pinCount: item?.board?.pin_count || 0,
    },
  };
}

export async function searchPinterestVideos(keyword, num = 10, apiKey = null) {
  const effectiveKey = PINTEREST_KEY || apiKey || null;
  if (!effectiveKey) {
    throw new Error(
      "PINTEREST_RAPIDAPI_KEY is missing. Provide it via environment variable or the query param `rapidapi_key`.",
    );
  }

  if (!keyword || !String(keyword).trim()) {
    throw new Error("keyword is required");
  }

  const response = await axios.get(
    `https://${PINTEREST_HOST}/pinterest/videos/relevance`,
    {
      params: {
        keyword: String(keyword).trim(),
        num: Math.max(1, Math.min(parseInt(num, 10) || 10, 20)),
      },
      headers: {
        "x-rapidapi-key": effectiveKey,
        "x-rapidapi-host": PINTEREST_HOST,
        "Content-Type": "application/json",
      },
    },
  );

  const data = Array.isArray(response.data?.data)
    ? response.data.data.map(mapPinterestItem).filter(Boolean)
    : [];

  return {
    status: response.data?.status || "success",
    message: response.data?.message || "Request has been successful.",
    query: keyword,
    data,
  };
}
