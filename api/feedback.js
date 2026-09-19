function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function validSecret(received, expected) {
  if (
    !received ||
    !expected ||
    typeof received !== "string" ||
    typeof expected !== "string"
  ) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;

  return require("node:crypto").timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

// ==============================
// MASK NICKNAME
// 3 huruf awal + bintang + 3 huruf akhir
// ==============================
function maskNickname(value) {
  const nickname = String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  if (!nickname) {
    return "******";
  }

  // Jika 6 karakter atau kurang, sembunyikan semuanya.
  if (nickname.length <= 6) {
    return "*".repeat(nickname.length);
  }

  const first = nickname.slice(0, 3);
  const last = nickname.slice(-3);
  const middle = "*".repeat(nickname.length - 6);

  return first + middle + last;
}

// ==============================
// MASK UID
// 3 angka awal + bintang + 2 angka akhir
// ==============================
function maskUid(value) {
  const uid = String(value ?? "").trim();

  if (!uid) {
    return "******";
  }

  if (uid.length <= 5) {
    return "*".repeat(uid.length);
  }

  return (
    uid.slice(0, 3) +
    "*".repeat(uid.length - 5) +
    uid.slice(-2)
  );
}

export default async function handler(req, res) {
  // ==============================
  // METHOD
  // ==============================
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return json(res, 405, {
      ok: false,
      error: "method_not_allowed"
    });
  }

  // ==============================
  // ENV
  // ==============================
  const expectedKey = process.env.AFB_SECRET_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!expectedKey || !botToken || !chatId) {
    return json(res, 500, {
      ok: false,
      error: "server_not_configured"
    });
  }

  // ==============================
  // JSON BODY
  // ==============================
  let data;

  try {
    data =
      typeof req.body === "object"
        ? req.body
        : JSON.parse(req.body || "{}");
  } catch {
    return json(res, 400, {
      ok: false,
      error: "invalid_json"
    });
  }

  // ==============================
  // SECRET KEY
  // ==============================
  if (!validSecret(data.key, expectedKey)) {
    return json(res, 401, {
      ok: false,
      error: "invalid_key"
    });
  }

  // ==============================
  // REQUIRED DATA
  // ==============================
  const required = [
    "uid",
    "playerName",
    "kills",
    "rank",
    "time",
    "photoBase64"
  ];

  for (const field of required) {
    if (
      typeof data[field] !== "string" ||
      !data[field].trim()
    ) {
      return json(res, 400, {
        ok: false,
        error: `missing_${field}`
      });
    }
  }

  // ==============================
  // PHOTO
  // ==============================
  const rawBase64 = data.photoBase64.replace(
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    ""
  );

  let image;

  try {
    image = Buffer.from(rawBase64, "base64");
  } catch {
    return json(res, 400, {
      ok: false,
      error: "invalid_photo"
    });
  }

  if (image.length < 500 || image.length > 3500000) {
    return json(res, 413, {
      ok: false,
      error: "photo_too_large_or_empty"
    });
  }

  // ==============================
  // MASK DATA
  // ==============================
  const maskedNickname = maskNickname(data.playerName);
  const maskedUid = maskUid(data.uid);

  // ==============================
  // PUBG VERSION
  // ==============================
  const pubgVersion =
    String(data.pubgVersion || "").trim() || "Tidak diketahui";

  // ==============================
  // TELEGRAM CAPTION
  // ==============================
  const caption =
    "╔═══━━━─── • ───━━━═══╗\n" +
    "   𓆩 🏆 𓆪 ◀ B A N ▶ 𓆩 🏆 𓆪\n" +
    "       𖤐 AUTO FEEDBACK 𖤐\n" +
    "╚═══━━━─── • ───━━━═══╝\n" +
    "🏆 PAK LUA VIP MOD BAN 🏆\n" +
    "🔥 AUTO FEEDBACK 🔥\n" +
    "⏱ Time: " + htmlEscape(data.time) + "\n" +
    "🎮 PUBG: " + htmlEscape(pubgVersion) + "\n" +
    "🧪 Bahan: AUTOFEEDBACK V4\n" +
    "👤 Nickname: " + htmlEscape(maskedNickname) + "\n" +
    "🔑 UID: " + htmlEscape(maskedUid) + "\n" +
    "🔫 Count Kill: " + htmlEscape(data.kills) + "\n" +
    "🏅 Rank: " + htmlEscape(data.rank) + "\n\n" +
    "⚡ 𓆩 VIP LUA 𓆪 ⚡";

  // ==============================
  // TELEGRAM FORM
  // ==============================
  const form = new FormData();

  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");

  form.append(
    "photo",
    new Blob(
      [image],
      {
        type: data.photoMimeType || "image/jpeg"
      }
    ),
    data.photoFilename || "win.jpg"
  );

  // ==============================
  // SEND TELEGRAM
  // ==============================
  let telegramResponse;

  try {
    telegramResponse = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendPhoto`,
      {
        method: "POST",
        body: form
      }
    );
  } catch {
    return json(res, 502, {
      ok: false,
      error: "telegram_network_error"
    });
  }

  // ==============================
  // TELEGRAM RESPONSE
  // ==============================
  let telegramData = {};

  try {
    telegramData = await telegramResponse.json();
  } catch {}

  if (!telegramResponse.ok || !telegramData.ok) {
    return json(res, 502, {
      ok: false,
      error: "telegram_error"
    });
  }

  // ==============================
  // SUCCESS
  // ==============================
  return json(res, 200, {
    ok: true,
    message_id:
      telegramData.result?.message_id ?? null
  });
}
