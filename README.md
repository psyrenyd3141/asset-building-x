# LINE AI秘書 — 毎朝タスク通知

毎朝、その日のタスクをLINEに自動で送ってくれるAI秘書です。GitHub Actionsで毎日決まった時刻に起動し、`tasks.yaml` に登録したタスクの中から今日該当するものを選んで、（設定していれば）Claude APIで秘書らしい文章にまとめてLINEへプッシュ通知します。

## 仕組み

1. `tasks.yaml` に日々のタスクを登録しておく(毎日/曜日指定/特定日付に対応)
2. GitHub Actionsが毎朝07:00(JST)に `src/sendDailyTasks.js` を実行
3. 今日該当するタスクを抽出
4. `ANTHROPIC_API_KEY` を設定していれば、Claude APIで挨拶+タスク整理+一言のメッセージを生成。未設定なら定型フォーマットで送信
5. LINE Messaging APIの `push` エンドポイントでLINEにメッセージを送信

## セットアップ

### 1. LINE Messaging APIチャネルを作成

1. [LINE Developersコンソール](https://developers.line.biz/console/) にログインし、プロバイダーを作成
2. 「Messaging API」チャネルを新規作成
3. チャネル基本設定の「チャネルアクセストークン(長期)」を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
4. 自分のLINEユーザーIDを取得(以下のいずれか)
   - LINE Official Account Managerの「友だち情報」から確認
   - もしくは一時的にWebhookを有効にし、自分から作成したBotへメッセージを送って `source.userId` をログから確認
   - → `LINE_USER_ID`
5. 作成したBotを自分のLINEアカウントで友だち追加しておく(これをしないとpush配信できません)

### 2. (任意) Claude APIキーを取得

秘書らしい自然な文章で送りたい場合は [console.anthropic.com](https://console.anthropic.com/) でAPIキーを発行し `ANTHROPIC_API_KEY` に設定してください。未設定でも定型メッセージで動作します。

### 3. GitHub Secretsを設定

このリポジトリの Settings → Secrets and variables → Actions で以下を登録します。

| Secret名 | 必須 | 内容 |
| --- | --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | LINEチャネルアクセストークン(長期) |
| `LINE_USER_ID` | ✅ | 送信先のLINEユーザーID(グループID/ルームIDも可) |
| `ANTHROPIC_API_KEY` | 任意 | AI文章生成を使う場合のみ |

### 4. タスクを編集

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

### 5. 動作確認

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

`.github/workflows/daily-secretary.yml` の `cron` を編集してください。デフォルトは `0 22 * * *`(UTC)= 毎朝07:00 JSTです。cronはUTC基準で評価されるため、JSTの時刻から9時間引いた値を指定してください。
