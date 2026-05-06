import OpenRouterSettings from "../../models/OpenRouterSettings.js";
import InstagramSession from "../models/InstagramSession.js";
import InstagramAiAgent from "../models/InstagramAiAgent.js";
import InstagramAiReplyLog from "../models/InstagramAiReplyLog.js";
import InstagramService from "../services/InstagramService.js";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

function trimText(value, max = 1200) {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function normalizeKeyPart(value) {
  return trimText(value, 1000).toLowerCase();
}

function buildRepliedCommentKeys(log) {
  const keys = [];
  const commentId = trimText(log?.comment?.id, 120);
  const mediaId = trimText(log?.post?.id, 120);
  const commentText = normalizeKeyPart(log?.comment?.text);
  const username = normalizeKeyPart(log?.comment?.username);

  if (commentId) {
    keys.push(`comment:${commentId}`);
  }

  if (mediaId && commentId) {
    keys.push(`media:${mediaId}:comment:${commentId}`);
  }

  if (mediaId && username && commentText) {
    keys.push(`fallback:${mediaId}:${username}:${commentText}`);
  }

  return keys;
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Empty OpenRouter response");

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Response was not valid JSON");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

async function getOpenRouterSettings() {
  const settings = await OpenRouterSettings.findOne({ key: "global" }).lean();
  if (!settings?.apiKey) {
    throw new Error("OpenRouter API key not configured by admin");
  }
  return settings;
}

async function callOpenRouterJson({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.3,
  max_tokens = 350,
}) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || "OpenRouter request failed");
  }

  const content = data?.choices?.[0]?.message?.content || "";
  return { data, content };
}

function buildAccountPrompt(account, session) {
  const sessionBits = [];
  if (session?.graph?.instagramUsername) {
    sessionBits.push(`Connected username: ${session.graph.instagramUsername}`);
  }
  if (session?.graph?.instagramFollowersCount != null) {
    sessionBits.push(`Followers: ${session.graph.instagramFollowersCount}`);
  }
  if (session?.graph?.instagramMediaCount != null) {
    sessionBits.push(`Media count: ${session.graph.instagramMediaCount}`);
  }

  return [
    "Create a concise Instagram business profile summary for an AI comment-reply agent.",
    "Return STRICT JSON with this shape:",
    '{"summary":"","niche":"","tone":"","language":"","about":""}',
    "Make the summary short, practical, and human-friendly.",
    "Use the user's business details and connected Instagram session info below.",
    "",
    `User account info: ${JSON.stringify(account)}`,
    sessionBits.length
      ? `Connected session info: ${sessionBits.join(" | ")}`
      : "Connected session info: none",
  ].join("\n");
}

function buildReplyPrompt({ account, post, comment }) {
  return [
    "You are an advanced AI Social Media Assistant designed to automatically reply to Instagram comments in a human-like, brand-consistent, and safe way.",
    "",
    "Your job is to:",
    "1. Understand the brand/account identity",
    "2. Analyze each incoming comment",
    "3. Classify the intent",
    "4. Generate the best possible reply",
    "5. Ensure replies feel human, not robotic",
    "",
    "INPUT STRUCTURE (STRICT JSON):",
    JSON.stringify({ account, post, comment }, null, 2),
    "",
    "STEP 1: CLASSIFY COMMENT",
    "Classify the comment into ONE: QUESTION, PRAISE, HATE, SPAM, BUYING_INTENT, GENERAL.",
    "Detect sentiment: POSITIVE, NEGATIVE, NEUTRAL.",
    "",
    "STEP 2: DECIDE ACTION",
    "If SPAM -> IGNORE.",
    "If HATE -> polite / neutral reply OR IGNORE if abusive.",
    "If QUESTION -> helpful, clear answer.",
    "If PRAISE -> short gratitude reply.",
    "If BUYING_INTENT -> encourage DM / purchase.",
    "If GENERAL -> friendly engagement reply.",
    "",
    "STEP 3: GENERATE REPLY",
    "Keep it short (1-2 lines max), human, and brand-consistent.",
    "Use Hinglish if the account language is Hinglish.",
    "",
    "STEP 4: SAFETY RULES",
    "Never generate offensive, abusive, or risky content.",
    "Avoid controversial topics and over-promising.",
    "If unsure -> neutral safe reply.",
    "",
    "OUTPUT FORMAT (STRICT JSON):",
    '{"category":"","sentiment":"","action":"","reply":""}',
  ].join("\n");
}

export async function getAgentStatus(req, res) {
  try {
    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    }).lean();
    const session = await InstagramSession.findOne({
      userId: req.user._id,
    }).lean();
    res.json({
      success: true,
      data: {
        configured: !!agent,
        hasSession: !!session,
        agent,
        session,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function setupAgent(req, res) {
  try {
    const { account = {}, name = "Instagram AI Agent" } = req.body || {};
    const normalizedAccount = {
      niche: trimText(account.niche, 140),
      tone: trimText(account.tone, 140),
      language: trimText(account.language, 80),
      about: trimText(account.about, 2000),
    };

    if (!normalizedAccount.about) {
      return res
        .status(400)
        .json({ success: false, error: "about is required" });
    }

    const settings = await getOpenRouterSettings();
    const session = await InstagramSession.findOne({
      userId: req.user._id,
    }).lean();

    const model = settings.model || DEFAULT_MODEL;
    const { content } = await callOpenRouterJson({
      apiKey: settings.apiKey,
      model,
      systemPrompt: "Return only JSON. No markdown or extra text.",
      userPrompt: buildAccountPrompt(normalizedAccount, session),
      temperature: 0.2,
      max_tokens: 280,
    });

    const parsed = extractJson(content);

    const agentDoc = await InstagramAiAgent.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          name: trimText(name, 120) || "Instagram AI Agent",
          account: {
            niche: parsed.niche || normalizedAccount.niche,
            tone: parsed.tone || normalizedAccount.tone,
            language: parsed.language || normalizedAccount.language,
            about: parsed.about || normalizedAccount.about,
          },
          summary: trimText(parsed.summary || "", 4000),
          model,
          isActive: true,
          sourceSessionId:
            session?.graph?.instagramBusinessAccountId ||
            session?.graph?.facebookPageId ||
            "",
          sourceAccount: session || null,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    res.json({
      success: true,
      data: {
        agent: agentDoc,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function generateReply(req, res) {
  try {
    const {
      agentId = null,
      account = {},
      post = {},
      comment = {},
    } = req.body || {};

    let agent = null;
    if (agentId) {
      agent = await InstagramAiAgent.findOne({
        _id: agentId,
        userId: req.user._id,
      }).lean();
      if (!agent) {
        return res
          .status(404)
          .json({ success: false, error: "Agent not found" });
      }
    } else {
      agent = await InstagramAiAgent.findOne({ userId: req.user._id }).lean();
    }

    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: "Create an Instagram AI agent first" });
    }

    const settings = await getOpenRouterSettings();
    const model = settings.model || DEFAULT_MODEL;

    const promptAccount = {
      niche: agent.account?.niche || account.niche || "",
      tone: agent.account?.tone || account.tone || "",
      language: agent.account?.language || account.language || "",
      about: agent.account?.about || account.about || "",
    };

    const normalizedPost = {
      caption: trimText(post.caption, 2000),
      type: trimText(post.type, 120),
      keywords: Array.isArray(post.keywords) ? post.keywords.slice(0, 12) : [],
      id: trimText(post.id, 120),
    };

    const normalizedComment = {
      text: trimText(comment.text, 1000),
      username: trimText(comment.username, 120),
    };

    const { content } = await callOpenRouterJson({
      apiKey: settings.apiKey,
      model,
      systemPrompt:
        "Return only strict JSON with keys category, sentiment, action, reply.",
      userPrompt: buildReplyPrompt({
        account: promptAccount,
        post: normalizedPost,
        comment: normalizedComment,
      }),
      temperature: 0.4,
      max_tokens: 220,
    });

    const parsed = extractJson(content);
    const category = String(parsed.category || "GENERAL").toUpperCase();
    const sentiment = String(parsed.sentiment || "NEUTRAL").toUpperCase();
    const action = String(parsed.action || "").trim() || "REPLY";
    const reply = trimText(parsed.reply || "", 500);

    const log = await InstagramAiReplyLog.create({
      agentId: agent._id,
      userId: req.user._id,
      post: normalizedPost,
      comment: normalizedComment,
      category,
      sentiment,
      action,
      reply,
      rawResponse: parsed,
    });

    await InstagramAiAgent.updateOne(
      { _id: agent._id },
      {
        $inc: { replyCount: 1 },
        $set: { lastGeneratedAt: new Date() },
      },
    );

    res.json({
      success: true,
      data: {
        category,
        sentiment,
        action,
        reply,
        logId: log._id,
        agentId: agent._id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLogs(req, res) {
  try {
    const { agentId = null } = req.query || {};
    const filter = { userId: req.user._id };
    if (agentId) filter.agentId = agentId;

    const logs = await InstagramAiReplyLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function fetchPendingComments(req, res) {
  try {
    const sinceParam = String(req.query?.since || "").trim();
    const sinceDate = sinceParam ? new Date(sinceParam) : null;
    const cutoffTime =
      sinceDate && !Number.isNaN(sinceDate.getTime())
        ? sinceDate.getTime()
        : null;

    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    }).lean();

    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: "Create an Instagram AI agent first" });
    }

    // Fetch recent media with comments
    const result = await InstagramService.fetchRecentMediaWithComments(
      req.user._id,
      { limit: 25, commentsLimit: 50 },
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    // Filter out comments that already have replies in the log
    const repliedLogs = await InstagramAiReplyLog.find({
      userId: req.user._id,
      "comment.text": { $exists: true, $ne: "" },
    })
      .select("comment.id comment.text comment.username post.id")
      .lean();

    const repliedCommentKeys = new Set();
    repliedLogs.forEach((log) => {
      buildRepliedCommentKeys(log).forEach((key) =>
        repliedCommentKeys.add(key),
      );
    });

    const pendingComments = [];
    result.data.forEach((media) => {
      if (media.comments && media.comments.length > 0) {
        media.comments.forEach((comment) => {
          const commentTime = comment.timestamp
            ? new Date(comment.timestamp).getTime()
            : null;
          if (cutoffTime && commentTime && commentTime < cutoffTime) {
            return;
          }

          const commentId = trimText(comment.id, 120);
          const mediaId = trimText(media.id, 120);
          const candidateKeys = [
            `comment:${commentId}`,
            `media:${mediaId}:comment:${commentId}`,
            `fallback:${mediaId}:${normalizeKeyPart(comment.username)}:${normalizeKeyPart(comment.text)}`,
          ];

          if (!candidateKeys.some((key) => repliedCommentKeys.has(key))) {
            pendingComments.push({
              mediaId: media.id,
              mediaCaption: media.caption,
              mediaType: media.media_type,
              mediaUrl: media.media_url,
              likeCount: media.like_count || 0,
              commentsCount: media.comments_count || 0,
              permalink: media.permalink,
              comment,
            });
          }
        });
      }
    });

    res.json({
      success: true,
      data: {
        agent,
        pendingComments,
        count: pendingComments.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function generateAndPostReply(req, res) {
  try {
    const {
      commentId,
      mediaId = "",
      mediaCaption,
      mediaType = "image",
      mediaUrl = "",
      likeCount = 0,
      commentsCount = 0,
      permalink = "",
      commentText,
      username,
    } = req.body || {};

    if (!commentId || !commentText) {
      return res
        .status(400)
        .json({ success: false, error: "commentId and commentText required" });
    }

    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    }).lean();

    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: "Create an Instagram AI agent first" });
    }

    const settings = await getOpenRouterSettings();
    const model = settings.model || DEFAULT_MODEL;

    const promptAccount = {
      niche: agent.account?.niche || "",
      tone: agent.account?.tone || "",
      language: agent.account?.language || "",
      about: agent.account?.about || "",
    };

    const normalizedPost = {
      caption: trimText(mediaCaption, 2000),
      type: trimText(mediaType || "image", 120),
      mediaType: trimText(mediaType || "image", 120),
      permalink: trimText(permalink, 500),
      mediaUrl: trimText(mediaUrl, 500),
      likeCount: Number(likeCount) || 0,
      commentsCount: Number(commentsCount) || 0,
      keywords: [],
      id: trimText(mediaId, 120),
    };

    const normalizedComment = {
      text: trimText(commentText, 1000),
      username: trimText(username, 120),
    };

    // Generate reply using AI
    const { content } = await callOpenRouterJson({
      apiKey: settings.apiKey,
      model,
      systemPrompt:
        "Return only strict JSON with keys category, sentiment, action, reply.",
      userPrompt: buildReplyPrompt({
        account: promptAccount,
        post: normalizedPost,
        comment: normalizedComment,
      }),
      temperature: 0.4,
      max_tokens: 220,
    });

    const parsed = extractJson(content);
    const category = String(parsed.category || "GENERAL").toUpperCase();
    const sentiment = String(parsed.sentiment || "NEUTRAL").toUpperCase();
    const action = String(parsed.action || "").trim() || "REPLY";
    const reply = trimText(parsed.reply || "", 500);

    // If action is IGNORE, don't post reply
    if (action === "IGNORE") {
      const log = await InstagramAiReplyLog.create({
        agentId: agent._id,
        userId: req.user._id,
        post: normalizedPost,
        comment: {
          text: normalizedComment.text,
          username: normalizedComment.username,
          id: commentId,
        },
        category,
        sentiment,
        action: "IGNORED",
        reply: "",
        rawResponse: parsed,
      });

      return res.json({
        success: true,
        data: {
          category,
          sentiment,
          action: "IGNORED",
          reply: "",
          logId: log._id,
          posted: false,
          reason: "Spam/Hate - Reply ignored",
        },
      });
    }

    // Post reply to Instagram
    const postResult = await InstagramService.replyToComment(
      req.user._id,
      commentId,
      reply,
    );

    // Like the comment after successfully posting reply
    if (postResult.success) {
      await InstagramService.likeComment(req.user._id, commentId);
    }

    const log = await InstagramAiReplyLog.create({
      agentId: agent._id,
      userId: req.user._id,
      post: normalizedPost,
      comment: {
        text: normalizedComment.text,
        username: normalizedComment.username,
        id: commentId,
      },
      category,
      sentiment,
      action,
      reply,
      rawResponse: parsed,
    });

    await InstagramAiAgent.updateOne(
      { _id: agent._id },
      {
        $inc: { replyCount: 1 },
        $set: { lastGeneratedAt: new Date() },
      },
    );

    res.json({
      success: postResult.success,
      data: {
        category,
        sentiment,
        action,
        reply,
        logId: log._id,
        agentId: agent._id,
        posted: postResult.success,
        instagramResponse: postResult.data || null,
        error: postResult.error || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function testReply(req, res) {
  try {
    const { comment } = req.body || {};

    if (!comment || !comment.text) {
      return res
        .status(400)
        .json({ success: false, error: "comment.text required" });
    }

    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    }).lean();

    if (!agent) {
      return res
        .status(400)
        .json({ success: false, error: "Create an Instagram AI agent first" });
    }

    const settings = await getOpenRouterSettings();
    const model = settings.model || DEFAULT_MODEL;

    const promptAccount = {
      niche: agent.account?.niche || "",
      tone: agent.account?.tone || "",
      language: agent.account?.language || "",
      about: agent.account?.about || "",
    };

    const normalizedPost = {
      caption: "",
      type: "image",
      keywords: [],
      id: "",
    };

    const normalizedComment = {
      text: trimText(comment.text, 1000),
      username: trimText(comment.username || "user", 120),
    };

    const { content } = await callOpenRouterJson({
      apiKey: settings.apiKey,
      model,
      systemPrompt:
        "Return only strict JSON with keys category, sentiment, action, reply.",
      userPrompt: buildReplyPrompt({
        account: promptAccount,
        post: normalizedPost,
        comment: normalizedComment,
      }),
      temperature: 0.4,
      max_tokens: 220,
    });

    const parsed = extractJson(content);

    res.json({
      success: true,
      data: {
        category: parsed.category || "GENERAL",
        sentiment: parsed.sentiment || "NEUTRAL",
        action: parsed.action || "REPLY",
        reply: parsed.reply || "",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function toggleAgentStatus(req, res) {
  try {
    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    });

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    agent.isActive = !agent.isActive;
    await agent.save();

    res.json({
      success: true,
      data: {
        isActive: agent.isActive,
        agent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateAgentSettings(req, res) {
  try {
    const { niche, tone, language, about } = req.body || {};

    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    });

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    if (niche) agent.account.niche = trimText(niche, 140);
    if (tone) agent.account.tone = trimText(tone, 140);
    if (language) agent.account.language = trimText(language, 80);
    if (about) agent.account.about = trimText(about, 2000);

    await agent.save();

    res.json({
      success: true,
      data: {
        agent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAnalytics(req, res) {
  try {
    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    }).lean();

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const logs = await InstagramAiReplyLog.find({
      agentId: agent._id,
    }).lean();

    const totalReplies = logs.length;
    const categoryCounts = {
      BUYING_INTENT: 0,
      PRAISE: 0,
      HATE: 0,
      SPAM: 0,
      QUESTION: 0,
      GENERAL: 0,
    };

    const sentimentCounts = {
      POSITIVE: 0,
      NEGATIVE: 0,
      NEUTRAL: 0,
    };

    const last7Days = {};
    const today = new Date();

    logs.forEach((log) => {
      // Category counts
      if (log.category && categoryCounts.hasOwnProperty(log.category)) {
        categoryCounts[log.category]++;
      }

      // Sentiment counts
      if (log.sentiment && sentimentCounts.hasOwnProperty(log.sentiment)) {
        sentimentCounts[log.sentiment]++;
      }

      // Last 7 days
      const logDate = new Date(log.createdAt);
      const diffTime = Math.abs(today - logDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 7) {
        const dateKey = logDate.toISOString().split("T")[0];
        if (!last7Days[dateKey]) {
          last7Days[dateKey] = 0;
        }
        last7Days[dateKey]++;
      }
    });

    res.json({
      success: true,
      data: {
        totalReplies,
        replyCount: agent.replyCount || 0,
        isActive: agent.isActive,
        lastGeneratedAt: agent.lastGeneratedAt,
        categoryCounts,
        sentimentCounts,
        last7Days,
        agent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function startAutoReply(req, res) {
  try {
    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    });

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    const now = new Date();
    agent.autoReplyEnabled = true;
    agent.autoReplyStartedAt = now;
    await agent.save();

    res.json({
      success: true,
      data: {
        autoReplyEnabled: true,
        autoReplyStartedAt: agent.autoReplyStartedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function stopAutoReply(req, res) {
  try {
    const agent = await InstagramAiAgent.findOne({
      userId: req.user._id,
    });

    if (!agent) {
      return res.status(404).json({ success: false, error: "Agent not found" });
    }

    agent.autoReplyEnabled = false;
    await agent.save();

    res.json({
      success: true,
      data: {
        autoReplyEnabled: false,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
