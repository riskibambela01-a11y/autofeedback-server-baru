export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      msg: "Method Not Allowed"
    });
  }

  try {
    const data = req.body || {};

    if (data.key !== process.env.FEEDBACK_KEY) {
      return res.status(401).json({
        ok: false,
        msg: "Invalid key"
      });
    }

    console.log("AutoFeedback received", {
      kills: data.kills,
      rank: data.rank,
      uid: data.uid,
      playerName: data.playerName,
      time: data.time,
      photoFilename: data.photoFilename
    });

    return res.status(200).json({
      ok: true,
      msg: "Feedback received"
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      msg: "Server error"
    });
  }
}
