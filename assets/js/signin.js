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
  setDoc,
  updateDoc,
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

const INITIAL_BALANCE = 1000;
const USER_ID_STORAGE_KEY = "hakuyosaiUserId";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loadingPanel = document.querySelector("#loadingPanel");
const createPanel = document.querySelector("#createPanel");
const accountPanel = document.querySelector("#accountPanel");
const renamePanel = document.querySelector("#renamePanel");
const createForm = document.querySelector("#createForm");
const renameForm = document.querySelector("#renameForm");
const createName = document.querySelector("#createName");
const renameName = document.querySelector("#renameName");
const currentName = document.querySelector("#currentName");
const userIdElement = document.querySelector("#userId");
const createButton = document.querySelector("#createButton");
const renameButton = document.querySelector("#renameButton");
const createMessage = document.querySelector("#createMessage");
const renameMessage = document.querySelector("#renameMessage");

let currentUserId = "";

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

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
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

function setVisibleState(hasAccount) {
  loadingPanel.classList.add("hidden");
  createPanel.classList.toggle("hidden", hasAccount);
  accountPanel.classList.toggle("hidden", !hasAccount);
  renamePanel.classList.toggle("hidden", !hasAccount);
}

function renderAccount(userId, data) {
  currentUserId = userId;
  localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  currentName.textContent = data.displayName;
  userIdElement.textContent = userId;
  renameName.value = data.displayName;
  setVisibleState(true);
}

async function loadAccount() {
  try {
    const authUser = await ensureAnonymousUser();
    const storedUserId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (storedUserId && storedUserId !== authUser.uid) {
      localStorage.removeItem(USER_ID_STORAGE_KEY);
    }

    const snapshot = await getDoc(doc(db, "users", authUser.uid));

    if (snapshot.exists()) {
      renderAccount(authUser.uid, snapshot.data());
      return;
    }

    currentUserId = authUser.uid;
    setVisibleState(false);
  } catch (error) {
    loadingPanel.innerHTML = "";
    const message = document.createElement("p");
    loadingPanel.appendChild(message);
    showMessage(message, `Firestoreへの接続に失敗しました: ${error.message}`, "error");
  }
}

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
    const userRef = doc(db, "users", authUser.uid);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      renderAccount(authUser.uid, snapshot.data());
      showMessage(createMessage, "この端末ではすでにアカウントが作成されています。", "info");
      return;
    }

    const userData = {
      displayName: validation.value,
      balance: INITIAL_BALANCE,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(userRef, userData);
    renderAccount(authUser.uid, { ...userData, displayName: validation.value });
    showMessage(renameMessage, "アカウントを作成しました。", "success");
  } catch (error) {
    showMessage(createMessage, `アカウント作成に失敗しました: ${error.message}`, "error");
  } finally {
    createButton.disabled = false;
  }
});

renameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(renameMessage, "");

  const validation = validateDisplayName(renameName.value);
  if (!validation.ok) {
    showMessage(renameMessage, validation.message, "error");
    return;
  }

  renameButton.disabled = true;
  try {
    await updateDoc(doc(db, "users", currentUserId), {
      displayName: validation.value,
      updatedAt: serverTimestamp()
    });
    currentName.textContent = validation.value;
    showMessage(renameMessage, "表示名を変更しました。", "success");
  } catch (error) {
    showMessage(renameMessage, `表示名変更に失敗しました: ${error.message}`, "error");
  } finally {
    renameButton.disabled = false;
  }
});

loadAccount();
