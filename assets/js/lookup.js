import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
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
const db = getFirestore(app);

const lookupForm = document.querySelector("#lookupForm");
const lookupPublicId = document.querySelector("#lookupPublicId");
const lookupButton = document.querySelector("#lookupButton");
const lookupMessage = document.querySelector("#lookupMessage");
const resultPanel = document.querySelector("#resultPanel");
const lookupRoomCard = document.querySelector("#lookupRoomCard");
const lookupRoom = document.querySelector("#lookupRoom");
const lookupRoomDetail = document.querySelector("#lookupRoomDetail");
const lookupName = document.querySelector("#lookupName");
const lookupPublicIdDisplay = document.querySelector("#lookupPublicIdDisplay");
const lookupBalance = document.querySelector("#lookupBalance");
const renameForm = document.querySelector("#renameForm");
const renameName = document.querySelector("#renameName");
const renameButton = document.querySelector("#renameButton");
const renameMessage = document.querySelector("#renameMessage");
const finishButton = document.querySelector("#finishButton");
const finishButtonBottom = document.querySelector("#finishButtonBottom");

let unsubscribeUser = null;
let unsubscribeRoomMember = null;
let currentUserId = "";
let currentUsername = "";
let inactivityTimerId = 0;

const INACTIVITY_TIMEOUT_MS = 45 * 1000;

function normalizePublicId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDisplayName(value) {
  return value;
}

function validateDisplayName(value) {
  const name = normalizeDisplayName(value);
  if (!/^[A-Za-z0-9_-]{1,12}$/.test(name)) {
    return {
      ok: false,
      message: "ユーザー名は英数字、ハイフン、アンダースコアのみで1〜12文字にしてください。"
    };
  }
  return { ok: true, value: name };
}

function getUsernameKey(username) {
  return username.toLowerCase();
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function setRoomStatus(name, detail, statusClass) {
  lookupRoom.textContent = name;
  lookupRoomDetail.textContent = detail;
  lookupRoomCard.className = `room-status ${statusClass}`;
}

function clearSubscriptions() {
  if (unsubscribeUser) {
    unsubscribeUser();
    unsubscribeUser = null;
  }
  if (unsubscribeRoomMember) {
    unsubscribeRoomMember();
    unsubscribeRoomMember = null;
  }
}

function resetInactivityTimer() {
  window.clearTimeout(inactivityTimerId);
  if (!currentUserId) {
    return;
  }

  inactivityTimerId = window.setTimeout(() => {
    endLookupSession("一定時間操作がなかったため、プロフィール表示を終了しました。", "info");
  }, INACTIVITY_TIMEOUT_MS);
}

function endLookupSession(message = "プロフィール表示を終了しました。", type = "success") {
  clearSubscriptions();
  currentUserId = "";
  currentUsername = "";
  window.clearTimeout(inactivityTimerId);
  resultPanel.classList.add("hidden");
  lookupForm.reset();
  renameForm.reset();
  lookupPublicId.focus();
  showMessage(lookupMessage, message, type);
  showMessage(renameMessage, "");
}

async function updateUsername(userId, nextName) {
  const nextUsernameKey = getUsernameKey(nextName);
  const userRef = doc(db, "users", userId);

  await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);

    if (!userSnapshot.exists()) {
      throw new Error("アカウントが見つかりません。");
    }

    const currentData = userSnapshot.data();
    const currentUsernameKey =
      currentData.usernameKey ||
      (currentData.displayName ? getUsernameKey(currentData.displayName) : "");
    const nextUsernameRef = doc(db, "usernames", nextUsernameKey);
    const currentUsernameRef = currentUsernameKey
      ? doc(db, "usernames", currentUsernameKey)
      : null;
    const nextUsernameSnapshot = await transaction.get(nextUsernameRef);
    const currentUsernameSnapshot =
      currentUsernameRef && currentUsernameKey !== nextUsernameKey
        ? await transaction.get(currentUsernameRef)
        : null;

    if (
      nextUsernameSnapshot.exists() &&
      nextUsernameSnapshot.data().userId !== userId
    ) {
      throw new Error("USERNAME_EXISTS");
    }

    if (
      currentUsernameRef &&
      currentUsernameKey !== nextUsernameKey &&
      currentUsernameSnapshot.exists() &&
      currentUsernameSnapshot.data().userId === userId
    ) {
      transaction.delete(currentUsernameRef);
    }

    transaction.set(nextUsernameRef, {
      userId,
      username: nextName,
      createdAt: nextUsernameSnapshot.exists()
        ? nextUsernameSnapshot.data().createdAt
        : serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.update(userRef, {
      displayName: nextName,
      usernameKey: nextUsernameKey,
      updatedAt: serverTimestamp()
    });
  });
}

function watchProfile(userId, publicId) {
  clearSubscriptions();
  currentUserId = userId;
  resultPanel.classList.remove("hidden");
  lookupPublicIdDisplay.textContent = publicId;
  setRoomStatus("確認中", "部屋が変わると自動で更新されます。", "is-loading");
  resetInactivityTimer();

  unsubscribeUser = onSnapshot(
    doc(db, "users", userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        showMessage(lookupMessage, "参加者データが見つかりません。", "error");
        resultPanel.classList.add("hidden");
        clearSubscriptions();
        return;
      }

      const user = snapshot.data();
      currentUsername = user.displayName || "";
      lookupName.textContent = currentUsername || "名前なし";
      renameName.value = currentUsername;
      lookupPublicIdDisplay.textContent = user.publicId || publicId;
      lookupBalance.textContent = formatNumber(user.balance);
    },
    (error) => {
      showMessage(lookupMessage, `プロフィールの取得に失敗しました: ${error.message}`, "error");
    }
  );

  unsubscribeRoomMember = onSnapshot(
    doc(db, "roomMembers", userId),
    (snapshot) => {
      if (!snapshot.exists()) {
        setRoomStatus("未参加", "スタッフが部屋に追加すると、ここに部屋名が表示されます。", "is-empty");
        return;
      }

      const membership = snapshot.data();
      setRoomStatus(
        membership.roomName || "名前なしの部屋",
        "現在この部屋に所属しています。部屋が変わると自動で更新されます。",
        "is-active"
      );
    },
    (error) => {
      setRoomStatus("取得失敗", "所属部屋を読み込めませんでした。", "is-error");
      showMessage(lookupMessage, `所属部屋の取得に失敗しました: ${error.message}`, "error");
    }
  );
}

lookupPublicId.addEventListener("input", () => {
  lookupPublicId.value = normalizePublicId(lookupPublicId.value).slice(0, 6);
});

["pointerdown", "keydown", "input"].forEach((eventName) => {
  window.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(lookupMessage, "");

  const publicId = normalizePublicId(lookupPublicId.value);
  if (!/^[A-Z0-9]{6}$/.test(publicId)) {
    showMessage(lookupMessage, "公開IDは大文字英字と数字の6文字で入力してください。", "error");
    return;
  }

  lookupButton.disabled = true;
  try {
    const publicIdSnapshot = await getDoc(doc(db, "publicIds", publicId));
    if (!publicIdSnapshot.exists()) {
      resultPanel.classList.add("hidden");
      clearSubscriptions();
      showMessage(lookupMessage, "この公開IDの参加者が見つかりません。", "error");
      return;
    }

    watchProfile(publicIdSnapshot.data().userId, publicId);
  } catch (error) {
    showMessage(lookupMessage, `プロフィール確認に失敗しました: ${error.message}`, "error");
  } finally {
    lookupButton.disabled = false;
  }
});

renameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(renameMessage, "");

  if (!currentUserId) {
    showMessage(renameMessage, "先に公開IDを入力してください。", "error");
    return;
  }

  const validation = validateDisplayName(renameName.value);
  if (!validation.ok) {
    showMessage(renameMessage, validation.message, "error");
    return;
  }

  if (validation.value === currentUsername) {
    showMessage(renameMessage, "同じユーザー名です。", "success");
    return;
  }

  const confirmed = window.confirm(
    `${currentUsername || "この参加者"} のユーザー名を ${validation.value} に変更します。\n実行しますか？`
  );
  if (!confirmed) {
    return;
  }

  renameButton.disabled = true;
  try {
    await updateUsername(currentUserId, validation.value);
    showMessage(renameMessage, "ユーザー名を変更しました。確認が終わったら終了してください。", "success");
  } catch (error) {
    const message = error.message === "USERNAME_EXISTS"
      ? "このユーザー名はすでに使われています。別の名前にしてください。"
      : `ユーザー名変更に失敗しました: ${error.message}`;
    showMessage(renameMessage, message, "error");
  } finally {
    renameButton.disabled = false;
  }
});

finishButton.addEventListener("click", () => {
  endLookupSession();
});

finishButtonBottom.addEventListener("click", () => {
  endLookupSession();
});

window.addEventListener("pagehide", clearSubscriptions);
