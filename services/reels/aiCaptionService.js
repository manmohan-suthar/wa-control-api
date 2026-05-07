import axios from "axios";
import OpenRouterSettings from "../../models/OpenRouterSettings.js";

// Cache for OpenRouter settings
let cachedSettings = null;

/**
 * Fetch OpenRouter settings from database
 * Caches result for 5 minutes to reduce DB calls
 */
async function getOpenRouterSettings() {
  try {
    // Return cached if available
    if (
      cachedSettings &&
      cachedSettings.timestamp > Date.now() - 5 * 60 * 1000
    ) {
      return cachedSettings.data;
    }

    const settings =
      (await OpenRouterSettings.findOne({ key: "global" })) ||
      (await OpenRouterSettings.create({ key: "global" }));

    cachedSettings = {
      data: settings,
      timestamp: Date.now(),
    };

    console.log(`[🤖 AI] Loaded OpenRouter settings: model=${settings.model}`);
    return settings;
  } catch (err) {
    console.error(`[❌ AI] Failed to load OpenRouter settings:`, err);
    throw err;
  }
}

/**
 * Generate caption for a reel part using OpenRouter API
 * Includes retry logic for reliability
 */
export async function generateCaptionForPart({
  campaignTitle,
  youtubeTitle,
  index,
  tone,
  hashtagCount,
}) {
  const prompt = `You are a social media copywriter. Given the campaign title: "${campaignTitle}" and original video title: "${youtubeTitle}", create a short catchy reel title for Part ${index}, a strong hook (one sentence), a CTA one-liner, a viral caption combining the hook and CTA, and ${hashtagCount} relevant hashtags in plain text. Tone: ${tone}. Return JSON with keys: title, hook, cta, caption, hashtags (array).`;

  const settings = await getOpenRouterSettings();
  const apiKey = settings.apiKey || process.env.OPENROUTER_API_KEY;
  const model = settings.model || "openai/gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "OpenRouter API key not configured. Set OPENROUTER_API_KEY env var.",
    );
  }

  // CORRECT URL: openrouter.ai (not api.openrouter.ai)
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

  // Retry logic - attempt up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(
        `[🤖 AI] Generating caption ${index} (attempt ${attempt}/3)...`,
      );

      const response = await axios.post(
        OPENROUTER_URL,
        {
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 60000,
        },
      );

      const text =
        response?.data?.choices?.[0]?.message?.content ||
        JSON.stringify(response.data);

      console.log(`[✅ AI] Caption generated (attempt ${attempt})`);

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(text);
        return parsed;
      } catch (parseErr) {
        // If not JSON, extract key info
        console.warn(`[⚠️ AI] Response not JSON, extracting text...`);
        return {
          title: `Part ${index} - ${campaignTitle}`,
          hook: text.slice(0, 120),
          cta: "Learn more",
          caption: text.slice(0, 220),
          hashtags: ["#reels", "#shorts", "#viral"].slice(0, hashtagCount),
        };
      }
    } catch (err) {
      console.error(`[❌ AI] Attempt ${attempt} failed:`, err.message || err);

      // If last attempt, throw error
      if (attempt === 3) {
        throw new Error(
          `OpenRouter API failed after 3 attempts: ${err?.message || "Unknown error"}`,
        );
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[⏳ AI] Retrying in ${delay}ms...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}
