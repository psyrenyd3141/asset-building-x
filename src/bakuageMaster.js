import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const RAW_DIR = path.join(process.cwd(), "downloads", "raw");
const MASTERED_DIR = path.join(process.cwd(), "downloads", "mastered");
const BAKUAGE_URL = "https://app.bakuage.com/#/masterings";
const PROCESSING_TIMEOUT_MS = 60 * 60 * 1000;
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

function getPendingFiles() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(MASTERED_DIR, { recursive: true });
  const rawFiles = fs.readdirSync(RAW_DIR).filter((f) => !f.startsWith("."));
  const masteredFiles = new Set(fs.readdirSync(MASTERED_DIR));
  return rawFiles.filter((f) => !masteredFiles.has(f));
}

async function main() {
  const pending = getPendingFiles();
  console.log(`未処理のファイル: ${pending.length}件`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let processedCount = 0;
  for (const fileName of pending) {
    if (processedCount >= LIMIT) break;
    const filePath = path.join(RAW_DIR, fileName);
    console.log(`処理中: ${fileName}`);

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
    await downloadButton.waitFor({ state: "visible", timeout: PROCESSING_TIMEOUT_MS });

    const downloadPromise = page.waitForEvent("download", { timeout: PROCESSING_TIMEOUT_MS });
    await downloadButton.click();
    const download = await downloadPromise;

    const savePath = path.join(MASTERED_DIR, fileName);
    await download.saveAs(savePath);
    console.log(`保存しました: ${savePath}`);

    processedCount += 1;
  }

  await browser.close();
  console.log(`完了しました。今回 ${processedCount} 件処理しました。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
