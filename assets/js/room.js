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

const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
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

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
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
    const isAdmin = await checkAdminPassword(adminPassword.value);
    if (!isAdmin) {
      showMessage(adminLoginMessage, "パスワードが違います。", "error");
      return;
    }

    await ensureStaffSession();
    adminLoginPanel.classList.add("hidden");
    mainPanel.classList.remove("hidden");
    watchRooms();
  } catch (error) {
    showMessage(adminLoginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    adminLoginButton.disabled = false;
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
