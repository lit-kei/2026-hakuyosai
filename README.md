# 2026 オキナシステム 資産管理サイト

文化祭のカジノ企画で、参加者が持っているゲーム内ポイント・チップを管理するための静的Webサイトです。実際のお金や決済機能は扱いません。

## ページ

- `signin.html`: 参加者の新規アカウント作成、6文字公開IDログイン
- `profile.html`: ユーザー名変更、公開ID、QRコード、現在資産の確認
- `manage.html`: 運営スタッフによるユーザー検索、資産変更、取引履歴確認
- `ranking.html`: 現在資産の資産総額TOP20ランキング表示
- `lookup.html`: スマホを持っていない参加者向けの運営端末プロフィール確認
- `room.html`: 部屋の作成、部屋一覧
- `room-detail.html?id={roomId}`: 個別部屋の参加者、残高、資産変更
- `room-scan.html?id={roomId}`: 部屋専用のQRコード読み取り、公開ID手入力
- `room-display.html?id={roomId}`: 部屋ごとの参加者、現在資産、この部屋で増えた額のディスプレイ表示

## Firebaseセットアップ

1. Firebase Consoleでプロジェクトを作成します。
2. Webアプリを追加し、Firebase configを取得します。
3. `assets/js/*.js` の先頭にある `firebaseConfig` を自分のプロジェクトの値に変更します。
4. AuthenticationでEmail/Passwordを有効化します。
5. Firestore Databaseを作成します。
6. `firestore.rules` の内容をFirestore Security Rulesへ設定します。

## Firestoreのコレクション構造

```text
users/{userId}
  displayName: string
  usernameKey: string
  balance: number
  publicId: string
  createdAt: timestamp
  updatedAt: timestamp

usernames/{usernameKey}
  userId: string
  username: string
  createdAt: timestamp
  updatedAt: timestamp

publicIds/{publicId}
  userId: string
  createdAt: timestamp

rooms/{roomId}
  name: string
  isActive: boolean
  createdAt: timestamp
  updatedAt: timestamp

roomMembers/{userId}
  roomId: string
  roomName: string
  balanceAtJoin: number
  roomDelta: number
  joinedAt: timestamp
  updatedAt: timestamp

transactions/{transactionId}
  userId: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  type: string
  roomId: string optional
  roomName: string optional
  createdAt: timestamp
```

`users/{userId}` はFirestoreの自動生成ドキュメントIDを使用します。端末側にも `localStorage` の `hakuyosaiUserId` と `hakuyosaiPublicId` として保存しています。

`displayName` は画面上のユーザー名です。使用できる文字は半角英数字、ハイフン、アンダースコアのみで、1〜12文字です。空白は使えません。`usernameKey` は `displayName` を小文字化した値で、`usernames/{usernameKey}` に予約情報を保存します。ユーザー名の重複判定では大文字小文字を区別しないため、`Alice` と `alice` は同じ名前として扱います。

`publicId` は6文字の公開IDです。手書き時の読み間違いを減らすため、使用文字は `ACDEFGHJKMNPQRTUVWXY34679` のみにしています。`0/O`、`1/I/L`、`2/Z`、`5/S`、`8/B` は使いません。候補数は `25^6 = 244,140,625` 通りです。作成時は `publicIds/{publicId}` をFirestore transaction内で確認し、衝突した場合は最大12回まで別IDを再生成します。参加者プロフィールのQRコードにはこの `publicId` だけを入れています。QRコードを表示できない場合は、スタッフが `room-scan.html` でこのIDを手入力できます。

`roomMembers/{userId}` は参加者の現在いる部屋を表します。同じ参加者を別の部屋に追加すると、このドキュメントが上書きされるため、所属は常に1部屋だけです。

`room-display.html?id={roomId}` は `roomMembers` の `joinedAt` を使って入室順に並べます。表示する「この部屋で増えた額」は `roomDelta` です。`room-detail.html` の部屋内資産操作では、ユーザー残高、取引履歴、`roomDelta` を同じFirestore transactionで更新します。`manage.html` からの全体管理操作は特定の部屋の勝ち負けとしては扱わないため、`roomDelta` には反映しません。

`ranking.html` は `users.balance` の降順で資産総額TOP20を表示します。同じ残高の参加者は同じ順位になり、20位以内に同率者がいる場合は20件を超えても全員表示します。`ranking.html?scroll=true` を開くと、ディスプレイ用途としてランキング一覧だけが自動スクロールします。

`balance` はマイナス値も許可します。ゲーム内の借金や後払い精算が必要な場合は、そのまま負の残高として記録できます。

## 初期残高の変更方法

初期残高は `assets/js/signin.js` の次の定数で変更できます。

```js
const INITIAL_BALANCE = 25000;
```

変更した場合は、`firestore.rules` の `request.resource.data.balance == 25000` も同じ値に変更してください。

## 管理者設定方法

管理者はFirebase AuthenticationのEmail/Passwordアカウントとして作成し、custom claimで `admin: true` を付与します。

Firebase Admin SDKが使える環境で、以下のように設定してください。

```js
await admin.auth().setCustomUserClaims("ADMIN_USER_UID", { admin: true });
```

`manage.html`、`room.html`、`room-detail.html`、`room-scan.html` は管理者メールアドレスとパスワードでログインし、IDトークン内の `admin` claimを確認します。Firebase Authのログイン状態はブラウザに保持されるため、同じ端末では毎回入力せずに運営画面へ入れます。

## Firestore Security Rules

このリポジトリの `firestore.rules` をFirebase Consoleに反映してください。主な方針は以下です。

- 一般参加者は `signin.html` から参加者データを作成できます。
- 一般参加者が作成できる初期残高は `INITIAL_BALANCE` と同じ値だけです。
- 6文字IDログイン後のプロフィール更新のため、クライアントが `users` のユーザー名、ユーザー名キー、公開IDだけを更新できる簡易運用にしています。
- `usernames` はユーザー名の重複を避けるための予約コレクションです。
- `publicIds` は6文字IDからユーザーを探すため公開読み取り可能です。
- `rooms`、`roomMembers` は部屋表示とプロフィール表示のため公開読み取り可能で、書き込みは `admin: true` の管理者だけです。
- `transactions` は `admin: true` の管理者だけが読み書きできます。
- ランキング表示のため、`users` は公開読み取り可能です。

## GitHub Pagesで公開する方法

1. GitHubにこのリポジトリをpushします。
2. GitHubのリポジトリ設定で Pages を開きます。
3. Sourceを `Deploy from a branch` にします。
4. Branchを `main`、フォルダを `/root` にして保存します。
5. 参加者には `signin.html` と `ranking.html` を案内します。
6. 運営スタッフは必要に応じて `manage.html`、`room.html` を直接開きます。
7. スマホを持っていない参加者に運営端末でプロフィールだけ見せる場合は、独立ページの `lookup.html` を開きます。
8. 各部屋のディスプレイには `room-detail.html` から `ディスプレイ表示` を開き、必要に応じて全画面表示にします。

## セキュリティ上の制約

このサイトはGitHub Pagesなどの静的ホスティングで動くため、サーバー側の秘密情報を安全に保持できません。運営画面はFirebase AuthenticationとFirestore Security Rulesの `admin` custom claimで保護します。

参加者側はFirebase Authenticationを使わず、6文字の公開IDだけでログインします。IDを知っている人はその参加者の `profile.html` に入れるため、ユーザー名変更も可能です。文化祭内の簡易本人確認として運用してください。

ユーザー名のユニーク判定は、クライアント側のFirestore transactionと `usernames` コレクションで行います。ただし、参加者側をパスワードなしにしているため、Firestore Security Rulesだけで「本人だけが自分の予約名を変更している」ことを完全には証明できません。より強い保護が必要な場合は、参加者にもFirebase Authenticationを使わせる設計に変更してください。

`lookup.html` はnavを持たない独立ページで、6文字IDからユーザー名、現在資産、所属部屋を確認できます。スマホを持っていない訪問者がその場の共用端末で使う想定です。ユーザー名変更はできますが、管理画面への導線は置いていません。確認後は画面上部または下部の終了ボタンでプロフィール表示を閉じます。操作が一定時間ない場合も自動でプロフィール表示を終了します。

ログイン状態は `localStorage` の `hakuyosaiUserId` と `hakuyosaiPublicId` に保存します。端末やブラウザを変える場合は、`signin.html` で6文字IDを入力して入り直します。ランキングのために `users` は公開読み取り可能です。ユーザー名と残高以外の個人情報は保存しないでください。

部屋作成、部屋参加、資産操作は管理者claimに依存しています。より強い監査やサーバー側検証が必要な場合は、Cloud Functionsまたは独自サーバーの導入を検討してください。
