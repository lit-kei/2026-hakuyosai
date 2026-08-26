import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  where,
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

const roomId = new URLSearchParams(location.search).get("id");
const roomTitle = document.querySelector("#roomTitle");
const memberCount = document.querySelector("#memberCount");
const displayMessage = document.querySelector("#displayMessage");
const displayList = document.querySelector("#displayList");

let renderRequestId = 0;

function showMessage(message, type = "info") {
  displayMessage.textContent = message;
  displayMessage.className = `message ${type}`;
  displayMessage.hidden = !message;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
}

function toMillis(timestamp) {
  if (timestamp?.toMillis) {
    return timestamp.toMillis();
  }
  return 0;
}

function renderRows(members) {
  displayList.innerHTML = "";
  memberCount.textContent = String(members.length);

  if (members.length === 0) {
    showMessage("この部屋にはまだ参加者がいません。", "info");
    return;
  }

  displayMessage.hidden = true;
  members.forEach((member, index) => {
    const row = document.createElement("article");
    row.className = "display-row";

    const number = document.createElement("div");
    number.className = "display-index";
    number.textContent = String(index + 1);

    const name = document.createElement("div");
    name.className = "display-name";
    name.textContent = member.user?.displayName || "参加者データなし";

    const balance = document.createElement("div");
    balance.className = "display-metric";
    const balanceLabel = document.createElement("span");
    balanceLabel.className = "display-label";
    balanceLabel.textContent = "現在資産";
    const balanceValue = document.createElement("strong");
    balanceValue.className = "display-value";
    balanceValue.textContent = member.user ? formatNumber(member.user.balance) : "-";
    balance.append(balanceLabel, balanceValue);

    const deltaAmount = Number(member.membership.roomDelta || 0);
    const delta = document.createElement("div");
    delta.className = `display-metric display-delta ${deltaAmount > 0 ? "is-positive" : ""} ${deltaAmount < 0 ? "is-negative" : ""}`;
    const deltaLabel = document.createElement("span");
    deltaLabel.className = "display-label";
    deltaLabel.textContent = "この部屋で増えた額";
    const deltaValue = document.createElement("strong");
    deltaValue.className = "display-value";
    deltaValue.textContent = formatSignedNumber(deltaAmount);
    delta.append(deltaLabel, deltaValue);

    row.append(number, name, balance, delta);
    displayList.appendChild(row);
  });
}

async function renderMembers(memberSnapshots) {
  const requestId = ++renderRequestId;
  const sortedSnapshots = [...memberSnapshots].sort((a, b) => {
    const joinedDiff = toMillis(a.data().joinedAt) - toMillis(b.data().joinedAt);
    return joinedDiff || a.id.localeCompare(b.id);
  });

  const members = await Promise.all(
    sortedSnapshots.map(async (memberSnapshot) => {
      const userSnapshot = await getDoc(doc(db, "users", memberSnapshot.id));
      return {
        membership: memberSnapshot.data(),
        user: userSnapshot.exists() ? { id: userSnapshot.id, ...userSnapshot.data() } : null
      };
    })
  );

  if (requestId !== renderRequestId) {
    return;
  }
  renderRows(members);
}

async function init() {
  if (!roomId) {
    showMessage("部屋IDが指定されていません。", "error");
    return;
  }

  try {
    const roomSnapshot = await getDoc(doc(db, "rooms", roomId));
    if (!roomSnapshot.exists()) {
      showMessage("部屋が見つかりません。", "error");
      return;
    }

    const room = roomSnapshot.data();
    roomTitle.textContent = room.name || "名前なしの部屋";

    const membersQuery = query(collection(db, "roomMembers"), where("roomId", "==", roomId));
    onSnapshot(
      membersQuery,
      (snapshot) => renderMembers(snapshot.docs),
      (error) => showMessage(`参加者の取得に失敗しました: ${error.message}`, "error")
    );
  } catch (error) {
    showMessage(`部屋情報の取得に失敗しました: ${error.message}`, "error");
  }
}

init();
