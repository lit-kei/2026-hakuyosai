import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  serverTimestamp,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const INITIAL_BALANCE = 1000;
export const USER_ID_STORAGE_KEY = "hakuyosaiUserId";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInAnonymously,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  serverTimestamp,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getDocs
};

export function normalizeDisplayName(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(value) {
  const name = normalizeDisplayName(value);
  if (name.length < 1) {
    return { ok: false, message: "表示名を入力してください。" };
  }
  if (name.length > 24) {
    return { ok: false, message: "表示名は24文字以内にしてください。" };
  }
  return { ok: true, value: name };
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("ja-JP");
}

export function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = !message;
}

export async function ensureAnonymousUser() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
        return;
      }

      try {
        const result = await signInAnonymously(auth);
        resolve(result.user);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function requireAdminClaim() {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true;
}
