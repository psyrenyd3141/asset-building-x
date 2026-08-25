# LINE AI秘書 — 毎朝タスク通知

毎朝、その日のタスクをLINEに自動で送ってくれるAI秘書です。GitHub Actionsで毎日決まった時刻に起動し、`tasks.yaml` に登録したタスクの中から今日該当するものを選んで、（設定していれば）Claude APIで秘書らしい文章にまとめてLINEへプッシュ通知します。

## 仕組み

1. `tasks.yaml` に日々のタスクを登録しておく(毎日/曜日指定/特定日付に対応)
2. GitHub Actionsが毎朝06:00(JST)に `src/sendDailyTasks.js` を実行
3. 今日該当するタスクを抽出
4. `ANTHROPIC_API_KEY` を設定していれば、Claude APIで挨拶+タスク整理+一言のメッセージを生成。未設定なら定型フォーマットで送信
5. LINE Messaging APIの `push` エンドポイントでLINEにメッセージを送信

## セットアップ

### 1. LINE Developersアカウント登録

1. [LINE Developersコンソール](https://developers.line.biz/console/) にアクセスし、普段使っているLINEアカウントでログイン
2. 初回は開発者情報(名前・メールアドレス)の登録を求められるので入力

### 2. プロバイダーとMessaging APIチャネルを作成

1. 「作成」→「新規プロバイダー作成」でプロバイダー名を適当に入力(例: `個人開発`)して作成
2. 作成したプロバイダーのページで「チャネル作成」→ チャネルタイプは **「Messaging API」** を選択
3. チャネル名(例「AI秘書」)、チャネル説明、業種などの必須項目を入力し、利用規約に同意して作成

### 3. チャネルアクセストークンを発行

1. 作成したチャネルの管理画面 →「Messaging API設定」タブを開く
2. 下の方にある「チャネルアクセストークン(長期)」欄で「発行」をクリック
3. 発行されたトークンをコピー → `LINE_CHANNEL_ACCESS_TOKEN`

### 4. Botを友だち追加

「Messaging API設定」タブに表示されるQRコードを自分のLINEアプリでスキャンして友だち追加してください。これをしないとpush配信(プログラムからの送信)が届きません。

### 5. 自分のLINEユーザーIDを取得

LINE Developersコンソール上には自分のuserIdを直接表示する場所がないため、このリポジトリに用意した簡易Webhook受信スクリプトを使って取得します。

1. [ngrok](https://ngrok.com/)(無料アカウントでOK)をインストールし、`ngrok config add-authtoken <あなたのトークン>` で認証設定を済ませる
2. ターミナルでこのリポジトリを開き、Webhook受信サーバーを起動:
   ```bash
   npm run get-user-id
   ```
   (`http://localhost:3000/webhook` で待受け開始)
3. 別のターミナルでngrokを起動し、3000番ポートを公開:
   ```bash
   ngrok http 3000
   ```
   表示される `https://xxxx.ngrok-free.app` のようなURLをコピー
4. LINE Developersコンソール →「Messaging API設定」タブで:
   - Webhook URLに `https://xxxx.ngrok-free.app/webhook` を設定して保存
   - 「Webhookの利用」をオンにする
   - 「検証」ボタンを押して200 OKが返ることを確認
   - 「応答メッセージ」はオフにしておくと、Botからの自動返信を止められて確認しやすいです(チャネル基本設定の「LINE公式アカウント機能」→ LINE Official Account Managerの応答設定から変更可能)
5. 友だち追加したBotへLINEアプリから何かメッセージを送信
6. `npm run get-user-id` を実行しているターミナルに `あなたの userId: U....` と表示されるので、これをコピー → `LINE_USER_ID`
7. 確認が終わったら、ngrokとサーバーは止めてOK。Webhook URLの設定もそのままで問題ありません(このBotで他にWebhookを使う予定がなければ)

### 6. (任意) Claude APIキーを取得

秘書らしい自然な文章で送りたい場合は [console.anthropic.com](https://console.anthropic.com/) でAPIキーを発行し `ANTHROPIC_API_KEY` に設定してください。未設定でも定型メッセージで動作します。

### 7. GitHub Secretsを設定

このリポジトリの Settings → Secrets and variables → Actions で以下を登録します。

| Secret名 | 必須 | 内容 |
| --- | --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINEチャネルアクセストークン(長期) |
| `LINE_USER_ID` | ✅ | 送信先のLINEユーザーID(グループID/ルームIDも可) |
| `ANTHROPIC_API_KEY` | 任意(secretaryのAI文章生成用) / ✅(投稿案自動生成を使う場合) | AI文章生成、および後述の投稿案自動生成で使用 |

### 8. タスクを編集

`tasks.yaml` を編集して自分のタスクを登録してください。

```yaml
tasks:
  - title: "資産・家計簿の記帳"
    recurrence: daily

  - title: "メールとタスクの棚卸し"
    recurrence: weekly
    days: [mon, wed, fri]

  - title: "確定申告の書類提出"
    date: "2026-09-15"
    priority: high
```

- `recurrence: daily` — 毎日
- `recurrence: weekly` + `days: [mon, ...]` — 指定した曜日のみ(`sun`/`mon`/`tue`/`wed`/`thu`/`fri`/`sat`)
- `date: "YYYY-MM-DD"` — 単発タスク。その日だけ送信され、過ぎたら自動的に送られなくなります
- `priority: high` — 任意。メッセージ内で強調されます(省略時 `normal`)

### SNS投稿案との連携(任意)

`post_drafts.yaml` に以下の形式で書き込んでおくと、その日のタスクと一緒にLINEメッセージへ含まれます。

```yaml
generated_date: "2026-08-26"
posts:
  - "投稿案1の本文..."
  - "投稿案2の本文..."
  - "投稿案3の本文..."
```

- `generated_date` が **その日の日付(JST)と一致する場合のみ** 送信対象になります。古い投稿案が延々と送られ続けるのを防ぐためです
- 投稿案を書き込む処理は、**毎朝06:00 JSTより前**(例: 05:30)に完了・コミット・プッシュされている必要があります
- 投稿案が無い日は `posts: []` のままでも、`generated_date` を空にしておいても問題ありません

このリポジトリには、この投稿案自体を毎朝自動生成する仕組み(`src/generatePostDrafts.js` + `.github/workflows/generate-post-drafts.yml`)も含まれています。

- 毎朝04:45 JST(06:00のLINE送信より前)にGitHub Actionsが起動し、Claude APIで「FIRE・資産形成」「お金×日常生活」「人生・幸福・価値観」「仕事・人間関係・自己投資」の4テーマを曜日ごとの比率(週次で概ね30% / 25% / 25% / 20%)でローテーションしながら3投稿分を生成します
- 生成ロジック・トーン・コンプライアンスの扱いは `src/generatePostDrafts.js` 内の `SYSTEM_PROMPT` にすべて記述されています。文面や比率を変えたい場合はここを編集してください
- 直近14日分の投稿案は `post_drafts_history.yaml` に自動保存され、同じ構文・フックの使い回しを避けるための参照データとして次回生成時に使われます
- このワークフローの実行には `ANTHROPIC_API_KEY` シークレットが必須です(上記「6. Claude APIキーを取得」で発行したものと共用できます)
- ローカルで試す場合: `ANTHROPIC_API_KEY=sk-... npm run generate:posts`(`post_drafts.yaml` がその場で書き換わります。LINEには送信されません)
- Actionsタブから「Generate Daily Post Drafts」ワークフローを `workflow_dispatch` で手動実行することもできます

### 9. 動作確認

GitHub Actionsの「Daily LINE Secretary」ワークフローは `workflow_dispatch` にも対応しているので、Actionsタブから手動実行して動作確認できます。

ローカルで試す場合:

```bash
npm install
cp .env.example .env   # 値を埋める
export $(cat .env | grep -v '^#' | xargs)
npm run send:dry-run   # LINEには送らず、コンソールにメッセージ内容を出力
npm run send           # 実際にLINEへ送信
```

## スケジュールの変更

`.github/workflows/daily-secretary.yml` の `cron` を編集してください。デフォルトは `0 21 * * *`(UTC)= 毎朝06:00 JSTです。cronはUTC基準で評価されるため、JSTの時刻から9時間引いた値を指定してください。
