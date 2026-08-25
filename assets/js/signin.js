import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
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
const auth = getAuth(app);
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

function normalizeDisplayName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function validateDisplayName(value) {
  const name = normalizeDisplayName(value);
  if (name.length < 1) {
    return { ok: false, message: "表示名を入力してください。" };
  }
  if (name.length > 24) {
    return { ok: false, message: "表示名は24文字以内にしてください。" };
  }
  return { ok: true, value: name };
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

function showEntryPanels() {
  loadingPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  createPanel.classList.remove("hidden");
}

function saveLogin(userId, publicId) {
  localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  localStorage.setItem(PUBLIC_ID_STORAGE_KEY, publicId);
}

function goToProfile() {
  location.href = "profile.html";
}

function generatePublicId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function ensureAnonymousUser() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
        return;
      }

      try {
        const result = await signInAnonymously(auth);
        resolve(result.user);
      } catch (error) {
        reject(error);
      }
    });
  });
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

async function createAccount(userId, displayName) {
  const userRef = doc(db, "users", userId);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const publicId = generatePublicId();
    try {
      await runTransaction(db, async (transaction) => {
        const userSnapshot = await transaction.get(userRef);
        const publicIdRef = doc(db, "publicIds", publicId);
        const publicIdSnapshot = await transaction.get(publicIdRef);

        if (userSnapshot.exists()) {
          throw new Error("この端末ではすでにアカウントが作成されています。");
        }
        if (publicIdSnapshot.exists()) {
          throw new Error("PUBLIC_ID_EXISTS");
        }

        transaction.set(publicIdRef, {
          userId,
          createdAt: serverTimestamp()
        });
        transaction.set(userRef, {
          displayName,
          balance: INITIAL_BALANCE,
          publicId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      return publicId;
    } catch (error) {
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

  loginButton.disabled = true;
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
    goToProfile();
  } catch (error) {
    showMessage(loginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    loginButton.disabled = false;
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

  createButton.disabled = true;
  try {
    const authUser = await ensureAnonymousUser();
    const userSnapshot = await getDoc(doc(db, "users", authUser.uid));
    if (userSnapshot.exists()) {
      const publicId = userSnapshot.data().publicId || "";
      saveLogin(authUser.uid, publicId);
      goToProfile();
      return;
    }

    const publicId = await createAccount(authUser.uid, validation.value);
    saveLogin(authUser.uid, publicId);
    goToProfile();
  } catch (error) {
    showMessage(createMessage, `アカウント作成に失敗しました: ${error.message}`, "error");
  } finally {
    createButton.disabled = false;
  }
});

validateStoredLogin();

