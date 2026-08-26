import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), ".auth");
const EXPORT_PATH = path.join(AUTH_DIR, "suno-cookies-export.json");
const STORAGE_STATE_PATH = path.join(AUTH_DIR, "suno-storage-state.json");

const SAME_SITE_MAP = {
  no_restriction: "None",
  unspecified: "Lax",
  lax: "Lax",
  strict: "Strict",
};

function toPlaywrightCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || "/",
    expires: cookie.session ? -1 : Math.round(cookie.expirationDate),
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
    sameSite: SAME_SITE_MAP[cookie.sameSite] || "Lax",
  };
}

function main() {
  if (!fs.existsSync(EXPORT_PATH)) {
    throw new Error(`${EXPORT_PATH} が見つかりません。Cookie-EditorでエクスポートしたJSONを保存してください。`);
  }

  const raw = fs.readFileSync(EXPORT_PATH, "utf8");
  const cookies = JSON.parse(raw);
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("Cookieのエクスポート内容が空か、配列形式ではありません。");
  }

  const storageState = {
    cookies: cookies.map(toPlaywrightCookie),
    origins: [],
  };

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));
  console.log(`変換しました(${cookies.length}件のCookie): ${STORAGE_STATE_PATH}`);
}

main();
