import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
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

const USER_ID_STORAGE_KEY = "hakuyosaiUserId";
const PUBLIC_ID_STORAGE_KEY = "hakuyosaiPublicId";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loadingPanel = document.querySelector("#loadingPanel");
const profilePanel = document.querySelector("#profilePanel");
const renamePanel = document.querySelector("#renamePanel");
const currentName = document.querySelector("#currentName");
const publicIdElement = document.querySelector("#publicId");
const balanceElement = document.querySelector("#balance");
const currentRoomCard = document.querySelector("#currentRoomCard");
const currentRoomElement = document.querySelector("#currentRoom");
const currentRoomDetail = document.querySelector("#currentRoomDetail");
const qrCodeElement = document.querySelector("#qrCode");
const renameForm = document.querySelector("#renameForm");
const renameName = document.querySelector("#renameName");
const renameButton = document.querySelector("#renameButton");
const renameMessage = document.querySelector("#renameMessage");
const profileNav = document.querySelector("#profileNav");
const logoutButton = document.querySelector("#logoutButton");
const qrLabel = document.querySelector("#qrLabel");
const helpMessage = document.querySelector("#help-message");

const params = new URLSearchParams(location.search);
const isReception = params.get("reception") === "true";

if (isReception) {
  profileNav.classList.add("hidden");
  logoutButton.classList.remove("hidden");
  qrCodeElement.classList.add("hidden");
  qrLabel.classList.add("hidden");
  helpMessage.textContent = "スマホを持っていない方は、公開IDを紙に記入し手元に保管してください。";
}

let currentUserId = localStorage.getItem(USER_ID_STORAGE_KEY) || "";
let unsubscribeUser = null;
let unsubscribeRoomMember = null;

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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
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
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

function redirectToSignin() {
  location.href = "signin.html";
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

function showProfile() {
  loadingPanel.classList.add("hidden");
  profilePanel.classList.remove("hidden");
  renamePanel.classList.remove("hidden");
}

function renderProfile(data) {
  currentName.textContent = data.displayName || "名前なし";
  publicIdElement.textContent = data.publicId || "発行中";
  balanceElement.textContent = formatNumber(data.balance);
  renameName.value = data.displayName || "";
  localStorage.setItem(PUBLIC_ID_STORAGE_KEY, data.publicId || "");
  renderQrCode(data.publicId);
  showProfile();
}

function setRoomStatus(name, detail, statusClass) {
  currentRoomElement.textContent = name;
  currentRoomDetail.textContent = detail;
  currentRoomCard.className = `room-status ${statusClass}`;
}

function watchCurrentRoom() {
  if (unsubscribeRoomMember) {
    unsubscribeRoomMember();
  }

  unsubscribeRoomMember = onSnapshot(
    doc(db, "roomMembers", currentUserId),
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
      showMessage(renameMessage, `所属部屋の取得に失敗しました: ${error.message}`, "error");
    }
  );
}

async function startProfile() {
  if (!currentUserId) {
    redirectToSignin();
    return;
  }

  try {
    await ensureAnonymousUser();
    const userRef = doc(db, "users", currentUserId);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
      localStorage.removeItem(USER_ID_STORAGE_KEY);
      localStorage.removeItem(PUBLIC_ID_STORAGE_KEY);
      redirectToSignin();
      return;
    }

    if (!snapshot.data().publicId) {
      const publicId = await assignPublicId(currentUserId);
      localStorage.setItem(PUBLIC_ID_STORAGE_KEY, publicId);
    }

    unsubscribeUser = onSnapshot(
      userRef,
      (userSnapshot) => {
        if (!userSnapshot.exists()) {
          localStorage.removeItem(USER_ID_STORAGE_KEY);
          localStorage.removeItem(PUBLIC_ID_STORAGE_KEY);
          redirectToSignin();
          return;
        }
        renderProfile(userSnapshot.data());
      },
      (error) => {
        showMessage(renameMessage, `プロフィールの取得に失敗しました: ${error.message}`, "error");
      }
    );
    watchCurrentRoom();
  } catch (error) {
    loadingPanel.innerHTML = "";
    const message = document.createElement("p");
    loadingPanel.appendChild(message);
    showMessage(message, `プロフィールの読み込みに失敗しました: ${error.message}`, "error");
  }
}

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
    await ensureAnonymousUser();
    await updateDoc(doc(db, "users", currentUserId), {
      displayName: validation.value,
      updatedAt: serverTimestamp()
    });
    showMessage(renameMessage, "表示名を変更しました。", "success");
  } catch (error) {
    showMessage(renameMessage, `表示名変更に失敗しました: ${error.message}`, "error");
  } finally {
    renameButton.disabled = false;
  }
});

window.addEventListener("pagehide", () => {
  if (unsubscribeUser) {
    unsubscribeUser();
  }
  if (unsubscribeRoomMember) {
    unsubscribeRoomMember();
  }
});

startProfile();

async function logout() {
  try {
    if (unsubscribeUser) {
      unsubscribeUser();
      unsubscribeUser = null;
    }

    if (unsubscribeRoomMember) {
      unsubscribeRoomMember();
      unsubscribeRoomMember = null;
    }

    await signOut(auth);

    localStorage.removeItem(USER_ID_STORAGE_KEY);
    localStorage.removeItem(PUBLIC_ID_STORAGE_KEY);

    location.href = "signin.html?reception=true";
  } catch (error) {
    console.error("ログアウトに失敗しました:", error);
  }
}

window.logout = logout;

logoutButton.addEventListener("click", logout);