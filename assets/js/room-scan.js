import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const roomId = new URLSearchParams(location.search).get("id");
const adminLoadingPanel = document.querySelector("#adminLoadingPanel");
const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const mainPanel = document.querySelector("#mainPanel");
const roomTitle = document.querySelector("#roomTitle");
const detailLink = document.querySelector("#detailLink");
const scanMessage = document.querySelector("#scanMessage");
const manualForm = document.querySelector("#manualForm");
const manualPublicId = document.querySelector("#manualPublicId");
const manualButton = document.querySelector("#manualButton");
const manualMessage = document.querySelector("#manualMessage");

let room = null;
let scanner = null;
let isProcessing = false;
let lastScannedPublicId = "";
let scannerStarted = false;
let adminAreaShown = false;

const PUBLIC_ID_PATTERN = /^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/;

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function normalizePublicId(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

async function hasAdminClaim(forceRefresh = false) {
  if (!auth.currentUser) {
    return false;
  }
  const token = await auth.currentUser.getIdTokenResult(forceRefresh);
  return token.claims.admin === true;
}

async function showAdminArea() {
  if (adminAreaShown) {
    return;
  }
  const roomLoaded = await loadRoom();
  if (!roomLoaded) {
    adminLoadingPanel.classList.add("hidden");
    adminLoginPanel.classList.remove("hidden");
    return;
  }

  adminAreaShown = true;
  adminLoadingPanel.classList.add("hidden");
  adminLoginPanel.classList.add("hidden");
  mainPanel.classList.remove("hidden");
  startScanner();
}

function showAdminLogin(message = "") {
  adminLoadingPanel.classList.add("hidden");
  adminLoginPanel.classList.remove("hidden");
  mainPanel.classList.add("hidden");
  if (message) {
    showMessage(adminLoginMessage, message, "error");
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
  roomTitle.textContent = `${room.name || "部屋"} 参加登録`;
  detailLink.href = `room-detail.html?id=${encodeURIComponent(roomId)}`;
  return true;
}

async function addPublicIdToRoom(rawPublicId, targetMessage) {
  if (isProcessing) {
    return;
  }

  const publicId = normalizePublicId(rawPublicId);
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    showMessage(
      targetMessage,
      "公開IDは紛らわしい文字を除いた6文字で入力してください。使用しない文字: 0/O/1/I/L/2/Z/5/S/8/B",
      "error"
    );
    return;
  }

  isProcessing = true;
  manualButton.disabled = true;
  showMessage(targetMessage, "参加者を確認中です。", "info");

  try {
    let joinedUser = null;

    await runTransaction(db, async (transaction) => {
      const publicIdRef = doc(db, "publicIds", publicId);
      const publicIdSnapshot = await transaction.get(publicIdRef);
      if (!publicIdSnapshot.exists()) {
        throw new Error("この公開IDの参加者が見つかりません。");
      }

      const userId = publicIdSnapshot.data().userId;
      const userRef = doc(db, "users", userId);
      const memberRef = doc(db, "roomMembers", userId);
      const userSnapshot = await transaction.get(userRef);
      const memberSnapshot = await transaction.get(memberRef);
      if (!userSnapshot.exists()) {
        throw new Error("参加者データが見つかりません。");
      }

      const user = { id: userSnapshot.id, ...userSnapshot.data() };
      const currentMembership = memberSnapshot.exists() ? memberSnapshot.data() : null;
      joinedUser = user;

      if (currentMembership?.roomId === roomId) {
        transaction.update(memberRef, {
          roomName: room.name || "",
          updatedAt: serverTimestamp()
        });
        return;
      }

      transaction.set(memberRef, {
        roomId,
        roomName: room.name || "",
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        balanceAtJoin: Number(user.balance || 0),
        roomDelta: 0
      });
    });

    showMessage(targetMessage, `${joinedUser?.displayName || "名前なし"} を ${room.name || "この部屋"} に追加しました。`, "success");
    manualPublicId.value = "";
  } catch (error) {
    showMessage(targetMessage, `参加登録に失敗しました: ${error.message}`, "error");
  } finally {
    isProcessing = false;
    manualButton.disabled = false;
  }
}

function startScanner() {
  if (scannerStarted) {
    return;
  }
  if (typeof window.Html5QrcodeScanner !== "function") {
    showMessage(scanMessage, "QR読み取りライブラリを読み込めませんでした。ID手入力を使ってください。", "error");
    return;
  }

  scannerStarted = true;
  scanner = new window.Html5QrcodeScanner(
    "reader",
    {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true
    },
    false
  );

  scanner.render(
    (decodedText) => {
      const publicId = normalizePublicId(decodedText);
      if (publicId === lastScannedPublicId && isProcessing) {
        return;
      }
      lastScannedPublicId = publicId;
      addPublicIdToRoom(publicId, scanMessage);
    },
    () => {}
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

    await showAdminArea();
  } catch (error) {
    showMessage(adminLoginMessage, `ログインに失敗しました: ${error.message}`, "error");
  } finally {
    adminLoginButton.disabled = false;
  }
});

manualPublicId.addEventListener("input", () => {
  manualPublicId.value = normalizePublicId(manualPublicId.value).slice(0, 6);
});

manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPublicIdToRoom(manualPublicId.value, manualMessage);
});

window.addEventListener("pagehide", () => {
  if (scanner) {
    scanner.clear().catch(() => {});
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showAdminLogin();
    return;
  }

  try {
    if (await hasAdminClaim()) {
      await showAdminArea();
    } else {
      showAdminLogin("このアカウントには管理者権限がありません。");
    }
  } catch (error) {
    showAdminLogin(`ログイン状態の確認に失敗しました: ${error.message}`);
  }
});
