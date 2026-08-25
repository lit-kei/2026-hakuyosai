import {
  INITIAL_BALANCE,
  USER_ID_STORAGE_KEY,
  db,
  ensureAnonymousUser,
  validateDisplayName,
  showMessage,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "./firebase.js";

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
