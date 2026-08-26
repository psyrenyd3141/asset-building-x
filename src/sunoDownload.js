import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "suno-storage-state.json");
const PLAYLIST_URL = "https://suno.com/playlist/55ff1b40-6ac0-41bc-897b-a8d485c12cb4";
const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
const RAW_DIR = path.join(DOWNLOAD_DIR, "raw");
const MANIFEST_PATH = path.join(DOWNLOAD_DIR, "processed_songs.json");
const FORMAT_BUTTON_LABEL = "WAVオーディオ";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function saveManifest(keys) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(keys, null, 2));
}

// リストは遅延読み込みされるため、末尾の曲を順にビューに入れて全曲読み込ませる
async function autoScrollToLoadAll(items) {
  let previousCount = -1;
  let currentCount = await items.count();
  while (currentCount !== previousCount) {
    previousCount = currentCount;
    await items.last().scrollIntoViewIfNeeded();
    await items.last().page().waitForTimeout(1000);
    currentCount = await items.count();
  }
  return currentCount;
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const processedKeys = new Set(loadManifest());

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
  await page.goto(PLAYLIST_URL);

  const items = page.getByRole("listitem").filter({ has: page.getByLabel("その他のオプション") });
  const total = await autoScrollToLoadAll(items);
  console.log(`プレイリスト内で ${total} 曲見つかりました。`);

  let downloadedCount = 0;
  for (let i = 0; i < total && downloadedCount < LIMIT; i++) {
    const item = items.nth(i);
    const key = (await item.innerText()).trim();

    if (processedKeys.has(key)) {
      console.log(`スキップ(処理済み): ${key.split("\n")[0]}`);
      continue;
    }

    await item.getByLabel("その他のオプション").click();
    await page.getByRole("button", { name: FORMAT_BUTTON_LABEL }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "ファイルをダウンロード" }).click();
    const download = await downloadPromise;

    const savePath = path.join(RAW_DIR, download.suggestedFilename());
    await download.saveAs(savePath);
    console.log(`保存しました: ${savePath}`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    processedKeys.add(key);
    saveManifest([...processedKeys]);
    downloadedCount += 1;
  }

  await browser.close();
  console.log(`完了しました。今回 ${downloadedCount} 曲ダウンロードしました。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
