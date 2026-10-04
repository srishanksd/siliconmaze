import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const dataFile = path.join(process.cwd(), "server", "data.json");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return { reminders: [], history: [] };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getContacts() {
  try {
    return JSON.parse(process.env.TELEGRAM_CONTACTS_JSON || "{}");
  } catch {
    return {};
  }
}

function createReminder(text, when) {
  const data = readData();
  const item = {
    id: Date.now(),
    text: String(text).trim(),
    when: String(when || "unscheduled").trim(),
    createdAt: new Date().toISOString(),
    done: false,
  };
  data.reminders.unshift(item);
  writeData(data);
  return item;
}

function clean(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeSteps(rawSteps) {
  if (!Array.isArray(rawSteps)) return [];

  const allowed = new Set([
    "reminder",
    "calendar",
    "telegram",
    "drive-search",
    "drive-upload",
    "info",
  ]);

  return rawSteps
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;

      const type = clean(raw.type).toLowerCase();
      if (!allowed.has(type)) return null;

      const step = {
        type,
        label: clean(raw.label, type === "info" ? "Review request" : "JARVIS action"),
      };

      if (type === "reminder") {
        step.text = clean(raw.text);
        step.when = clean(raw.when, "unscheduled");
        if (!step.text) return null;
      }

      if (type === "calendar") {
        step.title = clean(raw.title);
        step.start = clean(raw.start);
        step.end = clean(raw.end);
        step.description = clean(raw.description || raw.text);
        if (!step.title || !step.start || !step.end) return null;
      }

      if (type === "telegram") {
        step.recipient = clean(raw.recipient);
        step.message = clean(raw.message || raw.text);
        if (!step.recipient || !step.message) return null;
      }

      if (type === "drive-search") {
        step.query = clean(raw.query);
        if (!step.query) return null;
      }

      if (type === "drive-upload") {
        step.label = clean(raw.label, "Upload selected document");
      }

      if (type === "info") {
        step.text = clean(raw.text || raw.reply || raw.message, "I need more information to complete that request.");
      }

      return step;
    })
    .filter(Boolean);
}

function extractJson(content) {
  const text = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("")
    : String(content || "");

  const cleaned = text
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned || "{}");
}

app.get("/api/status", (req, res) => {
  const mistral = Boolean(process.env.MISTRAL_API_KEY);

  res.json({
    assistant: "ONLINE",
    integrations: {
      mistral: {
        configured: mistral,
        label: mistral ? "READY" : "API KEY MISSING",
      },
      calendar: {
        configured: Boolean(process.env.GOOGLE_ACCESS_TOKEN),
        label: process.env.GOOGLE_ACCESS_TOKEN ? "CONNECTED" : "NOT CONFIGURED",
      },
      drive: {
        configured: Boolean(process.env.GOOGLE_ACCESS_TOKEN),
        label: process.env.GOOGLE_ACCESS_TOKEN ? "CONNECTED" : "NOT CONFIGURED",
      },
      telegram: {
        configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        label: process.env.TELEGRAM_BOT_TOKEN ? "READY" : "NOT CONFIGURED",
      },
      reminders: {
        configured: true,
        label: "ACTIVE",
      },
    },
  });
});

app.post("/api/ai/interpret", async (req, res) => {
  if (!process.env.MISTRAL_API_KEY) {
    return res.json({
      configured: false,
      reply: "Mistral API key is not configured.",
      steps: [],
    });
  }

  const command = clean(req.body?.command);
  if (!command) {
    return res.status(400).json({ error: "Command is required." });
  }

  const currentTime = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "long",
  });

  const system = [
    "You are JARVIS, a command planner, not a general chatbot.",
    "Return ONLY one valid JSON object. JSON mode is enabled.",
    "The object must have exactly two top-level fields: reply and steps.",
    "reply must be one short sentence. Never claim an action already happened.",
    "steps must be an ordered array using only: reminder, calendar, telegram, drive-search, drive-upload, info.",
    "For calendar steps, title, start, and end are mandatory. start and end MUST be RFC3339 timestamps in Asia/Kolkata. Resolve relative dates from the current time below. If date or time is missing, return one info step instead of guessing.",
    "For telegram steps, recipient must be a contact name and message must be exactly what should be sent.",
    "For drive-search, query must contain only useful search terms.",
    "For reminders, preserve the requested reminder text and time/date.",
    "Never invent a recipient, time, file, credential, or success.",
    "Split multi-action commands into ordered steps.",
    "If the command is a question, return one info step.",
    "Current time in Asia/Kolkata: " + currentTime,
  ].join("\n");

  try {
    let response;
    let data = {};

    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || "mistral-small-latest",
          temperature: 0,
          random_seed: 17,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: command },
          ],
        }),
      });

      data = await response.json().catch(() => ({}));

      if (response.status !== 429 || attempt === 2) break;

      const waitMs = 1000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error?.message ||
        `Mistral request failed with HTTP ${response.status}.`;
      if (response.status === 429) {
        return res.status(429).json({
          error: "Mistral rate limit reached. Wait a moment and try again, or use a fresh API key if the limit is account-wide.",
        });
      }
      return res.status(502).json({ error: message });
    }

    const parsed = extractJson(data?.choices?.[0]?.message?.content);
    const steps = normalizeSteps(parsed.steps);

    if (!steps.length) {
      return res.json({
        configured: true,
        reply: clean(parsed.reply, "I could not turn that into a safe action plan."),
        steps: [{
          type: "info",
          label: "Clarify request",
          text: clean(parsed.reply, "Please provide the missing details."),
        }],
      });
    }

    return res.json({
      configured: true,
      reply: clean(parsed.reply, "Command understood."),
      steps,
    });
  } catch (error) {
    return res.status(502).json({
      error: `Mistral interpretation unavailable: ${error.message}`,
    });
  }
});

app.get("/api/preview", async (req, res) => {
  const data = readData();
  let calendar = [];

  if (process.env.GOOGLE_ACCESS_TOKEN) {
    try {
      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10",
        { headers: { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}` } },
      );
      const body = await response.json().catch(() => ({}));
      if (response.ok) calendar = body.items || [];
    } catch {}
  }

  res.json({
    reminders: data.reminders,
    history: data.history,
    calendar,
    drive: [],
  });
});

app.post("/api/reminders", (req, res) => {
  const text = clean(req.body?.text);
  if (!text) return res.status(400).json({ error: "Reminder text is required." });
  res.json(createReminder(text, req.body?.when));
});

app.delete("/api/reminders/:id", (req, res) => {
  const data = readData();
  data.reminders = data.reminders.filter((item) => String(item.id) !== req.params.id);
  writeData(data);
  res.sendStatus(204);
});

app.post("/api/calendar/events", async (req, res) => {
  if (!process.env.GOOGLE_ACCESS_TOKEN) {
    return res.status(503).json({
      error: "Google Calendar is not configured. Add GOOGLE_ACCESS_TOKEN on the server.",
    });
  }

  const { summary, description, start, end } = req.body || {};
  if (!summary || !start?.dateTime || !end?.dateTime) {
    return res.status(400).json({
      error: "Calendar event requires a title, start time, and end time.",
    });
  }

  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary, description: description || "", start, end }),
      },
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: body?.error?.message || "Calendar request failed.",
      });
    }

    res.json(body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/calendar/events", async (req, res) => {
  if (!process.env.GOOGLE_ACCESS_TOKEN) return res.json({ configured: false, events: [] });

  try {
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10",
      { headers: { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}` } },
    );
    const body = await response.json().catch(() => ({}));
    res.status(response.ok ? 200 : response.status).json({
      configured: true,
      events: body.items || [],
      error: body?.error?.message,
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/drive/search", async (req, res) => {
  if (!process.env.GOOGLE_ACCESS_TOKEN) {
    return res.status(503).json({
      error: "Google Drive is not configured. Add GOOGLE_ACCESS_TOKEN on the server.",
    });
  }

  const query = clean(req.query?.q);
  if (!query) return res.status(400).json({ error: "Drive search text is required." });

  const escaped = query.replaceAll("'", "\\'");
  const q = encodeURIComponent(`name contains '${escaped}' and trashed = false`);

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`,
      { headers: { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}` } },
    );
    const body = await response.json().catch(() => ({}));
    res.status(response.ok ? 200 : response.status).json(body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/drive/upload", upload.single("file"), async (req, res) => {
  if (!process.env.GOOGLE_ACCESS_TOKEN) {
    return res.status(503).json({
      error: "Google Drive is not configured. The selected file was not uploaded.",
    });
  }
  if (!req.file) return res.status(400).json({ error: "Select a file before uploading." });

  try {
    const form = new FormData();
    form.append(
      "metadata",
      new Blob(
        [JSON.stringify({ name: req.file.originalname, mimeType: req.file.mimetype || "application/octet-stream" })],
        { type: "application/json" },
      ),
    );
    form.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype || "application/octet-stream" }),
      req.file.originalname,
    );

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}` },
        body: form,
      },
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: body?.error?.message || "Drive upload failed.",
      });
    }

    res.json(body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/telegram/send", async (req, res) => {
  const recipient = clean(req.body?.recipient);
  const message = clean(req.body?.message);
  const chatId = getContacts()[recipient];

  if (!recipient || !message) {
    return res.status(400).json({ error: "Recipient and message are required." });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) {
    return res.status(503).json({
      error: `Telegram recipient ${recipient} is not configured on the server.`,
    });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      },
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      return res.status(502).json({
        error: body?.description || "Telegram delivery failed.",
      });
    }

    const data = readData();
    data.history.unshift({
      recipient,
      message,
      time: new Date().toISOString(),
      status: "SENT",
    });
    writeData(data);

    res.json(body.result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/command", (req, res) => {
  if (clean(req.body?.intent) === "reminder") {
    const text = clean(req.body?.text);
    if (!text) return res.status(400).json({ error: "Reminder text is required." });
    return res.json(createReminder(text, req.body?.when));
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`JARVIS server listening on http://localhost:${PORT}`);
});
