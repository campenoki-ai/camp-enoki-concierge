/**
 * Cloudflare Worker — Claude proxy for the Enoki AI Concierge.
 *
 * Why this exists: the Camp Enoki site is a static GitHub Pages page, so it
 * has nowhere safe to hold a real Anthropic API key (anything in the site's
 * JS is visible to anyone who views source). This tiny worker holds the key
 * as a server-side secret and is the ONLY thing that talks to Anthropic; the
 * site calls this worker instead.
 *
 * Deploy: see README.md in this folder. Nothing here needs a build step —
 * paste this file's contents into the Cloudflare dashboard's Worker editor.
 */

const MODEL = "claude-haiku-4-5-20251001"; // cheapest/fastest Claude model — keeps per-message cost low
const MAX_TOKENS = 400;

// Lock this down to your real GitHub Pages origin once deployed, e.g.
// "https://yourname.github.io" — set it as the ALLOWED_ORIGIN variable in
// the Cloudflare dashboard (Settings -> Variables). Defaults to "*" so it
// works immediately, but that lets ANY website call your worker.
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function buildSystemPrompt(context, systemPromptOverride) {
  if (systemPromptOverride) return systemPromptOverride;
  return [
    "You are Enoki AI, the friendly concierge chatbot for Camp Enoki, a Philippine riverside resort.",
    "Answer using ONLY the knowledge base excerpt below — do not invent rates, policies, or facts that aren't in it.",
    "Reply in the same language style as the guest's message (English, Tagalog, or Taglish).",
    "Keep replies short and conversational (2-4 sentences).",
    'If the knowledge base excerpt does not contain the answer, reply with EXACTLY the single word "NO_MATCH" and nothing else.',
    "",
    "KNOWLEDGE BASE EXCERPT:",
    context || "(no relevant entries found)",
  ].join("\n");
}

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders(env) });
  }

  const { query, context, systemPromptOverride } = body;
  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "Missing 'query' string" }), { status: 400, headers: corsHeaders(env) });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Worker is missing the ANTHROPIC_API_KEY secret" }), { status: 500, headers: corsHeaders(env) });
  }

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(context, systemPromptOverride),
      messages: [{ role: "user", content: query }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(JSON.stringify({ error: `Anthropic API error: ${anthropicRes.status}`, detail: errText }), {
      status: 502,
      headers: corsHeaders(env),
    });
  }

  const data = await anthropicRes.json();
  const text = data.content?.[0]?.text || "";
  return new Response(JSON.stringify({ text }), { status: 200, headers: { ...corsHeaders(env), "Content-Type": "application/json" } });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST is supported" }), { status: 405, headers: corsHeaders(env) });
    }
    try {
      return await handleChat(request, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message || "Unexpected error" }), { status: 500, headers: corsHeaders(env) });
    }
  },
};
