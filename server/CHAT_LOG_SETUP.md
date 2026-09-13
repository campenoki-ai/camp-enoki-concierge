# Setting up the Chat Log (Google Sheet)

This lets you see every conversation guests have with the Enoki AI
Concierge in a Google Sheet, and reply to any of them yourself — your
reply shows up in the guest's chat within about 8 seconds. Free, no new
account needed (just your existing Google account), no credit card.

## 1. Create the Sheet
1. Go to https://sheets.google.com → **Blank spreadsheet**.
2. Name it something like "Camp Enoki Chat Log" (top left, click the title).

## 2. Add the script
1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete everything in the code editor that opens.
3. Paste in the contents of [`chat-log.gs`](chat-log.gs) from this folder.
4. Click the **Save** icon (disk icon, top left).

## 3. Deploy it as a Web App
1. Click **Deploy** (top right) → **New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - **Execute as**: **Me** (your account)
   - **Who has access**: **Anyone**
4. Click **Deploy**.
5. It'll ask you to **Authorize access** — click through the Google
   permission screens (you may see an "unverified app" warning since this
   is your own private script; click **Advanced** → **Go to (project name)
   (unsafe)** → **Allow**. This is safe — it's your own script, only you
   can edit it.)
6. Copy the **Web app URL** shown (looks like
   `https://script.google.com/macros/s/AKfycb.../exec`).

## 4. Wire it into the site
1. Open Admin → **Site Settings**.
2. Paste the URL into **"Chat log Google Sheet URL"**.
3. Click **Save**, then go to the **Publish** tab and click **Publish to
   Live Site**.

That's it. Open the Sheet any time to see conversations arrive as new
rows: guest question, AI's answer, and language. To reply to a specific
guest, click that row's **Owner Reply** cell and type your message — it
appears in their chat automatically (only while they still have the
chat open in their browser).

## 5. (Optional) Nightly "learn from the chat log"

Once a night the script can take the rows you ticked and add them to the live
FAQ, so those questions are answered instantly and for free from then on —
and stop costing AI credits.

**How it works day to day:** the Sheet has two extra columns, **"Add to FAQ?"**
(a checkbox) and **"Status"**. When you look through the log, tick the box on
any row worth keeping. At about 12:15 AM the script adds every ticked row to
the FAQ and writes back "Added <date>" in the Status column. Untick, or just
leave a row alone, and nothing happens to it.

Which answer gets used:
- If you typed an **Owner Reply**, that is used — your words win.
- If not, the **AI Answer** is used.
- If nothing was ever answered ("I don't know the answer yet") and you haven't
  written a reply, the row is skipped and the Status says so. Nothing that was
  never actually answered can reach your FAQ.
- A question already in the FAQ is skipped as a duplicate.

Keywords are generated automatically so guests find the entry however they
phrase it (including Tagalog/Taglish, e.g. a generator question also matches
"kuryente" and "may generator ba").

### Turning it on
1. You need a GitHub token so the script can update the site. Create one at
   github.com → **Settings** → **Developer settings** → **Personal access
   tokens** → **Fine-grained tokens** → **Generate new token**. Give it access
   to **only** the `camp-enoki-concierge` repository, and under **Repository
   permissions** set **Contents** to **Read and write**. Copy the token.
2. In the Apps Script editor: **Project Settings** (gear icon, left side) →
   scroll to **Script Properties** → **Add script property**, three times:
   - `GITHUB_TOKEN` = the token you just copied
   - `GITHUB_OWNER` = `campenoki-ai`
   - `GITHUB_REPO` = `camp-enoki-concierge`
   - *(optional but recommended)* `AI_PROXY_URL` = your Cloudflare worker URL,
     the same one in Admin → AI Concierge. This is what writes the good
     keywords; without it the script falls back to using the question's own
     words.
3. While in **Project Settings**, set the **time zone** to
   *(GMT+08:00) Kuala Lumpur, Singapore* (Philippine time) so "midnight" means
   your midnight.
4. Back in the editor, pick **setupNightlyTrigger** from the function dropdown
   at the top and click **Run**. Authorise it if asked. That schedules the job.
5. To test it without waiting for midnight: tick a row's checkbox, then choose
   **promoteApprovedToFaq** from the dropdown and click **Run**. Check the
   Status column, then look at the FAQ tab in Admin.

### If something goes wrong
The Status column tells you why a row was skipped. For anything else, open
**Executions** in the left sidebar of the Apps Script editor to see the error
from the nightly run.

## Notes
- If you ever edit `chat-log.gs` again, you need to **Deploy → Manage
  deployments → edit (pencil icon) → New version → Deploy** for the
  change to take effect — just saving the script isn't enough.
- Replies only reach a guest whose chat window is still open (or gets
  reopened) on their device — there's no way to "push" a message to a
  guest who has fully left the site, same as any live chat widget.
- This is separate from the "Continue on Messenger" button, which only
  appears when the AI can't answer at all. The chat log records *every*
  conversation, answered or not.
