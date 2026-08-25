import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

// 事前生成した post_drafts_queue.yaml から「今日の日付」に一致するentryを
// 取り出して post_drafts.yaml に書き込むだけの、無料(API呼び出しなし)の仕組み。
//
// キューが尽きた場合の補充ルールは POST_DRAFT_GUIDELINES.md を参照してください。

function getJstDateStr(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function loadQueue() {
  const queuePath = process.env.POST_DRAFTS_QUEUE_FILE || path.join(process.cwd(), "post_drafts_queue.yaml");
  if (!fs.existsSync(queuePath)) return [];
  const doc = yaml.load(fs.readFileSync(queuePath, "utf8")) ?? {};
  return Array.isArray(doc.entries) ? doc.entries : [];
}

function writePostDrafts(dateStr, posts) {
  const header = `# X/Threads投稿自動化の仕組み(generatePostDrafts.js)が
# 毎朝05:30 JSTより前に書き換えることで、タスクと一緒にLINEへ届きます。
#
# generated_date が「今日の日付」と一致する場合のみ送信対象になります。
# (前日以前の古い投稿案が延々と送られ続けるのを防ぐためです)

`;
  const body = yaml.dump({ generated_date: dateStr, posts }, { lineWidth: -1 });
  fs.writeFileSync(path.join(process.cwd(), "post_drafts.yaml"), header + body);
}

function main() {
  const dateStr = getJstDateStr();
  const queue = loadQueue();
  const todaysEntry = queue.find((entry) => entry.date === dateStr);

  if (!todaysEntry) {
    console.warn(
      `No queued post drafts for ${dateStr}. post_drafts_queue.yaml may be exhausted or missing this date - ` +
        `see POST_DRAFT_GUIDELINES.md for how to refill it. Writing an empty post_drafts.yaml.`,
    );
    writePostDrafts("", []);
    return;
  }

  writePostDrafts(dateStr, todaysEntry.posts);
  console.log(`Wrote ${todaysEntry.posts.length} post drafts for ${dateStr} from the queue.`);

  const remaining = queue.filter((entry) => entry.date > dateStr).length;
  console.log(`${remaining} day(s) remaining in the queue after today.`);
  if (remaining <= 7) {
    console.warn(`Only ${remaining} day(s) left in post_drafts_queue.yaml - time to refill soon.`);
  }
}

main();
