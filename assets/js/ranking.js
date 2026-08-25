import {
  db,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  formatNumber,
  showMessage
} from "./firebase.js";

const rankingMessage = document.querySelector("#rankingMessage");
const rankingList = document.querySelector("#rankingList");

function renderRanking(users) {
  rankingList.innerHTML = "";

  if (users.length === 0) {
    showMessage(rankingMessage, "まだ参加者がいません。", "info");
    return;
  }

  rankingMessage.hidden = true;
  users.forEach((user, index) => {
    const item = document.createElement("li");
    item.className = `ranking-item${index < 3 ? " top-rank" : ""}`;

    const rank = document.createElement("span");
    rank.className = "ranking-rank";
    rank.textContent = `${index + 1}位`;

    const name = document.createElement("span");
    name.className = "ranking-name";
    name.textContent = user.displayName || "名前なし";

    const balance = document.createElement("span");
    balance.className = "ranking-balance";
    balance.textContent = formatNumber(user.balance);

    item.append(rank, name, balance);
    rankingList.appendChild(item);
  });
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

