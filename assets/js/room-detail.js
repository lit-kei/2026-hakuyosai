import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoBskKHJxPUfnVz0rhinxHBm6VuZ6ndoQ",
  authDomain: "hakuyosai-ae580.firebaseapp.com",
  projectId: "hakuyosai-ae580",
  storageBucket: "hakuyosai-ae580.firebasestorage.app",
  messagingSenderId: "729750832138",
  appId: "1:729750832138:web:7248b5bc281179e8ec4bf3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const roomId = new URLSearchParams(location.search).get("id");
const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const mainPanel = document.querySelector("#mainPanel");
const roomTitle = document.querySelector("#roomTitle");
const roomNameDisplay = document.querySelector("#roomNameDisplay");
const roomMessage = document.querySelector("#roomMessage");
const scanButton = document.querySelector("#scanButton");
const scanLink = document.querySelector("#scanLink");
const memberMessage = document.querySelector("#memberMessage");
const memberList = document.querySelector("#memberList");

let room = null;
let members = [];
let unsubscribeMembers = null;
let processingUserId = "";

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return amount;
}

async function checkAdminPassword(inputPassword) {
  const snapshot = await getDoc(doc(db, "password", "password"));
  if (!snapshot.exists()) {
    throw new Error("パスワード設定が見つかりません。");
  }
  return snapshot.data().password === inputPassword;
}

async function ensureStaffSession() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

async function loadRoom() {
  if (!roomId) {
    showMessage(adminLoginMessage, "部屋IDが指定されていません。", "error");
    adminLoginButton.disabled = true;
    return false;
  }

  const snapshot = await getDoc(doc(db, "rooms", roomId));
  if (!snapshot.exists()) {
    showMessage(adminLoginMessage, "部屋が見つかりません。", "error");
    adminLoginButton.disabled = true;
    return false;
  }

  room = { id: snapshot.id, ...snapshot.data() };
  roomTitle.textContent = room.name || "個別部屋管理";
  roomNameDisplay.textContent = room.name || "名前なしの部屋";
  scanButton.href = `room-scan.html?id=${encodeURIComponent(roomId)}`;
  scanLink.href = `room-scan.html?id=${encodeURIComponent(roomId)}`;
  return true;
}

async function hydrateMembers(memberSnapshots) {
  const nextMembers = await Promise.all(
    memberSnapshots.map(async (memberSnapshot) => {
      const userSnapshot = await getDoc(doc(db, "users", memberSnapshot.id));
      return {
        memberId: memberSnapshot.id,
        membership: memberSnapshot.data(),
        user: userSnapshot.exists() ? { id: userSnapshot.id, ...userSnapshot.data() } : null
      };
    })
  );

  members = nextMembers;
  renderMembers();
}

function renderMembers() {
  memberList.innerHTML = "";

  if (members.length === 0) {
    showMessage(memberMessage, "この部屋にはまだ参加者がいません。", "info");
    return;
  }

  memberMessage.hidden = true;
  members.forEach((member) => {
    const user = member.user;
    const item = document.createElement("article");
    item.className = "member-card";

    const header = document.createElement("div");
    header.className = "member-header";

    const nameBlock = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = user?.displayName || "参加者データなし";
    const publicId = document.createElement("span");
    publicId.textContent = user?.publicId ? `公開ID: ${user.publicId}` : "公開IDなし";
    nameBlock.append(name, publicId);

    const balance = document.createElement("p");
    balance.className = "member-balance";
    balance.textContent = user ? formatNumber(user.balance) : "-";
    header.append(nameBlock, balance);

    const quickGrid = document.createElement("div");
    quickGrid.className = "button-grid";
    [100, 500, -100, -500].forEach((amount) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = amount < 0 ? "button-danger" : "";
      button.textContent = `${amount > 0 ? "+" : ""}${amount}`;
      button.disabled = !user || processingUserId === user.id;
      button.addEventListener("click", () => updateBalance(user, amount, "room-quick"));
      quickGrid.appendChild(button);
    });

    const form = document.createElement("form");
    form.className = "inline-form";
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.step = "1";
    input.placeholder = "金額";
    input.disabled = !user || processingUserId === user?.id;
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.name = "direction";
    addButton.value = "add";
    addButton.textContent = "追加";
    addButton.disabled = !user || processingUserId === user?.id;
    const subtractButton = document.createElement("button");
    subtractButton.type = "submit";
    subtractButton.name = "direction";
    subtractButton.value = "subtract";
    subtractButton.className = "button-danger";
    subtractButton.textContent = "減少";
    subtractButton.disabled = !user || processingUserId === user?.id;
    form.append(input, addButton, subtractButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const amount = parseAmount(input.value);
      if (amount === null) {
        showMessage(roomMessage, "金額は1以上の整数で入力してください。", "error");
        return;
      }
      const signedAmount = event.submitter?.value === "subtract" ? -amount : amount;
      updateBalance(user, signedAmount, signedAmount > 0 ? "room-add" : "room-subtract");
      input.value = "";
    });

    const leaveButton = document.createElement("button");
    leaveButton.type = "button";
    leaveButton.className = "button-secondary";
    leaveButton.textContent = "退出";
    leaveButton.disabled = !user || processingUserId === user?.id;
    leaveButton.addEventListener("click", () => removeMember(user));

    item.append(header, quickGrid, form, leaveButton);
    memberList.appendChild(item);
  });
}

function watchMembers() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const membersQuery = query(collection(db, "roomMembers"), where("roomId", "==", roomId));
  unsubscribeMembers = onSnapshot(
    membersQuery,
    (snapshot) => hydrateMembers(snapshot.docs),
    (error) => showMessage(memberMessage, `参加者の取得に失敗しました: ${error.message}`, "error")
  );
}

async function updateBalance(user, amount, type) {
  if (!user || processingUserId) {
    return;
  }

  const nextBalance = Number(user.balance || 0) + amount;
  if (!Number.isInteger(nextBalance) || nextBalance < 0) {
    showMessage(roomMessage, "変更後の残高が不正です。", "error");
    return;
  }

  const confirmed = window.confirm(
    `${user.displayName || "名前なし"} の資産を\n\n${formatNumber(user.balance)} -> ${formatNumber(nextBalance)}\n\nに変更します。\n実行しますか？`
  );
  if (!confirmed) {
    return;
  }

  processingUserId = user.id;
  renderMembers();
  showMessage(roomMessage, "処理中です。", "info");

  try {
    let actualBalanceAfter = nextBalance;
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, "users", user.id);
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists()) {
        throw new Error("対象ユーザーが見つかりません。");
      }

      const currentBalance = Number(userSnapshot.data().balance || 0);
      const balanceAfter = currentBalance + amount;
      if (!Number.isInteger(balanceAfter) || balanceAfter < 0) {
        throw new Error("残高が0未満になる操作はできません。");
      }
      actualBalanceAfter = balanceAfter;

      transaction.update(userRef, {
        balance: balanceAfter,
        updatedAt: serverTimestamp()
      });
      transaction.set(doc(collection(db, "transactions")), {
        userId: user.id,
        amount,
        balanceBefore: currentBalance,
        balanceAfter,
        type,
        roomId,
        roomName: room.name || "",
        createdAt: serverTimestamp()
      });
    });

    members = members.map((member) => {
      if (member.user?.id !== user.id) {
        return member;
      }
      return {
        ...member,
        user: {
          ...member.user,
          balance: actualBalanceAfter
        }
      };
    });
    showMessage(roomMessage, "資産を変更しました。", "success");
  } catch (error) {
    showMessage(roomMessage, `資産変更に失敗しました: ${error.message}`, "error");
  } finally {
    processingUserId = "";
    renderMembers();
  }
}

async function removeMember(user) {
  if (!user || processingUserId) {
    return;
  }

  const confirmed = window.confirm(`${user.displayName || "名前なし"} をこの部屋から退出させますか？`);
  if (!confirmed) {
    return;
  }

  processingUserId = user.id;
  renderMembers();
  try {
    await deleteDoc(doc(db, "roomMembers", user.id));
    showMessage(roomMessage, "退出しました。", "success");
  } catch (error) {
    showMessage(roomMessage, `退出処理に失敗しました: ${error.message}`, "error");
  } finally {
    processingUserId = "";
    renderMembers();
  }
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(adminLoginMessage, "");
  adminLoginButton.disabled = true;

  try {
    const isAdmin = await checkAdminPassword(adminPassword.value);
    if (!isAdmin) {
      showMessage(adminLoginMessage, "パスワードが違います。", "error");
      return;
    }

    await ensureStaffSession();
    const roomLoaded = await loadRoom();
    if (!roomLoaded) {
      return;
    }

    adminLoginPanel.classList.add("hidden");
    mainPanel.classList.remove("hidden");
    watchMembers();
  } catch (error) {
    showMessage(adminLoginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    adminLoginButton.disabled = false;
  }
});
