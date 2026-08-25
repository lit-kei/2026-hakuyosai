import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function checkAdminPassword(db, inputPassword) {
  const snapshot = await getDoc(
    doc(db, "password", "password")
  );

  if (!snapshot.exists()) {
    throw new Error("パスワード設定が見つかりません。");
  }

  return snapshot.data().password === inputPassword;
}

export function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}
