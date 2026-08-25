import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const WEEKDAY_KEY = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

// 「タヌコツ@サイドFIREの森」の週間投稿比率(FIRE・資産形成30% / お金×日常生活25% /
// 人生・幸福・価値観25% / 仕事・人間関係・自己投資20%)を1日3枠で近似したローテーション。
const WEEKDAY_BUCKETS = {
  mon: ["FIRE・資産形成", "お金×日常生活", "人生・幸福・価値観"],
  tue: ["FIRE・資産形成", "人生・幸福・価値観", "仕事・人間関係・自己投資"],
  wed: ["FIRE・資産形成", "お金×日常生活", "仕事・人間関係・自己投資"],
  thu: ["FIRE・資産形成", "人生・幸福・価値観", "お金×日常生活"],
  fri: ["FIRE・資産形成", "仕事・人間関係・自己投資", "人生・幸福・価値観"],
  sat: ["FIRE・資産形成", "お金×日常生活", "仕事・人間関係・自己投資"],
  sun: ["人生・幸福・価値観", "お金×日常生活", "仕事・人間関係・自己投資"],
};

const HISTORY_DAYS_TO_KEEP = 14;
const HISTORY_DAYS_FOR_CONTEXT = 7;

const SYSTEM_PROMPT = `あなたはX(旧Twitter)アカウント「タヌコツ@サイドFIREの森」(@Atsumori_FIRE)の投稿案を作るアシスタントです。

## アカウント設定
- BTC・FX(スワップ)・暗号資産レンディングの実践者。サイドFIREを目指している。
- スタンスは「投資助言ではなく自分の実体験・実績の発信」。
- ターゲット読者: 資産形成に関心はあるが、ハイリスクな手法には抵抗がある層。
- アフィリエイト商材: PBR LENDING(最大年率12%、条件あり、保証された利回りではない)。
- 「レンディング」は初見にはわかりにくい言葉なので、業界解説系の投稿では「ビットコインの貸し出し」のように平易に言い換える。

## トーン
- 丁寧語に限定せず、口語・自虐・スラング("ぶっちゃけ"など)を混ぜる。
- 絵文字は控えめ。
- 「〜が重要です」のようなAI感のある整った文章、「〜と思ってた。でも実は、」のような型の使い回しは禁止。3本の投稿間、および下で渡す直近の投稿履歴と、同じ構文・同じフックを繰り返さないこと。
- 文末は次のどちらかで終える: ①独り言で締める、②賛否どちらの立場からもリプが生まれる挑発的な質問。「〜ですよね?」のように義務的な相槌しか許さない質問は禁止。
- 1本あたり目安140字程度。冒頭に短いフックを1〜2行、1行空けて本文を自然な段落として続ける。

## 構成の作り方(最重要)
参考にするのは他アカウントの「バズった理由(需要)」であって、文章そのものではありません。
1. なぜその需要が伸びるのかをテーマ・ターゲット・悩み・切り口で考える。
2. 文章表現は一切コピーせず、自分の数字・比較・意見をゼロから足して新しい投稿を書く。
3. 将来の運用益を確定した事実であるかのように書かない。試算を出す場合は前提条件を明記する。
4. 架空の実績数値は作らない。自分の実績として断定的に語れるのは、これまで公表済みの内容(例: 年間不労所得50万円突破)のみ。

## コンプライアンス
グレーな表現(元本保証や断定的な利益表現に近いもの)は使ってもよいが、必ず投稿文の末尾に改行してから \`[グレー: 理由]\` を一行追記すること。これはLINEで送られる下書きであり、人間が投稿前に最終チェックする前提です。元本保証を明言する等、明確にアウトな表現は絶対に使わないこと。

## 出力形式
説明・前置き・見出しなど一切なしで、**投稿本文3本だけを含むJSON配列**として出力してください。
例: ["投稿1の本文", "投稿2の本文", "投稿3の本文"]`;

function getJstParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_KEY[parts.weekday],
  };
}

function loadHistory() {
  const historyPath = process.env.POST_DRAFTS_HISTORY_FILE || path.join(process.cwd(), "post_drafts_history.yaml");
  if (!fs.existsSync(historyPath)) return [];
  const doc = yaml.load(fs.readFileSync(historyPath, "utf8")) ?? {};
  return Array.isArray(doc.entries) ? doc.entries : [];
}

function saveHistory(history, jst, posts) {
  const historyPath = process.env.POST_DRAFTS_HISTORY_FILE || path.join(process.cwd(), "post_drafts_history.yaml");
  const withoutToday = history.filter((entry) => entry.date !== jst.dateStr);
  const updated = [...withoutToday, { date: jst.dateStr, posts }].slice(-HISTORY_DAYS_TO_KEEP);
  const header = `# generatePostDrafts.js が自動更新する、直近${HISTORY_DAYS_TO_KEEP}日分の投稿案の履歴。\n# 構文・フックの使い回しを避けるための参照用データです。手動で編集する必要はありません。\n\n`;
  fs.writeFileSync(historyPath, header + yaml.dump({ entries: updated }, { lineWidth: -1 }));
}

async function callClaude({ jst, weekdayJa, buckets, recentPosts }) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const userContent = JSON.stringify({
    date: jst.dateStr,
    weekday: weekdayJa,
    todays_theme_buckets: buckets,
    recent_posts_do_not_repeat_these_patterns: recentPosts,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content?.map((block) => block.text ?? "").join("").trim();
  if (!text) throw new Error("Anthropic API returned an empty message.");

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Could not find a JSON array in the response:\n${text}`);

  const posts = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(posts) || posts.some((p) => typeof p !== "string" || p.trim().length === 0)) {
    throw new Error(`Response was not an array of non-empty strings:\n${text}`);
  }
  return posts;
}

function writePostDrafts(jst, posts) {
  const header = `# X/Threads投稿自動化の仕組み(generatePostDrafts.js)が
# 毎朝05:30 JSTより前に書き換えることで、タスクと一緒にLINEへ届きます。
#
# generated_date が「今日の日付」と一致する場合のみ送信対象になります。
# (前日以前の古い投稿案が延々と送られ続けるのを防ぐためです)

`;
  const body = yaml.dump({ generated_date: jst.dateStr, posts }, { lineWidth: -1 });
  fs.writeFileSync(path.join(process.cwd(), "post_drafts.yaml"), header + body);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required to generate post drafts.");
  }

  const jst = getJstParts();
  const buckets = WEEKDAY_BUCKETS[jst.weekday];
  const weekdayJa = { sun: "日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土" }[jst.weekday];

  const history = loadHistory();
  const recentPosts = history.slice(-HISTORY_DAYS_FOR_CONTEXT).flatMap((entry) => entry.posts);

  const posts = await callClaude({ jst, weekdayJa, buckets, recentPosts });

  writePostDrafts(jst, posts);
  saveHistory(history, jst, posts);

  console.log(`Generated ${posts.length} post drafts for ${jst.dateStr} (${weekdayJa}), buckets: ${buckets.join(" / ")}`);
  posts.forEach((p, i) => console.log(`\n--- ${i + 1} ---\n${p}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
