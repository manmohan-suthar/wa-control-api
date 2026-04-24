import Flow from "../models/Flow.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppService from "../services/WhatsAppService.js";

// In-memory runtime state for conversations waiting on an Input node reply.
const pendingInputState = new Map();

function runtimeKey(runtimeSessionId, userId, phoneNumber) {
  return [
    String(runtimeSessionId || ""),
    String(userId || ""),
    String(phoneNumber || ""),
  ].join("::");
}

// Check trigger and execute flow
export const executeFlowOnMessage = async (
  runtimeSessionId,
  phoneNumber,
  messageContent,
  userId,
) => {
  try {
    const key = runtimeKey(runtimeSessionId, userId, phoneNumber);
    const waitingState = pendingInputState.get(key);

    // If this chat is waiting for an input node reply, consume this message as input and resume.
    if (waitingState?.flowId) {
      const waitingFlow = await Flow.findOne({
        _id: waitingState.flowId,
        userId,
        status: "Active",
      });

      if (!waitingFlow) {
        pendingInputState.delete(key);
      } else {
        const resumedContext = {
          ...(waitingState.context || {}),
        };

        applyInputToContext(
          resumedContext,
          waitingState.variableKey,
          messageContent,
        );

        pendingInputState.delete(key);

        const resumeResult = await executeFlowSequence(waitingFlow, {
          phoneNumber,
          runtimeSessionId,
          context: resumedContext,
          startNodeId: waitingState.nextNodeId,
        });

        if (resumeResult?.status === "waiting") {
          pendingInputState.set(key, {
            flowId: String(waitingFlow._id),
            variableKey: resumeResult.variableKey,
            nextNodeId: resumeResult.nextNodeId,
            context: resumeResult.context,
            updatedAt: Date.now(),
          });
        }

        return;
      }
    }

    const session = await WhatsAppSession.findOne({
      sessionId: runtimeSessionId,
      userId,
    }).select("_id");

    if (!session) {
      return;
    }

    // Find flows for this session
    const flows = await Flow.find({
      sessionId: session._id,
      userId,
      status: "Active",
    });

    for (const flow of flows) {
      // Find trigger node
      const triggerNode = flow.nodes.find((n) => n.type === "trigger");
      if (!triggerNode) continue;

      // Check if trigger matches
      const triggerMatch = checkTriggerMatch(triggerNode.data, messageContent);
      if (!triggerMatch) continue;

      console.log(`✅ Flow triggered: ${flow.name}`);

      // Execute flow
      const result = await executeFlowSequence(flow, {
        phoneNumber,
        runtimeSessionId,
        context: createRuntimeContext(phoneNumber, messageContent),
      });

      if (result?.status === "waiting") {
        pendingInputState.set(key, {
          flowId: String(flow._id),
          variableKey: result.variableKey,
          nextNodeId: result.nextNodeId,
          context: result.context,
          updatedAt: Date.now(),
        });
      }

      // Process first matching flow only to avoid overlapping runtime states.
      break;
    }
  } catch (error) {
    console.error("Error executing flow on message:", error);
  }
};

// Check if trigger condition matches
function checkTriggerMatch(triggerData, messageContent) {
  const { triggerType, keyword } = triggerData || {};
  const normalizedMessage = String(messageContent || "")
    .trim()
    .toLowerCase();
  const normalizedKeyword = String(keyword || "")
    .trim()
    .toLowerCase();

  if (triggerType === "message_received") {
    return true; // All messages trigger this
  }

  if (triggerType === "keyword_match") {
    if (!normalizedKeyword) return false;
    return normalizedMessage.includes(normalizedKeyword);
  }

  if (triggerType === "match_text") {
    if (!normalizedKeyword) return false;
    return normalizedMessage === normalizedKeyword;
  }

  return false;
}

function hasContextKey(context, key) {
  if (!key) return false;
  return Object.prototype.hasOwnProperty.call(context, key);
}

function resolveTemplate(text, context) {
  return String(text ?? "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey || "").trim();
    const value = hasContextKey(context, key) ? context[key] : "";
    return value == null ? "" : String(value);
  });
}

function resolveValue(input, context) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  if (hasContextKey(context, raw)) {
    return context[raw];
  }

  const rendered = resolveTemplate(raw, context).trim();
  if (hasContextKey(context, rendered)) {
    return context[rendered];
  }

  return rendered;
}

function toComparable(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;

  const text = String(value).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text;
}

function toLowerSafe(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function evaluateRule(rule, context) {
  const operator = rule?.operator || "equals";

  const leftRaw = String(rule?.field ?? "").trim();
  const rightRaw = String(rule?.value ?? "").trim();

  const leftValue = toComparable(
    hasContextKey(context, leftRaw)
      ? context[leftRaw]
      : resolveValue(leftRaw, context),
  );
  const rightValue = toComparable(resolveValue(rightRaw, context));

  const leftText = String(leftValue ?? "");
  const rightText = String(rightValue ?? "");
  const leftLower = leftText.toLowerCase();
  const rightLower = rightText.toLowerCase();

  switch (operator) {
    case "equals":
      return leftLower === rightLower;
    case "not_equals":
      return leftLower !== rightLower;
    case "contains":
      return leftLower.includes(rightLower);
    case "not_contains":
      return !leftLower.includes(rightLower);
    case "starts_with":
      return leftLower.startsWith(rightLower);
    case "ends_with":
      return leftLower.endsWith(rightLower);
    case "gt":
      return Number(leftValue) > Number(rightValue);
    case "lt":
      return Number(leftValue) < Number(rightValue);
    case "gte":
      return Number(leftValue) >= Number(rightValue);
    case "lte":
      return Number(leftValue) <= Number(rightValue);
    case "num_eq":
      return Number(leftValue) === Number(rightValue);
    case "exists":
      return (
        leftValue !== undefined && leftValue !== null && leftText.trim() !== ""
      );
    case "not_exists":
      return (
        leftValue === undefined || leftValue === null || leftText.trim() === ""
      );
    case "is_empty":
      return leftText.trim() === "";
    case "is_not_empty":
      return leftText.trim() !== "";
    case "in_list": {
      const list = rightLower
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return list.includes(leftLower);
    }
    case "not_in_list": {
      const list = rightLower
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return !list.includes(leftLower);
    }
    case "regex":
      try {
        return new RegExp(rightText).test(leftText);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evaluateConditionNode(conditionNode, context) {
  const data = conditionNode?.data || {};
  const { advancedMode, expression, rules = [], logic = "AND" } = data;

  if (advancedMode && expression) {
    try {
      const renderedExpression = String(expression).replace(
        /\{\{\s*([^}]+?)\s*\}\}/g,
        (_, rawKey) => {
          const key = String(rawKey || "").trim();
          const value = hasContextKey(context, key) ? context[key] : "";
          return JSON.stringify(value ?? "");
        },
      );

      const result = Function(
        `"use strict"; return (${renderedExpression});`,
      )();
      return Boolean(result);
    } catch (error) {
      console.error("Error evaluating advanced condition:", error.message);
      return false;
    }
  }

  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : [];
  if (activeRules.length === 0) return false;

  const results = activeRules.map((rule) => evaluateRule(rule, context));
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

function evaluateRouterCase(routerCase, fieldValue, context) {
  const operator = routerCase?.operator || "equals";
  const actual = toLowerSafe(fieldValue);
  const expectedRaw = resolveValue(routerCase?.value || "", context);
  const expected = toLowerSafe(expectedRaw);

  if (operator === "expression") {
    try {
      const expression = String(routerCase?.value || "").replace(
        /\{\{\s*([^}]+?)\s*\}\}/g,
        (_, rawKey) => {
          const key = String(rawKey || "").trim();
          const value = hasContextKey(context, key) ? context[key] : "";
          return JSON.stringify(value ?? "");
        },
      );

      return Boolean(Function(`"use strict"; return (${expression});`)());
    } catch (error) {
      console.error("Error evaluating router expression:", error.message);
      return false;
    }
  }

  if (operator === "contains") {
    return actual.includes(expected);
  }

  if (operator === "starts_with") {
    return actual.startsWith(expected);
  }

  if (operator === "ends_with") {
    return actual.endsWith(expected);
  }

  const values = expected
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (values.length > 1) {
    return values.includes(actual);
  }

  return actual === expected;
}

function flattenJson(value, prefix = "", target = {}) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flattenJson(item, `${prefix}[${index}]`, target),
    );
    return target;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      flattenJson(nested, prefix ? `${prefix}.${key}` : key, target);
    });
    return target;
  }

  if (prefix) {
    target[prefix] = value;
  }
  return target;
}

function createRuntimeContext(phoneNumber, incomingText) {
  const text = String(incomingText ?? "").trim();
  return {
    incoming_message: text,
    user_message: text,
    user_input: text.toLowerCase(),
    "user.message": text,
    "user.reply": text.toLowerCase(),
    "user.phone": String(phoneNumber ?? ""),
    "user.name": "",
    "user.email": "",
  };
}

function getOutgoingEdge(edges, nodeId, sourceHandle) {
  const outgoing = edges.filter((edge) => edge.source === nodeId);
  if (sourceHandle !== undefined && sourceHandle !== null) {
    const matched = outgoing.find(
      (edge) => String(edge.sourceHandle || "") === String(sourceHandle),
    );
    if (matched) return matched;
  }

  return outgoing[0] || null;
}

// Execute flow sequence
async function executeFlowSequence(
  flow,
  { phoneNumber, runtimeSessionId, context, startNodeId = null },
) {
  try {
    const triggerNode = flow.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) return;

    const nodeMap = new Map((flow.nodes || []).map((node) => [node.id, node]));
    const edges = flow.edges || [];

    let currentNode = null;
    if (startNodeId) {
      currentNode = nodeMap.get(startNodeId) || null;
    } else {
      const firstEdge = getOutgoingEdge(edges, triggerNode.id);
      currentNode = firstEdge ? nodeMap.get(firstEdge.target) : null;
    }

    const maxSteps = 100;
    let stepCount = 0;

    while (stepCount < maxSteps && currentNode) {
      stepCount += 1;

      if (currentNode.type === "message") {
        await executeSendMessage(
          currentNode,
          phoneNumber,
          runtimeSessionId,
          context,
        );
      }

      if (currentNode.type === "input") {
        const { variableKey } = await executeInputNode(
          currentNode,
          phoneNumber,
          runtimeSessionId,
          context,
        );
        const edgeAfterInput = getOutgoingEdge(edges, currentNode.id);
        return {
          status: "waiting",
          variableKey,
          nextNodeId: edgeAfterInput?.target || null,
          context,
        };
      }

      let nextHandle = null;
      if (currentNode.type === "condition") {
        const result = evaluateConditionNode(currentNode, context);
        nextHandle = result ? "true" : "false";
      } else if (currentNode.type === "router") {
        nextHandle = await executeRouterNode(currentNode, context);
      } else if (currentNode.type === "api") {
        await executeApiNode(currentNode, context);
      }

      const edge = getOutgoingEdge(edges, currentNode.id, nextHandle);
      currentNode = edge ? nodeMap.get(edge.target) : null;
    }

    console.log(`✅ Flow execution completed: ${flow.name}`);
    return { status: "completed", context };
  } catch (error) {
    console.error("Error in flow execution:", error);
    return { status: "failed", error: error.message };
  }
}

async function executeInputNode(
  inputNode,
  phoneNumber,
  runtimeSessionId,
  context,
) {
  const promptText = resolveTemplate(
    inputNode?.data?.prompt || "Please enter a value",
    context,
  );

  if (promptText) {
    try {
      await WhatsAppService.sendMessage(
        runtimeSessionId,
        phoneNumber,
        promptText,
      );
      console.log(`📨 Flow input prompt sent to ${phoneNumber}: ${promptText}`);
    } catch (error) {
      console.error("Error sending input prompt:", error.message);
    }
  }

  const variableKey =
    String(inputNode?.data?.variableKey || "user_input").trim() || "user_input";

  return { variableKey };
}

function applyInputToContext(context, variableKey, incomingText) {
  const key = String(variableKey || "user_input").trim() || "user_input";
  const text = String(incomingText ?? "").trim();
  const normalized = String(incomingText ?? "")
    .trim()
    .toLowerCase();

  context[key] = normalized;
  context.incoming_message = text;
  context.user_message = text;
  context.user_input = normalized;
  context["user.reply"] = normalized;
}

async function executeRouterNode(routerNode, context) {
  const cases = Array.isArray(routerNode?.data?.cases)
    ? routerNode.data.cases
    : [];
  const fieldKey =
    String(routerNode?.data?.field || "user_input").trim() || "user_input";
  const fieldValue = resolveValue(fieldKey, context);

  const matched = cases.find((routerCase) =>
    evaluateRouterCase(routerCase, fieldValue, context),
  );
  return matched?.id || "default";
}

async function executeApiNode(apiNode, context) {
  try {
    const {
      method = "GET",
      url = "",
      headers = [],
      params = [],
      body = "",
      responsePrefix = "api",
    } = apiNode.data || {};

    const resolvedUrl = resolveTemplate(url, context);
    if (!resolvedUrl) {
      console.warn("API node skipped: URL is empty");
      return;
    }

    const urlObject = new URL(resolvedUrl);
    (params || []).forEach(({ key, value }) => {
      if (!key) return;
      urlObject.searchParams.set(
        resolveTemplate(key, context),
        resolveTemplate(value, context),
      );
    });

    const headerObject = {};
    (headers || []).forEach(({ key, value }) => {
      if (!key) return;
      headerObject[resolveTemplate(key, context)] = resolveTemplate(
        value,
        context,
      );
    });

    const requestOptions = { method, headers: headerObject };
    if (
      ["POST", "PUT", "PATCH"].includes(method) &&
      String(body || "").trim()
    ) {
      requestOptions.body = resolveTemplate(body, context);
    }

    const response = await fetch(urlObject.toString(), requestOptions);
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        typeof payload === "string" ? payload : JSON.stringify(payload),
      );
    }

    const flattened = flattenJson(payload, responsePrefix || "api", {});
    Object.entries(flattened).forEach(([key, value]) => {
      context[key] = value;
    });
  } catch (error) {
    console.error("Error in executeApiNode:", error.message);
  }
}

// Execute send message node
async function executeSendMessage(
  messageNode,
  phoneNumber,
  runtimeSessionId,
  context,
) {
  try {
    const { message, delayType, fixedDelay } = messageNode.data || {};

    if (!message) {
      console.warn("No message content in node");
      return;
    }

    const messageToSend = resolveTemplate(message, context);

    // Calculate delay
    let delayMs = 0;
    if (delayType === "random") {
      delayMs = Math.random() * 3000 + 3000; // 3-6 seconds
    } else if (delayType === "fixed") {
      delayMs = (fixedDelay || 5) * 1000;
    }

    // Wait for delay
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Send message via WhatsApp service
    try {
      await WhatsAppService.sendMessage(
        runtimeSessionId,
        phoneNumber,
        messageToSend,
      );
      console.log(`📨 Flow message sent to ${phoneNumber}: ${messageToSend}`);
    } catch (error) {
      console.error("Error sending flow message:", error.message);
    }
  } catch (error) {
    console.error("Error in executeSendMessage:", error);
  }
}

// Get flow execution history
export const getFlowExecutionHistory = async (req, res) => {
  try {
    const { flowId } = req.params;
    const { userId } = req.user;

    const flow = await Flow.findOne({ _id: flowId, userId });
    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Flow not found",
      });
    }

    // TODO: Implement execution history tracking
    res.status(200).json({
      success: true,
      executions: [],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Test trigger with sample message
export const testFlowTrigger = async (req, res) => {
  try {
    const { flowId } = req.params;
    const { messageContent, phoneNumber } = req.body;
    const { userId } = req.user;

    const flow = await Flow.findOne({ _id: flowId, userId });
    if (!flow) {
      return res.status(404).json({
        success: false,
        message: "Flow not found",
      });
    }

    // Find trigger node
    const triggerNode = flow.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) {
      return res.status(400).json({
        success: false,
        message: "No trigger node found in flow",
      });
    }

    // Check trigger match
    const isMatch = checkTriggerMatch(triggerNode.data, messageContent);

    res.status(200).json({
      success: true,
      triggerMatches: isMatch,
      message: isMatch
        ? "Trigger would activate"
        : "Trigger would not activate",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Proxy API request from flow builder to avoid browser CORS restrictions.
export const proxyFlowApiRequest = async (req, res) => {
  try {
    const {
      method = "GET",
      url = "",
      headers = {},
      params = {},
      body = "",
    } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "URL is required",
      });
    }

    let urlObject;
    try {
      urlObject = new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid URL",
      });
    }

    if (!["http:", "https:"].includes(urlObject.protocol)) {
      return res.status(400).json({
        success: false,
        message: "Only HTTP/HTTPS URLs are allowed",
      });
    }

    Object.entries(params || {}).forEach(([key, value]) => {
      if (!key) return;
      urlObject.searchParams.set(String(key), String(value ?? ""));
    });

    const safeHeaders = {};
    Object.entries(headers || {}).forEach(([key, value]) => {
      if (!key) return;
      const lower = String(key).toLowerCase();
      if (lower === "host" || lower === "content-length") return;
      safeHeaders[key] = String(value ?? "");
    });

    const requestOptions = {
      method: String(method || "GET").toUpperCase(),
      headers: safeHeaders,
    };

    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(requestOptions.method) &&
      String(body || "").trim()
    ) {
      requestOptions.body = String(body);
    }

    const response = await fetch(urlObject.toString(), requestOptions);
    const contentType = response.headers.get("content-type") || "";

    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    res.status(response.ok ? 200 : 400).json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data,
      contentType,
      message: response.ok
        ? "Proxy request successful"
        : "Proxy request failed",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Proxy request failed",
    });
  }
};
