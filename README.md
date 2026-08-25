# 2026 柏葉祭カジノ 資産管理サイト

文化祭のカジノ企画で、参加者が持っているゲーム内ポイント・チップを管理するための静的Webサイトです。実際のお金や決済機能は扱いません。

## ページ

- `signin.html`: 参加者のアカウント作成、現在の表示名確認、表示名変更
- `manage.html`: 運営スタッフによるユーザー検索、資産変更、取引履歴確認
- `ranking.html`: 現在資産のランキング表示

## Firebaseセットアップ

1. Firebase Consoleでプロジェクトを作成します。
2. Webアプリを追加し、Firebase configを取得します。
3. `assets/js/signin.js`、`assets/js/manage.js`、`assets/js/ranking.js` の先頭にある `firebaseConfig` を自分のプロジェクトの値に変更します。
4. Authenticationで以下を有効化します。
   - Anonymous
   - Email/Password
5. Firestore Databaseを作成します。
6. `firestore.rules` の内容をFirestore Security Rulesへ設定します。

## Firestoreのコレクション構造

```text
users/{userId}
  displayName: string
  balance: number
  createdAt: timestamp
  updatedAt: timestamp

transactions/{transactionId}
  userId: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  type: "increment" | "add" | "subtract" | "set"
  createdAt: timestamp
  adminUid: string
```

`users/{userId}` はFirebase Anonymous AuthのUIDを使用します。端末側にも `localStorage` の `hakuyosaiUserId` として保存しています。

## 初期残高の変更方法

初期残高は `assets/js/signin.js` の次の定数で変更できます。

```js
const INITIAL_BALANCE = 1000;
```

変更した場合は、`firestore.rules` の `request.resource.data.balance == 1000` も同じ値に変更してください。

## 管理者設定方法

管理者パスワードをJavaScript内に平文で埋め込まないため、管理者はFirebase AuthenticationのEmail/Passwordアカウントとして作成し、custom claimで `admin: true` を付与します。

Firebase Admin SDKが使える環境で、以下のように設定してください。

```js
await admin.auth().setCustomUserClaims("ADMIN_USER_UID", { admin: true });
```

`manage.html` では管理者メールアドレスとパスワードでログインし、IDトークン内の `admin` claimを確認します。Firestore Rulesでも `request.auth.token.admin == true` の場合だけ資産変更と取引履歴書き込みを許可します。

## Firestore Security Rules

このリポジトリの `firestore.rules` をFirebase Consoleに反映してください。主な方針は以下です。

- 一般参加者は自分の `users/{uid}` だけ作成できます。
- 一般参加者が作成できる初期残高は `INITIAL_BALANCE` と同じ値だけです。
- 一般参加者が更新できるのは自分の `displayName` と `updatedAt` だけです。
- `balance` と `createdAt` は一般参加者から変更できません。
- `transactions` は管理者だけが読み書きできます。
- ランキング表示のため、`users` は公開読み取り可能です。

## GitHub Pagesで公開する方法

1. GitHubにこのリポジトリをpushします。
2. GitHubのリポジトリ設定で Pages を開きます。
3. Sourceを `Deploy from a branch` にします。
4. Branchを `main`、フォルダを `/root` にして保存します。
5. 公開URLで `signin.html`、`ranking.html`、`manage.html` を開きます。

## セキュリティ上の制約

このサイトはGitHub Pagesなどの静的ホスティングで動くため、サーバー側の秘密情報を安全に保持できません。そのため、管理者パスワードをJavaScriptに直接書く実装は採用していません。

参加者側は画面上のログイン操作を省略するため、Firebase Anonymous Authを使用しています。Anonymous Authの認証状態はブラウザに保存され、あわせてユーザーIDを `localStorage` に保存します。端末やブラウザを変えると同じ参加者として扱えない場合があります。

`localStorage` だけでは本人確認を安全に行えません。この実装ではFirestore Rulesの本人判定にFirebase AuthのUIDを使っています。ただし、ランキングのために `users` は公開読み取り可能です。表示名と残高以外の個人情報は保存しないでください。

より強い本人確認や管理者監査が必要な場合は、Firebase Authenticationの通常ログイン、Cloud Functions、または独自サーバーの導入を検討してください。
