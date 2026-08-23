import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT || 3000);
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

function verifySignature(rawBody, signature) {
  if (!CHANNEL_SECRET) return true;
  const expected = crypto.createHmac("sha256", CHANNEL_SECRET).update(rawBody).digest("base64");
  return signature === expected;
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404).end();
    return;
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    // LINEは2秒以内の200応答を期待するので先に返す
    res.writeHead(200).end();

    const signature = req.headers["x-line-signature"];
    if (!verifySignature(raw, signature)) {
      console.warn("署名検証に失敗しました(LINE_CHANNEL_SECRETを確認してください)。中身は表示しますが注意してください。");
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      console.warn("Webhookのbodyのパースに失敗しました:", raw);
      return;
    }

    const events = body.events || [];
    if (events.length === 0) {
      console.log("Webhook受信(検証リクエストなど、eventsは空でした)。");
      return;
    }

    for (const event of events) {
      const userId = event.source?.userId;
      const groupId = event.source?.groupId;
      const roomId = event.source?.roomId;
      console.log("=== Webhookイベント受信 ===");
      console.log("type:", event.type);
      if (userId) console.log("あなたの userId:", userId, "  ← これを LINE_USER_ID に設定してください");
      if (groupId) console.log("groupId:", groupId, "  ← グループに送りたい場合はこちらを LINE_USER_ID に設定");
      if (roomId) console.log("roomId:", roomId);
      if (event.message?.text) console.log("受信テキスト:", event.message.text);
      console.log("===========================");
    }
  });
});

server.listen(PORT, () => {
  console.log(`Webhook受信サーバーを起動しました: http://localhost:${PORT}/webhook`);
  console.log("ngrok等でこのポートを公開し、LINE DevelopersのWebhook URLに設定してください。");
  console.log("設定後、自分のBotへLINEアプリからメッセージを送るとuserIdが表示されます。");
});
