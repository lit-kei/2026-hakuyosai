# 2026 柏葉祭カジノ 資産管理サイト

文化祭のカジノ企画で、参加者が持っているゲーム内ポイント・チップを管理するための静的Webサイトです。実際のお金や決済機能は扱いません。

## ページ

- `signin.html`: 参加者のアカウント作成、現在の表示名確認、表示名変更
- `manage.html`: 運営スタッフによるユーザー検索、資産変更、取引履歴確認
- `ranking.html`: 現在資産のランキング表示
- `room.html`: 部屋の作成、部屋一覧
- `room-detail.html?id={roomId}`: 個別部屋の参加者、残高、資産変更
- `room-scan.html?id={roomId}`: 部屋専用のQRコード読み取り、公開ID手入力

## Firebaseセットアップ

1. Firebase Consoleでプロジェクトを作成します。
2. Webアプリを追加し、Firebase configを取得します。
3. `assets/js/*.js` の先頭にある `firebaseConfig` を自分のプロジェクトの値に変更します。
4. Authenticationで以下を有効化します。
   - Anonymous
5. Firestore Databaseを作成します。
6. `firestore.rules` の内容をFirestore Security Rulesへ設定します。
7. Firestoreに `password/password` ドキュメントを作成し、`password` フィールドに運営用パスワードを入れます。

## Firestoreのコレクション構造

```text
users/{userId}
  displayName: string
  balance: number
  publicId: string
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

password/password
  password: string
```

`users/{userId}` はFirebase Anonymous AuthのUIDを使用します。端末側にも `localStorage` の `hakuyosaiUserId` として保存しています。

`publicId` は大文字英字と数字からなる6文字のIDです。参加者プロフィールのQRコードにはこの `publicId` だけを入れています。QRコードを表示できない場合は、スタッフが `room-scan.html` でこのIDを手入力できます。

`roomMembers/{userId}` は参加者の現在いる部屋を表します。同じ参加者を別の部屋に追加すると、このドキュメントが上書きされるため、所属は常に1部屋だけです。

## 初期残高の変更方法

初期残高は `assets/js/signin.js` の次の定数で変更できます。

```js
const INITIAL_BALANCE = 1000;
```

変更した場合は、`firestore.rules` の `request.resource.data.balance == 1000` も同じ値に変更してください。

## 管理者設定方法

管理者パスワードをJavaScript内に平文で埋め込まないため、運営画面はFirestoreの `password/password` ドキュメントに保存した `password` フィールドを読み、入力値と一致するかをブラウザ側で確認します。

`manage.html`、`room.html`、`room-detail.html`、`room-scan.html` はこの方式を使います。パスワード通過後、スタッフ画面はFirebase Anonymous Authへ入り、Firestoreへ書き込みます。

## Firestore Security Rules

このリポジトリの `firestore.rules` をFirebase Consoleに反映してください。主な方針は以下です。

- 一般参加者は自分の `users/{uid}` だけ作成できます。
- 一般参加者が作成できる初期残高は `INITIAL_BALANCE` と同じ値だけです。
- 一般参加者は自分の `displayName`、`publicId`、`updatedAt` を更新できます。
- `publicIds` は6文字IDからユーザーを探すため公開読み取り可能です。
- `rooms`、`roomMembers`、`transactions` はスタッフ画面が匿名認証後に読み書きします。
- ランキング表示のため、`users` は公開読み取り可能です。

## GitHub Pagesで公開する方法

1. GitHubにこのリポジトリをpushします。
2. GitHubのリポジトリ設定で Pages を開きます。
3. Sourceを `Deploy from a branch` にします。
4. Branchを `main`、フォルダを `/root` にして保存します。
5. 公開URLで `signin.html`、`ranking.html`、`manage.html`、`room.html` を開きます。

## セキュリティ上の制約

このサイトはGitHub Pagesなどの静的ホスティングで動くため、サーバー側の秘密情報を安全に保持できません。現在の管理者パスワード方式はFirestore上の値をブラウザで照合する簡易方式です。パスワードをJavaScriptへ直接書くより運用はしやすいですが、Firestore Rules上の強い管理者認可にはなりません。

参加者側は画面上のログイン操作を省略するため、Firebase Anonymous Authを使用しています。Anonymous Authの認証状態はブラウザに保存され、あわせてユーザーIDを `localStorage` に保存します。端末やブラウザを変えると同じ参加者として扱えない場合があります。

`localStorage` だけでは本人確認を安全に行えません。この実装ではFirestore Rulesの本人判定にFirebase AuthのUIDを使っています。ただし、ランキングのために `users` は公開読み取り可能です。表示名と残高以外の個人情報は保存しないでください。

部屋作成、部屋参加、資産操作はスタッフ画面のパスワードゲートに依存しています。より強い本人確認、管理者認可、監査が必要な場合は、Firebase Authenticationの管理者アカウント、custom claim、Cloud Functions、または独自サーバーの導入を検討してください。
