import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const starterPrompts = [
  "Bantu saya meneliti peluang bisnis dari masalah nyata.",
  "Ringkas dokumen dan temukan poin penting.",
  "Buat rencana kerja bertahap untuk sebuah proyek."
];

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("chat");
  const [notice, setNotice] = useState("");
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const endRef = useRef(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, busy]);

  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    setNotice("");
    const next = [...messages, { role: "user", content: prompt }];
    setMessages(next);
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId,
          messages: next,
          mode
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
      setMessages([...next, { role: "assistant", content: data.reply || "Provider belum mengembalikan jawaban." }]);
      if (data.demo) setNotice("Mode demo aktif — sambungkan provider AI di backend untuk jawaban model sungguhan.");
    } catch (error) {
      setMessages(next);
      setNotice(error.message || "Tidak bisa menghubungi backend.");
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setMessages([]);
    setConversationId(crypto.randomUUID());
    setNotice("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">✳</div><span>AI Workspace</span></div>
        <button className="new-chat" onClick={newChat}>＋ <span>Chat baru</span></button>
        <div className="side-label">WORKSPACE</div>
        <button className={mode === "chat" ? "nav-item active" : "nav-item"} onClick={() => setMode("chat")}>◉ <span>Assistant</span></button>
        <button className={mode === "agent" ? "nav-item active" : "nav-item"} onClick={() => setMode("agent")}>⌘ <span>Agent tasks</span><span className="soon">MVP</span></button>
        <button className="nav-item" onClick={() => setNotice("Riwayat persisten akan diaktifkan setelah integrasi D1.")}>▤ <span>Riwayat</span></button>
        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div><strong>Local workspace</strong><small>Provider belum dikonfigurasi</small></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">✳ AI Workspace</div>
          <div className="mode-chip">{mode === "chat" ? "Assistant" : "Agent mode"} <span>⌄</span></div>
          <button className="icon-button" aria-label="Percakapan baru" onClick={newChat}>＋</button>
        </header>
        <section className={messages.length ? "conversation has-messages" : "conversation"}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">✳</div>
              <div className="eyebrow">YOUR AI WORKSPACE</div>
              <h1>Apa yang ingin<br/><span>kita kerjakan?</span></h1>
              <p>Tempat untuk berpikir, meneliti, dan menyelesaikan pekerjaan bersama AI.</p>
              <div className="prompt-grid">
                {starterPrompts.map((prompt) => <button key={prompt} className="prompt-card" onClick={() => send(prompt)}>{prompt}<span>↗</span></button>)}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => <article className={message.role === "user" ? "message user-message" : "message assistant-message"} key={index}>
                <div className="avatar">{message.role === "user" ? "K" : "✳"}</div>
                <div className="message-content"><div className="message-role">{message.role === "user" ? "Kamu" : "AI Workspace"}</div><div className="message-text">{message.content}</div></div>
              </article>)}
              {busy && <div className="thinking"><span/><span/><span/> AI sedang menyiapkan jawaban…</div>}
              <div ref={endRef} />
            </div>
          )}
        </section>
        <div className="composer-wrap">
          {notice && <div className="notice">{notice}</div>}
          <form className="composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={mode === "agent" ? "Jelaskan tugas yang ingin dijalankan…" : "Kirim pesan ke AI Workspace…"} rows={1} aria-label="Pesan" />
            <div className="composer-footer">
              <div className="composer-hint"><span>↵</span> kirim <span className="hint-divider">·</span> shift + ↵ baris baru</div>
              <button className="send-button" type="submit" disabled={!input.trim() || busy} aria-label="Kirim pesan">{busy ? "…" : "↑"}</button>
            </div>
          </form>
          <div className="disclaimer">AI Workspace dapat membuat kesalahan. Verifikasi informasi penting.</div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
