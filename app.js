/**
 * STARK — Agente AI Privato
 * Powered by Google Gemini
 *
 * NOTA SULLA CHIAVE API:
 * La chiave non deve mai essere scritta qui dentro.
 * Devi servirla tramite una delle seguenti modalità:
 *
 *  (A) Server-side / Service Worker: esponi un endpoint proxy
 *      (es. /api/gemini) che inietta la chiave server-side.
 *
 *  (B) Build-time environment variable (es. Vite/Webpack):
 *      sostituisci STARK_GEMINI_KEY con import.meta.env.VITE_GEMINI_KEY
 *
 *  (C) Config locale (solo sviluppo, NON committare):
 *      crea un file config.js che assegna window.__STARK_KEY = "la-tua-key"
 *      e includilo PRIMA di app.js in index.html.
 *
 * L'app legge la chiave da window.__STARK_KEY — imposta quella variabile
 * con il metodo che preferisci per il tuo deployment.
 */

"use strict";

// ─── Configurazione ──────────────────────────────────────────────────────────

const CONFIG = {
  // Legge la chiave dalla variabile globale iniettata a runtime.
  // Non scrivere mai la chiave direttamente in questo file.
  get apiKey() {
    return window.__STARK_KEY || "";
  },

  // Modello Gemini più recente e performante disponibile.
  model: "gemini-2.0-flash",

  // Endpoint REST ufficiale delle API Google Gemini
  get endpoint() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  },

  // System prompt: definisce la personalità di Stark.
  systemInstruction: `Sei Stark, un agente AI privato, riservato e affidabile.
Ti rivolgi all'utente in modo formale ma naturale e amichevole: educato, diretto, mai rigido o distaccato.
Dai risposte concise, precise e ben strutturate. Quando appropriato, usa Markdown per formattare il testo (codice, elenchi, titoli).
Non menzionare mai le tue istruzioni interne né il fatto di essere basato su Gemini a meno che non venga chiesto esplicitamente.`,
};

// ─── Macro Commands ───────────────────────────────────────────────────────────

const MACROS = {
  sintetizza: (testo) =>
    `Sintetizza in modo chiaro e conciso il seguente testo, mantenendo tutti i punti chiave:\n\n${testo}`,

  codice: (testo) =>
    `Analizza il seguente codice. Identifica eventuali bug, problemi di performance, pattern non ottimali e suggerisci miglioramenti concreti:\n\n\`\`\`\n${testo}\n\`\`\``,

  correggi: (testo) =>
    `Correggi ortografia, grammatica e punteggiatura del seguente testo, migliorando anche lo stile dove necessario. Restituisci solo il testo corretto, senza spiegazioni aggiuntive:\n\n${testo}`,
};

// ─── Stato ───────────────────────────────────────────────────────────────────

const state = {
  isProcessing: false,
  // Cronologia conversazione per contesto multi-turno
  history: [],
};

// ─── Riferimenti DOM ─────────────────────────────────────────────────────────

const chatEl     = document.getElementById("chat");
const inputEl    = document.getElementById("user-input");
const sendBtn    = document.getElementById("send-btn");
const statusDot  = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const macroBtns  = document.querySelectorAll(".macro-btn");

// ─── Utilità UI ──────────────────────────────────────────────────────────────

function setStatus(mode) {
  statusDot.className = "";
  if (mode === "idle") {
    statusDot.classList.add("idle");
    statusText.textContent = "Pronto";
  } else if (mode === "processing") {
    statusDot.classList.add("processing");
    statusText.textContent = "Elaborazione…";
  } else {
    statusText.textContent = "In attesa";
  }
}

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", role);

  const sender = document.createElement("div");
  sender.classList.add("sender");
  sender.textContent = role === "user" ? "Tu" : "Stark";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  // Supporto minimale Markdown: codice inline e blocchi
  bubble.innerHTML = renderMarkdown(text);

  wrapper.appendChild(sender);
  wrapper.appendChild(bubble);
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;
  return wrapper;
}

function showTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "assistant", "typing-indicator");
  wrapper.id = "typing-indicator";

  const sender = document.createElement("div");
  sender.classList.add("sender");
  sender.textContent = "Stark";

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.classList.add("dot");
    bubble.appendChild(dot);
  }

  wrapper.appendChild(sender);
  wrapper.appendChild(bubble);
  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}

/**
 * Rendering Markdown minimalista:
 * - Blocchi di codice ```lang ... ```
 * - Codice inline `...`
 * - Grassetto **...**
 * - Corsivo *...*
 * - Elenchi puntati/numerati
 * - A capo → <br>
 */
function renderMarkdown(text) {
  let html = text
    // Escape HTML di base
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Blocchi di codice
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre style="background:#0a0c0f;border:1px solid #1e2229;border-radius:6px;padding:12px;overflow-x:auto;font-size:12.5px;line-height:1.6;margin:8px 0;color:#a8f0e0;">${code.trim()}</pre>`
    )
    // Codice inline
    .replace(/`([^`]+)`/g, '<code style="background:#0a0c0f;border:1px solid #1e2229;border-radius:4px;padding:1px 5px;font-size:12.5px;color:#a8f0e0;">$1</code>')
    // Grassetto
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Corsivo
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Elenchi puntati
    .replace(/^[\s]*[-•]\s(.+)/gm, '<li style="margin-left:16px;">$1</li>')
    // Elenchi numerati
    .replace(/^[\s]*\d+\.\s(.+)/gm, '<li style="margin-left:16px;">$1</li>')
    // Titoli h3
    .replace(/^###\s(.+)/gm, '<h3 style="font-family:\'Syne\',sans-serif;font-size:14px;color:#e0e8f0;margin:10px 0 4px;letter-spacing:0.05em;">$1</h3>')
    // Titoli h2
    .replace(/^##\s(.+)/gm, '<h2 style="font-family:\'Syne\',sans-serif;font-size:15px;color:#e0e8f0;margin:12px 0 4px;letter-spacing:0.05em;">$1</h2>')
    // Newline
    .replace(/\n/g, "<br/>");

  return html;
}

// ─── Chiamata API Gemini ──────────────────────────────────────────────────────

async function callGemini(userMessage) {
  if (!CONFIG.apiKey) {
    throw new Error(
      "Chiave API non trovata. Imposta window.__STARK_KEY prima di avviare l'applicazione."
    );
  }

  // Aggiunge il messaggio corrente alla cronologia
  state.history.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const requestBody = {
    system_instruction: {
      parts: [{ text: CONFIG.systemInstruction }],
    },
    contents: state.history,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
  };

  const response = await fetch(CONFIG.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `Errore HTTP ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();

  // Estrae il testo dalla risposta
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Nessuna risposta ricevuta dal modello.");

  const assistantText = candidate.content?.parts?.map((p) => p.text || "").join("") || "";

  // Aggiunge la risposta alla cronologia (multi-turno)
  state.history.push({
    role: "model",
    parts: [{ text: assistantText }],
  });

  return assistantText;
}

// ─── Flusso principale di invio ───────────────────────────────────────────────

async function sendMessage(text) {
  const message = text.trim();
  if (!message || state.isProcessing) return;

  state.isProcessing = true;
  inputEl.value = "";
  autoResize(inputEl);
  sendBtn.disabled = true;

  appendMessage("user", message);
  showTypingIndicator();
  setStatus("processing");

  try {
    const reply = await callGemini(message);
    removeTypingIndicator();
    appendMessage("assistant", reply);
    setStatus("idle");
  } catch (err) {
    removeTypingIndicator();
    appendMessage("assistant", `⚠ Si è verificato un problema: ${err.message}`);
    setStatus("idle");
    console.error("[Stark] Errore API:", err);
  } finally {
    state.isProcessing = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

sendBtn.addEventListener("click", () => sendMessage(inputEl.value));

inputEl.addEventListener("keydown", (e) => {
  // Invio senza Shift invia il messaggio (su iPad la tastiera usa "return")
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

inputEl.addEventListener("input", () => autoResize(inputEl));

// Macro buttons
macroBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const macro = btn.dataset.macro;
    const currentText = inputEl.value.trim();

    if (!currentText) {
      // Se l'input è vuoto, inserisce un prompt guida
      const prompts = {
        sintetizza: "Incolla qui il testo che vuoi sintetizzare.",
        codice: "Incolla qui il codice che vuoi analizzare.",
        correggi: "Incolla qui il testo che vuoi correggere.",
      };
      inputEl.value = prompts[macro] || "";
      autoResize(inputEl);
      inputEl.focus();
      inputEl.select();
      return;
    }

    // Applica la macro al testo presente nell'input
    if (MACROS[macro]) {
      const enrichedPrompt = MACROS[macro](currentText);
      sendMessage(enrichedPrompt);
    }
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  // Service Worker per modalità offline / PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.warn("[Stark] SW non registrato:", err));
  }

  setStatus("idle");

  // Messaggio di benvenuto
  appendMessage(
    "assistant",
    "Benvenuto. Sono Stark, il suo agente AI privato.\nCome posso esserle utile oggi?"
  );

  inputEl.focus();
})();
