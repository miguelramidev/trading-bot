import { handler } from "./src/telegram/webhook.js";
import "dotenv/config";

const mockEvent = {
  body: JSON.stringify({
    update_id: 123456,
    message: {
      message_id: 1,
      from: { id: 769581187, is_bot: false, first_name: "Miguel" },
      chat: { id: 769581187, type: "private" },
      date: 1620000000,
      text: "/start",
      entities: [{ offset: 0, length: 6, type: "bot_command" }]
    }
  })
};

async function test() {
  console.log("Testing webhook handler...");
  const response = await handler(mockEvent);
  console.log("Response:", response);
}

test();
