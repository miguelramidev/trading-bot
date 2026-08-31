import fetch from "node-fetch"; // or built-in fetch if Node >= 18
import "dotenv/config";

const TOKEN = process.env.TELEGRAM_TOKEN;
const URL = process.argv[2]; // Pass URL as argument

if (!URL) {
  console.error("Please provide the webhook URL as an argument.");
  process.exit(1);
}

async function setWebhook() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${URL}`);
  const json = await res.json();
  console.log(json);
}

setWebhook();
