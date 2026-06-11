import { initializeApp } from "firebase/app"

const firebaseConfig = {
  apiKey: "AIzaSyC4gyDjcb4fe33vnaN1w0mpWHPYjcZLRJ8",
  authDomain: "decoai-kstm.firebaseapp.com",
  projectId: "decoai-kstm",
  storageBucket: "decoai-kstm.firebasestorage.app",
  messagingSenderId: "466788298507",
  appId: "1:466788298507:web:e79c8da4eee550910c7c0e",
  measurementId: "G-KFDBHVCKBG"
}

export const app = initializeApp(firebaseConfig)