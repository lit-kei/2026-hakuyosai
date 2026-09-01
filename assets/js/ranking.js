import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
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

const rankingMessage = document.querySelector("#rankingMessage");
const rankingScroller = document.querySelector("#rankingScroller");
const rankingList = document.querySelector("#rankingList");

const shouldAutoScroll = new URLSearchParams(location.search).get("scroll") === "true";
const TOP_RANK_LIMIT = 20;
const HIGHLIGHT_RANK_LIMIT = 5;
const SCROLL_SPEED_PX_PER_MS = 0.035;
const BOTTOM_PAUSE_MS = 3500;
const TOP_PAUSE_MS = 3000;

let scrollAnimationId = 0;
let scrollPauseTimer = 0;
let lastScrollFrameAt = 0;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function getRankedUsers(users) {
  let previousBalance = null;
  let previousRank = 0;

  return users.map((user, index) => {
    const balance = Number(user.balance || 0);
    const rank = previousBalance === balance ? previousRank : index + 1;
    previousBalance = balance;
    previousRank = rank;
    return { ...user, rank };
  });
}

function getTopUsers(users) {
  return getRankedUsers(users).filter((user) => user.rank <= TOP_RANK_LIMIT);
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
  const maxScroll = rankingScroller.scrollHeight - rankingScroller.clientHeight;
  if (!shouldAutoScroll || maxScroll <= 24) {
    scrollAnimationId = 0;
    return;
  }

  if (!lastScrollFrameAt) {
    lastScrollFrameAt = frameAt;
  }

  const elapsed = frameAt - lastScrollFrameAt;
  lastScrollFrameAt = frameAt;
  const nextY = Math.min(maxScroll, rankingScroller.scrollTop + elapsed * SCROLL_SPEED_PX_PER_MS);
  rankingScroller.scrollTop = nextY;

  if (nextY >= maxScroll - 1) {
    scrollAnimationId = 0;
    scrollPauseTimer = window.setTimeout(() => {
      rankingScroller.scrollTop = 0;
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

  rankingScroller.scrollTop = 0;
  requestAnimationFrame(() => {
    const maxScroll = rankingScroller.scrollHeight - rankingScroller.clientHeight;
    if (maxScroll > 24) {
      scheduleAutoScrollStart(TOP_PAUSE_MS);
    }
  });
}

function renderRanking(users) {
  stopAutoScroll();
  rankingList.innerHTML = "";

  if (users.length === 0) {
    showMessage(rankingMessage, "まだ参加者がいません。", "info");
    return;
  }

  rankingMessage.hidden = true;
  const rankedUsers = getTopUsers(users);
  rankedUsers.forEach((user) => {
    const item = document.createElement("li");
    item.className = `ranking-item${user.rank <= HIGHLIGHT_RANK_LIMIT ? " top-rank" : ""}`;

    const rank = document.createElement("span");
    rank.className = "ranking-rank";
    rank.textContent = `${user.rank}位`;

    const name = document.createElement("span");
    name.className = "ranking-name";
    name.textContent = user.displayName || "名前なし";

    const balance = document.createElement("span");
    balance.className = "ranking-balance";
    balance.textContent = formatNumber(user.balance);

    item.append(rank, name, balance);
    rankingList.appendChild(item);
  });

  restartAutoScroll();
}

try {
  const rankingQuery = query(collection(db, "users"), orderBy("balance", "desc"), limit(100));
  onSnapshot(
    rankingQuery,
    (snapshot) => {
      const users = snapshot.docs.map((documentSnapshot) => documentSnapshot.data());
      renderRanking(users);
    },
    (error) => {
      showMessage(rankingMessage, `ランキングの取得に失敗しました: ${error.message}`, "error");
    }
  );
} catch (error) {
  showMessage(rankingMessage, `Firestoreへの接続に失敗しました: ${error.message}`, "error");
}

if (shouldAutoScroll) {
  document.body.classList.add("ranking-display-page");
}

window.addEventListener("resize", () => {
  restartAutoScroll();
});
