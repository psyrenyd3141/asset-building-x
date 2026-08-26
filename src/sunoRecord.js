import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "suno-storage-state.json");
const PLAYLIST_URL = "https://suno.com/playlist/55ff1b40-6ac0-41bc-897b-a8d485c12cb4";

async function main() {
  if (!fs.existsSync(STORAGE_STATE_PATH)) {
    throw new Error(
      `${STORAGE_STATE_PATH} が見つかりません。先に "npm run suno:import-cookies" を実行してください。`
    );
  }

  // sunoLogin.jsと同じ設定(本物のChrome + 自動操作の痕跡を隠すオプション)で開くことで、
  // ログイン状態を保ったまま Playwright Inspector で操作を記録できるようにする。
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();
  await page.goto(PLAYLIST_URL);

  console.log("別ウィンドウでPlaywright Inspectorが開きます。");
  console.log("Inspectorの「Record」をONにしてから、いつも通り1曲だけダウンロードしてください。");

  await page.pause();

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
