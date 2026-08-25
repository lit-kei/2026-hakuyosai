import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const managePanel = document.querySelector("#managePanel");
const searchInput = document.querySelector("#searchInput");
const userList = document.querySelector("#userList");
const userListMessage = document.querySelector("#userListMessage");
const emptySelection = document.querySelector("#emptySelection");
const selectedUserPanel = document.querySelector("#selectedUserPanel");
const selectedName = document.querySelector("#selectedName");
const selectedId = document.querySelector("#selectedId");
const selectedBalance = document.querySelector("#selectedBalance");
const assetPanel = document.querySelector("#assetPanel");
const transactionsPanel = document.querySelector("#transactionsPanel");
const transactionMessage = document.querySelector("#transactionMessage");
const transactionList = document.querySelector("#transactionList");
const assetMessage = document.querySelector("#assetMessage");
const adjustForm = document.querySelector("#adjustForm");
const adjustAmount = document.querySelector("#adjustAmount");
const setBalanceForm = document.querySelector("#setBalanceForm");
const setBalanceAmount = document.querySelector("#setBalanceAmount");
const quickAmountButtons = Array.from(document.querySelectorAll(".quickAmount"));

let users = [];
let selectedUserId = "";
let unsubscribeUsers = null;
let unsubscribeTransactions = null;
let isProcessing = false;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

async function requireAdminClaim() {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true;
}

function setProcessing(processing) {
  isProcessing = processing;
  document
    .querySelectorAll("#assetPanel button, #assetPanel input")
    .forEach((element) => {
      element.disabled = processing;
    });
}

function parseAmount(value, allowZero = false) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    return null;
  }
  return amount;
}

function getSelectedUser() {
  return users.find((user) => user.id === selectedUserId) || null;
}

function renderUsers() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const name = (user.displayName || "").toLowerCase();
    return name.includes(searchTerm) || user.id.toLowerCase().includes(searchTerm);
  });

  userList.innerHTML = "";
  if (filteredUsers.length === 0) {
    showMessage(userListMessage, "該当するユーザーがいません。", "info");
    return;
  }

  userListMessage.hidden = true;
  filteredUsers.forEach((user) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `user-item${user.id === selectedUserId ? " is-selected" : ""}`;
    button.dataset.userId = user.id;

    const name = document.createElement("strong");
    name.textContent = user.displayName || "名前なし";
    const detail = document.createElement("span");
    detail.textContent = `${formatNumber(user.balance)} / ${user.id}`;

    button.append(name, detail);
    userList.appendChild(button);
  });
}

function renderSelectedUser() {
  const user = getSelectedUser();
  const hasUser = Boolean(user);
  emptySelection.classList.toggle("hidden", hasUser);
  selectedUserPanel.classList.toggle("hidden", !hasUser);
  assetPanel.classList.toggle("hidden", !hasUser);
  transactionsPanel.classList.toggle("hidden", !hasUser);

  if (!user) {
    return;
  }

  selectedName.textContent = user.displayName || "名前なし";
  selectedId.textContent = user.id;
  selectedBalance.textContent = formatNumber(user.balance);
  setBalanceAmount.value = user.balance;
}

function watchUsers() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
  }

  const usersQuery = query(collection(db, "users"), orderBy("displayName"), limit(500));
  unsubscribeUsers = onSnapshot(
    usersQuery,
    (snapshot) => {
      users = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      renderUsers();
      renderSelectedUser();
    },
    (error) => {
      showMessage(userListMessage, `ユーザー一覧の取得に失敗しました: ${error.message}`, "error");
    }
  );
}

function watchTransactions(userId) {
  if (unsubscribeTransactions) {
    unsubscribeTransactions();
  }
  transactionList.innerHTML = "";
  showMessage(transactionMessage, "取引履歴を読み込み中です。", "info");

  const transactionQuery = query(
    collection(db, "transactions"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  unsubscribeTransactions = onSnapshot(
    transactionQuery,
    (snapshot) => {
      transactionList.innerHTML = "";
      if (snapshot.empty) {
        showMessage(transactionMessage, "取引履歴はまだありません。", "info");
        return;
      }

      transactionMessage.hidden = true;
      snapshot.docs.forEach((documentSnapshot) => {
        const transaction = documentSnapshot.data();
        const item = document.createElement("li");
        item.className = "transaction-item";

        const main = document.createElement("div");
        main.className = "transaction-main";
        const amount = Number(transaction.amount || 0);
        main.textContent = `${amount > 0 ? "+" : ""}${formatNumber(amount)}: ${formatNumber(transaction.balanceBefore)} -> ${formatNumber(transaction.balanceAfter)}`;

        const time = document.createElement("small");
        const date = transaction.createdAt?.toDate?.();
        time.textContent = date ? date.toLocaleString("ja-JP") : "日時を記録中";

        item.append(main, time);
        transactionList.appendChild(item);
      });
    },
    (error) => {
      showMessage(transactionMessage, `取引履歴の取得に失敗しました: ${error.message}`, "error");
    }
  );
}

async function updateBalance({ type, amount = 0, targetBalance = null }) {
  if (isProcessing) {
    return;
  }

  const user = getSelectedUser();
  if (!user) {
    showMessage(assetMessage, "ユーザーを選択してください。", "error");
    return;
  }

  const nextBalance = targetBalance === null ? Number(user.balance || 0) + amount : targetBalance;
  if (!Number.isInteger(nextBalance) || nextBalance < 0) {
    showMessage(assetMessage, "変更後の残高が不正です。", "error");
    return;
  }

  const confirmed = window.confirm(
    `${user.displayName || "名前なし"} の資産を\n\n${formatNumber(user.balance)} -> ${formatNumber(nextBalance)}\n\nに変更します。\n実行しますか？`
  );
  if (!confirmed) {
    return;
  }

  setProcessing(true);
  showMessage(assetMessage, "処理中です。", "info");

  try {
    const userRef = doc(db, "users", user.id);
    await runTransaction(db, async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists()) {
        throw new Error("対象ユーザーが見つかりません。");
      }

      const currentBalance = Number(userSnapshot.data().balance || 0);
      const balanceAfter = targetBalance === null ? currentBalance + amount : targetBalance;
      if (!Number.isInteger(balanceAfter) || balanceAfter < 0) {
        throw new Error("残高が0未満になる操作はできません。");
      }

      const transactionRef = doc(collection(db, "transactions"));
      transaction.update(userRef, {
        balance: balanceAfter,
        updatedAt: serverTimestamp()
      });
      transaction.set(transactionRef, {
        userId: user.id,
        amount: balanceAfter - currentBalance,
        balanceBefore: currentBalance,
        balanceAfter,
        type,
        createdAt: serverTimestamp(),
        adminUid: auth.currentUser.uid
      });
    });

    showMessage(assetMessage, "資産を変更しました。", "success");
    adjustAmount.value = "";
  } catch (error) {
    showMessage(assetMessage, `資産変更に失敗しました: ${error.message}`, "error");
  } finally {
    setProcessing(false);
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(adminLoginMessage, "");
  adminLoginButton.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, adminEmail.value.trim(), adminPassword.value);
    const isAdmin = await requireAdminClaim();
    if (!isAdmin) {
      await signOut(auth);
      showMessage(adminLoginMessage, "このアカウントには管理者権限がありません。", "error");
      return;
    }

    adminLoginPanel.classList.add("hidden");
    managePanel.classList.remove("hidden");
    watchUsers();
  } catch (error) {
    showMessage(adminLoginMessage, `管理者ログインに失敗しました: ${error.message}`, "error");
  } finally {
    adminLoginButton.disabled = false;
  }
});

searchInput.addEventListener("input", renderUsers);

userList.addEventListener("click", (event) => {
  const button = event.target.closest(".user-item");
  if (!button) {
    return;
  }

  selectedUserId = button.dataset.userId;
  renderUsers();
  renderSelectedUser();
  watchTransactions(selectedUserId);
  showMessage(assetMessage, "");
});

quickAmountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.amount);
    updateBalance({ type: "increment", amount });
  });
});

adjustForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const amount = parseAmount(adjustAmount.value);
  if (amount === null) {
    showMessage(assetMessage, "金額は1以上の整数で入力してください。", "error");
    return;
  }

  const signedAmount = submitter?.value === "subtract" ? -amount : amount;
  updateBalance({ type: signedAmount >= 0 ? "add" : "subtract", amount: signedAmount });
});

setBalanceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const targetBalance = parseAmount(setBalanceAmount.value, true);
  if (targetBalance === null) {
    showMessage(assetMessage, "残高は0以上の整数で入力してください。", "error");
    return;
  }

  updateBalance({ type: "set", targetBalance });
});
