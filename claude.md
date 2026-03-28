# Multi-Language TODO App — LLM 引き継ぎドキュメント

> **このファイルを読めば、新しいセッションでもプロジェクトの全体像・現状・次のタスクが即座に把握できる。**
> 実装を進めるたびにこのファイルを更新すること。

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| 目的 | 共通フロントエンド・共通DBを使い、様々なバックエンド言語・FWで同一のTODO APIを実装・比較する |
| フロントエンド | バニラ HTML / CSS / JavaScript（フレームワーク不使用） |
| データベース | Supabase (PostgreSQL) |
| デプロイ | Vercel Serverless Functions（一部言語は外部サービス） |
| リポジトリ | `superman5-22/todo_language` |
| 開発ブランチ | `claude/setup-todo-app-supabase-iM7nU` |

---

## 2. ディレクトリ構造

```
/
├── index.html              # ランディングページ（全言語へのリンク集）
├── css/
│   └── style.css           # 全ページ共通スタイル（ダークテーマ）
├── js/
│   └── app.js              # 共通フロントエンドロジック（fetch / UI）
├── sql_setup.sql           # Supabase テーブル定義 + RLS設定
├── vercel.json             # Vercel ルーティング・Functions設定
├── claude.md               # ← このファイル（LLM引き継ぎ用）
│
├── nodejs/
│   ├── todo_nodejs.html    # Node.js版UIページ
│   └── main.js             # Vercel Serverless Function (Node.js http)
├── express/
│   ├── todo_express.html
│   └── main.js             # Express 4
├── hono/
│   ├── todo_hono.html
│   └── main.js             # Hono (TypeScript)
├── deno/
│   ├── todo_deno.html
│   └── main.ts             # Deno Runtime（Deno Deployへ）
├── bun/
│   ├── todo_bun.html
│   └── main.js             # Bun Runtime
├── flask/
│   ├── todo_flask.html
│   └── main.py             # Python Flask
├── fastapi/
│   ├── todo_fastapi.html
│   └── main.py             # Python FastAPI
├── django/
│   ├── todo_django.html
│   └── main.py             # Python Django REST Framework
├── go/
│   ├── todo_go.html
│   └── main.go             # Go net/http (stdlib)
├── gin/
│   ├── todo_gin.html
│   └── main.go             # Go Gin
├── echo/
│   ├── todo_echo.html
│   └── main.go             # Go Echo
├── fiber/
│   ├── todo_fiber.html
│   └── main.go             # Go Fiber
├── ruby_rails/
│   ├── todo_rails.html
│   └── main.ru             # Ruby on Rails API（Render / Railwayへ）
├── sinatra/
│   ├── todo_sinatra.html
│   └── main.ru             # Ruby Sinatra
├── php/
│   ├── todo_php.html
│   └── main.php            # PHP 8 (vercel-php runtime)
├── laravel/
│   ├── todo_laravel.html
│   └── main.php            # PHP Laravel（外部デプロイ）
├── spring/
│   ├── todo_spring.html
│   └── Main.java           # Java Spring Boot（Railway / Renderへ）
├── kotlin/
│   ├── todo_kotlin.html
│   └── Main.kt             # Kotlin Ktor
├── scala/
│   ├── todo_scala.html
│   └── Main.scala          # Scala Play Framework
├── rust/
│   ├── todo_rust.html
│   └── main.rs             # Rust Actix-web（Fly.io / Railwayへ）
├── csharp/
│   ├── todo_csharp.html
│   └── Program.cs          # C# ASP.NET Core Minimal API
├── elixir/
│   ├── todo_elixir.html
│   └── main.ex             # Elixir Phoenix（Fly.ioへ）
├── swift/
│   ├── todo_swift.html
│   └── main.swift          # Swift Vapor
└── perl/
    ├── todo_perl.html
    └── main.pl             # Perl Mojolicious
```

---

## 3. フロントエンド設計

### 共通ロジック (`js/app.js`)

- `API_BASE` 変数（各 `todo_*.html` で定義）を使って fetch する
- 全 CRUD 操作を実装（GET/POST/PATCH/DELETE）
- 楽観的 UI 更新（Optimistic Update）でレスポンスを体感的に高速化
- XSS 対策済み（`escapeHtml()` でサニタイズ）
- フィルター機能（すべて / 未完了 / 完了済）

### 各言語ページのボイラープレート

```html
<!-- API_BASE を定義してから app.js を読み込む -->
<script>const API_BASE = '/api/<lang>';</script>
<script src="../js/app.js"></script>
```

---

## 4. データベーススキーマ

```sql
TABLE todos (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title      TEXT        NOT NULL,
    completed  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- trigger で自動更新
);
```

**Supabase 初期設定手順:**
1. Supabase ダッシュボード → SQL Editor を開く
2. `sql_setup.sql` の内容を貼り付けて実行
3. Project Settings → API から `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を取得
4. Vercel の Environment Variables に以下を設定:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

---

## 5. 共通 API 仕様（全バックエンド厳守）

> **すべてのバックエンドはこの仕様を完全に実装すること。**

### ベース URL

```
/api/<lang>/
```

例: `/api/nodejs/`, `/api/flask/`, `/api/go/`

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET     | `/api/<lang>/todos` | 全 TODO 取得（created_at 降順） |
| POST    | `/api/<lang>/todos` | TODO 新規作成 |
| PATCH   | `/api/<lang>/todos/:id` | TODO 更新（title / completed） |
| DELETE  | `/api/<lang>/todos/:id` | TODO 削除 |

OPTIONS プリフライトリクエストにも `200 OK` を返すこと（CORS対応）。

### GET `/api/<lang>/todos`

**Response 200:**
```json
{
  "todos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "タスク名",
      "completed": false,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST `/api/<lang>/todos`

**Request Body:**
```json
{ "title": "新しいタスク" }
```

**Response 201:**
```json
{
  "todo": {
    "id": "550e8400-...",
    "title": "新しいタスク",
    "completed": false,
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Validation:**
- `title` が空文字 / 未指定 → `400 Bad Request`
```json
{ "error": "title is required" }
```

### PATCH `/api/<lang>/todos/:id`

**Request Body（片方だけでも可）:**
```json
{ "title": "更新後タスク名", "completed": true }
```

**Response 200:**
```json
{
  "todo": { "id": "...", "title": "更新後タスク名", "completed": true, ... }
}
```

**エラー:**
- 存在しない ID → `404 Not Found`
```json
{ "error": "todo not found" }
```

### DELETE `/api/<lang>/todos/:id`

**Response 200:**
```json
{ "message": "deleted" }
```

**エラー:**
- 存在しない ID → `404 Not Found`
```json
{ "error": "todo not found" }
```

### 共通エラー形式

```json
{ "error": "<エラーメッセージ>" }
```

### 共通レスポンスヘッダー

```
Content-Type: application/json
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## 6. 環境変数

| 変数名 | 説明 |
|--------|------|
| `SUPABASE_URL` | Supabase プロジェクト URL（`https://xxxx.supabase.co`） |
| `SUPABASE_SERVICE_ROLE_KEY` | サービスロールキー（サーバーサイド専用、公開禁止） |

各バックエンドの実装ではこれらの環境変数を読み込み、Supabase REST API または PostgreSQL ドライバで DB に接続する。

**Supabase REST API 利用パターン（推奨）:**
```
GET  {SUPABASE_URL}/rest/v1/todos?select=*&order=created_at.desc
POST {SUPABASE_URL}/rest/v1/todos
PATCH {SUPABASE_URL}/rest/v1/todos?id=eq.{id}
DELETE {SUPABASE_URL}/rest/v1/todos?id=eq.{id}

Headers:
  apikey: {SUPABASE_SERVICE_ROLE_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type: application/json
  Prefer: return=representation   (POST/PATCH で更新後レコード取得)
```

---

## 7. Vercel デプロイ戦略

### Vercel ネイティブ対応（Serverless Functions）

| 言語 | Runtime | ファイル |
|------|---------|---------|
| Node.js | `nodejs20.x` | `nodejs/main.js`, `express/main.js`, `hono/main.js`, `bun/main.js` |
| Python | `python3.12` | `flask/main.py`, `fastapi/main.py`, `django/main.py` |
| Go | `go1.22.x` | `go/main.go`, `gin/main.go`, `echo/main.go`, `fiber/main.go` |
| PHP | `vercel-php@0.7.2` | `php/main.php` |
| Ruby | `vercel-ruby@3.3.0` | `ruby_rails/main.ru`, `sinatra/main.ru` |

### 外部デプロイが必要な言語

以下の言語は Vercel Serverless Functions では動作しないため、外部サービスを使用する。
フロントエンドの `API_BASE` を外部サービスの URL に向ける（環境変数で切り替え推奨）。

| 言語/FW | デプロイ先（推奨） | 理由 |
|---------|------------------|------|
| Java (Spring Boot) | Railway / Render / Fly.io | JVM 起動時間・ビルドサイズ |
| Kotlin (Ktor) | Railway / Render / Fly.io | JVM |
| Scala (Play) | Heroku / Render | JVM |
| Rust (Actix-web) | Fly.io / Railway | バイナリビルドが必要 |
| C# (ASP.NET Core) | Azure App Service / Railway | .NET ランタイム |
| Elixir (Phoenix) | Fly.io | BEAM VM |
| Swift (Vapor) | Fly.io / Railway | Swift ランタイム |
| Perl (Mojolicious) | Heroku / Render | Perl 実行環境 |
| Deno | Deno Deploy | 専用プラットフォームが最適 |

**外部デプロイ時の HTML 書き換え手順:**
```html
<!-- todo_spring.html などで外部 URL を指定 -->
<script>
  const API_BASE = 'https://your-spring-app.railway.app/api/spring';
</script>
```

---

## 8. 実装ロードマップ

### フェーズ1（完了）— 基盤構築

- [x] `sql_setup.sql` — Supabase テーブル定義
- [x] `css/style.css` — 共通スタイル
- [x] `js/app.js` — 共通フロントエンドロジック
- [x] `index.html` — ランディングページ
- [x] `nodejs/todo_nodejs.html` — Node.js版UIページ（ベース）
- [x] 全言語の `todo_*.html` プレースホルダー
- [x] `vercel.json` — ルーティング基本設定
- [x] `claude.md` — 引き継ぎドキュメント

### フェーズ2 — Node.js バックエンド

- [x] `nodejs/main.js` — Node.js http モジュール版 API
- [x] `express/main.js` — Express 4 版 API（`package.json` 含む）
- [x] `hono/main.js` — Hono (ESM) 版 API（`package.json` 含む）
- [x] `bun/main.js` — Bun Runtime 版 API
- [ ] 動作確認・Vercel デプロイテスト

### フェーズ3 — Python バックエンド

- [x] `flask/main.py` — Flask 版 API（`requirements.txt` 含む）
- [x] `fastapi/main.py` — FastAPI 版 API（`requirements.txt` 含む）
- [x] `django/main.py` — Django REST Framework 版 API（`requirements.txt` 含む）
- [ ] 動作確認

### フェーズ4 — Go バックエンド

- [x] `go/main.go` — net/http 版 API（`go.mod` 含む）
- [x] `gin/main.go` — Gin 版 API（`go.mod` 含む）
- [x] `echo/main.go` — Echo 版 API（`go.mod` 含む）
- [x] `fiber/main.go` — Fiber 版 API（`go.mod` 含む）
- [ ] 動作確認

### フェーズ5 — Ruby / PHP バックエンド

- [x] `ruby_rails/main.ru` — Rack ベース Rails スタイル API（`Gemfile` 含む）
- [x] `sinatra/main.ru` — Sinatra 版 API（`Gemfile` 含む）
- [x] `php/main.php` — PHP 8 版 API
- [ ] 動作確認

### フェーズ6 — JVM 系（外部デプロイ）

- [x] `spring/Main.java` — Spring Boot API（`pom.xml` 含む）
- [x] `kotlin/Main.kt` — Ktor API（`build.gradle.kts` 含む）
- [x] `scala/Main.scala` — Play Framework API（`build.sbt` 含む）
- [ ] Railway / Render デプロイ設定
- [ ] フロントエンドの `API_BASE` を外部 URL に向ける

### フェーズ7 — Rust / C# / その他（外部デプロイ）

- [x] `rust/main.rs` — Actix-web API（`Cargo.toml` 含む）
- [x] `csharp/Program.cs` — ASP.NET Core Minimal API（`.csproj` 含む）
- [x] `elixir/main.ex` — Phoenix API（`mix.exs` 含む）
- [x] `swift/main.swift` — Vapor API（`Package.swift` 含む）
- [x] `perl/main.pl` — Mojolicious API
- [x] `deno/main.ts` — Deno Deploy 版 API
- [ ] Fly.io / Railway デプロイ設定

### フェーズ8 — 仕上げ

- [ ] 全言語の動作確認テスト
- [ ] パフォーマンス比較ページの追加
- [ ] README.md の作成
- [ ] 全言語のレスポンスタイム計測スクリプト

---

## 9. 各バックエンド実装時の注意事項

### Supabase 接続方法（REST API 推奨）

```
全バックエンドで以下の Supabase REST API を直接 HTTP コールする方式を推奨。
言語固有の Supabase SDK がある場合は SDK を使用しても良い。

GET    todos: GET  {URL}/rest/v1/todos?select=*&order=created_at.desc
POST   todo:  POST {URL}/rest/v1/todos (body: {title, completed})
PATCH  todo:  PATCH {URL}/rest/v1/todos?id=eq.{id} (body: {title?, completed?})
DELETE todo:  DELETE {URL}/rest/v1/todos?id=eq.{id}

共通ヘッダー:
  apikey: {SUPABASE_SERVICE_ROLE_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type: application/json
  Prefer: return=representation  (POST/PATCH 時)
```

### Vercel Serverless Functions のパス解決

```
vercel.json の rewrites で /api/<lang>/:path* → /<lang>/main.xx にマッピング済み。
main.xx 内では PATH_INFO や req.url からパスを解析し、
  /todos        → GET/POST に対応
  /todos/{uuid} → PATCH/DELETE に対応
```

### CORS

すべてのバックエンドで OPTIONS メソッドに対して `200 OK` を返し、
以下のヘッダーをすべてのレスポンスに付与すること:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## 10. 現在の実装状況サマリー

| 言語/FW | HTML | API実装 | デプロイ | 備考 |
|---------|------|---------|---------|------|
| Node.js (http) | ✅ | ✅ | ⬜ | フェーズ2 |
| Express | ✅ | ✅ | ⬜ | フェーズ2 |
| Hono | ✅ | ✅ | ⬜ | フェーズ2 |
| Bun | ✅ | ✅ | ⬜ | フェーズ2 |
| Flask | ✅ | ✅ | ⬜ | フェーズ3 |
| FastAPI | ✅ | ✅ | ⬜ | フェーズ3 |
| Django REST | ✅ | ✅ | ⬜ | フェーズ3 |
| Go (net/http) | ✅ | ✅ | ⬜ | フェーズ4 |
| Gin | ✅ | ✅ | ⬜ | フェーズ4 |
| Echo | ✅ | ✅ | ⬜ | フェーズ4 |
| Fiber | ✅ | ✅ | ⬜ | フェーズ4 |
| Ruby on Rails | ✅ | ✅ | ⬜ | フェーズ5 / 外部 |
| Sinatra | ✅ | ✅ | ⬜ | フェーズ5 |
| PHP | ✅ | ✅ | ⬜ | フェーズ5 |
| Spring Boot | ✅ | ✅ | ⬜ | フェーズ6 / 外部 |
| Ktor | ✅ | ✅ | ⬜ | フェーズ6 / 外部 |
| Play (Scala) | ✅ | ✅ | ⬜ | フェーズ6 / 外部 |
| Rust (Actix) | ✅ | ✅ | ⬜ | フェーズ7 / 外部 |
| ASP.NET Core | ✅ | ✅ | ⬜ | フェーズ7 / 外部 |
| Phoenix (Elixir) | ✅ | ✅ | ⬜ | フェーズ7 / 外部 |
| Vapor (Swift) | ✅ | ✅ | ⬜ | フェーズ7 / 外部 |
| Mojolicious (Perl) | ✅ | ✅ | ⬜ | フェーズ7 / 外部 |
| Deno | ✅ | ✅ | ⬜ | フェーズ7 / Deno Deploy |

**凡例:** ✅ 完了 / ⬜ 未着手 / 🔄 進行中
