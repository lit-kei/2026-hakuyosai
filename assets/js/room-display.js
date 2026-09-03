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
const displayScroller = document.querySelector("#displayScroller");
const displayList = document.querySelector("#displayList");
const sortButtons = document.querySelectorAll("[data-sort]");

let allMembers = [];
let unsubscribeMembers = null;
let sortMode = "join";
let scrollAnimationId = 0;
let scrollPauseTimer = 0;
let lastScrollFrameAt = 0;
const membershipMap = new Map();
const userMap = new Map();
const userUnsubscribes = new Map();

const shouldAutoScroll = new URLSearchParams(location.search).get("scroll") === "true";
const SCROLL_SPEED_PX_PER_MS = 0.035;
const BOTTOM_PAUSE_MS = 3500;
const TOP_PAUSE_MS = 3000;

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

function compareJoinedAt(a, b) {
  const joinedDiff = toMillis(a.membership.joinedAt) - toMillis(b.membership.joinedAt);
  return joinedDiff || (a.user?.id || a.memberId || "").localeCompare(b.user?.id || b.memberId || "");
}

function sortMembers(members) {
  const sortedMembers = [...members];

  if (sortMode === "balance") {
    sortedMembers.sort((a, b) => {
      const balanceDiff = Number(b.user?.balance || 0) - Number(a.user?.balance || 0);
      return balanceDiff || compareJoinedAt(a, b);
    });
    return sortedMembers;
  }

  if (sortMode === "delta") {
    sortedMembers.sort((a, b) => {
      const deltaDiff = Number(b.membership.roomDelta || 0) - Number(a.membership.roomDelta || 0);
      return deltaDiff || compareJoinedAt(a, b);
    });
    return sortedMembers;
  }

  sortedMembers.sort(compareJoinedAt);
  return sortedMembers;
}

function updateSortButtons() {
  sortButtons.forEach((button) => {
    const isActive = button.dataset.sort === sortMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function stopAutoScroll() {
  if (scrollAnimationId) {
    cancelAnimationFrame(scrollAnimationId);
    scrollAnimationId = 0;
  }
  if (scrollPauseTimer) {
    clearTimeout(scrollPauseTimer);
    scrollPauseTimer = 0;
  }
  lastScrollFrameAt = 0;
}

function scheduleAutoScrollStart(delayMs) {
  scrollPauseTimer = window.setTimeout(() => {
    scrollPauseTimer = 0;
    lastScrollFrameAt = 0;
    scrollAnimationId = requestAnimationFrame(runAutoScroll);
  }, delayMs);
}

function runAutoScroll(frameAt) {
  const maxScroll = displayScroller.scrollHeight - displayScroller.clientHeight;
  if (!shouldAutoScroll || maxScroll <= 24) {
    scrollAnimationId = 0;
    return;
  }

  if (!lastScrollFrameAt) {
    lastScrollFrameAt = frameAt;
  }

  const elapsed = frameAt - lastScrollFrameAt;
  lastScrollFrameAt = frameAt;
  const nextY = Math.min(maxScroll, displayScroller.scrollTop + elapsed * SCROLL_SPEED_PX_PER_MS);
  displayScroller.scrollTop = nextY;

  if (nextY >= maxScroll - 1) {
    scrollAnimationId = 0;
    scrollPauseTimer = window.setTimeout(() => {
      displayScroller.scrollTop = 0;
      scheduleAutoScrollStart(TOP_PAUSE_MS);
    }, BOTTOM_PAUSE_MS);
    return;
  }

  scrollAnimationId = requestAnimationFrame(runAutoScroll);
}

function restartAutoScroll() {
  stopAutoScroll();
  if (!shouldAutoScroll) {
    return;
  }

  displayScroller.scrollTop = 0;
  requestAnimationFrame(() => {
    const maxScroll = displayScroller.scrollHeight - displayScroller.clientHeight;
    if (maxScroll > 24) {
      scheduleAutoScrollStart(TOP_PAUSE_MS);
    }
  });
}

function rebuildMembers() {
  allMembers = [...membershipMap.entries()].map(([memberId, membership]) => {
    return {
      membership,
      memberId,
      user: userMap.has(memberId) ? userMap.get(memberId) : null
    };
  });
  renderRows(sortMembers(allMembers));
}

function unsubscribeUser(userId) {
  const unsubscribe = userUnsubscribes.get(userId);
  if (unsubscribe) {
    unsubscribe();
    userUnsubscribes.delete(userId);
  }
  userMap.delete(userId);
}

function watchUser(userId) {
  if (userUnsubscribes.has(userId)) {
    return;
  }

  const unsubscribe = onSnapshot(
    doc(db, "users", userId),
    (snapshot) => {
      userMap.set(
        userId,
        snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
      );
      rebuildMembers();
    },
    () => {
      userMap.set(userId, null);
      rebuildMembers();
    }
  );

  userUnsubscribes.set(userId, unsubscribe);
}

function syncMembers(memberSnapshots) {
  const activeIds = new Set(memberSnapshots.map((memberSnapshot) => memberSnapshot.id));

  [...membershipMap.keys()].forEach((memberId) => {
    if (!activeIds.has(memberId)) {
      membershipMap.delete(memberId);
      unsubscribeUser(memberId);
    }
  });

  memberSnapshots.forEach((memberSnapshot) => {
    membershipMap.set(memberSnapshot.id, memberSnapshot.data());
    watchUser(memberSnapshot.id);
  });

  rebuildMembers();
}

function cleanupSubscriptions() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
    unsubscribeMembers = null;
  }

  userUnsubscribes.forEach((unsubscribe) => unsubscribe());
  userUnsubscribes.clear();
  membershipMap.clear();
  userMap.clear();
}

function renderRows(members) {
  stopAutoScroll();
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

  restartAutoScroll();
}

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextSortMode = button.dataset.sort;
    if (!["join", "balance", "delta"].includes(nextSortMode)) {
      return;
    }

    sortMode = nextSortMode;
    updateSortButtons();
    renderRows(sortMembers(allMembers));
  });
});

window.addEventListener("resize", () => {
  restartAutoScroll();
});

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
    unsubscribeMembers = onSnapshot(
      membersQuery,
      (snapshot) => syncMembers(snapshot.docs),
      (error) => showMessage(`参加者の取得に失敗しました: ${error.message}`, "error")
    );
  } catch (error) {
    showMessage(`部屋情報の取得に失敗しました: ${error.message}`, "error");
  }
}

updateSortButtons();
init();

window.addEventListener("pagehide", cleanupSubscriptions);
