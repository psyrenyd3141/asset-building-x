// FIRECRAWL_API_KEYは省略可: Claude Code Cloud環境の「API credentials」で
// api.firecrawl.devへのBearerトークンを設定している場合、そちらをエージェント
// プロキシが自動付与するため、このスクリプト自身はキーを扱わない(値を知らない)。
// ローカル実行やGitHub Actionsなど、API credentialsの仕組みがない環境で動かす
// 場合だけ、.envにFIRECRAWL_API_KEYを設定してください。
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node src/scrapeArticle.js <URL>');
    process.exit(1);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (FIRECRAWL_API_KEY) {
    headers.Authorization = `Bearer ${FIRECRAWL_API_KEY}`;
  }

  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Firecrawl APIエラー: ${res.status} ${text}`);
    if (res.status === 401 || res.status === 403) {
      console.error('FIRECRAWL_API_KEYが未設定の場合、Cloud環境のAPI credentialsにapi.firecrawl.devへのBearerトークンを設定してください。');
    }
    process.exit(1);
  }

  const json = await res.json();
  if (!json.success) {
    console.error(`Firecrawl取得失敗: ${JSON.stringify(json)}`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    url,
    title: json.data?.metadata?.title ?? null,
    markdown: json.data?.markdown ?? '',
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
