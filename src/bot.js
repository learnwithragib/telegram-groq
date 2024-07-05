import { Bot, session, InlineKeyboard } from "grammy";
import Groq from "groq-sdk";
import fs from "fs";
import axios from "axios";

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "your_groq_api_key",
});

// Initialize Telegram bot
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "your_telegram_bot_token");

// Define available models
const models = {
  "llama3-8b": { id: "llama3-8b-8192", name: "LLaMA3 8b", context: 8192 },
  "llama3-70b": { id: "llama3-70b-8192", name: "LLaMA3 70b", context: 8192 },
  "mixtral": { id: "mixtral-8x7b-32768", name: "Mixtral 8x7b", context: 32768 },
  "gemma-7b": { id: "gemma-7b-it", name: "Gemma 7b", context: 8192 },
  "gemma2-9b": { id: "gemma2-9b-it", name: "Gemma2 9b", context: 8192 },
};

// Configure session storage
function createInitialSessionData() {
  return { 
    history: [], 
    model: "llama3-70b",
    language: "english",
    personality: "default"
  };
}
bot.use(session({ initial: createInitialSessionData }));

// Helper function to get response from Groq
async function getGroqResponse(messages, model, language, personality) {
  try {
    const systemMessage = `You are an AI assistant. Respond in ${language}. Personality: ${personality}.`;
    const allMessages = [{ role: "system", content: systemMessage }, ...messages];
    
    const completion = await groq.chat.completions.create({
      messages: allMessages,
      model: models[model].id,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stop: null,
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Error calling Groq API:", error);
    return "Sorry, I encountered an error. Please try again later.";
  }
}

// Command handler for /start
bot.command("start", (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Help", "help")
    .text("Change Model", "change_model")
    .row()
    .text("Settings", "settings")
    .text("Reset", "reset");
  
  ctx.reply("Welcome! I'm your AI assistant. How can I help you today?", {
    reply_markup: keyboard
  });
});

// Help command and callback
bot.command("help", sendHelpMessage);
bot.callbackQuery("help", (ctx) => {
  ctx.answerCallbackQuery();
  sendHelpMessage(ctx);
});

function sendHelpMessage(ctx) {
  const helpMessage = `
Here are the available commands:

/start - Start the bot and show main menu
/help - Show this help message
/reset - Reset the conversation history
/model - Change the AI model
/currentmodel - Show the current model in use
/language - Change the response language
/personality - Change the bot's personality
/save - Save the conversation history
/load - Load a saved conversation

You can also just send a message to chat with me!
  `;
  ctx.reply(helpMessage);
}

// Reset command and callback
bot.command("reset", resetConversation);
bot.callbackQuery("reset", (ctx) => {
  ctx.answerCallbackQuery();
  resetConversation(ctx);
});

function resetConversation(ctx) {
  ctx.session.history = [];
  ctx.reply("Conversation history has been reset.");
}

// Model selection
bot.command("model", sendModelSelectionMessage);
bot.callbackQuery("change_model", (ctx) => {
  ctx.answerCallbackQuery();
  sendModelSelectionMessage(ctx);
});

function sendModelSelectionMessage(ctx) {
  const keyboard = new InlineKeyboard();
  Object.entries(models).forEach(([key, model]) => {
    keyboard.text(model.name, `select_model:${key}`).row();
  });
  ctx.reply("Choose a model:", { reply_markup: keyboard });
}

bot.callbackQuery(/^select_model:/, (ctx) => {
  const modelKey = ctx.callbackQuery.data.split(':')[1];
  ctx.session.model = modelKey;
  ctx.answerCallbackQuery();
  ctx.reply(`Model changed to ${models[modelKey].name}.`);
});

// Current model command
bot.command("currentmodel", (ctx) => {
  const currentModel = models[ctx.session.model];
  ctx.reply(`Current model: ${currentModel.name} (Context: ${currentModel.context} tokens)`);
});

// Language selection
bot.command("language", (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("English", "lang:english")
    .text("Spanish", "lang:spanish")
    .row()
    .text("French", "lang:french")
    .text("German", "lang:german");
  ctx.reply("Choose a language:", { reply_markup: keyboard });
});

bot.callbackQuery(/^lang:/, (ctx) => {
  const language = ctx.callbackQuery.data.split(':')[1];
  ctx.session.language = language;
  ctx.answerCallbackQuery();
  ctx.reply(`Language changed to ${language}.`);
});

// Personality selection
bot.command("personality", (ctx) => {
  const keyboard = new InlineKeyboard()
    .text("Default", "pers:default")
    .text("Friendly", "pers:friendly")
    .row()
    .text("Professional", "pers:professional")
    .text("Humorous", "pers:humorous");
  ctx.reply("Choose a personality:", { reply_markup: keyboard });
});

bot.callbackQuery(/^pers:/, (ctx) => {
  const personality = ctx.callbackQuery.data.split(':')[1];
  ctx.session.personality = personality;
  ctx.answerCallbackQuery();
  ctx.reply(`Personality changed to ${personality}.`);
});

// Save conversation
bot.command("save", (ctx) => {
  const fileName = `conversation_${Date.now()}.json`;
  fs.writeFileSync(fileName, JSON.stringify(ctx.session.history));
  ctx.reply(`Conversation saved as ${fileName}`);
});

// Load conversation
bot.command("load", (ctx) => {
  ctx.reply("Please upload the conversation file.");
});

bot.on("message:document", async (ctx) => {
  try {
    const fileId = ctx.message.document.file_id;
    const fileInfo = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
    const response = await axios.get(fileUrl);
    ctx.session.history = JSON.parse(response.data);
    ctx.reply("Conversation loaded successfully.");
  } catch (error) {
    console.error("Error loading conversation:", error);
    ctx.reply("Error loading conversation. Please try again.");
  }
});

// Settings menu
bot.callbackQuery("settings", (ctx) => {
  ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text("Change Language", "language")
    .text("Change Personality", "personality");
  ctx.reply("Settings:", { reply_markup: keyboard });
});

// Handler for text messages
bot.on("message:text", async (ctx) => {
  // Add user message to history
  ctx.session.history.push({ role: "user", content: ctx.message.text });

  // Get response from Groq
  const response = await getGroqResponse(
    ctx.session.history, 
    ctx.session.model, 
    ctx.session.language, 
    ctx.session.personality
  );

  // Add assistant response to history
  ctx.session.history.push({ role: "assistant", content: response });

  // Trim history if it gets too long
  const maxTokens = models[ctx.session.model].context;
  while (ctx.session.history.reduce((acc, msg) => acc + msg.content.length, 0) > maxTokens * 0.75) {
    ctx.session.history.shift();
  }

  // Send response to user
  ctx.reply(response);
});

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Start the bot
bot.start();
