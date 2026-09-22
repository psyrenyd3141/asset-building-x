const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node src/scrapeArticle.js <URL>');
    process.exit(1);
  }
  if (!FIRECRAWL_API_KEY) {
    console.error('FIRECRAWL_API_KEY が設定されていません(.env を確認してください)');
    process.exit(1);
  }

  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Firecrawl APIエラー: ${res.status} ${text}`);
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
