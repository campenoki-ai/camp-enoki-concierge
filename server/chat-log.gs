/**
 * chat-log.gs
 * Google Apps Script Web App behind the Enoki AI Concierge. Three jobs:
 *
 *  1. doPost  — logs every conversation to a Sheet.
 *  2. doGet   — serves back any reply the owner typed, so the guest's open
 *               chat window picks it up within a few seconds.
 *  3. promoteApprovedToFaq — runs nightly, and adds the rows the owner ticked
 *               to the live FAQ on GitHub so they are answered for free
 *               (and instantly) from then on.
 *
 * Setup: see CHAT_LOG_SETUP.md
 */

const SHEET_NAME = "Chat Log";
const HEADERS = ["Time", "Conversation ID", "Guest Question", "AI Answer", "Language", "Owner Reply", "Add to FAQ?", "Status"];

// Column positions (1-based, for Sheet ranges).
const COL = { TIME: 1, CONV: 2, QUESTION: 3, AI_ANSWER: 4, LANG: 5, OWNER_REPLY: 6, APPROVE: 7, STATUS: 8 };

// An unanswered fallback must never become a FAQ answer.
const NO_ANSWER_MARKERS = ["i don't know the answer yet", "hindi ko pa alam ang sagot"];

// Only used when the AI proxy can't be reached — keeps the crude keyword
// fallback from filling up with "there", "have", "your" and friends.
const FALLBACK_STOPWORDS = "the a an is are do does did you your we our can could would will have has may might there here what when where why how and or but for from with about ang mga ng sa na po ba ito yan yung may meron pwede ka kayo ako namin natin".split(" ");

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  ensureHeaders_(sheet);
  return sheet;
}

/** Adds the approval/status columns to a Sheet created before they existed. */
function ensureHeaders_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (current[COL.STATUS - 1] === HEADERS[COL.STATUS - 1]) return;
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  const rows = sheet.getLastRow() - 1;
  if (rows > 0) {
    sheet.getRange(2, COL.APPROVE, rows, 1).insertCheckboxes();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Guest's browser calls this once per exchange to log the question + answer. */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    sheet.appendRow([new Date(), String(data.conversationId || ""), String(data.question || ""), String(data.answer || ""), String(data.lang || ""), "", false, ""]);
    sheet.getRange(sheet.getLastRow(), COL.APPROVE).insertCheckboxes();
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Guest's browser polls this for a staff reply typed into "Owner Reply". */
function doGet(e) {
  const conversationId = (e.parameter.conversationId || "").trim();
  if (!conversationId) return json_({ replies: [] });

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const replies = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (String(row[COL.CONV - 1] || "") === conversationId) {
      const reply = String(row[COL.OWNER_REPLY - 1] || "").trim();
      if (reply) replies.push({ rowId: i + 1, text: reply });
    }
  }
  return json_({ replies });
}

// ---------------------------------------------------------------------------
// Nightly: promote approved rows into the live FAQ
// ---------------------------------------------------------------------------

function config_() {
  const p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty("GITHUB_TOKEN"),
    owner: p.getProperty("GITHUB_OWNER") || "campenoki-ai",
    repo: p.getProperty("GITHUB_REPO") || "camp-enoki-concierge",
    branch: p.getProperty("GITHUB_BRANCH") || "main",
    aiProxyUrl: p.getProperty("AI_PROXY_URL") || "",
  };
}

/** Run this once by hand to schedule the nightly job for midnight. */
function setupNightlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "promoteApprovedToFaq")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("promoteApprovedToFaq").timeBased().atHour(0).nearMinute(15).everyDays(1).create();
  return "Nightly trigger created for ~12:00 AM (script timezone).";
}

function promoteApprovedToFaq() {
  const cfg = config_();
  if (!cfg.token) throw new Error("Set GITHUB_TOKEN in Project Settings > Script Properties first.");

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  // Collect the ticked rows that haven't been handled yet.
  const pending = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[COL.APPROVE - 1] !== true) continue;
    if (String(row[COL.STATUS - 1] || "").trim()) continue;

    const question = String(row[COL.QUESTION - 1] || "").trim();
    const ownerReply = String(row[COL.OWNER_REPLY - 1] || "").trim();
    const aiAnswer = String(row[COL.AI_ANSWER - 1] || "").trim();
    const answer = ownerReply || aiAnswer;
    const rowNum = i + 1;

    if (!question || !answer) {
      setStatus_(sheet, rowNum, "Skipped: no question or answer");
      continue;
    }
    if (!ownerReply && isNoAnswer_(aiAnswer)) {
      setStatus_(sheet, rowNum, "Skipped: nothing was answered — type an Owner Reply first");
      continue;
    }
    pending.push({ rowNum: rowNum, question: question, answer: answer, source: ownerReply ? "owner reply" : "AI answer" });
  }

  if (!pending.length) return "Nothing ticked to add.";

  const file = githubGetFaq_(cfg);
  const faqs = file.faqs;
  const existing = {};
  faqs.forEach(function (f) {
    existing[normalize_(f.question)] = true;
  });

  const added = [];
  pending.forEach(function (item) {
    if (existing[normalize_(item.question)]) {
      setStatus_(sheet, item.rowNum, "Skipped: already in the FAQ");
      return;
    }
    const entry = {
      id: uniqueId_(item.question, faqs),
      category: "general",
      keywords: buildKeywords_(item.question, cfg),
      question: item.question,
      answer: item.answer,
      language: "auto",
      images: [],
      videos: [],
      buttons: [],
      priority: 5,
    };
    faqs.push(entry);
    existing[normalize_(item.question)] = true;
    added.push({ rowNum: item.rowNum, source: item.source });
  });

  if (!added.length) return "Nothing new to add.";

  githubPutFaq_(cfg, faqs, file.sha, added.length);

  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  added.forEach(function (a) {
    setStatus_(sheet, a.rowNum, "Added " + stamp + " (" + a.source + ")");
  });

  return "Added " + added.length + " entries to the FAQ.";
}

function setStatus_(sheet, rowNum, text) {
  sheet.getRange(rowNum, COL.STATUS).setValue(text);
}

function isNoAnswer_(text) {
  const t = String(text || "").toLowerCase();
  return NO_ANSWER_MARKERS.some(function (m) {
    return t.indexOf(m) !== -1;
  });
}

function normalize_(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueId_(question, faqs) {
  let base = normalize_(question).split(" ").slice(0, 6).join("-");
  if (!base) base = "faq";
  const taken = {};
  faqs.forEach(function (f) {
    taken[f.id] = true;
  });
  let id = base;
  let n = 2;
  while (taken[id]) id = base + "-" + n++;
  return id;
}

/** Asks the existing Claude proxy for search keywords. The proxy already holds
 *  the API key, so no extra secret is needed here. Falls back to the question's
 *  own words if the proxy is unavailable. */
function buildKeywords_(question, cfg) {
  const fallback = normalize_(question)
    .split(" ")
    .filter(function (w) {
      return w.length > 2 && FALLBACK_STOPWORDS.indexOf(w) === -1;
    })
    .slice(0, 8);

  if (!cfg.aiProxyUrl) return fallback;
  try {
    const res = UrlFetchApp.fetch(cfg.aiProxyUrl, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify({
        query: question,
        context: " ",
        systemPromptOverride:
          "You generate search keywords for a Philippine resort's FAQ. Given a guest's question, reply with 6-10 short lowercase search terms a guest might type, comma-separated, nothing else. Include natural Tagalog/Taglish variants. No sentences, no explanation.",
      }),
    });
    if (res.getResponseCode() !== 200) return fallback;
    const text = String(JSON.parse(res.getContentText()).text || "");
    const words = text
      .split(",")
      .map(function (w) {
        return w.trim().toLowerCase();
      })
      .filter(function (w) {
        return w && w.length < 40 && w.indexOf("\n") === -1;
      });
    return words.length ? words.slice(0, 12) : fallback;
  } catch (err) {
    return fallback;
  }
}

function githubGetFaq_(cfg) {
  const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/data/faq.json?ref=" + encodeURIComponent(cfg.branch);
  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" },
  });
  if (res.getResponseCode() !== 200) throw new Error("Could not read faq.json from GitHub (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 200));
  const body = JSON.parse(res.getContentText());
  const text = Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, ""))).getDataAsString("UTF-8");
  return { faqs: JSON.parse(text), sha: body.sha };
}

function githubPutFaq_(cfg, faqs, sha, count) {
  const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/data/faq.json";
  const content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(faqs, null, 2) + "\n").getBytes());
  const res = UrlFetchApp.fetch(url, {
    method: "put",
    muteHttpExceptions: true,
    contentType: "application/json",
    headers: { Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json" },
    payload: JSON.stringify({
      message: "Add " + count + " approved FAQ " + (count === 1 ? "entry" : "entries") + " from the chat log",
      content: content,
      sha: sha,
      branch: cfg.branch,
    }),
  });
  if (res.getResponseCode() >= 300) throw new Error("Could not write faq.json to GitHub (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 200));
}
