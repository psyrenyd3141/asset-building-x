import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const AUTH_DIR = path.join(process.cwd(), ".auth");
const STORAGE_STATE_PATH = path.join(AUTH_DIR, "suno-storage-state.json");

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function main() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Googleは自動操作用のブラウザ(テスト用Chromium)からのログインをブロックすることがあるため、
  // PCにインストール済みの本物のChromeを使い、自動操作の痕跡を隠すオプションを付ける。
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://suno.com");

  await waitForEnter(
    "ブラウザでSUNOにログインしてください。ログインできたらこのターミナルに戻って Enter キーを押してください...\n"
  );

  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`ログインセッションを保存しました: ${STORAGE_STATE_PATH}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
