import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const api = async (url, options = {}) => {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}`);
  return body;
};

function createId(index) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
}

function addStepIds(steps) {
  return steps.map((step, index) => ({ ...step, id: step.id || createId(index), state: "WAITING" }));
}

function parseCommand(text) {
  const lower = text.toLowerCase();
  const steps = [];

  if (/remind|reminder/.test(lower)) {
    const cleaned = text
      .replace(/^.*?remind(?: me)?(?: to)?\s*/i, "")
      .replace(/\s+(?:at|on)\s+.+$/i, "")
      .trim();
    steps.push({
      type: "reminder",
      label: "Create personal reminder",
      text: cleaned || text,
      when: text.match(/(?:at|on)\s+(.+)$/i)?.[1] || "unscheduled",
    });
  }

  if (/schedule|calendar|meeting|event/.test(lower)) {
    steps.push({
      type: "info",
      label: "Use Mistral for calendar planning",
      text: "Calendar commands need Mistral to resolve the requested date and time safely.",
    });
  }

  if (/telegram|send (?:a )?message|message/.test(lower)) {
    const recipient = text.match(/\bto\s+([A-Z][a-z]+)\b/)?.[1] || "";
    const message = text.match(/(?:saying|that)\s+(.+)$/i)?.[1]?.trim() || "";
    steps.push(
      recipient && message
        ? {
            type: "telegram",
            label: "Send Telegram message",
            recipient,
            message,
          }
        : {
            type: "info",
            label: "Missing message details",
            text: "Please provide both the recipient and the message.",
          },
    );
  }

  if (/drive|document|file/.test(lower) && /search|find/.test(lower)) {
    steps.push({
      type: "drive-search",
      label: "Search Stark Archive",
      query: text.replace(/.*?(?:search|find)\s+(?:for\s+)?/i, "").trim() || text,
    });
  }

  if (/upload/.test(lower)) {
    steps.push({ type: "drive-upload", label: "Upload selected document" });
  }

  return steps.length
    ? steps
    : [{ type: "info", label: "Interpret request", text: "I could not map that command to a supported JARVIS action." }];
}

function localConversation(text) {
  const value = text.trim().toLowerCase();

  if (/^(hi|hello|hey|good morning|good evening|good afternoon)\b/.test(value)) {
    return "Good evening, Tony. Systems are online and ready.";
  }

  if (/how are you|how's life|hows life|how is life|how have you been/.test(value)) {
    return "All systems are stable. I'm operational and ready for your next command.";
  }

  if (/what is your name|who are you|your name\b/.test(value)) {
    return "I am JARVIS, your local command-centre assistant.";
  }

  if (/what (?:can|could) you do|what are you able to do|help|commands/.test(value)) {
    return "I can create reminders, plan calendar events, send Telegram messages, search Drive, and upload documents.";
  }

  if (/thank you|thanks|thx/.test(value)) {
    return "Always ready, Tony.";
  }

  return null;
}

function App() {
  const [messages, setMessages] = useState([
    { role: "jarvis", text: "Good evening, Tony. All local systems are online. What shall we handle?" },
  ]);
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState({ reminders: [], history: [], calendar: [], drive: [] });
  const [tab, setTab] = useState("reminders");
  const [confirmation, setConfirmation] = useState(null);
  const [file, setFile] = useState(null);

  const say = (text) => {
    if (text) setMessages((current) => [...current, { role: "jarvis", text }]);
  };

  const refresh = async () => {
    try {
      setPreview(await api("/api/preview"));
    } catch {}
  };

  useEffect(() => {
    api("/api/status")
      .then((data) => {
        setStatus(data);
        if (!data.integrations.mistral.configured) {
          say("Mistral is not configured. Add MISTRAL_API_KEY to .env to enable AI command planning.");
        }
      })
      .catch((error) => say(error.message));
    refresh();
  }, []);

  const setStepState = (id, state) => {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, state } : item)));
  };

  async function runStep(step) {
    setStepState(step.id, "RUNNING");
    try {
      if (step.type === "reminder") {
        await api("/api/reminders", {
          method: "POST",
          body: JSON.stringify({ text: step.text, when: step.when }),
        });
        say(`Reminder created: ${step.text}`);
        setTab("reminders");
      } else if (step.type === "calendar") {
        await api("/api/calendar/events", {
          method: "POST",
          body: JSON.stringify({
            summary: step.title,
            description: step.description || "",
            start: { dateTime: step.start, timeZone: "Asia/Kolkata" },
            end: { dateTime: step.end, timeZone: "Asia/Kolkata" },
          }),
        });
        say(`Calendar event created: ${step.title}`);
        setTab("calendar");
      } else if (step.type === "telegram") {
        await api("/api/telegram/send", {
          method: "POST",
          body: JSON.stringify({ recipient: step.recipient, message: step.message }),
        });
        say(`Telegram delivered to ${step.recipient}.`);
        setTab("communication");
      } else if (step.type === "drive-search") {
        const data = await api(`/api/drive/search?q=${encodeURIComponent(step.query)}`);
        setPreview((current) => ({ ...current, drive: data.files || [] }));
        say(`I found ${(data.files || []).length} Drive files for "${step.query}".`);
        setTab("drive");
      } else if (step.type === "drive-upload") {
        if (!file) throw new Error("Select a document in the Stark Archive panel first.");
        const form = new FormData();
        form.append("file", file);
        await api("/api/drive/upload", { method: "POST", body: form });
        say(`Uploaded ${file.name} to the Stark Archive.`);
        setFile(null);
        setTab("drive");
      } else if (step.type === "info") {
        say(step.text || "I need more information before I can do that.");
      }

      setStepState(step.id, "DONE");
    } catch (error) {
      setStepState(step.id, "ERROR");
      say(`Action not completed: ${error.message}`);
    } finally {
      await refresh();
    }
  }

  async function process(steps) {
    setRunning(true);
    for (const step of steps) await runStep(step);
    setRunning(false);
  }

  async function submit(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || running) return;

    setMessages((current) => [...current, { role: "user", text }]);
    setInput("");

    const conversationalReply = localConversation(text);
    if (conversationalReply) {
      say(conversationalReply);
      return;
    }

    let steps;
    try {
      const ai = await api("/api/ai/interpret", {
        method: "POST",
        body: JSON.stringify({ command: text }),
      });

      if (ai.configured && Array.isArray(ai.steps) && ai.steps.length) {
        steps = ai.steps;
        say(ai.reply);
      } else {
        steps = parseCommand(text);
        say("Mistral is unavailable, so I used the local parser for this command.");
      }
    } catch (error) {
      say(`Mistral is unavailable: ${error.message}. I switched to the local parser.`);
      steps = parseCommand(text);
    }

    const plannedSteps = addStepIds(steps);
    setQueue((current) => [...current, ...plannedSteps]);

    if (plannedSteps.some((step) => ["calendar", "telegram"].includes(step.type))) {
      setConfirmation({ text, steps: plannedSteps });
    } else {
      await process(plannedSteps);
    }
  }

  const previewContent =
    tab === "reminders" ? (
      <Preview
        title="PERSONAL REMINDERS"
        items={preview.reminders}
        empty="No reminders yet."
      />
    ) : tab === "calendar" ? (
      <Preview
        title="GOOGLE CALENDAR"
        items={preview.calendar}
        empty={status?.integrations.calendar.configured ? "No upcoming events loaded." : "Google Calendar is not configured."}
      />
    ) : tab === "communication" ? (
      <Preview title="RECENT COMMUNICATIONS" items={preview.history} empty="No JARVIS communications yet." />
    ) : (
      <div className="preview-body">
        <div className="preview-title">STARK ARCHIVE</div>
        <div className="upload">
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <button
            onClick={() => runStep({ id: createId(0), type: "drive-upload", label: "Upload selected document" })}
            disabled={!file || running}
          >
            UPLOAD
          </button>
        </div>
        {preview.drive.length ? (
          preview.drive.map((fileItem) => (
            <div className="row" key={fileItem.id}>
              <span>
                {fileItem.name}
                <small>{fileItem.mimeType} · {fileItem.modifiedTime}</small>
              </span>
              {fileItem.webViewLink && (
                <a href={fileItem.webViewLink} target="_blank" rel="noreferrer">OPEN</a>
              )}
            </div>
          ))
        ) : (
          <p className="muted">Drive search and upload require server-side Google credentials.</p>
        )}
      </div>
    );

  return (
    <main className="app">
      <header>
        <div>
          <div className="eyebrow">STARK INDUSTRIES / SECURE NODE 07</div>
          <h1>JARVIS <span>COMMAND CENTRE</span></h1>
        </div>
        <div className="online"><i /> {status?.assistant || "CONNECTING"}</div>
      </header>

      <section className="layout">
        <div className="assistant panel">
          <div className="panel-head">
            <b>ASSISTANT CHANNEL</b>
            <span>QUEUE {queue.filter((item) => !["DONE", "ERROR"].includes(item.state)).length}</span>
          </div>

          <div className="chat">
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={index}>
                <small>{message.role === "user" ? "TONY" : "JARVIS"}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <form onSubmit={submit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tell JARVIS what to do..."
            />
            <button disabled={running}>EXECUTE</button>
          </form>
        </div>

        <aside className="side">
          <div className="panel queue">
            <div className="panel-head">
              <b>COMMAND QUEUE</b>
              <span>{running ? "PROCESSING" : "READY"}</span>
            </div>

            {queue.length ? (
              <ol>
                {queue.map((item) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <em className={item.state.toLowerCase()}>{item.state}</em>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No pending operations.</p>
            )}
          </div>

          <div className="panel integrations">
            <div className="panel-head"><b>INTEGRATIONS</b></div>
            {status &&
              Object.entries(status.integrations).map(([name, value]) => (
                <div className="integration" key={name}>
                  <span>{name.toUpperCase()}</span>
                  <em className={value.configured ? "ok" : ""}>{value.label}</em>
                </div>
              ))}
          </div>
        </aside>
      </section>

      <section className="preview panel">
        <div className="tabs">
          {["reminders", "calendar", "drive", "communication"].map((name) => (
            <button
              type="button"
              className={tab === name ? "active" : ""}
              onClick={() => {
                setTab(name);
                if (name === "calendar") refresh();
              }}
              key={name}
            >
              {name.toUpperCase()}
            </button>
          ))}
        </div>
        {previewContent}
      </section>

      {confirmation && (
        <div className="confirm">
          <div className="confirm-card">
            <div className="eyebrow">ACTION CONFIRMATION</div>
            <h2>Execute this plan?</h2>
            <p>{confirmation.text}</p>
            <ol>
              {confirmation.steps.map((step) => <li key={step.id}>{step.label}</li>)}
            </ol>
            <button
              onClick={() => {
                const steps = confirmation.steps;
                setConfirmation(null);
                process(steps);
              }}
              disabled={running}
            >
              CONFIRM
            </button>
            <button className="quiet" onClick={() => setConfirmation(null)} disabled={running}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Preview({ title, items, empty }) {
  return (
    <div className="preview-body">
      <div className="preview-title">{title}</div>
      {items.length ? (
        items.map((item, index) => (
          <div className="row" key={item.id || index}>
            <span>
              {item.text || item.summary || item.recipient}
              <small>{item.when || item.start?.dateTime || item.message || item.time || ""}</small>
            </span>
            <b>{item.status || "ACTIVE"}</b>
          </div>
        ))
      ) : (
        <p className="muted">{empty}</p>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
