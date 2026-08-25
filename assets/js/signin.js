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
  updateDoc,
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
const publicIdElement = document.querySelector("#publicId");
const qrCodeElement = document.querySelector("#qrCode");
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

function generatePublicId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function assignPublicId(userId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const publicId = generatePublicId();
    let assignedPublicId = publicId;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", userId);
        const publicIdRef = doc(db, "publicIds", publicId);
        const userSnapshot = await transaction.get(userRef);
        const publicIdSnapshot = await transaction.get(publicIdRef);

        if (!userSnapshot.exists()) {
          throw new Error("アカウントが見つかりません。");
        }
        if (userSnapshot.data().publicId) {
          assignedPublicId = userSnapshot.data().publicId;
          return;
        }
        if (publicIdSnapshot.exists()) {
          throw new Error("PUBLIC_ID_EXISTS");
        }

        transaction.set(publicIdRef, {
          userId,
          createdAt: serverTimestamp()
        });
        transaction.update(userRef, {
          publicId,
          updatedAt: serverTimestamp()
        });
      });

      return assignedPublicId;
    } catch (error) {
      if (error.message !== "PUBLIC_ID_EXISTS") {
        throw error;
      }
    }
  }

  throw new Error("公開IDの生成に失敗しました。もう一度お試しください。");
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

      return {
        displayName,
        balance: INITIAL_BALANCE,
        publicId
      };
    } catch (error) {
      if (error.message !== "PUBLIC_ID_EXISTS") {
        throw error;
      }
    }
  }

  throw new Error("公開IDの生成に失敗しました。もう一度お試しください。");
}

function renderQrCode(publicId) {
  qrCodeElement.innerHTML = "";
  if (!publicId || typeof window.QRCode !== "function") {
    qrCodeElement.textContent = "QRコードを表示できません。公開IDを使ってください。";
    return;
  }

  new window.QRCode(qrCodeElement, {
    text: publicId,
    width: 180,
    height: 180,
    colorDark: "#16201f",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.H
  });
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
  publicIdElement.textContent = data.publicId || "発行中";
  renameName.value = data.displayName;
  renderQrCode(data.publicId);
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
      const userData = snapshot.data();
      if (!userData.publicId) {
        const publicId = await assignPublicId(authUser.uid);
        renderAccount(authUser.uid, { ...userData, publicId });
        return;
      }
      renderAccount(authUser.uid, userData);
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

    const userData = await createAccount(authUser.uid, validation.value);
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
