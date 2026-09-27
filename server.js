// server.ts
import express from "express";
import path2 from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";

// server/providers/openai.ts
async function streamOpenAI(apiKey, model, messages, sendSSE, signal) {
  const url = "https://api.openai.com/v1/chat/completions";
  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: true
    }),
    signal
  });
  if (!response.ok) {
    if (response.status === 429) {
      sendSSE("error", "rate_limited");
      return;
    }
    if (response.status === 401 || response.status === 403) {
      sendSSE("error", "invalid_api_key");
      return;
    }
    if (response.status >= 500) {
      sendSSE("error", "server_error");
      return;
    }
    const errText = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(errText);
      sendSSE("error", parsed.error?.message || `OpenAI error: HTTP ${response.status}`);
    } catch {
      sendSSE("error", `OpenAI error: HTTP ${response.status}`);
    }
    return;
  }
  if (!response.body) {
    sendSSE("error", "No response body received from OpenAI");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") {
          sendSSE("done", null);
          return;
        }
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              sendSSE("token", token);
            }
          } catch {
          }
        }
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed === "data: [DONE]") {
        sendSSE("done", null);
        return;
      }
      if (trimmed.startsWith("data: ")) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            sendSSE("token", token);
          }
        } catch {
        }
      }
    }
    sendSSE("done", null);
  } finally {
    reader.releaseLock();
  }
}

// server/providers/anthropic.ts
async function streamAnthropic(apiKey, model, messages, sendSSE, signal) {
  const url = "https://api.anthropic.com/v1/messages";
  const systemTexts = [];
  const conversationMessages = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemTexts.push(m.content);
    } else {
      conversationMessages.push({
        role: m.role,
        content: m.content
      });
    }
  }
  const sanitizedMessages = [];
  for (const m of conversationMessages) {
    if (sanitizedMessages.length === 0 && m.role === "assistant") {
      continue;
    }
    const last = sanitizedMessages[sanitizedMessages.length - 1];
    if (last && last.role === m.role) {
      last.content += `

${m.content}`;
    } else {
      sanitizedMessages.push({ role: m.role, content: m.content });
    }
  }
  if (sanitizedMessages.length === 0) {
    sanitizedMessages.push({ role: "user", content: "Hello" });
  }
  const requestBody = {
    model,
    max_tokens: 4096,
    messages: sanitizedMessages,
    stream: true
  };
  if (systemTexts.length > 0) {
    requestBody.system = systemTexts.join("\n\n");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody),
    signal
  });
  if (!response.ok) {
    if (response.status === 429) {
      sendSSE("error", "rate_limited");
      return;
    }
    if (response.status === 401 || response.status === 403) {
      sendSSE("error", "invalid_api_key");
      return;
    }
    if (response.status >= 500) {
      sendSSE("error", "server_error");
      return;
    }
    const errText = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(errText);
      sendSSE("error", parsed.error?.message || `Anthropic error: HTTP ${response.status}`);
    } catch {
      sendSSE("error", `Anthropic error: HTTP ${response.status}`);
    }
    return;
  }
  if (!response.body) {
    sendSSE("error", "No response body received from Anthropic");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            if (json.type === "content_block_delta") {
              const deltaText = json.delta?.text;
              if (deltaText) {
                sendSSE("token", deltaText);
              }
            } else if (json.type === "message_stop") {
              sendSSE("done", null);
              return;
            } else if (json.type === "error") {
              sendSSE("error", json.error?.message || "Anthropic stream error");
              return;
            }
          } catch {
          }
        }
      }
    }
    sendSSE("done", null);
  } finally {
    reader.releaseLock();
  }
}

// server/providers/gemini.ts
async function streamGemini(apiKey, model, messages, sendSSE, signal, webSearch) {
  const cleanModel = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;
  const contents = [];
  const systemParts = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push({ text: m.content });
    } else {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      });
    }
  }
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hello" }] });
  }
  const requestBody = {
    contents
  };
  if (systemParts.length > 0) {
    requestBody.systemInstruction = { parts: systemParts };
  }
  if (webSearch) {
    requestBody.tools = [{ google_search: {} }];
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody),
    signal
  });
  if (!response.ok) {
    if (response.status === 429) {
      sendSSE("error", "rate_limited");
      return;
    }
    if (response.status === 400 || response.status === 403) {
      const errText2 = await response.text().catch(() => "");
      if (errText2.includes("API_KEY_INVALID") || errText2.includes("API key not valid")) {
        sendSSE("error", "invalid_api_key");
        return;
      }
      try {
        const parsed = JSON.parse(errText2);
        sendSSE("error", parsed.error?.message || `Gemini error: HTTP ${response.status}`);
      } catch {
        sendSSE("error", `Gemini error: HTTP ${response.status}`);
      }
      return;
    }
    if (response.status >= 500) {
      sendSSE("error", "server_error");
      return;
    }
    const errText = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(errText);
      sendSSE("error", parsed.error?.message || `Gemini error: HTTP ${response.status}`);
    } catch {
      sendSSE("error", `Gemini error: HTTP ${response.status}`);
    }
    return;
  }
  if (!response.body) {
    sendSSE("error", "No response body received from Gemini");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const parts = json.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  sendSSE("token", part.text);
                }
              }
            }
          } catch {
          }
        }
      }
    }
    if (buffer.trim().startsWith("data: ")) {
      try {
        const json = JSON.parse(buffer.trim().slice(6));
        const parts = json.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              sendSSE("token", part.text);
            }
          }
        }
      } catch {
      }
    }
    sendSSE("done", null);
  } finally {
    reader.releaseLock();
  }
}

// server/providers/xai.ts
async function streamXAI(apiKey, model, messages, sendSSE, signal) {
  const url = "https://api.x.ai/v1/chat/completions";
  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content
  }));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: true
    }),
    signal
  });
  if (!response.ok) {
    if (response.status === 429) {
      sendSSE("error", "rate_limited");
      return;
    }
    if (response.status === 401 || response.status === 403) {
      sendSSE("error", "invalid_api_key");
      return;
    }
    if (response.status >= 500) {
      sendSSE("error", "server_error");
      return;
    }
    const errText = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(errText);
      sendSSE("error", parsed.error?.message || `xAI error: HTTP ${response.status}`);
    } catch {
      sendSSE("error", `xAI error: HTTP ${response.status}`);
    }
    return;
  }
  if (!response.body) {
    sendSSE("error", "No response body received from xAI");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed === "data: [DONE]") {
          sendSSE("done", null);
          return;
        }
        if (trimmed.startsWith("data: ")) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              sendSSE("token", token);
            }
          } catch {
          }
        }
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed === "data: [DONE]") {
        sendSSE("done", null);
        return;
      }
      if (trimmed.startsWith("data: ")) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            sendSSE("token", token);
          }
        } catch {
        }
      }
    }
    sendSSE("done", null);
  } finally {
    reader.releaseLock();
  }
}

// server/rag/documentStore.ts
import crypto from "crypto";
var store = /* @__PURE__ */ new Map();
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "cannot",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "isn",
  "it",
  "its",
  "itself",
  "just",
  "ll",
  "m",
  "me",
  "might",
  "more",
  "most",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "now",
  "o",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "re",
  "s",
  "same",
  "she",
  "should",
  "so",
  "some",
  "such",
  "t",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "ve",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "won",
  "would",
  "y",
  "you",
  "your",
  "yours"
]);
function chunkDocument(text, targetSize = 1500) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= targetSize) {
    return [normalized];
  }
  const chunks = [];
  const paragraphs = normalized.split(/\n\s*\n/);
  let currentChunk = "";
  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;
    if (trimmedPara.length > targetSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const sentences = trimmedPara.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [trimmedPara];
      let subChunk = "";
      for (const sent of sentences) {
        if ((subChunk + sent).length > targetSize && subChunk.length > 200) {
          chunks.push(subChunk.trim());
          subChunk = sent;
        } else {
          subChunk += sent;
        }
      }
      if (subChunk.trim()) {
        chunks.push(subChunk.trim());
      }
      continue;
    }
    if ((currentChunk + "\n\n" + trimmedPara).length > targetSize && currentChunk.length > 200) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedPara;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n\n" + trimmedPara : trimmedPara;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks.length > 0 ? chunks : [text.slice(0, targetSize)];
}
function findTopChunks(chunks, query, topK = 6) {
  if (!chunks || chunks.length === 0) return [];
  if (chunks.length <= topK) return chunks;
  const rawTokens = query.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const uniqueTokens = Array.from(new Set(rawTokens));
  if (uniqueTokens.length === 0) {
    return chunks.slice(0, topK);
  }
  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const token of uniqueTokens) {
      let pos = 0;
      while ((pos = lower.indexOf(token, pos)) !== -1) {
        score += 1;
        pos += token.length;
      }
    }
    return { chunk, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, topK).map((s) => s.chunk);
}
function saveDocument(filename, fileType, sizeBytes, text) {
  const docId = "doc_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
  const chunks = chunkDocument(text);
  const record = {
    docId,
    filename,
    fileType,
    sizeBytes,
    text,
    chunks,
    createdAt: Date.now()
  };
  store.set(docId, record);
  return record;
}
function getDocument(docId) {
  return store.get(docId);
}

// server/search/tavily.ts
async function searchTavily(query, apiKey) {
  const trimmedQuery = query.trim();
  const trimmedKey = (apiKey || "").trim();
  if (!trimmedQuery) {
    return { ok: false, query: "", results: [] };
  }
  if (!trimmedKey) {
    return {
      ok: false,
      query: trimmedQuery,
      results: [],
      fallback: true,
      error: "Add a Tavily key to enable web search"
    };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1e4);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: trimmedKey,
        query: trimmedQuery,
        max_results: 5
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.status === 429 || res.status === 402) {
      console.warn(`[Tavily] Search quota reached (HTTP ${res.status}) for query: "${trimmedQuery}"`);
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        quotaExceeded: true,
        error: "Web search quota reached this month"
      };
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[Tavily] API error (HTTP ${res.status}):`, errData);
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: "Web search unavailable, answered from model knowledge only"
      };
    }
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: "Web search unavailable, answered from model knowledge only"
      };
    }
    const results = data.results.filter((item) => item && (item.content || item.title) && item.url).slice(0, 5).map((item) => ({
      title: String(item.title || "Search Result").replace(/<[^>]+>/g, ""),
      url: String(item.url || ""),
      snippet: String(item.content || item.raw_content || item.snippet || "").replace(/<[^>]+>/g, "")
    }));
    if (results.length === 0) {
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: "Web search unavailable, answered from model knowledge only"
      };
    }
    return {
      ok: true,
      query: trimmedQuery,
      results
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted || err instanceof Error && err.name === "AbortError") {
      console.warn(`[Tavily] Request timed out after 10s for query: "${trimmedQuery}"`);
    } else {
      console.warn("[Tavily] Search request error:", err);
    }
    return {
      ok: false,
      query: trimmedQuery,
      results: [],
      fallback: true,
      error: "Web search unavailable, answered from model knowledge only"
    };
  }
}

// server/chatHandler.ts
async function handleChatStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const sendSSE = (type, data) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify({ type, data })}

`);
    } catch (e) {
      console.error("[OmniChat SSE] Write error:", e);
    }
  };
  const {
    provider,
    apiKey,
    model,
    messages,
    contextChunks,
    docId,
    webSearch,
    tavilyKey,
    keys
  } = req.body || {};
  if (!provider || !apiKey || !model || !Array.isArray(messages)) {
    sendSSE("error", "Missing required parameters: provider, apiKey, model, or messages");
    res.end();
    return;
  }
  const effectiveTavilyKey = (tavilyKey || keys?.tavily || "").trim();
  const trimmedKey = String(apiKey).trim();
  if (!trimmedKey) {
    sendSSE("error", "invalid_api_key");
    res.end();
    return;
  }
  const normalizedMessages = messages.map((m) => ({
    role: m.role || "user",
    content: String(m.content || "")
  }));
  if (docId) {
    const doc = getDocument(docId);
    if (doc && doc.chunks.length > 0) {
      const latestUserQuery = normalizedMessages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
      const top6Chunks = findTopChunks(doc.chunks, latestUserQuery, 6);
      const chunkContext = `[Context from uploaded document: "${doc.filename}"]

${top6Chunks.map((c, i) => `--- Excerpt ${i + 1} ---
${c}`).join("\n\n")}

[Instructions: Answer the user's question grounded in the document excerpts above. If the document doesn't contain the answer, answer based on your knowledge and clearly note that the document does not mention it.]`;
      normalizedMessages.unshift({
        role: "system",
        content: chunkContext
      });
    }
  } else if (Array.isArray(contextChunks) && contextChunks.length > 0) {
    const chunkContext = `[Context from uploaded document]:
${contextChunks.join(
      "\n\n---\n\n"
    )}

[End of context]`;
    normalizedMessages.unshift({
      role: "system",
      content: chunkContext
    });
  }
  if (webSearch && provider !== "gemini") {
    const latestUserQuery = normalizedMessages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    if (latestUserQuery) {
      if (!effectiveTavilyKey) {
        sendSSE(
          "web_search_fallback",
          "Add a Tavily key to enable web search"
        );
      } else {
        try {
          const searchResult = await searchTavily(latestUserQuery, effectiveTavilyKey);
          if (searchResult.ok && searchResult.results.length > 0) {
            const searchContext = `[Web Search Grounding Results for query: "${latestUserQuery}"]

${searchResult.results.map(
              (r, i) => `--- Source ${i + 1}: ${r.title} ---
URL: ${r.url}
Summary: ${r.snippet}`
            ).join(
              "\n\n"
            )}

[Instructions: Provide an accurate answer synthesizing these search results, citing the source URLs.]`;
            normalizedMessages.unshift({
              role: "system",
              content: searchContext
            });
            sendSSE("web_search_sources", searchResult.results);
          } else if (searchResult.quotaExceeded) {
            sendSSE(
              "web_search_fallback",
              "Web search quota reached this month"
            );
          } else {
            sendSSE(
              "web_search_fallback",
              searchResult.error || "Web search unavailable, answered from model knowledge only"
            );
          }
        } catch {
          sendSSE(
            "web_search_fallback",
            "Web search unavailable, answered from model knowledge only"
          );
        }
      }
    }
  }
  const controller = new AbortController();
  let isDone = false;
  const timeoutId = setTimeout(() => {
    if (!isDone) {
      console.warn(`[OmniChat] Request timed out for provider: ${provider}, model: ${model}`);
      controller.abort();
      sendSSE("error", "timeout");
      res.end();
    }
  }, 3e4);
  res.on("close", () => {
    if (!res.writableEnded && !isDone) {
      isDone = true;
      clearTimeout(timeoutId);
      controller.abort();
    }
  });
  const wrappedSendSSE = (type, data) => {
    if (type === "done" || type === "error") {
      isDone = true;
      clearTimeout(timeoutId);
    }
    sendSSE(type, data);
  };
  try {
    switch (provider) {
      case "openai":
        await streamOpenAI(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;
      case "anthropic":
        await streamAnthropic(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;
      case "gemini":
        await streamGemini(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal, webSearch);
        break;
      case "xai":
        await streamXAI(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;
      default:
        wrappedSendSSE("error", `Unsupported provider: ${provider}`);
        break;
    }
  } catch (err) {
    if (controller.signal.aborted) {
      if (!isDone) {
        wrappedSendSSE("error", "timeout");
      }
    } else {
      console.error(`[OmniChat] Error proxying to ${provider}:`, err);
      const message = err instanceof Error ? err.message : "Unknown provider error";
      wrappedSendSSE("error", message);
    }
  } finally {
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

// server/keyTester.ts
async function testProviderApiKey(provider, apiKey) {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return {
      ok: false,
      provider,
      reason: `No API key provided for ${provider}.`
    };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12e3);
  try {
    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`
          },
          signal: controller.signal
        });
        if (res.ok) {
          return {
            ok: true,
            provider,
            message: "OpenAI API key verified and operational."
          };
        }
        const data = await res.json().catch(() => ({}));
        const reason = data?.error?.message || (res.status === 401 ? "Invalid OpenAI API key (401 Unauthorized)." : res.status === 429 ? "OpenAI rate limit or credit quota reached (429)." : `OpenAI returned status ${res.status}`);
        return { ok: false, provider, reason };
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": trimmedKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }]
          }),
          signal: controller.signal
        });
        if (res.ok) {
          return {
            ok: true,
            provider,
            message: "Anthropic API key verified and operational."
          };
        }
        const data = await res.json().catch(() => ({}));
        const reason = data?.error?.message || (res.status === 401 ? "Invalid Anthropic API key (401 Unauthorized)." : res.status === 429 ? "Anthropic rate limit or credit balance exhausted (429)." : `Anthropic returned status ${res.status}`);
        return { ok: false, provider, reason };
      }
      case "gemini": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
            trimmedKey
          )}`,
          {
            signal: controller.signal
          }
        );
        if (res.ok) {
          return {
            ok: true,
            provider,
            message: "Gemini API key verified and operational."
          };
        }
        const data = await res.json().catch(() => ({}));
        const reason = data?.error?.message || (res.status === 400 || res.status === 403 ? "Invalid Gemini API key or Generative Language API not enabled." : res.status === 429 ? "Gemini quota or rate limit exceeded (429)." : `Gemini returned status ${res.status}`);
        return { ok: false, provider, reason };
      }
      case "xai": {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`
          },
          signal: controller.signal
        });
        if (res.ok) {
          return {
            ok: true,
            provider,
            message: "xAI Grok API key verified and operational."
          };
        }
        const data = await res.json().catch(() => ({}));
        const reason = data?.error?.message || (res.status === 401 ? "Invalid xAI API key (401 Unauthorized)." : res.status === 429 ? "xAI rate limit reached (429)." : `xAI returned status ${res.status}`);
        return { ok: false, provider, reason };
      }
      case "tavily": {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            api_key: trimmedKey,
            query: "test ping",
            max_results: 1
          }),
          signal: controller.signal
        });
        if (res.ok) {
          return {
            ok: true,
            provider,
            message: "Tavily API key verified and operational."
          };
        }
        const data = await res.json().catch(() => ({}));
        const reason = res.status === 401 || res.status === 403 ? "Invalid Tavily key" : res.status === 429 || res.status === 402 ? "Tavily search quota reached (429/402)." : data?.detail?.error || data?.error || data?.message || `Tavily returned status ${res.status}`;
        return { ok: false, provider, reason };
      }
      default:
        return {
          ok: false,
          provider,
          reason: `Unknown provider: ${provider}`
        };
    }
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        provider,
        reason: "Verification timed out after 12 seconds."
      };
    }
    const message = err instanceof Error ? err.message : "Network error testing API key";
    return { ok: false, provider, reason: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// server/rag/fileParser.ts
import path from "path";
import mammoth from "mammoth";
async function parseUploadedDocument(buffer, originalFilename) {
  const extension = path.extname(originalFilename).toLowerCase();
  const sizeBytes = buffer.length;
  const MAX_SIZE = 15 * 1024 * 1024;
  if (sizeBytes > MAX_SIZE) {
    throw new Error("File too large \u2014 max 15MB");
  }
  let text = "";
  if (extension === ".pdf") {
    try {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const pdfData = await pdfParse(buffer);
      text = (pdfData?.text || "").trim();
    } catch (err) {
      console.error("[OmniChat RAG] PDF parse error:", err);
      throw new Error("Couldn't read any text from this file");
    }
  } else if (extension === ".docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = (result.value || "").trim();
    } catch (err) {
      console.error("[OmniChat RAG] DOCX parse error:", err);
      throw new Error("Couldn't read any text from this file");
    }
  } else if (extension === ".txt" || extension === ".md") {
    text = buffer.toString("utf-8").trim();
  } else {
    throw new Error("Only PDF, DOCX, TXT supported");
  }
  if (!text || text.length === 0) {
    throw new Error("Couldn't read any text from this file");
  }
  return {
    text,
    filename: originalFilename,
    extension,
    sizeBytes
  };
}

// server/modelVerifier.ts
async function verifyProviderModels(provider, apiKey) {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return {
      provider,
      ok: false,
      availableModelIds: [],
      error: `No API key provided for ${provider}.`
    };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12e3);
  try {
    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`
          },
          signal: controller.signal
        });
        if (!res.ok) {
          const data2 = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data2?.error?.message || `OpenAI returned status ${res.status}`
          };
        }
        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const modelIds = rawList.map((m) => String(m.id || "")).filter(Boolean);
        return {
          provider,
          ok: true,
          availableModelIds: modelIds
        };
      }
      case "xai": {
        const res = await fetch("https://api.x.ai/v1/models", {
          headers: {
            Authorization: `Bearer ${trimmedKey}`
          },
          signal: controller.signal
        });
        if (!res.ok) {
          const data2 = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data2?.error?.message || `xAI returned status ${res.status}`
          };
        }
        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const modelIds = rawList.map((m) => String(m.id || m.name || "")).filter(Boolean);
        return {
          provider,
          ok: true,
          availableModelIds: modelIds
        };
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": trimmedKey,
            "anthropic-version": "2023-06-01"
          },
          signal: controller.signal
        });
        if (!res.ok) {
          const data2 = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data2?.error?.message || `Anthropic returned status ${res.status}`
          };
        }
        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const modelIds = rawList.map((m) => String(m.id || "")).filter(Boolean);
        return {
          provider,
          ok: true,
          availableModelIds: modelIds
        };
      }
      case "gemini": {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
            trimmedKey
          )}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const data2 = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data2?.error?.message || `Gemini returned status ${res.status}`
          };
        }
        const data = await res.json();
        const rawList = Array.isArray(data?.models) ? data.models : [];
        const modelIds = [];
        for (const m of rawList) {
          if (m?.name) {
            modelIds.push(String(m.name));
            modelIds.push(String(m.name).replace(/^models\//, ""));
          }
        }
        return {
          provider,
          ok: true,
          availableModelIds: Array.from(new Set(modelIds))
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model verification timed out or connection failed";
    return {
      provider,
      ok: false,
      availableModelIds: [],
      error: message
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// server/gmail/imap.ts
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
function cleanCredentials(email, appPassword) {
  const cleanEmail = (email || "").trim();
  const cleanPass = (appPassword || "").replace(/\s+/g, "").trim();
  return { email: cleanEmail, pass: cleanPass };
}
function createClient(email, appPassword) {
  const { email: user, pass } = cleanCredentials(email, appPassword);
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user,
      pass
    },
    logger: false,
    emitLogs: false,
    clientInfo: {
      name: "OmniChat",
      version: "1.0.0"
    }
  });
}
function formatImapError(err) {
  const errObj = err && typeof err === "object" ? err : {};
  const message = err instanceof Error ? err.message : String(err);
  const responseText = String(errObj.responseText || "");
  console.warn("[Gmail IMAP] Error encountered:", message, responseText);
  const combined = `${message} ${responseText}`.toLowerCase();
  if (errObj.authenticationFailed === true || errObj.responseStatus === "NO" || combined.includes("authenticationfailed") || combined.includes("invalid credentials") || combined.includes("username and password not accepted") || combined.includes("please log in via your web browser") || combined.includes("command failed") || combined.includes("auth")) {
    return {
      error: "Authentication failed \u2014 check your email and app password. Make sure you are using a 16-character Google App Password with 2-Step Verification, not your regular password.",
      code: "AUTH_FAILED"
    };
  }
  if (combined.includes("enotfound") || combined.includes("econnrefused") || combined.includes("etimedout") || combined.includes("network") || combined.includes("timeout")) {
    return {
      error: "Couldn't reach Gmail \u2014 try again in a moment",
      code: "NETWORK_ERROR"
    };
  }
  return {
    error: message || "Couldn't reach Gmail \u2014 try again in a moment",
    code: "GENERAL_ERROR"
  };
}
async function testGmailConnection(email, appPassword) {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass) {
    return {
      ok: false,
      error: "Email address and App Password are both required."
    };
  }
  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {
    });
    return {
      ok: true,
      message: `Successfully connected to Gmail mailbox (${cleanEmail})`
    };
  } catch (err) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error
    };
  }
}
async function fetchInboxMessages(email, appPassword, limit = 10) {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass) {
    return {
      ok: false,
      error: "Email address and App Password are required."
    };
  }
  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const summaries = [];
    try {
      const mailbox = client.mailbox;
      if (!mailbox || mailbox.exists === 0) {
        return { ok: true, messages: [] };
      }
      const total = mailbox.exists;
      const startSeq = Math.max(1, total - limit + 1);
      const sequenceRange = `${startSeq}:${total}`;
      for await (const msg of client.fetch(sequenceRange, {
        envelope: true,
        bodyStructure: true,
        uid: true
      })) {
        const fromAddress = msg.envelope?.from?.[0]?.address || msg.envelope?.from?.[0]?.name || "Unknown Sender";
        const fromName = msg.envelope?.from?.[0]?.name || fromAddress;
        const subject = msg.envelope?.subject || "(No Subject)";
        const dateStr = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
        summaries.push({
          id: String(msg.uid),
          seq: msg.seq,
          subject,
          from: fromAddress,
          fromName,
          date: dateStr,
          snippet: `From ${fromName}: ${subject}`
        });
      }
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {
    });
    summaries.sort((a, b) => b.seq - a.seq);
    return {
      ok: true,
      messages: summaries
    };
  } catch (err) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error
    };
  }
}
async function fetchFullMessage(email, appPassword, uid) {
  const { email: cleanEmail, pass: cleanPass } = cleanCredentials(email, appPassword);
  if (!cleanEmail || !cleanPass || !uid) {
    return {
      ok: false,
      error: "Email, App Password, and Message UID are required."
    };
  }
  const client = createClient(cleanEmail, cleanPass);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let messageObj = null;
    try {
      const downloadResult = await client.download(String(uid), void 0, { uid: true });
      if (downloadResult && downloadResult.content) {
        const parsed = await simpleParser(downloadResult.content);
        const htmlString = typeof parsed.html === "string" ? parsed.html : "";
        const textContent = parsed.text || htmlString.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "(No text body)";
        messageObj = {
          id: String(uid),
          subject: parsed.subject || "(No Subject)",
          from: parsed.from?.text || parsed.from?.value?.[0]?.address || "Unknown Sender",
          to: parsed.to ? Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to.text : void 0,
          date: parsed.date ? parsed.date.toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
          text: textContent,
          html: typeof parsed.html === "string" ? parsed.html : void 0
        };
      }
    } finally {
      lock.release();
    }
    await client.logout().catch(() => {
    });
    if (!messageObj) {
      return { ok: false, error: "Message not found in INBOX." };
    }
    return { ok: true, message: messageObj };
  } catch (err) {
    const formatted = formatImapError(err);
    return {
      ok: false,
      error: formatted.error
    };
  }
}

// server/gmail/draftHelper.ts
async function generateEmailDraftReply({
  message,
  userPrompt,
  provider = "gemini",
  model,
  apiKey
}) {
  const cleanKey = (apiKey || process.env.GEMINI_API_KEY || "").trim();
  const systemInstruction = "You are an executive email assistant. Your task is to draft a polite, concise, and professional email reply. Do NOT auto-send. Output only the email reply body with a greeting and sign-off placeholder.";
  const promptContent = `Here is the email to reply to:
From: ${message.from}
Date: ${message.date}
Subject: ${message.subject}

Original Email Body:
${message.text.slice(0, 3500)}

${userPrompt ? `User's Special Reply Instructions:
${userPrompt}
` : "Draft a courteous, relevant, and constructive response."}

Reply Draft:`;
  if (provider === "openai" && cleanKey) {
    const chosenModel2 = model || "gpt-4o";
    const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model: chosenModel2,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: promptContent }
        ],
        temperature: 0.7
      })
    });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI error ${res2.status}`);
    }
    const data2 = await res2.json();
    return data2.choices?.[0]?.message?.content?.trim() || "";
  }
  if (provider === "anthropic" && cleanKey) {
    const chosenModel2 = model || "claude-sonnet-5";
    const res2 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cleanKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: chosenModel2,
        max_tokens: 1500,
        system: systemInstruction,
        messages: [{ role: "user", content: promptContent }],
        temperature: 0.7
      })
    });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic error ${res2.status}`);
    }
    const data2 = await res2.json();
    return data2.content?.filter((c) => c.type === "text").map((c) => c.text).join("").trim() || "";
  }
  if (provider === "xai" && cleanKey) {
    const chosenModel2 = model || "grok-4.3";
    const res2 = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model: chosenModel2,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: promptContent }
        ],
        temperature: 0.7
      })
    });
    if (!res2.ok) {
      const err = await res2.json().catch(() => ({}));
      throw new Error(err?.error?.message || `xAI error ${res2.status}`);
    }
    const data2 = await res2.json();
    return data2.choices?.[0]?.message?.content?.trim() || "";
  }
  const geminiKey = (provider === "gemini" ? cleanKey : "") || process.env.GEMINI_API_KEY || cleanKey;
  if (!geminiKey) {
    throw new Error("API key is required to draft a reply.");
  }
  const chosenModel = (model || "gemini-3.8-flash").replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: promptContent }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
  return text;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3e3;
  app.use(express.json());
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "OmniChat Express Gateway",
      phase: 3,
      time: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/keys/test", async (req, res) => {
    const { provider, apiKey } = req.body;
    if (!provider || typeof provider !== "string") {
      return res.status(400).json({ ok: false, reason: "Provider is required" });
    }
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return res.status(400).json({ ok: false, reason: "API key cannot be empty" });
    }
    try {
      const result = await testProviderApiKey(provider, apiKey);
      if (result.ok) {
        return res.json({ ok: true, provider, message: result.message });
      } else {
        return res.status(400).json({ ok: false, provider, reason: result.reason });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal key verification error";
      return res.status(500).json({ ok: false, provider, reason: message });
    }
  });
  app.post("/api/models/verify", async (req, res) => {
    const { provider, apiKey, keys } = req.body || {};
    if (keys && typeof keys === "object") {
      const results = {};
      const providers = Object.keys(keys);
      await Promise.all(
        providers.map(async (p) => {
          const key = keys[p];
          if (key && typeof key === "string" && key.trim()) {
            results[p] = await verifyProviderModels(p, key);
          }
        })
      );
      return res.json({ ok: true, results });
    }
    if (!provider || !apiKey) {
      return res.status(400).json({ ok: false, error: "Provider and apiKey are required" });
    }
    try {
      const result = await verifyProviderModels(provider, apiKey);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Model verification error";
      return res.status(500).json({ ok: false, provider, error: message });
    }
  });
  app.post("/api/document/upload", (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            ok: false,
            error: "File too large \u2014 max 15MB"
          });
        }
        return res.status(400).json({
          ok: false,
          error: err.message || "File upload error"
        });
      }
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No file uploaded"
        });
      }
      try {
        const parsed = await parseUploadedDocument(req.file.buffer, req.file.originalname);
        const record = saveDocument(
          parsed.filename,
          parsed.extension,
          parsed.sizeBytes,
          parsed.text
        );
        return res.json({
          ok: true,
          docId: record.docId,
          filename: record.filename,
          chunkCount: record.chunks.length,
          sizeBytes: record.sizeBytes
        });
      } catch (parseErr) {
        const message = parseErr instanceof Error ? parseErr.message : "Failed to parse file";
        return res.status(400).json({
          ok: false,
          error: message
        });
      }
    });
  });
  app.get("/api/document/:docId", (req, res) => {
    const doc = getDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "Document not found" });
    }
    return res.json({
      ok: true,
      docId: doc.docId,
      filename: doc.filename,
      chunkCount: doc.chunks.length,
      sizeBytes: doc.sizeBytes
    });
  });
  app.post("/api/search", async (req, res) => {
    const { query, tavilyKey, apiKey } = req.body || {};
    const q = String(query || "").trim();
    const key = String(tavilyKey || apiKey || "").trim();
    if (!q) {
      return res.status(400).json({ ok: false, error: "Query parameter is required" });
    }
    try {
      const result = await searchTavily(q, key);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search error";
      return res.status(500).json({ ok: false, error: message });
    }
  });
  app.get("/api/search", async (req, res) => {
    const q = String(req.query.q || req.query.query || "").trim();
    const key = String(req.query.tavilyKey || req.query.apiKey || "").trim();
    if (!q) {
      return res.status(400).json({ ok: false, error: 'Query parameter "q" is required' });
    }
    try {
      const result = await searchTavily(q, key);
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search error";
      return res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/gmail/connect", async (req, res) => {
    const { email, appPassword } = req.body || {};
    if (!email || !appPassword) {
      return res.status(400).json({
        ok: false,
        error: "Gmail address and App Password are required."
      });
    }
    const result = await testGmailConnection(email, appPassword);
    if (!result.ok) {
      return res.status(401).json(result);
    }
    return res.json(result);
  });
  app.post("/api/gmail/messages", async (req, res) => {
    const { email, appPassword, limit } = req.body || {};
    if (!email || !appPassword) {
      return res.status(400).json({
        ok: false,
        error: "Gmail address and App Password are required."
      });
    }
    const result = await fetchInboxMessages(email, appPassword, Number(limit) || 10);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });
  app.post("/api/gmail/message", async (req, res) => {
    const { email, appPassword, messageId } = req.body || {};
    if (!email || !appPassword || !messageId) {
      return res.status(400).json({
        ok: false,
        error: "Email, App Password, and messageId are required."
      });
    }
    const result = await fetchFullMessage(email, appPassword, String(messageId));
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });
  app.post("/api/gmail/draft-reply", async (req, res) => {
    const { email, appPassword, messageId, promptInstructions, provider, model, apiKey } = req.body || {};
    if (!email || !appPassword || !messageId) {
      return res.status(400).json({
        ok: false,
        error: "Email, App Password, and messageId are required."
      });
    }
    try {
      const msgResult = await fetchFullMessage(email, appPassword, String(messageId));
      if (!msgResult.ok || !msgResult.message) {
        return res.status(400).json({
          ok: false,
          error: msgResult.error || "Failed to fetch original message for drafting."
        });
      }
      const draftText = await generateEmailDraftReply({
        message: msgResult.message,
        userPrompt: promptInstructions,
        provider,
        model,
        apiKey
      });
      return res.json({
        ok: true,
        draft: draftText,
        subject: msgResult.message.subject.startsWith("Re:") ? msgResult.message.subject : `Re: ${msgResult.message.subject}`,
        originalMessage: {
          id: msgResult.message.id,
          subject: msgResult.message.subject,
          from: msgResult.message.from,
          date: msgResult.message.date
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Draft generation error";
      return res.status(500).json({ ok: false, error: message });
    }
  });
  app.post("/api/chat", (req, res) => {
    handleChatStream(req, res);
  });
  const distPath = path2.resolve(__dirname, "dist");
  const hasBuiltDist = fs.existsSync(distPath);
  const isProduction = hasBuiltDist || process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
  if (isProduction && hasBuiltDist) {
    console.log("[OmniChat] Serving production static assets from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexPath = path2.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Index file not found in dist directory.");
      }
    });
  } else {
    try {
      console.log("[OmniChat] Starting Vite dev server middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn("[OmniChat] Vite dev middleware failed to initialize, checking for static assets...", viteErr);
      if (hasBuiltDist) {
        app.use(express.static(distPath));
        app.get("*", (_req, res) => {
          res.sendFile(path2.resolve(distPath, "index.html"));
        });
      } else {
        console.error("[OmniChat] Critical: No dist directory found and Vite failed to load.");
      }
    }
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OmniChat] Server running at http://0.0.0.0:${PORT} (${isProduction && hasBuiltDist ? "production" : "development"})`);
  });
}
startServer().catch((err) => {
  console.error("[OmniChat] Failed to start server:", err);
  process.exit(1);
});
