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
let activePointerId = null;
let dragGhost = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let draggedItemElement = null;
let dragStartX = 0;
let dragStartY = 0;
let hasSortMoved = false;

const MEMBER_ORDER_STORAGE_KEY = `hakuyosaiRoomMemberOrder:${roomId || "unknown"}`;
const SAVE_CONCURRENCY_LIMIT = 5;

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

function clearDropIndicators() {
  dropTargetUserId = "";
  dropTargetPlacement = "";
  document.querySelectorAll(".member-card.is-drop-before, .member-card.is-drop-after, .member-card.is-drag-over").forEach((card) => {
    card.classList.remove("is-drop-before", "is-drop-after", "is-drag-over");
  });
}

function findNearestDropCard(clientX, clientY) {
  const directCard = document.elementFromPoint(clientX, clientY)?.closest(".member-card");
  if (directCard && directCard.dataset.userId !== draggedUserId) {
    return directCard;
  }

  const cards = [...memberList.querySelectorAll(".member-card")].filter((card) => {
    return card.dataset.userId !== draggedUserId;
  });

  let nearestCard = null;
  let nearestDistance = Infinity;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const horizontalDistance = clientX < rect.left ? rect.left - clientX : Math.max(clientX - rect.right, 0);
    const verticalDistance = clientY < rect.top ? rect.top - clientY : Math.max(clientY - rect.bottom, 0);
    const distance = horizontalDistance + verticalDistance * 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestCard = card;
    }
  });

  return nearestCard;
}

function updateDropIndicator(clientX, clientY) {
  clearDropIndicators();
  if (!draggedUserId) {
    return;
  }

  const item = findNearestDropCard(clientX, clientY);
  if (!item) {
    return;
  }

  const rect = item.getBoundingClientRect();
  const insertAfter = clientX > rect.left + rect.width / 2;
  dropTargetUserId = item.dataset.userId;
  dropTargetPlacement = insertAfter ? "after" : "before";
  item.classList.add(insertAfter ? "is-drop-after" : "is-drop-before");
}

function moveDragGhost(clientX, clientY) {
  if (!dragGhost) {
    return;
  }

  dragGhost.style.transform = `translate(${clientX - dragOffsetX}px, ${clientY - dragOffsetY}px)`;
}

function cleanupMemberSort() {
  draggedUserId = "";
  activePointerId = null;
  dropTargetUserId = "";
  dropTargetPlacement = "";
  draggedItemElement?.classList.remove("is-dragging");
  draggedItemElement = null;
  hasSortMoved = false;
  memberList.classList.remove("is-sorting");
  clearDropIndicators();
  dragGhost?.remove();
  dragGhost = null;
}

function startMemberSort(event, user, item) {
  if (!user || isSavingBalances || processingUserId) {
    return;
  }

  cleanupMemberSort();
  event.preventDefault();
  activePointerId = event.pointerId;
  draggedUserId = user.id;
  draggedItemElement = item;
  dragStartX = event.clientX;
  dragStartY = event.clientY;

  const rect = item.getBoundingClientRect();
  dragOffsetX = event.clientX - rect.left;
  dragOffsetY = event.clientY - rect.top;

  dragGhost = item.cloneNode(true);
  dragGhost.classList.add("member-drag-ghost");
  dragGhost.style.width = `${rect.width}px`;
  dragGhost.style.height = `${rect.height}px`;
  document.body.appendChild(dragGhost);
  moveDragGhost(event.clientX, event.clientY);

  item.classList.add("is-dragging");
  memberList.classList.add("is-sorting");
  event.currentTarget.setPointerCapture(event.pointerId);
}

function finishMemberSort(shouldCommit) {
  if (shouldCommit && draggedUserId && hasSortMoved) {
    if (dropTargetUserId) {
      moveMemberOrder(dropTargetUserId, dropTargetPlacement === "after");
    }
  }

  cleanupMemberSort();
}

function handleMemberSortMove(event) {
  if (event.pointerId !== activePointerId || !draggedUserId) {
    return;
  }

  event.preventDefault();
  const distance = Math.abs(event.clientX - dragStartX) + Math.abs(event.clientY - dragStartY);
  if (distance > 5) {
    hasSortMoved = true;
  }
  moveDragGhost(event.clientX, event.clientY);
  updateDropIndicator(event.clientX, event.clientY);
}

function addCustomAmount(userId, rawAmount, direction, messageElement) {
  const amount = parseAmount(rawAmount);
  if (amount === null) {
    showMessage(messageElement, "1以上の整数を入力してください。", "error");
    return false;
  }

  changePendingDelta(userId, direction === "subtract" ? -amount : amount);
  showMessage(messageElement, "");
  return true;
}

async function runLimitedParallel(items, limit, worker) {
  const results = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        try {
          return {
            ok: true,
            value: await worker(item)
          };
        } catch (error) {
          return {
            ok: false,
            item,
            error
          };
        }
      })
    );
    results.push(...chunkResults);
  }

  return results;
}

async function saveOneBalanceChange(change) {
  let result = null;

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", change.user.id);
    const memberRef = doc(db, "roomMembers", change.user.id);
    const userSnapshot = await transaction.get(userRef);
    const memberSnapshot = await transaction.get(memberRef);

    if (!userSnapshot.exists()) {
      throw new Error(`${change.user.displayName || "参加者"} が見つかりません。`);
    }

    const currentBalance = Number(userSnapshot.data().balance || 0);
    const balanceAfter = currentBalance + change.amount;

    if (!Number.isInteger(balanceAfter)) {
      throw new Error(`${change.user.displayName || "参加者"} の残高が不正です。`);
    }

    transaction.update(userRef, {
      balance: balanceAfter,
      updatedAt: serverTimestamp()
    });

    if (memberSnapshot.exists() && memberSnapshot.data().roomId === roomId) {
      transaction.update(memberRef, {
        roomDelta: Number(memberSnapshot.data().roomDelta || 0) + change.amount,
        updatedAt: serverTimestamp()
      });
    }

    transaction.set(doc(collection(db, "transactions")), {
      userId: change.user.id,
      amount: change.amount,
      balanceBefore: currentBalance,
      balanceAfter,
      type: "room-game",
      roomId,
      roomName: room.name || "",
      createdAt: serverTimestamp()
    });

    result = {
      userId: change.user.id,
      balanceAfter
    };
  });

  return result;
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
  if (draggedUserId) {
    finishMemberSort(false);
  }

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
  if (!draggedUserId) {
    cleanupMemberSort();
  }
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

  members.forEach((member) => {
    const user = member.user;

    const item = document.createElement("article");
    item.className = "member-card";
    item.classList.toggle("is-not-sortable", !user || isSavingBalances || Boolean(processingUserId));
    item.dataset.userId = getMemberUserId(member);

    const dragHandle = document.createElement("div");
    dragHandle.className = "member-drag-handle";
    dragHandle.addEventListener("pointerdown", (event) => {
      startMemberSort(event, user, item);
    });
    dragHandle.addEventListener("pointermove", handleMemberSortMove);
    dragHandle.addEventListener("pointerup", (event) => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      event.preventDefault();
      finishMemberSort(true);
    });
    dragHandle.addEventListener("pointercancel", (event) => {
      if (event.pointerId !== activePointerId) {
        return;
      }

      finishMemberSort(false);
    });
    dragHandle.addEventListener("lostpointercapture", () => {
      if (draggedUserId) {
        finishMemberSort(false);
      }
    });
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
      ? user.publicId
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

    [-100, 100].forEach((amount) => {
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

    const customForm = document.createElement("form");
    customForm.className = "custom-delta-form";
    let customDirection = "add";

    const customInput = document.createElement("input");
    customInput.type = "number";
    customInput.inputMode = "numeric";
    customInput.min = "1";
    customInput.step = "1";
    customInput.placeholder = "任意額";
    customInput.disabled = !user || isSavingBalances;

    const customDirectionButtons = document.createElement("div");
    customDirectionButtons.className = "custom-delta-direction";

    const plusButton = document.createElement("button");
    plusButton.type = "button";
    plusButton.textContent = "+";
    plusButton.className = "is-active plus";
    plusButton.disabled = !user || isSavingBalances;

    const minusButton = document.createElement("button");
    minusButton.type = "button";
    minusButton.textContent = "-";
    minusButton.className = "minus";
    minusButton.disabled = !user || isSavingBalances;

    const setDirection = (direction) => {
      customDirection = direction;
      plusButton.classList.toggle("is-active", direction === "add");
      minusButton.classList.toggle("is-active", direction === "subtract");
    };

    plusButton.addEventListener("click", () => setDirection("add"));
    minusButton.addEventListener("click", () => setDirection("subtract"));
    customDirectionButtons.append(plusButton, minusButton);

    const customSubmitButton = document.createElement("button");
    customSubmitButton.type = "submit";
    customSubmitButton.textContent = "反映";
    customSubmitButton.disabled = !user || isSavingBalances;

    const customMessage = document.createElement("p");
    customMessage.className = "message custom-delta-message";
    customMessage.hidden = true;

    customForm.append(customInput, customDirectionButtons, customSubmitButton, customMessage);
    customForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!user || isSavingBalances) {
        return;
      }

      if (addCustomAmount(user.id, customInput.value, customDirection, customMessage)) {
        customInput.value = "";
      }
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
      customForm,
      subActions
    );

    memberList.appendChild(item);
  });
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

  finishMemberSort(false);
  isSavingBalances = true;

  renderMembers();
  updateBatchControls();

  showMessage(
    roomMessage,
    "資産を一括更新しています。",
    "info"
  );

  try {
    const saveResults = await runLimitedParallel(
      changes,
      SAVE_CONCURRENCY_LIMIT,
      saveOneBalanceChange
    );
    const successes = saveResults
      .filter((result) => result.ok)
      .map((result) => result.value);
    const failures = saveResults.filter((result) => !result.ok);
    const successfulUserIds = new Set(successes.map((result) => result.userId));

    successfulUserIds.forEach((userId) => {
      pendingDeltas.delete(userId);
    });

    members = members.map((member) => {
      const result = successes.find(
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

    if (failures.length > 0) {
      const failureSummary = failures
        .slice(0, 3)
        .map((failure) => {
          const name = failure.item.user?.displayName || "名前なし";
          return `${name}: ${failure.error.message}`;
        })
        .join(" / ");
      const extraCount = failures.length > 3 ? ` ほか${failures.length - 3}件` : "";
      showMessage(
        roomMessage,
        `${successes.length}人を保存しました。${failures.length}人は失敗しました。${failureSummary}${extraCount}`,
        "error"
      );
    } else {
      showMessage(
        roomMessage,
        `${successes.length}人の資産を更新しました。`,
        "success"
      );
    }
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

window.addEventListener("pointermove", handleMemberSortMove);
window.addEventListener("pointerup", (event) => {
  if (event.pointerId === activePointerId) {
    finishMemberSort(true);
  }
});
window.addEventListener("pointercancel", (event) => {
  if (event.pointerId === activePointerId) {
    finishMemberSort(false);
  }
});
window.addEventListener("blur", () => {
  finishMemberSort(false);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    finishMemberSort(false);
  }
});
