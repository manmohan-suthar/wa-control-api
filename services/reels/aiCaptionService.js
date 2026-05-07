import fetch from "node-fetch";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_URL =
  process.env.OPENROUTER_URL || "https://api.openrouter.ai/v1/chat/completions";

export async function generateCaptionForPart({
  campaignTitle,
  youtubeTitle,
  index,
  tone,
  hashtagCount,
}) {
  const prompt = `You are a social media copywriter. Given the campaign title: "${campaignTitle}" and original video title: "${youtubeTitle}", create a short catchy reel title for Part ${index}, a strong hook (one sentence), a CTA one-liner, a viral caption combining the hook and CTA, and ${hashtagCount} relevant hashtags in plain text. Tone: ${tone}. Return JSON with keys: title, hook, cta, caption, hashtags (array).`;

  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
  };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  // Fallback if API returns text
  const text = json?.choices?.[0]?.message?.content || JSON.stringify(json);
  // Try to parse JSON from text
  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    // crude extraction
    return {
      title: `Part ${index} - ${campaignTitle}`,
      hook: text.slice(0, 120),
      cta: "Learn more",
      caption: text.slice(0, 220),
      hashtags: ["#reels", "#shorts"].slice(0, hashtagCount),
    };
  }
}
