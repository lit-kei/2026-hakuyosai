import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
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

const adminLoadingPanel = document.querySelector("#adminLoadingPanel");
const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const mainPanel = document.querySelector("#mainPanel");
const roomForm = document.querySelector("#roomForm");
const roomName = document.querySelector("#roomName");
const createRoomButton = document.querySelector("#createRoomButton");
const roomFormMessage = document.querySelector("#roomFormMessage");
const roomListMessage = document.querySelector("#roomListMessage");
const roomList = document.querySelector("#roomList");

let unsubscribeRooms = null;
let adminAreaShown = false;

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

async function hasAdminClaim(forceRefresh = false) {
  if (!auth.currentUser) {
    return false;
  }
  const token = await auth.currentUser.getIdTokenResult(forceRefresh);
  return token.claims.admin === true;
}

function showAdminArea() {
  if (adminAreaShown) {
    return;
  }
  adminAreaShown = true;
  adminLoadingPanel.classList.add("hidden");
  adminLoginPanel.classList.add("hidden");
  mainPanel.classList.remove("hidden");
  watchRooms();
}

function showAdminLogin(message = "") {
  adminLoadingPanel.classList.add("hidden");
  adminLoginPanel.classList.remove("hidden");
  mainPanel.classList.add("hidden");
  if (message) {
    showMessage(adminLoginMessage, message, "error");
  }
}

function normalizeRoomName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function watchRooms() {
  if (unsubscribeRooms) {
    unsubscribeRooms();
  }

  const roomsQuery = query(collection(db, "rooms"), orderBy("createdAt", "desc"));
  unsubscribeRooms = onSnapshot(
    roomsQuery,
    (snapshot) => {
      roomList.innerHTML = "";

      if (snapshot.empty) {
        showMessage(roomListMessage, "まだ部屋がありません。", "info");
        return;
      }

      roomListMessage.hidden = true;
      snapshot.docs.forEach((roomSnapshot) => {
        const room = roomSnapshot.data();
        const link = document.createElement("a");
        link.className = "room-card";
        link.href = `room-detail.html?id=${encodeURIComponent(roomSnapshot.id)}`;

        const title = document.createElement("strong");
        title.textContent = room.name || "名前なしの部屋";

        const status = document.createElement("span");
        status.textContent = room.isActive === false ? "停止中" : "利用中";

        link.append(title, status);
        roomList.appendChild(link);
      });
    },
    (error) => {
      showMessage(roomListMessage, `部屋一覧の取得に失敗しました: ${error.message}`, "error");
    }
  );
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(adminLoginMessage, "");
  adminLoginButton.disabled = true;

  try {
    const result = await signInWithEmailAndPassword(auth, adminEmail.value.trim(), adminPassword.value);
    const token = await result.user.getIdTokenResult(true);
    const isAdmin = token.claims.admin === true;
    if (!isAdmin) {
      showMessage(adminLoginMessage, "このアカウントには管理者権限がありません。", "error");
      return;
    }

    showAdminArea();
  } catch (error) {
    showMessage(adminLoginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    adminLoginButton.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showAdminLogin();
    return;
  }

  try {
    if (await hasAdminClaim()) {
      showAdminArea();
    } else {
      showAdminLogin("このアカウントには管理者権限がありません。");
    }
  } catch (error) {
    showAdminLogin(`ログイン状態の確認に失敗しました: ${error.message}`);
  }
});

roomForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(roomFormMessage, "");

  const name = normalizeRoomName(roomName.value);
  if (!name) {
    showMessage(roomFormMessage, "部屋名を入力してください。", "error");
    return;
  }
  if (name.length > 32) {
    showMessage(roomFormMessage, "部屋名は32文字以内にしてください。", "error");
    return;
  }

  createRoomButton.disabled = true;
  try {
    await addDoc(collection(db, "rooms"), {
      name,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    roomName.value = "";
    showMessage(roomFormMessage, "部屋を作成しました。", "success");
  } catch (error) {
    showMessage(roomFormMessage, `部屋作成に失敗しました: ${error.message}`, "error");
  } finally {
    createRoomButton.disabled = false;
  }
});
