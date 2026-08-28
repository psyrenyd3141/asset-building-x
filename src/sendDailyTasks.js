import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const WEEKDAY_KEY = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
const WEEKDAY_JA = { sun: "日", mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土" };
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

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
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function isTaskToday(task, jst) {
  if (task.date) return task.date === jst.dateStr;
  if (task.recurrence === "daily") return true;
  if (task.recurrence === "weekly") return Array.isArray(task.days) && task.days.includes(jst.weekday);
  return false;
}

function loadTodaysTasks(jst) {
  const tasksPath = process.env.TASKS_FILE || path.join(process.cwd(), "tasks.yaml");
  const doc = yaml.load(fs.readFileSync(tasksPath, "utf8")) ?? {};
  const allTasks = Array.isArray(doc.tasks) ? doc.tasks : [];

  return allTasks
    .filter((task) => isTaskToday(task, jst))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1));
}

function loadTodaysPostDrafts(jst) {
  const draftsPath = process.env.POST_DRAFTS_FILE || path.join(process.cwd(), "post_drafts.yaml");
  if (!fs.existsSync(draftsPath)) return [];

  const doc = yaml.load(fs.readFileSync(draftsPath, "utf8")) ?? {};
  if (doc.generated_date !== jst.dateStr) return [];

  const posts = Array.isArray(doc.posts) ? doc.posts : [];
  return posts.filter((p) => typeof p === "string" && p.trim().length > 0);
}

function buildPlainMessage(tasks, jst, postDrafts) {
  const header = `おはようございます☀️\n本日 ${jst.month}/${jst.day}(${WEEKDAY_JA[jst.weekday]}) のタスクです。`;

  const taskSection =
    tasks.length === 0
      ? "本日予定されているタスクはありません。"
      : tasks.map((t, i) => `${i + 1}. ${t.priority === "high" ? "🔴 " : ""}${t.title}`).join("\n");

  const draftSection =
    postDrafts.length > 0
      ? `\n\n📝 今日の投稿案\n${postDrafts.map((p, i) => `${i + 1}. ${p}`).join("\n\n")}`
      : "";

  return `${header}\n\n${taskSection}${draftSection}\n\n今日も一日頑張りましょう!`;
}

async function buildAiMessage(tasks, jst, postDrafts) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const system = [
    "あなたはユーザー専属の優秀でフレンドリーなAI秘書です。",
    "LINEで毎朝送る短いメッセージを作成します。",
    "渡された今日のタスクリストの内容は変えず、すべて含めてください（タスクが0件なら「今日は予定タスクなし」と伝えてください）。",
    "postDraftsが渡された場合は、SNS投稿案としてタスクとは別のセクションに分け、文面を一切変更せずそのまま全文含めてください。",
    "朝の挨拶、今日の日付と曜日、タスクの要点整理、前向きな一言を含め、絵文字は適度に使い、日本語で書いてください。",
    "postDraftsがある場合は文字数上限を気にせず全文を含めてください。ない場合は300文字以内にまとめてください。",
    "余計な前置きや説明文は付けず、LINEにそのまま送れる本文のみを出力してください。",
  ].join("\n");

  const userContent = JSON.stringify({
    date: jst.dateStr,
    weekday: WEEKDAY_JA[jst.weekday],
    tasks: tasks.map((t) => ({ title: t.title, priority: t.priority || "normal" })),
    postDrafts,
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
      max_tokens: 400,
      system,
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
  return text;
}

async function alreadySentToday(jst) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const currentRunId = process.env.GITHUB_RUN_ID;
  if (!token || !repo) return false; // ローカル実行など、判定できない場合は素通りする

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/daily-secretary.yml/runs?status=success&per_page=20`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } },
  );
  if (!res.ok) return false; // API障害時はブロックせず送信を優先する

  const data = await res.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.some((run) => {
    if (String(run.id) === String(currentRunId)) return false;
    return getJstParts(new Date(run.created_at)).dateStr === jst.dateStr;
  });
}

async function sendLineMessage(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_USER_ID;
  if (!token || !to) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID must be set.");
  }

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE API error ${res.status}: ${body}`);
  }
}

async function main() {
  const jst = getJstParts();

  if (await alreadySentToday(jst)) {
    console.log(`Already sent successfully today (${jst.dateStr}); skipping to avoid a duplicate LINE message.`);
    return;
  }

  const todaysTasks = loadTodaysTasks(jst);
  const todaysPostDrafts = loadTodaysPostDrafts(jst);

  let message;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      message = await buildAiMessage(todaysTasks, jst, todaysPostDrafts);
    } catch (err) {
      console.warn(`AI message generation failed, falling back to plain message: ${err.message}`);
      message = buildPlainMessage(todaysTasks, jst, todaysPostDrafts);
    }
  } else {
    message = buildPlainMessage(todaysTasks, jst, todaysPostDrafts);
  }

  console.log("--- Message to send ---");
  console.log(message);
  console.log("------------------------");

  if (process.env.DRY_RUN) {
    console.log("DRY_RUN is set; not sending to LINE.");
    return;
  }

  await sendLineMessage(message);
  console.log("Sent to LINE successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
