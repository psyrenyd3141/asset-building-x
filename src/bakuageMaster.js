import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RAW_DIR = path.join(process.cwd(), "downloads", "raw");
const MASTERED_DIR = path.join(process.cwd(), "downloads", "mastered");
const FAILED_LOG_PATH = path.join(process.cwd(), "downloads", "failed_songs.json");
const BAKUAGE_URL = "https://app.bakuage.com/#/masterings";
const UI_ACTION_TIMEOUT_MS = 3 * 60 * 1000;
const MASTERING_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

function getPendingFiles() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(MASTERED_DIR, { recursive: true });
  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => !f.startsWith("."));
  const masteredFiles = new Set(fs.readdirSync(MASTERED_DIR));
  return rawFiles.filter((f) => !masteredFiles.has(f));
}

function logFailure(fileName, message) {
  const failures = fs.existsSync(FAILED_LOG_PATH) ? JSON.parse(fs.readFileSync(FAILED_LOG_PATH, "utf8")) : [];
  failures.push({ fileName, message, at: new Date().toISOString() });
  fs.writeFileSync(FAILED_LOG_PATH, JSON.stringify(failures, null, 2));
}

async function masterOneSong(page, filePath) {
  // 前の曲の状態(モーダルの残留など)を引きずらないよう、毎回ページを開き直す
  await page.goto(BAKUAGE_URL);
  const agreeButton = page.getByRole("button", { name: "同意する" });
  if (await agreeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await agreeButton.click();
  }

  await page.getByRole("listitem").filter({ hasText: "新規マスタリング" }).click();
  await page.locator(".el-upload-dragger").click();
  await page.locator('input[name="file"]').setInputFiles(filePath);
  await page.getByRole("button", { name: "実行" }).click();

  const downloadButton = page.getByRole("button", { name: " マスタリング後ダウンロード (フル)" });
  await downloadButton.waitFor({ state: "visible", timeout: MASTERING_WAIT_TIMEOUT_MS });

  const downloadPromise = page.waitForEvent("download", { timeout: MASTERING_WAIT_TIMEOUT_MS });
  await downloadButton.click();
  return downloadPromise;
}

async function main() {
  const pending = getPendingFiles();
  console.log(`未処理のファイル: ${pending.length}件`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  // 通常のクリックや表示待ちのデフォルトタイムアウト(マスタリング完了待ちは別途長めに指定する)
  page.setDefaultTimeout(UI_ACTION_TIMEOUT_MS);

  let processedCount = 0;
  let failedCount = 0;
  for (const fileName of pending) {
    if (processedCount >= LIMIT) break;
    const filePath = path.join(RAW_DIR, fileName);
    console.log(`処理中: ${fileName}`);

    try {
      const download = await masterOneSong(page, filePath);
      const savePath = path.join(MASTERED_DIR, fileName);
      await download.saveAs(savePath);
      console.log(`保存しました: ${savePath}`);
      processedCount += 1;
    } catch (err) {
      console.error(`失敗しました(次の曲に進みます): ${fileName} - ${err.message}`);
      logFailure(fileName, err.message);
      failedCount += 1;
    }
  }

  await browser.close();
  console.log(`完了しました。今回 ${processedCount} 件処理、${failedCount} 件失敗しました。`);
  if (failedCount > 0) {
    console.log(`失敗した曲の一覧: ${FAILED_LOG_PATH}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
