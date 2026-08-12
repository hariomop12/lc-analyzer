const GEMINI_MODEL = env => env?.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const LC_GRAPHQL = "https://leetcode.com/graphql";
const LC_PROBLEMS_LIST = "https://leetcode.com/api/problems/algorithms/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SYSTEM_PROMPT = `You are an elite LeetCode problem setter and senior competitive-programming code reviewer. You analyze a user's solution to a coding problem exactly the way LeetCode's premium "Analysis" feature does.

Analyze these dimensions:
1. VERDICT - Is the solution correct AND efficient? If it passes the common cases but is suboptimal, say needs_improvement. If clearly wrong, incorrect.
2. APPROACH - Identify the current algorithmic approach and data structures used. Then name the best possible approach for this problem and explain the key idea (e.g. "Hash Table / Counting", "Two Pointers", "Sliding Window"). Be specific.
3. EFFICIENCY - Give time and space complexity of BOTH the user's solution and the optimal solution, plus a short comparison of why it matters.
4. CODE STYLE - Line-level review: naming, readability, edge-case handling, premature optimization, idiomatic usage. Each item must reference a line number or exact code snippet.
5. SUGGESTIONS - Concrete, actionable improvements to reach the optimal solution.
6. FOLLOW-UP - Pose ONE follow-up challenge a real LeetCode problem would ask (e.g. "How would you optimize space if input was guaranteed to be only lowercase English letters?").

Rules:
- Verdict wording: if optimal, say "Congratulations! You passed. Your solution is correct and efficient." If suboptimal but correct, say "Your solution is correct, but it can be optimized."
- ALWAYS output valid JSON only. No markdown fences, no commentary, no extra text.
- Fill EVERY field. Never leave any field empty or "-".
- BE EXTREMELY CONCISE. Every field must be ONE short line / one short sentence. No paragraphs ever. No bullet formatting inside strings.
- verdictMessage: exactly 1 short sentence.
- approaches.current: 2-5 words (e.g. "Sorting"). approaches.suggested: 2-5 words (e.g. "Hash Table / Counting").
- keyIdea: one short sentence (max 12 words).
- complexity: Big-O notation only (e.g. O(n), O(1), O(n log n)).
- efficiencyAnalysis: one short sentence (max 15 words).
- codeStyle items: max 3, each with one-line issue and one-line suggestion.
- suggestions: max 3, each a single short actionable phrase (max 12 words).
- followUp: one short question (max 15 words).

Output EXACTLY this JSON shape (every key must be present, all values short):
{
  "verdict": "needs_improvement",
  "verdictMessage": "Your solution is correct, but it can be optimized.",
  "approaches": { "current": "Sorting", "suggested": "Hash Table / Counting", "keyIdea": "Count character frequencies and compare." },
  "complexity": {
    "current": { "time": "O(n log n)", "space": "O(1)" },
    "suggested": { "time": "O(n)", "space": "O(1)" }
  },
  "efficiencyAnalysis": "Counting avoids expensive sorting.",
  "codeStyle": [ { "line": "3", "issue": "Verbose naming", "suggestion": "Shorten variable names" } ],
  "suggestions": [ "Add early length check", "Use fixed-size array" ],
  "followUp": "Optimize space for lowercase letters only?"
}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["passed", "needs_improvement", "incorrect"] },
    verdictMessage: { type: "string" },
    approaches: {
      type: "object",
      properties: {
        current: { type: "string" },
        suggested: { type: "string" },
        keyIdea: { type: "string" },
      },
      required: ["current", "suggested", "keyIdea"],
    },
    complexity: {
      type: "object",
      properties: {
        current: {
          type: "object",
          properties: { time: { type: "string" }, space: { type: "string" } },
          required: ["time", "space"],
        },
        suggested: {
          type: "object",
          properties: { time: { type: "string" }, space: { type: "string" } },
          required: ["time", "space"],
        },
      },
      required: ["current", "suggested"],
    },
    efficiencyAnalysis: { type: "string" },
    codeStyle: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "string" },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["line", "issue", "suggestion"],
      },
    },
    suggestions: { type: "array", items: { type: "string" } },
    followUp: { type: "string" },
  },
  required: [
    "verdict",
    "verdictMessage",
    "approaches",
    "complexity",
    "efficiencyAnalysis",
    "codeStyle",
    "suggestions",
    "followUp",
  ],
};

function buildPrompt({ question, code, language }) {
  return `${SYSTEM_PROMPT}

## PROBLEM
${question}

## USER SOLUTION (${language})
${code}

Output the analysis as JSON.`;
}

async function analyze(question, code, language, apiKey, env) {
  const model = GEMINI_MODEL(env);
  const res = await fetch(`${GEMINI_URL(model)}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt({ question, code, language }) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let detail = res.statusText;
    try {
      const j = JSON.parse(errText);
      detail = j?.error?.message || detail;
    } catch (_) {}
    throw new Error(`Gemini API error (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return sanitize(parseLooseJson(text));
}

function sanitize(r) {
  const cx = (c) => ({ time: c?.time || "-", space: c?.space || "-" });
  return {
    verdict: ["passed", "needs_improvement", "incorrect"].includes(r?.verdict) ? r.verdict : "needs_improvement",
    verdictMessage: r?.verdictMessage || "Analysis complete.",
    approaches: {
      current: r?.approaches?.current || "Not detected",
      suggested: r?.approaches?.suggested || "Not provided",
      keyIdea: r?.approaches?.keyIdea || "",
    },
    complexity: {
      current: cx(r?.complexity?.current),
      suggested: cx(r?.complexity?.suggested),
    },
    efficiencyAnalysis: r?.efficiencyAnalysis || "",
    codeStyle: Array.isArray(r?.codeStyle) ? r.codeStyle.filter((i) => i && (i.issue || i.suggestion)) : [],
    suggestions: Array.isArray(r?.suggestions) ? r.suggestions.filter(Boolean) : [],
    followUp: r?.followUp || "",
  };
}

function parseLooseJson(text) {
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(s);
  } catch (_) {
    const end = s.lastIndexOf("}");
    if (end > 0) {
      try {
        return JSON.parse(s.slice(0, end + 1));
      } catch (_2) {}
    }
    throw new Error("AI ka response kharaab aa gaya (truncated). Dobara try kar bhai 🙏");
  }
}

async function getProblemByNumber(number, ctx) {
  const num = Number(number);
  if (!Number.isInteger(num) || num <= 0) throw new Error("Invalid question number");

  const cacheReq = new Request("https://lc-analyzer.internal/problems-list", { method: "GET" });
  const cache = caches.default;
  let cached = await cache.match(cacheReq);
  let list;
  if (cached && cached.ok) {
    list = await cached.json();
  } else {
    const res = await fetch(LC_PROBLEMS_LIST, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`LeetCode problem list unavailable (${res.status})`);
    list = await res.json();
    ctx.waitUntil(
      cache.put(cacheReq, new Response(JSON.stringify(list), {
        headers: { "Cache-Control": "public, max-age=86400" },
      }))
    );
  }

  const pairs = list?.stat_status_pairs || [];
  const hit = pairs.find((p) => p.stat?.frontend_question_id === num);
  return hit?.stat?.question__title_slug || null;
}

async function getQuestionBySlug(slug) {
  const res = await fetch(LC_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://leetcode.com",
      "Referer": `https://leetcode.com/problems/${slug}/`,
      "User-Agent": UA,
    },
    body: JSON.stringify({
      query: `query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          questionFrontendId
          title
          titleSlug
          difficulty
          content
          topicTags { name }
        }
      }`,
      variables: { titleSlug: slug },
    }),
  });

  if (!res.ok) throw new Error(`LeetCode GraphQL failed (${res.status})`);
  const data = await res.json();
  if (data?.errors?.length) throw new Error("LeetCode: " + data.errors[0].message);
  const q = data?.data?.question;
  if (!q) throw new Error("Question not found on LeetCode");
  return q;
}

function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<pre[^>]*>/gi, "\n```\n").replace(/<\/pre>/gi, "\n```\n");
  s = s.replace(/<code[^>]*>/gi, "`").replace(/<\/code>/gi, "`");
  s = s.replace(/<(li|p|div|tr|br)[^>]*>/gi, (m) => (m.startsWith("<br") ? "\n" : "\n"));
  s = s.replace(/<\/(li|p|div|tr|h[1-6])[^>]*>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "- ");
  s = s.replace(/<strong[^>]*>/gi, "**").replace(/<\/strong>/gi, "**");
  s = s.replace(/<b[^>]*>/gi, "**").replace(/<\/b>/gi, "**");
  s = s.replace(/<em[^>]*>/gi, "*").replace(/<\/em>/gi, "*");
  s = s.replace(/<i[^>]*>/gi, "*").replace(/<\/i>/gi, "*");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
       .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
       .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
       .replace(/&#x2F;/gi, "/").replace(/&rarr;/gi, "->")
       .replace(/&times;/gi, "x").replace(/&le;/gi, "<=").replace(/&ge;/gi, ">=");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { method } = request;

    if (method === "POST" && url.pathname === "/api/analyze") {
      try {
        if (!env.GEMINI_API_KEY) {
          return json({ error: "GEMINI_API_KEY not configured on the server." }, 500);
        }

        const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0] || "unknown";
        const rateOk = await checkRateLimit(ip, ctx);
        if (!rateOk.ok) {
          return json({ ok: false, error: "Too many requests. Max 2 analyses per 5 minutes. Thoda wait kar ke try kar bhai 🙏" }, 429);
        }

        const body = await request.json();
        const { number, question, code, language } = body;
        if (!code?.trim() || !language?.trim()) {
          return json({ error: "code and language are required." }, 400);
        }

        if (!/^\d{1,4}$/.test(String(number ?? "").trim())) {
          return json({ ok: false, error: "Question number sirf digits me do bhai (e.g. 242)." }, 400);
        }
        if (!isCodeLike(code)) {
          return json({ ok: false, error: "Code field me sirf code daalo bhai — question/HTML nahi." }, 400);
        }

        let questionText = question?.trim();
        let meta = null;

        if (number) {
          const slug = await getProblemByNumber(number, ctx);
          if (!slug) return json({ ok: false, error: `Problem #${number} LeetCode par nahi mili 😕` }, 404);
          const q = await getQuestionBySlug(slug);
          questionText = `#${q.questionFrontendId} ${q.title} [${q.difficulty}]\n\n${htmlToText(q.content)}`;
          meta = {
            id: q.questionFrontendId,
            title: q.title,
            difficulty: q.difficulty,
            tags: (q.topicTags || []).map((t) => t.name),
            url: `https://leetcode.com/problems/${q.titleSlug}/`,
          };
        }

        if (!questionText) return json({ error: "question ya number required hai." }, 400);
        if (questionText.length > 30000 || code.length > 30000) {
          return json({ error: "Input too large." }, 400);
        }

        const result = await analyze(questionText, code, language, env.GEMINI_API_KEY, env);
        return json({ ok: true, meta, result }, 200);
      } catch (e) {
        return json({ ok: false, error: e.message || "Analysis failed" }, 500);
      }
    }

    if (method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, model: GEMINI_MODEL(env), keyConfigured: Boolean(env.GEMINI_API_KEY) }, 200);
    }

    return new Response("Not found", { status: 404 });
  },
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RATE_LIMIT_PER_WINDOW = 2;
const RATE_WINDOW_SECONDS = 300;

async function checkRateLimit(ip, ctx) {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / RATE_WINDOW_SECONDS);
  const cacheReq = new Request(`https://lc-analyzer.internal/ratelimit/${ip}/${bucket}`, { method: "GET" });
  const cache = caches.default;

  let count = 0;
  const cached = await cache.match(cacheReq);
  if (cached && cached.ok) {
    count = Number(await cached.text()) || 0;
  }

  if (count >= RATE_LIMIT_PER_WINDOW) {
    return { ok: false };
  }

  count++;
  const ttl = RATE_WINDOW_SECONDS - (now % RATE_WINDOW_SECONDS);
  ctx.waitUntil(
    cache.put(cacheReq, new Response(String(count), {
      headers: { "Cache-Control": `max-age=${ttl}` },
    }))
  );
  return { ok: true };
}

function isCodeLike(code) {
  const s = String(code).trim();
  if (s.length < 5) return false;
  if (/<\/?(script|style|html|body|div|span|p|h[1-6]|img|a)[^>]*>/i.test(s)) return false;
  if (/^https?:\/\/\S+$/i.test(s)) return false;
  const keywords = /\b(def|class|function|return|int\s+main|public|private|static|import|include|using\s+namespace|package|let\s|const\s|var\s|fn\s|void|if\s*\(|for\s*\(|while\s*\(|print|return)\b/i;
  const operators = /[{}();=<>\[\]+\-*/%!&|^~]/;
  return keywords.test(s) || operators.test(s);
}
