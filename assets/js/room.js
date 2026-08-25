import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { checkAdminPassword, showMessage } from "./secret.js";

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



const adminLoginPanel = document.querySelector("#adminLoginPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const adminLoginButton = document.querySelector("#adminLoginButton");
const adminLoginMessage = document.querySelector("#adminLoginMessage");
const mainPanel = document.querySelector("#mainPanel");


adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  showMessage(adminLoginMessage, "");
  adminLoginButton.disabled = true;

  try {
    const password = adminPassword.value;

    const isAdmin = await checkAdminPassword(db, password);

    if (isAdmin) {
      adminLoginPanel.classList.add("hidden");
      mainPanel.classList.remove("hidden");

      //
    } else {
      
      showMessage(
        adminLoginMessage,
        "パスワードが違います。",
        "error"
      );
      return;
    }

  } catch (error) {
    showMessage(
      adminLoginMessage,
      `ログインに失敗しました: ${error.message}`,
      "error"
    );
  } finally {
    adminLoginButton.disabled = false;
  }
});