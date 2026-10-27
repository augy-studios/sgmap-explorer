// POST /api/telegram/webhook: every update Telegram sends the bot (SETUP.md sets it up).
//
// Telegram proves a call is its own by echoing setWebhook's secret_token in the
// X-Telegram-Bot-Api-Secret-Token header; that's compared in constant time to
// TELEGRAM_WEBHOOK_SECRET. There's no request signing. A call without it gets 401 and nothing
// else happens.
//
// The replies (api/_lib/bot.js) go out as rich messages with a plain fallback
// (api/_lib/telegram.js), or as one plain line. Once the secret matches it always answers 200,
// even when the reply couldn't be sent, so Telegram doesn't send the same update again and again.
// Nothing about the chat or its people is stored.

import { replyTo } from "../_lib/bot.js";
import { sendError, sendJson } from "../_lib/respond.js";
import { botConfigured, sameSecret, sendRichTelegram, sendTelegram } from "../_lib/telegram.js";

// Vercel parses a JSON body; anything else arrives as a string or a Buffer.
function update(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  try {
    return JSON.parse(Buffer.isBuffer(b) ? b.toString("utf8") : String(b || ""));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendError(res, 405, "Only POST");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.headers["x-telegram-bot-api-secret-token"];
  // Logged: a webhook Telegram can't get through to just goes quiet. getWebhookInfo shows the 401.
  if (!secret) {
    console.warn("[sgmap] telegram webhook: TELEGRAM_WEBHOOK_SECRET isn't set; refusing the update");
    return sendError(res, 401, "Not allowed");
  }
  if (!sameSecret(given, secret)) {
    console.warn(`[sgmap] telegram webhook: secret token ${given ? "doesn't match" : "missing"}; check setWebhook's secret_token`);
    return sendError(res, 401, "Not allowed");
  }
  if (!botConfigured()) {
    console.warn("[sgmap] telegram webhook: TELEGRAM_BOT_TOKEN isn't set, so the bot can't reply");
    return sendJson(res, 200, { ok: true });
  }

  const message = update(req)?.message;
  const chatId = message?.chat?.id;
  if (chatId == null || (typeof message.text !== "string" && !message.location)) return sendJson(res, 200, { ok: true });

  try {
    const reply = await replyTo(message, process.env.TELEGRAM_BOT_USERNAME || "");
    if (reply?.markdown) await sendRichTelegram(chatId, reply);
    else if (reply?.text) await sendTelegram(chatId, reply.text, reply.button);
  } catch (err) {
    console.warn(`[sgmap] telegram reply failed: ${err?.message ?? err}`);
  }
  return sendJson(res, 200, { ok: true });
}
