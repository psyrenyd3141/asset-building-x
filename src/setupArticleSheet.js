import { google } from 'googleapis';

const {
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  GOOGLE_SHEET_ID,
} = process.env;

const SHEET_TITLE = '記事データベース';
const HEADER = [
  'URL',
  '著者',
  'タイトル',
  '投稿日時',
  '表示回数',
  'ブックマーク数',
  'ジャンル',
  '需要メモ(テーマ・ターゲット・悩み・切り口)',
  '収集日',
];

async function main() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    console.error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_SHEET_ID が設定されていません(.env を確認してください)');
    process.exit(1);
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEET_ID });
  const existing = spreadsheet.data.sheets?.find((s) => s.properties?.title === SHEET_TITLE);

  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }],
      },
    });
    console.log(`シート「${SHEET_TITLE}」を作成しました`);
  } else {
    console.log(`シート「${SHEET_TITLE}」は既に存在します`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_TITLE}!A1:I1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADER] },
  });

  console.log('ヘッダー行を設定しました。セットアップ完了です。');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
