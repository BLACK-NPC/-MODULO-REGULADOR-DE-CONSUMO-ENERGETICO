import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getDatabase, ref, onValue, set, update, serverTimestamp, Database } from 'firebase/database'

// Configuracion de Firebase con credenciales reales del proyecto AVC-01
const firebaseConfig = {
  apiKey: "AIzaSyCNNSX4rDEtx0fREDr6d-FSYHxWxrAihBU",
  authDomain: "modulo-regulador-de-consumo.firebaseapp.com",
  databaseURL: "https://modulo-regulador-de-consumo-default-rtdb.firebaseio.com",
  projectId: "modulo-regulador-de-consumo",
  storageBucket: "modulo-regulador-de-consumo.firebasestorage.app",
  messagingSenderId: "22114158158",
  appId: "1:22114158158:android:7f857f15d310400868a51f",
}

// Firebase siempre configurado con credenciales reales
const isFirebaseConfigured = true

// Initialize Firebase
let app: FirebaseApp | null = null
let database: Database | null = null

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  database = getDatabase(app)
} catch (error) {
  console.error('Firebase initialization error:', error)
}

export { database, ref, onValue, set, update, serverTimestamp, isFirebaseConfigured }
export type { Database }
