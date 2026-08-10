/**
 * chat-log.gs
 * Google Apps Script Web App that logs every Enoki AI Concierge conversation
 * to a Sheet, and lets the resort owner type a reply directly into a cell —
 * the guest's chat widget polls this same endpoint and picks up the reply.
 *
 * Setup: see ../server/CHAT_LOG_SETUP.md
 */

const SHEET_NAME = "Chat Log";
const HEADERS = ["Time", "Conversation ID", "Guest Question", "AI Answer", "Language", "Owner Reply"];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Guest's browser calls this once per exchange to log the question + AI's answer. */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    sheet.appendRow([new Date(), String(data.conversationId || ""), String(data.question || ""), String(data.answer || ""), String(data.lang || ""), ""]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Guest's browser polls this every few seconds to check for a staff reply
 *  typed into the "Owner Reply" column for any of its own rows. */
function doGet(e) {
  const conversationId = (e.parameter.conversationId || "").trim();
  if (!conversationId) return json_({ replies: [] });

  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const replies = [];
  // Row 1 is the header, so data starts at index 1 (sheet row 2).
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowConversationId = String(row[1] || "");
    const ownerReply = String(row[5] || "").trim();
    if (rowConversationId === conversationId && ownerReply) {
      replies.push({ rowId: i + 1, text: ownerReply });
    }
  }
  return json_({ replies });
}
