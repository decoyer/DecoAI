import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDZ5CAj5y2Loie8Kj8FW8LimLXtl3iFpzo",
  authDomain: "kasutamu-ai.firebaseapp.com",
  projectId: "kasutamu-ai",
  storageBucket: "kasutamu-ai.firebasestorage.app",
  messagingSenderId: "1006766461945",
  appId: "1:1006766461945:web:dcef3ac378fc6f207fe328",
  measurementId: "G-LFXEQDJR5W"
};

export const app = initializeApp(firebaseConfig)