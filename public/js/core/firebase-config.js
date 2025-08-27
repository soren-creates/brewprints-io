/**
 * Firebase Configuration
 */

// Note: Firebase client-side API keys are safe to expose publicly
// They are restricted by Firebase security rules, not by secrecy
// See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey: "AIzaSyDGmGsjTvHZGTOINTo1nwzZ7OKghWdKwN4", // Public client key - safe to expose
  authDomain: "brewprints-io.firebaseapp.com",
  databaseURL: "https://brewprints-io-default-rtdb.firebaseio.com",
  projectId: "brewprints-io",
  storageBucket: "brewprints-io.firebasestorage.app",
  messagingSenderId: "645183140420",
  appId: "1:645183140420:web:ee44475a79cc7a3dbcc211"
};

// Export the config
export { firebaseConfig };