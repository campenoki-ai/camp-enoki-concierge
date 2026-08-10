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
