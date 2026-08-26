import path from "node:path";
import { chromium } from "playwright";

const PROFILE_DIR = path.join(process.cwd(), ".auth", "chrome-profile");

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
  // .auth/chrome-profile には、普段使っているChromeのプロフィール(ログイン状態込み)を
  // 事前にコピーしておく。本物のChromeプロフィールを使って開くので、
  // Googleの「自動操作ブラウザ」検知には引っかからず、すでにログイン済みの状態で開ける。
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = await context.newPage();
  await page.goto("https://suno.com");

  await waitForEnter(
    "SUNOにログイン済みの状態で表示されているか確認してください。\n" +
      "(もしログインが必要な画面なら、ここで手動でログインしてください)\n" +
      "確認できたらこのターミナルに戻って Enter キーを押してください...\n"
  );

  await context.close();
  console.log("完了しました。このプロフィールは今後の自動化スクリプトでもそのまま使えます。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
