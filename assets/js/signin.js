import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
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

const INITIAL_BALANCE = 1000;
const USER_ID_STORAGE_KEY = "hakuyosaiUserId";
const PUBLIC_ID_STORAGE_KEY = "hakuyosaiPublicId";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const loadingPanel = document.querySelector("#loadingPanel");
const loginPanel = document.querySelector("#loginPanel");
const createPanel = document.querySelector("#createPanel");
const loginForm = document.querySelector("#loginForm");
const createForm = document.querySelector("#createForm");
const loginPublicId = document.querySelector("#loginPublicId");
const createName = document.querySelector("#createName");
const loginButton = document.querySelector("#loginButton");
const createButton = document.querySelector("#createButton");
const loginMessage = document.querySelector("#loginMessage");
const createMessage = document.querySelector("#createMessage");
const signinNav = document.querySelector("#signinNav");
const busyOverlay = document.querySelector("#busyOverlay");
const busyText = document.querySelector("#busyText");

const params = new URLSearchParams(location.search);
const isReception = params.get("reception") === "true";

if (isReception) {
  signinNav.classList.add("hidden");
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

function createReadableError(error) {
  if (error.message === "USERNAME_EXISTS") {
    return new Error("このユーザー名はすでに使われています。別の名前にしてください。");
  }
  if (error.message === "PUBLIC_ID_EXISTS") {
    return new Error("公開IDの生成が重複しました。もう一度お試しください。");
  }
  return error;
}

function normalizePublicId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function validatePublicId(value) {
  const publicId = normalizePublicId(value);
  if (!/^[A-Z0-9]{6}$/.test(publicId)) {
    return { ok: false, message: "公開IDは大文字英字と数字の6文字で入力してください。" };
  }
  return { ok: true, value: publicId };
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function setBusy(isBusy, message = "処理中です。") {
  busyText.textContent = message;
  busyOverlay.classList.toggle("hidden", !isBusy);
  loginButton.disabled = isBusy;
  createButton.disabled = isBusy;
  loginPublicId.disabled = isBusy;
  createName.disabled = isBusy;
}

function showEntryPanels() {
  loadingPanel.classList.add("hidden");
  if (isReception === false) loginPanel.classList.remove("hidden");
  createPanel.classList.remove("hidden");
}

function saveLogin(userId, publicId) {
  localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  localStorage.setItem(PUBLIC_ID_STORAGE_KEY, publicId);
}

function goToProfile() {
  location.href = isReception
    ? "profile.html?reception=true"
    : "profile.html";
}

function generatePublicId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function validateStoredLogin() {
  const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
  if (!storedUserId) {
    showEntryPanels();
    return;
  }

  try {
    const userSnapshot = await getDoc(doc(db, "users", storedUserId));
    if (!userSnapshot.exists()) {
      localStorage.removeItem(USER_ID_STORAGE_KEY);
      localStorage.removeItem(PUBLIC_ID_STORAGE_KEY);
      showEntryPanels();
      return;
    }

    const publicId = userSnapshot.data().publicId || localStorage.getItem(PUBLIC_ID_STORAGE_KEY);
    if (publicId) {
      localStorage.setItem(PUBLIC_ID_STORAGE_KEY, publicId);
    }
    goToProfile();
  } catch (error) {
    showEntryPanels();
    showMessage(loginMessage, `ログイン状態の確認に失敗しました: ${error.message}`, "error");
  }
}

async function createAccount(displayName) {
  const usernameKey = getUsernameKey(displayName);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const publicId = generatePublicId();
    const userRef = doc(collection(db, "users"));
    const userId = userRef.id;

    try {
      await runTransaction(db, async (transaction) => {
        const publicIdRef = doc(db, "publicIds", publicId);
        const usernameRef = doc(db, "usernames", usernameKey);
        const publicIdSnapshot = await transaction.get(publicIdRef);
        const usernameSnapshot = await transaction.get(usernameRef);

        if (publicIdSnapshot.exists()) {
          throw new Error("PUBLIC_ID_EXISTS");
        }
        if (usernameSnapshot.exists()) {
          throw new Error("USERNAME_EXISTS");
        }

        transaction.set(publicIdRef, {
          userId,
          createdAt: serverTimestamp()
        });
        transaction.set(userRef, {
          displayName,
          usernameKey,
          balance: INITIAL_BALANCE,
          publicId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        transaction.set(usernameRef, {
          userId,
          username: displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      return { userId, publicId };
    } catch (error) {
      if (error.message === "USERNAME_EXISTS") {
        throw createReadableError(error);
      }
      if (error.message !== "PUBLIC_ID_EXISTS") {
        throw error;
      }
    }
  }

  throw new Error("公開IDの生成に失敗しました。もう一度お試しください。");
}

loginPublicId.addEventListener("input", () => {
  loginPublicId.value = normalizePublicId(loginPublicId.value).slice(0, 6);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "");

  const validation = validatePublicId(loginPublicId.value);
  if (!validation.ok) {
    showMessage(loginMessage, validation.message, "error");
    return;
  }

  let navigating = false;
  setBusy(true, "ログインしています。");
  try {
    const publicIdSnapshot = await getDoc(doc(db, "publicIds", validation.value));
    if (!publicIdSnapshot.exists()) {
      showMessage(loginMessage, "この公開IDの参加者が見つかりません。", "error");
      return;
    }

    const userId = publicIdSnapshot.data().userId;
    const userSnapshot = await getDoc(doc(db, "users", userId));
    if (!userSnapshot.exists()) {
      showMessage(loginMessage, "参加者データが見つかりません。", "error");
      return;
    }

    saveLogin(userId, validation.value);
    navigating = true;
    goToProfile();
  } catch (error) {
    showMessage(loginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    if (!navigating) {
      setBusy(false);
    }
  }
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(createMessage, "");

  const validation = validateDisplayName(createName.value);
  if (!validation.ok) {
    showMessage(createMessage, validation.message, "error");
    return;
  }

  const confirmed = window.confirm(
    `ユーザー名「${validation.value}」でアカウントを作成します。\nこの名前は他の人と同じものは使えません。\n実行しますか？`
  );
  if (!confirmed) {
    return;
  }

  let navigating = false;
  setBusy(true, "アカウントを作成しています。");

  try {
    const account = await createAccount(validation.value);

    saveLogin(account.userId, account.publicId);
    navigating = true;
    goToProfile();

  } catch (error) {
    showMessage(
      createMessage,
      `アカウント作成に失敗しました: ${error.message}`,
      "error"
    );
  } finally {
    if (!navigating) {
      setBusy(false);
    }
  }
});

validateStoredLogin();
