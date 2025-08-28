/**
 * Firebase Configuration
 */

// Cache for the configuration
let cachedConfig = null;

/**
 * Loads Firebase configuration from the secure function endpoint
 * @returns {Promise<Object>} Firebase configuration object
 */
async function loadFirebaseConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Fetch configuration from Firebase Function via hosting rewrite
    const response = await fetch('/api/config');
    
    if (!response.ok) {
      throw new Error(`Config fetch failed: ${response.status}`);
    }
    
    cachedConfig = await response.json();
    return cachedConfig;
  } catch (error) {
    console.error('Failed to load Firebase configuration:', error);
    
    // Fallback configuration for development
    cachedConfig = {
      apiKey: "FIREBASE_API_KEY_NOT_SET",
      authDomain: "brewprints-io.firebaseapp.com",
      databaseURL: "https://brewprints-io-default-rtdb.firebaseio.com",
      projectId: "brewprints-io",
      storageBucket: "brewprints-io.firebasestorage.app",
      messagingSenderId: "MESSAGING_SENDER_ID_NOT_SET",
      appId: "APP_ID_NOT_SET"
    };
    return cachedConfig;
  }
}

// Export the loader function
export { loadFirebaseConfig };