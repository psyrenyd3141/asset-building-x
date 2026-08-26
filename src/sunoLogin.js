import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "suno-storage-state.json");

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
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      `${STORAGE_STATE_PATH} が見つかりません。先に "npm run suno:import-cookies" を実行してください。`
    );
  }

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();
  await page.goto("https://suno.com");

  await waitForEnter(
    "SUNOにログイン済みの状態で表示されているか確認してください。確認できたらこのターミナルに戻って Enter キーを押してください...\n"
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
