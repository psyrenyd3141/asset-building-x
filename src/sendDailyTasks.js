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

function buildPlainMessage(tasks, jst) {
  const header = `おはようございます☀️\n本日 ${jst.month}/${jst.day}(${WEEKDAY_JA[jst.weekday]}) のタスクです。`;

  if (tasks.length === 0) {
    return `${header}\n\n本日予定されているタスクはありません。良い一日を!`;
  }

  const lines = tasks.map((t, i) => `${i + 1}. ${t.priority === "high" ? "🔴 " : ""}${t.title}`);
  return `${header}\n\n${lines.join("\n")}\n\n今日も一日頑張りましょう!`;
}

async function buildAiMessage(tasks, jst) {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const system = [
    "あなたはユーザー専属の優秀でフレンドリーなAI秘書です。",
    "LINEで毎朝送る短いメッセージを作成します。",
    "渡された今日のタスクリストの内容は変えず、すべて含めてください（タスクが0件なら「今日は予定タスクなし」と伝えてください）。",
    "朝の挨拶、今日の日付と曜日、タスクの要点整理、前向きな一言を含め、絵文字は適度に使い、300文字以内・日本語で書いてください。",
    "余計な前置きや説明文は付けず、LINEにそのまま送れる本文のみを出力してください。",
  ].join("\n");

  const userContent = JSON.stringify({
    date: jst.dateStr,
    weekday: WEEKDAY_JA[jst.weekday],
    tasks: tasks.map((t) => ({ title: t.title, priority: t.priority || "normal" })),
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
  const todaysTasks = loadTodaysTasks(jst);

  let message;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      message = await buildAiMessage(todaysTasks, jst);
    } catch (err) {
      console.warn(`AI message generation failed, falling back to plain message: ${err.message}`);
      message = buildPlainMessage(todaysTasks, jst);
    }
  } else {
    message = buildPlainMessage(todaysTasks, jst);
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
