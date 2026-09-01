import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-4MSzfzZiE3ow3aadDy7zKM7lyoNpEdo",
  authDomain: "lotikipi-1-stock-production.firebaseapp.com",
  projectId: "lotikipi-1-stock-production",
  storageBucket: "lotikipi-1-stock-production.firebasestorage.app",
  messagingSenderId: "704635559030",
  appId: "1:704635559030:web:8caf9bef4cecaf87c51357",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
