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

  // Constant-time comparison when lengths match.
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  if (a.length !== b.length) return false;

  return require("node:crypto").timingSafeEqual(a, b);
}

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return json(res, 405, {
      ok: false,
      error: "method_not_allowed"
    });
  }

  const expectedKey = process.env.AFB_SECRET_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!expectedKey || !botToken || !chatId) {
    return json(res, 500, {
      ok: false,
      error: "server_not_configured"
    });
  }

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

  if (!validSecret(data.key, expectedKey)) {
    return json(res, 401, {
      ok: false,
      error: "invalid_key"
    });
  }

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

  // Basic protection against accidentally sending non-image data.
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

  // Keep requests practical for serverless deployments.
  if (image.length < 500 || image.length > 3_500_000) {
    return json(res, 413, {
      ok: false,
      error: "photo_too_large_or_empty"
    });
  }

  // ==========================================
  // MASK IDENTITY
  // ==========================================

  // Nickname selalu menjadi 6 tanda bintang.
  const maskedNickname = "******";

  // UID:
  // 3 angka awal tetap terlihat
  // bagian tengah menjadi *
  // 2 angka terakhir tetap terlihat
  //
  // Contoh:
  // 52512345687
  // menjadi:
  // 525******87

  const uid = String(data.uid);

  const maskedUid =
    uid.length > 5
      ? uid.slice(0, 3) +
        "*".repeat(uid.length - 5) +
        uid.slice(-2)
      : "*".repeat(uid.length);

  // ==========================================
  // PUBG VERSION
  // ==========================================

  // Dikirim dari Lua.
  // Jika belum dikirim oleh Lua lama, tampilkan
  // "Tidak diketahui" agar AutoFeedback tetap bekerja.
  const pubgVersion =
    typeof data.pubgVersion === "string" &&
    data.pubgVersion.trim()
      ? data.pubgVersion.trim()
      : "Tidak diketahui";

  // ==========================================
  // TELEGRAM CAPTION
  // ==========================================

  const caption =
    "╔═══━━━─── • ───━━━═══╗\n" +
    "   𓆩 🏆 𓆪 ◀ B A N  ▶ 𓆩 🏆 𓆪 \n" +
    "       𖤐 AUTO FEEDBACK 𖤐    \n" +
    "╚═══━━━─── • ───━━━═══╝\n" +
    "🏆 PAK LUA VIP MOD BAN  🏆\n" +
    "🔥 AUTO FEEDBACK 🔥\n" +
    "⏱ Time: " + htmlEscape(data.time) + "\n" +
    "🎮 PUBG: " + htmlEscape(pubgVersion) + "\n" +
    "👤 Nickname: " + htmlEscape(maskedNickname) + "\n" +
    "🔑 UID: " + htmlEscape(maskedUid) + "\n" +
    "🔫 Count Kill: " + htmlEscape(data.kills) + "\n" +
    "🏅 Rank: " + htmlEscape(data.rank) + "\n\n" +
    "⚡ 𓆩 VIP LUA 𓆪 ⚡";

  // ==========================================
  // SEND PHOTO TO TELEGRAM
  // ==========================================

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

  return json(res, 200, {
    ok: true,
    message_id:
      telegramData.result?.message_id ?? null
  });
}
