# Deploying the Claude proxy (Cloudflare Worker)

This is the one piece of Phase 2 that isn't static — it's a tiny serverless
function that holds your Anthropic API key so the site itself never sees it.
Free tier, no credit card required for Cloudflare, no build step.

## 1. Get an Anthropic API key
1. Go to https://console.anthropic.com → **API Keys** → create a key.
2. **Set a spend limit** on the account (Settings → Billing → limits) — this
   is your real cost-safety net, more reliable than anything the worker can
   enforce on its own.

## 2. Create the Worker
1. Go to https://dash.cloudflare.com → sign up free if you don't have an account.
2. **Workers & Pages** → **Create** → **Create Worker**.
3. Give it a name (e.g. `camp-enoki-ai`) → **Deploy** (deploys the default "Hello World" first — that's fine).
4. Click **Edit code**. Delete everything in the editor and paste in the
   contents of [`worker.js`](worker.js) from this folder.
5. Click **Deploy** again.

## 3. Add your API key as a secret
1. On the worker's page → **Settings** → **Variables and Secrets**.
2. Add variable: name `ANTHROPIC_API_KEY`, value = your key from step 1,
   type **Secret** (encrypted). Save.
3. *(Optional but recommended once you know your site's URL)*: also add a
   plain variable `ALLOWED_ORIGIN` = `https://yourname.github.io` (no
   trailing slash) so only your site can call this worker. Leave it unset
   while testing — it defaults to allowing any origin.

## 4. Get your worker's URL
It's shown at the top of the worker's dashboard page, looks like:
`https://camp-enoki-ai.yoursubdomain.workers.dev`

## 5. Wire it into the site
1. Open `admin.html` on your deployed site → **AI Concierge** tab.
2. Paste the worker URL into **Proxy URL**.
3. Turn on **Enabled**.
4. Pick a **Mode**:
   - **Local first, AI fallback** (recommended/default) — instant free
     answers from the FAQ knowledge base whenever it has a good match;
     Claude only gets called for questions the FAQ engine can't confidently
     answer. Keeps API costs low.
   - **Always use AI** — every message goes to Claude (grounded with your
     FAQ data as context). Costs more, most flexible/conversational.
   - **Local only** — same as Phase 1, no AI calls at all.
5. Save. Ask the concierge something not in your FAQ — it should now get a
   real Claude-generated answer (marked with a small "✨ Enoki AI" tag so you
   can tell it apart from an instant FAQ answer).

## Notes
- The worker only ever answers using the FAQ knowledge base you feed it as
  context — it's told to reply with the literal string `NO_MATCH` if it
  can't help, which the site turns back into the normal "send this to
  staff?" flow.
- If you ever need to update the worker's code, edit `worker.js` here, then
  paste the new contents into the Cloudflare dashboard editor and Deploy —
  there's no separate build/publish step.
- Model used is `claude-haiku-4-5-20251001` (Anthropic's fastest/cheapest
  model) — change the `MODEL` constant in `worker.js` if you want higher
  quality answers at a higher per-message cost.
