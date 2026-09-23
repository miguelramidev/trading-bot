import ccxt from "ccxt";

const binance = new ccxt.binance({
    apiKey: "dummy_api_key",
    privateKey: "-----BEGIN PRIVATE KEY-----\ndummy\n-----END PRIVATE KEY-----"
});

console.log("Checking if CCXT binance throws on checkRequiredCredentials...");
try {
    binance.checkRequiredCredentials();
    console.log("Success! privateKey is accepted without secret.");
} catch (e) {
    console.error("Error:", e.message);
}
