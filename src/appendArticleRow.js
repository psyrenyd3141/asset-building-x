import { google } from 'googleapis';

const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  GOOGLE_SHEET_ID,
} = process.env;

const SHEET_TITLE = '記事データベース';
const SHEET_RANGE = `${SHEET_TITLE}!A:I`;

function parseRow() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: node src/appendArticleRow.js \'{"url":"...","author":"...","title":"...","postedAt":"...","impressions":"...","bookmarks":"...","genre":"...","demandMemo":"..."}\'');
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('JSONのパースに失敗しました:', err.message);
    process.exit(1);
  }
}

function getSheetsClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    console.error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_SHEET_ID が設定されていません(.env を確認してください)');
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function main() {
  const row = parseRow();
  const sheets = getSheetsClient();

  const collectedAt = new Date().toISOString().slice(0, 10);
  const values = [[
    row.url ?? '',
    row.author ?? '',
    row.title ?? '',
    row.postedAt ?? '',
    row.impressions ?? '',
    row.bookmarks ?? '',
    row.genre ?? '',
    row.demandMemo ?? '',
    collectedAt,
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log(`記事データベースに1行追加しました: ${row.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
