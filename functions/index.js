/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {defineString} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Define configuration parameters
const firebaseApiKey = defineString("API_KEY");
const firebaseMessagingSenderId = defineString("MESSAGING_SENDER_ID");
const firebaseAppId = defineString("APP_ID");
const clerkProductionKey = defineString("CLERK_PRODUCTION_KEY");
const clerkDevKey = defineString("CLERK_DEV_KEY");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// Config endpoint to serve Firebase configuration securely
exports.config = onRequest({cors: true}, (request, response) => {
  // Only allow GET requests
  if (request.method !== "GET") {
    return response.status(405).json({error: "Method not allowed"});
  }

  // Prevent caching issues - configuration should always be fresh
  response.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");

  // Determine environment based on request origin
  const origin = request.get("origin") || request.get("referer") || "";
  const isProduction = origin.includes("brewprints.io") &&
                      !origin.includes("localhost");

  // Return Firebase configuration and appropriate Clerk key
  const config = {
    apiKey: firebaseApiKey.value(),
    authDomain: "brewprints-io.firebaseapp.com",
    databaseURL: "https://brewprints-io-default-rtdb.firebaseio.com",
    projectId: "brewprints-io",
    storageBucket: "brewprints-io.firebasestorage.app",
    messagingSenderId: firebaseMessagingSenderId.value(),
    appId: firebaseAppId.value(),
    clerkKey: isProduction ? clerkProductionKey.value() : clerkDevKey.value(),
  };

  // Validate that required fields are present
  const missingFields = !config.apiKey || !config.messagingSenderId ||
                       !config.appId || !config.clerkKey;
  if (missingFields) {
    logger.error("Missing required configuration parameters");
    return response.status(500).json({error: "Configuration not available"});
  }

  response.json(config);
});
