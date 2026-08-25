import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot
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

let unsubscribeUser = null;
let unsubscribeRoomMember = null;

function normalizePublicId(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

function watchProfile(userId, publicId) {
  clearSubscriptions();
  resultPanel.classList.remove("hidden");
  lookupPublicIdDisplay.textContent = publicId;
  setRoomStatus("確認中", "部屋が変わると自動で更新されます。", "is-loading");

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
      lookupName.textContent = user.displayName || "名前なし";
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

window.addEventListener("pagehide", clearSubscriptions);

