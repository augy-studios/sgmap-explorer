// The Telegram Bot API over HTTPS, for the bot's webhook (api/telegram/webhook.js), with the
// token read here and sent only in the Bot API's own URL.
//
// Rich Messages (Bot API 10.1, sendRichMessage), per docs/telethon-richmessage-retrofit.md
// adapted to the HTTP Bot API, as OneLink GFTV's bot does it: every structured reply is
// { markdown, fallback }, Rich Markdown for clients that render it and plain text carrying the
// same information. sendRichMessage has no plain field of its own, so the fallback goes out with
// sendMessage whenever the rich send is refused, and the reason is logged. One-line notices
// ("Couldn't find that place.") are plain sendMessage.

import { timingSafeEqual } from "node:crypto";

const API = "https://api.telegram.org";

export const botConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

async function callBot(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN isn't set");
  const r = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    // Telegram's own description of what it refused; never the token, which is only in the URL.
    const body = await r.text().catch(() => "");
    throw new Error(`telegram ${method} ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json().catch(() => null);
}

// An "Open the map" button under a reply, when it has a link.
const keyboard = (button) => (button ? { reply_markup: { inline_keyboard: [[{ text: button.text, url: button.url }]] } } : {});

// Plain text, no parse_mode.
export function sendTelegram(chatId, text, button) {
  return callBot("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...keyboard(button) });
}

// A rich message, or its fallback when Telegram won't take it (an older client, a parse error).
export async function sendRichTelegram(chatId, rich) {
  if (!rich?.fallback) throw new Error("a rich message needs a plain fallback");
  try {
    return await callBot("sendRichMessage", { chat_id: chatId, rich_message: { markdown: rich.markdown }, ...keyboard(rich.button) });
  } catch (err) {
    console.warn(`[sgmap] rich send failed, falling back: ${err?.message ?? err}`);
    return sendTelegram(chatId, rich.fallback, rich.button);
  }
}

// Data escaped for Rich Markdown: the spec's set, plus "<", since Rich Markdown takes HTML tags
// too (as OneLink GFTV's bot does). Markup written in the builders isn't escaped.
const MD_SPECIAL = /([\\*_~`|[\]#>=<])/g;

export function escapeMd(text) {
  return String(text ?? "").replace(MD_SPECIAL, "\\$1");
}

// A table cell: escaped, and on one line.
export function escapeCell(text) {
  return escapeMd(String(text ?? "").replace(/\r?\n/g, " "));
}

// The spec's table: a blank corner cell over the rows' labels, so each row is
// [label, ...values], one value under each of `headers`.
export function richTable(headers, rows) {
  return [
    `| ${["", ...headers].map(escapeCell).join(" | ")} |`,
    `| ${Array(headers.length + 1).fill("---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

// The webhook's secret, compared in constant time.
export function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
