# Setting up the Telegram bot

SG Map Explorer's bot answers in Telegram from the same live data as the map:

| Command | What it does |
|---|---|
| `/weather <place>` | NEA's 2-hour forecast there; on its own, every town |
| `/rain <place>` | whether the rain gauges near there have rain; on its own, where it's raining |
| `/psi` | air quality (24-hour PSI and PM2.5) by region |
| `/carpark <place>` | the nearest carparks with free car lots |
| a location | the forecast and the rain where it was sent from |
| `/start`, `/help` | what the bot does |

Every reply has an **Open the map** button that opens sgmap.uwuapps.org at that spot with the
right layer on. Replies are Telegram Rich Messages (Bot API 10.1, `sendRichMessage`) with
headings and tables; if Telegram refuses one, the same reply goes as plain text.

Telegram calls the site's webhook, `https://sgmap.uwuapps.org/api/telegram/webhook`, for every
message the bot gets. The webhook checks a secret Telegram sends with each call, then replies.
Nothing about the chats or the people in them is stored.

You'll need: the site deployed on Vercel at sgmap.uwuapps.org, the Telegram app, and a terminal.
Below, replace `<TOKEN>` with the bot's token and `<SECRET>` with the webhook secret. On
Windows PowerShell, type `curl.exe` where it says `curl`.

## 1. Make the bot with @BotFather

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Give it a name people see (for example `SG Map Explorer`) and a username ending in `bot`
   (for example `SGMapExplorerBot`).
3. BotFather replies with the bot's **token**, like `123456789:AA...`. Keep it secret: anyone
   with it can run the bot. Don't paste it into a chat, a doc or a commit.
4. Optional, in BotFather: `/setdescription`, `/setabouttext` and `/setuserpic` (the
   `main-site/ESG-512.png` icon works) for the bot's profile.

## 2. Make the webhook secret

Any random string of letters, digits, `_` and `-`, up to 256 characters. For example:

```sh
openssl rand -hex 32
```

Or in PowerShell:

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

## 3. Set the Vercel environment variables

In the Vercel project, **Settings → Environment Variables**, for Production:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from step 1 |
| `TELEGRAM_WEBHOOK_SECRET` | the secret from step 2 |
| `TELEGRAM_BOT_USERNAME` | the bot's username without the `@`, e.g. `SGMapExplorerBot` (optional: in a group, the bot then answers only its own commands) |

The bot's answers also need the map's own keys: `DATA_GOV_KEY` (weather, rain, PSI; optional,
it raises data.gov.sg's rate limit) and `LTA_ACCOUNT_KEY` (carparks). `ONEMAP_EMAIL` and
`ONEMAP_PASSWORD` are optional: OneMap's place search also works without them.

## 4. Deploy

Redeploy (Deployments → the latest → Redeploy) so the functions pick up the new variables.
Check the webhook is there: opening `https://sgmap.uwuapps.org/api/telegram/webhook` in a
browser should say `{"error":"Only POST"}`.

## 5. Point Telegram at the webhook

```sh
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://sgmap.uwuapps.org/api/telegram/webhook" \
  -d "secret_token=<SECRET>" \
  -d 'allowed_updates=["message"]' \
  -d "drop_pending_updates=true"
```

It should answer `{"ok":true,"result":true,"description":"Webhook was set"}`.

- `secret_token`: Telegram sends it in the `X-Telegram-Bot-Api-Secret-Token` header with every
  call; the webhook refuses any call without the same value as `TELEGRAM_WEBHOOK_SECRET`.
- `allowed_updates=["message"]`: only messages, which is all the bot reads.
- `drop_pending_updates`: forgets anything sent to the bot before the webhook was set.

On PowerShell, the line ends are a backtick (`` ` ``) instead of `\`, and the
`allowed_updates` line is `-d 'allowed_updates=[\"message\"]'`.

## 6. Give the bot its command menu

So Telegram suggests the commands when someone types `/`:

```sh
curl -s "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[{"command":"weather","description":"2-hour forecast for a place"},{"command":"rain","description":"Is it raining near a place"},{"command":"psi","description":"Air quality by region"},{"command":"carpark","description":"Nearest carparks with free lots"},{"command":"help","description":"What the bot does"}]}'
```

## 7. Test it

In Telegram, open the bot and send each of these:

1. `/start`: the help, with a table of the commands and an **Open the map** button.
2. `/weather Tampines`, then `/weather` on its own.
3. `/rain Bishan`, then `/rain` on its own.
4. `/psi`.
5. `/carpark Bugis`.
6. The paperclip → **Location** → send your current location.
7. Tap **Open the map** on any reply: the map should open at that spot, with a red pin and the
   reply's layer turned on.

## Checking on it

```sh
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

- `url` should be the webhook's address and `pending_update_count` near 0.
- `last_error_message` and `last_error_date` say what went wrong last, if anything.

## Troubleshooting

| What you see | What to do |
|---|---|
| The bot says nothing; `getWebhookInfo` shows `401 Unauthorized` | `secret_token` in step 5 and `TELEGRAM_WEBHOOK_SECRET` in Vercel differ, or the variable was set after the last deploy. Set them the same, redeploy, and run step 5 again. |
| The bot says nothing; Vercel's logs say `TELEGRAM_BOT_TOKEN isn't set` | Set it (step 3) and redeploy. |
| `getWebhookInfo` shows `404` or `Wrong response from the webhook: 404` | The URL in step 5 is wrong, or the deploy doesn't have `api/telegram/webhook.js` yet. |
| `getWebhookInfo` shows an SSL or connection error | The domain isn't pointing at Vercel yet; check sgmap.uwuapps.org opens in a browser. |
| Replies come as plain text, without tables | Telegram refused the rich message. Vercel's logs say why (`rich send failed, falling back: ...`). The reply still has everything in it. |
| "NEA's forecast didn't answer just now" | data.gov.sg was down or rate-limited. Setting `DATA_GOV_KEY` raises the limit. |
| "LTA's carpark feed didn't answer just now" | `LTA_ACCOUNT_KEY` isn't set, or LTA DataMall is down. |
| In a group the bot ignores `/psi` | Send `/psi@<bot username>`, or check `TELEGRAM_BOT_USERNAME` matches the bot's username. |
| Old updates arrive all at once after a fix | Run step 5 again with `drop_pending_updates=true`. |

To stop the bot answering: `curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook"`.
If the token ever leaks: in @BotFather, `/revoke`, then put the new token in Vercel and
redeploy (the webhook stays set).
