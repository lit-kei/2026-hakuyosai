import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  deleteDoc,
  query,
  where,
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
const roomNameDisplay = document.querySelector("#roomNameDisplay");
const roomMessage = document.querySelector("#roomMessage");
const scanButton = document.querySelector("#scanButton");
const scanLink = document.querySelector("#scanLink");
const displayButton = document.querySelector("#displayButton");
const displayLink = document.querySelector("#displayLink");
const memberMessage = document.querySelector("#memberMessage");
const memberList = document.querySelector("#memberList");
const pendingCount = document.querySelector("#pendingCount");
const saveBalancesButton = document.querySelector("#saveBalancesButton");

let room = null;
let members = [];
let unsubscribeMembers = null;
let processingUserId = "";
let adminAreaShown = false;
const pendingDeltas = new Map();
let isSavingBalances = false;
let draggedUserId = "";
let memberOrder = [];
let dropTargetUserId = "";
let dropTargetPlacement = "";

const MEMBER_ORDER_STORAGE_KEY = `hakuyosaiRoomMemberOrder:${roomId || "unknown"}`;

function loadMemberOrder() {
  try {
    const storedOrder = JSON.parse(localStorage.getItem(MEMBER_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(storedOrder) ? storedOrder.filter((userId) => typeof userId === "string") : [];
  } catch {
    return [];
  }
}

function saveMemberOrder() {
  try {
    localStorage.setItem(MEMBER_ORDER_STORAGE_KEY, JSON.stringify(memberOrder));
  } catch {
    // localStorageが使えない環境では、その表示中だけの並び順にします。
  }
}

function getMemberUserId(member) {
  return member.user?.id || member.memberId;
}

function applyMemberOrder(nextMembers) {
  const existingIds = new Set(nextMembers.map(getMemberUserId));
  const cleanedOrder = memberOrder.filter((userId) => existingIds.has(userId));
  const newIds = nextMembers.map(getMemberUserId).filter((userId) => !cleanedOrder.includes(userId));
  memberOrder = [...cleanedOrder, ...newIds];
  saveMemberOrder();

  const orderIndex = new Map(memberOrder.map((userId, index) => [userId, index]));
  return [...nextMembers].sort((a, b) => {
    return (orderIndex.get(getMemberUserId(a)) ?? 9999) - (orderIndex.get(getMemberUserId(b)) ?? 9999);
  });
}

function moveMemberOrder(targetUserId, insertAfter = false) {
  if (!draggedUserId || draggedUserId === targetUserId) {
    return;
  }

  const nextOrder = memberOrder.filter((userId) => userId !== draggedUserId);
  const targetIndex = nextOrder.indexOf(targetUserId);
  if (targetIndex === -1) {
    return;
  }

  nextOrder.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedUserId);
  memberOrder = nextOrder;
  saveMemberOrder();
  members = applyMemberOrder(members);
  renderMembers();
}

function moveDraggedMemberToEdge(edge) {
  if (!draggedUserId) {
    return;
  }

  const nextOrder = memberOrder.filter((userId) => userId !== draggedUserId);
  if (edge === "end") {
    nextOrder.push(draggedUserId);
  } else {
    nextOrder.unshift(draggedUserId);
  }

  memberOrder = nextOrder;
  saveMemberOrder();
  members = applyMemberOrder(members);
  renderMembers();
}

function clearDropIndicators() {
  dropTargetUserId = "";
  dropTargetPlacement = "";
  document.querySelectorAll(".member-card.is-drop-before, .member-card.is-drop-after, .member-card.is-drag-over, .member-drop-zone.is-drop-active").forEach((card) => {
    card.classList.remove("is-drop-before", "is-drop-after", "is-drag-over");
    card.classList.remove("is-drop-active");
  });
}

function updateDropIndicator(item, event) {
  clearDropIndicators();
  if (!draggedUserId || draggedUserId === item.dataset.userId) {
    return;
  }

  const rect = item.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  dropTargetUserId = item.dataset.userId;
  dropTargetPlacement = insertAfter ? "after" : "before";
  item.classList.add(insertAfter ? "is-drop-after" : "is-drop-before");
}

function changePendingDelta(userId, amount) {
  const current = pendingDeltas.get(userId) || 0;
  const next = current + amount;

  if (next === 0) {
    pendingDeltas.delete(userId);
  } else {
    pendingDeltas.set(userId, next);
  }

  renderMembers();
  updateBatchControls();
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  return amount;
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
  watchMembers();
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
  roomTitle.textContent = room.name || "個別部屋管理";
  roomNameDisplay.textContent = room.name || "名前なしの部屋";
  scanButton.href = `room-scan.html?id=${encodeURIComponent(roomId)}`;
  scanLink.href = `room-scan.html?id=${encodeURIComponent(roomId)}`;
  displayButton.href = `room-display.html?id=${encodeURIComponent(roomId)}`;
  displayLink.href = `room-display.html?id=${encodeURIComponent(roomId)}`;
  return true;
}

async function hydrateMembers(memberSnapshots) {
  const nextMembers = await Promise.all(
    memberSnapshots.map(async (memberSnapshot) => {
      const userSnapshot = await getDoc(doc(db, "users", memberSnapshot.id));
      return {
        memberId: memberSnapshot.id,
        membership: memberSnapshot.data(),
        user: userSnapshot.exists() ? { id: userSnapshot.id, ...userSnapshot.data() } : null
      };
    })
  );

  members = applyMemberOrder(nextMembers);
  renderMembers();
}

function renderMembers() {
  memberList.innerHTML = "";

  if (members.length === 0) {
    showMessage(
      memberMessage,
      "この部屋にはまだ参加者がいません。",
      "info"
    );
    return;
  }

  memberMessage.hidden = true;

  const topDropZone = createDropZone("先頭に入れる", "start");
  memberList.appendChild(topDropZone);

  members.forEach((member) => {
    const user = member.user;

    const item = document.createElement("article");
    item.className = "member-card";
    item.draggable = Boolean(user) && !isSavingBalances && !processingUserId;
    item.dataset.userId = getMemberUserId(member);

    item.addEventListener("dragstart", (event) => {
      if (!user || isSavingBalances || processingUserId) {
        event.preventDefault();
        return;
      }

      draggedUserId = user.id;
      item.classList.add("is-dragging");
      memberList.classList.add("is-sorting");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", user.id);
    });

    item.addEventListener("dragover", (event) => {
      if (!draggedUserId || draggedUserId === item.dataset.userId) {
        return;
      }

      event.preventDefault();
      updateDropIndicator(item, event);
      event.dataTransfer.dropEffect = "move";
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-before", "is-drop-after", "is-drag-over");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const insertAfter = dropTargetPlacement === "after";
      moveMemberOrder(item.dataset.userId, insertAfter);
      draggedUserId = "";
      memberList.classList.remove("is-sorting");
      clearDropIndicators();
    });

    item.addEventListener("dragend", () => {
      draggedUserId = "";
      memberList.classList.remove("is-sorting");
      clearDropIndicators();
      document.querySelectorAll(".member-card.is-dragging").forEach((card) => {
        card.classList.remove("is-dragging");
      });
    });

    const dragHandle = document.createElement("div");
    dragHandle.className = "member-drag-handle";
    const dragGrip = document.createElement("span");
    dragGrip.className = "member-drag-grip";
    dragGrip.textContent = "⋮⋮";
    dragHandle.appendChild(dragGrip);

    // 上段
    const header = document.createElement("div");
    header.className = "member-header";

    const nameBlock = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent =
      user?.displayName || "参加者データなし";

    const publicId = document.createElement("span");
    publicId.textContent = user?.publicId
      ? `公開ID: ${user.publicId}`
      : "公開IDなし";

    nameBlock.append(name, publicId);

    // 残高と今回収支
    const balanceArea = document.createElement("div");
    balanceArea.className = "member-balance-area";

    const balance = document.createElement("p");
    balance.className = "member-balance";
    balance.textContent = user
      ? `${formatNumber(user.balance)}円`
      : "-";

    const delta = user
      ? pendingDeltas.get(user.id) || 0
      : 0;

    const deltaDisplay = document.createElement("span");
    deltaDisplay.className = "member-delta";

    if (delta > 0) {
      deltaDisplay.textContent =
        `+${formatNumber(delta)}`;
      deltaDisplay.classList.add("positive");
    } else if (delta < 0) {
      deltaDisplay.textContent =
        formatNumber(delta);
      deltaDisplay.classList.add("negative");
    } else {
      deltaDisplay.textContent = "±0";
    }

    balanceArea.append(balance, deltaDisplay);

    header.append(nameBlock, balanceArea);

    // ±100 / ±500
    const quickGrid = document.createElement("div");
    quickGrid.className = "balance-controls";

    [-500, -100, 100, 500].forEach((amount) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = amount < 0
        ? "balance-button balance-minus"
        : "balance-button balance-plus";

      button.textContent =
        `${amount > 0 ? "+" : ""}${amount}`;

      button.disabled =
        !user || isSavingBalances;

      button.addEventListener("click", () => {
        changePendingDelta(user.id, amount);
      });

      quickGrid.appendChild(button);
    });

    // その人の変更だけリセット
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "button-secondary";
    resetButton.textContent = "リセット";

    resetButton.disabled =
      !user ||
      isSavingBalances ||
      !pendingDeltas.has(user?.id);

    resetButton.addEventListener("click", () => {
      pendingDeltas.delete(user.id);

      renderMembers();
      updateBatchControls();
    });

    // 退出
    const leaveButton = document.createElement("button");
    leaveButton.type = "button";
    leaveButton.className = "button-secondary";
    leaveButton.textContent = "退出";

    leaveButton.disabled =
      !user ||
      isSavingBalances ||
      processingUserId === user?.id;

    leaveButton.addEventListener("click", () => {
      removeMember(user);
    });

    const subActions = document.createElement("div");
    subActions.className = "member-sub-actions";

    subActions.append(
      resetButton,
      leaveButton
    );

    item.append(
      dragHandle,
      header,
      quickGrid,
      subActions
    );

    memberList.appendChild(item);
  });

  const bottomDropZone = createDropZone("末尾に入れる", "end");
  memberList.appendChild(bottomDropZone);
}

function createDropZone(label, edge) {
  const zone = document.createElement("div");
  zone.className = "member-drop-zone";
  zone.textContent = label;

  zone.addEventListener("dragover", (event) => {
    if (!draggedUserId) {
      return;
    }
    event.preventDefault();
    clearDropIndicators();
    zone.classList.add("is-drop-active");
    event.dataTransfer.dropEffect = "move";
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("is-drop-active");
  });

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    moveDraggedMemberToEdge(edge);
    draggedUserId = "";
    memberList.classList.remove("is-sorting");
    clearDropIndicators();
  });

  return zone;
}
function updateBatchControls() {
  const count = pendingDeltas.size;

  pendingCount.textContent =
    count === 0
      ? "変更なし"
      : `未保存: ${count}人`;

  saveBalancesButton.disabled =
    count === 0 || isSavingBalances;
}
async function saveAllBalanceChanges() {
  if (
    isSavingBalances ||
    pendingDeltas.size === 0
  ) {
    return;
  }

  const changes = [...pendingDeltas.entries()]
    .map(([userId, amount]) => {
      const member = members.find(
        (member) =>
          member.user?.id === userId
      );

      return {
        user: member?.user,
        amount
      };
    })
    .filter(
      ({ user, amount }) =>
        user && amount !== 0
    );

  if (changes.length === 0) {
    return;
  }

  const summary = changes
    .map(({ user, amount }) => {
      const sign = amount > 0 ? "+" : "";

      return (
        `${user.displayName || "名前なし"}: ` +
        `${sign}${formatNumber(amount)}`
      );
    })
    .join("\n");

  const confirmed = window.confirm(
    `以下の収支を反映します。\n\n` +
    `${summary}\n\n` +
    `実行しますか？`
  );

  if (!confirmed) {
    return;
  }

  isSavingBalances = true;

  renderMembers();
  updateBatchControls();

  showMessage(
    roomMessage,
    "資産を一括更新しています。",
    "info"
  );

  try {
    const results = [];

    await runTransaction(
      db,
      async (transaction) => {
        const records = [];

        // 先に全データを読む
        for (const change of changes) {
          const userRef = doc(
            db,
            "users",
            change.user.id
          );

          const memberRef = doc(
            db,
            "roomMembers",
            change.user.id
          );

          const userSnapshot =
            await transaction.get(userRef);

          const memberSnapshot =
            await transaction.get(memberRef);

          if (!userSnapshot.exists()) {
            throw new Error(
              `${change.user.displayName} が見つかりません。`
            );
          }

          records.push({
            ...change,
            userRef,
            memberRef,
            userSnapshot,
            memberSnapshot
          });
        }

        // そのあと全員分を書く
        for (const record of records) {
          const currentBalance = Number(
            record.userSnapshot.data().balance || 0
          );

          const balanceAfter =
            currentBalance + record.amount;

          if (!Number.isInteger(balanceAfter)) {
            throw new Error(
              `${record.user.displayName} の残高が不正です。`
            );
          }

          transaction.update(
            record.userRef,
            {
              balance: balanceAfter,
              updatedAt: serverTimestamp()
            }
          );

          if (
            record.memberSnapshot.exists() &&
            record.memberSnapshot.data().roomId === roomId
          ) {
            transaction.update(
              record.memberRef,
              {
                roomDelta:
                  Number(
                    record.memberSnapshot.data()
                      .roomDelta || 0
                  ) + record.amount,

                updatedAt:
                  serverTimestamp()
              }
            );
          }

          transaction.set(
            doc(
              collection(
                db,
                "transactions"
              )
            ),
            {
              userId: record.user.id,
              amount: record.amount,

              balanceBefore:
                currentBalance,

              balanceAfter,

              type: "room-game",

              roomId,

              roomName:
                room.name || "",

              createdAt:
                serverTimestamp()
            }
          );

          results.push({
            userId: record.user.id,
            balanceAfter
          });
        }
      }
    );

    pendingDeltas.clear();

    members = members.map((member) => {
      const result = results.find(
        (result) =>
          result.userId === member.user?.id
      );

      if (!result) {
        return member;
      }

      return {
        ...member,
        user: {
          ...member.user,
          balance: result.balanceAfter
        }
      };
    });

    showMessage(
      roomMessage,
      `${results.length}人の資産を更新しました。`,
      "success"
    );
  } catch (error) {
    showMessage(
      roomMessage,
      `一括更新に失敗しました: ${error.message}`,
      "error"
    );
  } finally {
    isSavingBalances = false;

    renderMembers();
    updateBatchControls();
  }
}
function watchMembers() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const membersQuery = query(collection(db, "roomMembers"), where("roomId", "==", roomId));
  unsubscribeMembers = onSnapshot(
    membersQuery,
    (snapshot) => hydrateMembers(snapshot.docs),
    (error) => showMessage(memberMessage, `参加者の取得に失敗しました: ${error.message}`, "error")
  );
}


async function removeMember(user) {
  if (!user || processingUserId) {
    return;
  }

  const confirmed = window.confirm(`${user.displayName || "名前なし"} をこの部屋から退出させますか？`);
  if (!confirmed) {
    return;
  }

  processingUserId = user.id;
  renderMembers();
  try {
    await deleteDoc(doc(db, "roomMembers", user.id));
    showMessage(roomMessage, "退出しました。", "success");
  } catch (error) {
    showMessage(roomMessage, `退出処理に失敗しました: ${error.message}`, "error");
  } finally {
    processingUserId = "";
    renderMembers();
  }
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
saveBalancesButton.addEventListener(
  "click",
  saveAllBalanceChanges
);

memberOrder = loadMemberOrder();
