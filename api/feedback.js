module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      msg: "Method Not Allowed"
    });
  }

  try {
    const data = req.body || {};

    // Cek key
    if (data.key !== process.env.FEEDBACK_KEY) {
      return res.status(401).json({
        ok: false,
        msg: "Invalid key"
      });
    }

    // Cek foto
    if (!data.photoBase64) {
      return res.status(400).json({
        ok: false,
        msg: "Photo missing"
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return res.status(500).json({
        ok: false,
        msg: "Telegram configuration missing"
      });
    }

    // Bersihkan prefix Base64 jika ada
    const base64 = data.photoBase64.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    const imageBuffer = Buffer.from(base64, "base64");

    // Caption Telegram
    const caption =
      "🤖 AUTO FEEDBACK VIP\n\n" +
      "👤 Player: " + (data.playerName || "-") + "\n" +
      "🆔 UID: " + (data.uid || "-") + "\n" +
      "🎯 Kills: " + (data.kills ?? "-") + "\n" +
      "🏆 Rank: " + (data.rank ?? "-") + "\n" +
      "🕒 Time: " + (data.time || "-");

    const form = new FormData();

    form.append("chat_id", chatId);
    form.append("caption", caption);

    form.append(
      "photo",
      new Blob([imageBuffer], {
        type: data.photoMimeType || "image/jpeg"
      }),
      data.photoFilename || "win.jpg"
    );

    // Kirim ke Telegram
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        body: form
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      console.error("Telegram error:", telegramData);

      return res.status(502).json({
  ok: false,
  msg: "Telegram send failed",
  error: telegramData.description || "Unknown Telegram error"
});

    console.log("AutoFeedback sent to Telegram");

    return res.status(200).json({
      ok: true,
      msg: "Feedback sent"
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      ok: false,
      msg: "Server error"
    });
  }
};
