import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

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

// Local testing only: `VITE_USE_EMULATOR=1 npm run dev` with
// `firebase emulators:start --config firebase.emulators.json` running.
// Never set in production builds.
if (import.meta.env.VITE_USE_EMULATOR === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
