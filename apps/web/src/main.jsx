import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-workspace-request': '1' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Permintaan gagal.'); error.status = response.status; throw error; }
  return data;
}
function App() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [password, setPassword] = useState('');
  const [messages, setMessages] = useState([]), [input, setInput] = useState(''), [busy, setBusy] = useState(false), [mode, setMode] = useState('chat');
  const [notice, setNotice] = useState(''), [conversations, setConversations] = useState([]), [conversationId, setConversationId] = useState(null);
  const [config, setConfig] = useState(null), [provider, setProvider] = useState('demo'), [retry, setRetry] = useState(null), [mobileOpen, setMobileOpen] = useState(false);
  const [tasks, setTasks] = useState([]), [task, setTask] = useState(null), [tool, setTool] = useState('auto'), [actor, setActor] = useState('');
  const end = useRef(null);
  useEffect(() => { api('/auth/me').then(d => setUser(d.user)).catch(e => { if (e.status !== 401) setNotice(e.message); }).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (user) initialize().catch(e => setNotice(e.message)); }, [user]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  async function refresh() { const [c, t] = await Promise.all([api('/conversations'), api('/tasks')]); setConversations(c.conversations); setTasks(t.tasks); }
  async function initialize() { const data = await api('/settings'); setConfig(data); setProvider(data.provider); setActor(data.apify.actors[0]?.id || ''); await refresh(); }
  async function action(fn) { if (busy) return; setBusy(true); setNotice(''); try { await fn(); } catch (e) { setNotice(e.message); if (e.status === 401) setUser(null); } finally { setBusy(false); } }
  async function loadConversation(cid) { await action(async () => { const data = await api('/conversations/' + cid); setConversationId(cid); setMessages(data.messages); setMode('chat'); setRetry(null); setMobileOpen(false); }); }
  function newChat() { if (busy) return; setMessages([]); setConversationId(null); setRetry(null); setNotice(''); setMode('chat'); setMobileOpen(false); }
  async function send(retryMessage) {
    const content = retryMessage?.content || input.trim(); if (!content || busy) return;
    await action(async () => {
      let cid = conversationId;
      if (!cid) { const c = await api('/conversations', 'POST'); cid = c.id; setConversationId(cid); }
      const pending = retryMessage || { content, requestId: crypto.randomUUID() };
      setInput('');
      try {
        const data = await api('/chat', 'POST', { conversationId: cid, provider, ...pending });
        setRetry(null); if (data.demo) setNotice('MODE DEMO — respons ini bukan hasil provider AI.');
      } catch (e) { setRetry(pending); throw e; }
      finally { const data = await api('/conversations/' + cid); setMessages(data.messages); await refresh(); }
    });
  }
  async function createTask() {
    if (!input.trim()) return;
    await action(async () => {
      let steps;
      if (tool !== 'auto') {
        let toolInput = tool === 'github.repo_info' ? { repo: input.trim() } : { text: input.trim() };
        if (tool === 'apify.run') { try { toolInput = { actor, actorInput: JSON.parse(input) }; } catch { throw new Error('Masukkan Actor input sebagai JSON valid.'); } }
        steps = [{ tool, input: toolInput }];
      }
      const data = await api('/tasks', 'POST', { objective: input.trim(), provider, ...(steps ? { steps } : {}) }); setTask(data); setInput(''); await refresh();
    });
  }
  async function taskAction(a) { await action(async () => { setTask(await api('/tasks/' + task.task.id + '/' + a, 'POST')); await refresh(); }); }
  const selected = config?.providers.find(p => p.id === provider);
  if (loading) return <main className="login-screen"><p>Memuat workspace…</p></main>;
  if (!user) return <main className="login-screen"><form className="login-card" onSubmit={e => { e.preventDefault(); action(async () => { const d = await api('/auth/login', 'POST', { password }); setPassword(''); setUser(d.user); }); }}><div className="eyebrow">PRIVATE AI WORKSPACE</div><h1>Ruang kerja,<br/>pikiran terbuka.</h1><p>Masuk sebagai pemilik workspace. Riwayat dan tools hanya tersedia setelah autentikasi.</p><label htmlFor="owner-password">Password pemilik</label><input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={200}/><button className="primary" disabled={busy}> {busy ? 'Memverifikasi…' : 'Masuk ke workspace'}</button>{notice && <p role="alert" className="notice">{notice}</p>}<small>Session aman · D1 persistence · Backend-only secrets</small></form></main>;
  return <div className="app-shell">
    <aside className={'sidebar ' + (mobileOpen ? 'mobile-open' : '')}>
      <div className="brand"><div className="brand-mark">AI</div><span>AI Workspace</span></div>
      <button className="new-chat" disabled={busy} onClick={newChat}>+ Chat baru</button>
      <div className="side-label">WORKSPACE</div>
      {['chat', 'agent', 'settings'].map(m => <button key={m} disabled={busy} className={'nav-item ' + (mode === m ? 'active' : '')} onClick={() => { setMode(m); setMobileOpen(false); setNotice(''); }}>{m === 'chat' ? 'Assistant' : m === 'agent' ? 'Agent tasks' : 'Settings & integrations'}</button>)}
      <div className="side-label history-label">PERCAKAPAN</div><nav className="history" aria-label="Riwayat percakapan">{conversations.map(c => <section className={'history-row ' + (c.id === conversationId ? 'selected' : '')} key={c.id}><button disabled={busy} onClick={() => loadConversation(c.id)} title={c.title}>{c.title}</button><button aria-label={'Hapus ' + c.title} disabled={busy} onClick={() => { if (window.confirm('Hapus percakapan dan semua pesannya?')) action(async () => { await api('/conversations/' + c.id, 'DELETE'); if (conversationId === c.id) { setConversationId(null); setMessages([]); setRetry(null); } await refresh(); }); }}>×</button></section>)}{!conversations.length && <small>Belum ada percakapan.</small>}</nav>
      <div className="sidebar-bottom"><div className="status-dot"/><div><strong>Private owner workspace</strong><small>{selected?.configured && provider !== 'demo' ? provider + ' dikonfigurasi' : 'Mode demo'}</small></div></div>
      <button className="nav-item" disabled={busy} onClick={() => action(async () => { await api('/auth/logout', 'POST'); setUser(null); setMessages([]); setTask(null); })}>Keluar</button>
    </aside>
    <main className="main"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Buka navigasi" onClick={() => setMobileOpen(!mobileOpen)}>☰</button><div className="header-title">{mode === 'chat' ? 'Assistant' : mode === 'agent' ? 'Agent workspace' : 'Integrations'}</div><label className="provider-label">Model<select aria-label="Provider AI" value={provider} disabled={busy} onChange={e => { const p = e.target.value; setProvider(p); action(() => api('/settings', 'PUT', { provider: p })); }}>{config?.providers.map(p => <option key={p.id} value={p.id} disabled={!p.configured}>{p.id} · {p.model}{!p.configured ? ' (belum aktif)' : ''}</option>)}</select></label></header>
      {mode === 'settings' ? <section className="settings-panel"><div className="eyebrow">BACKEND-ONLY CREDENTIALS</div><h1>Integrations & limits</h1><p>Indikator menunjukkan secret tersedia, bukan bukti koneksi. Uji koneksi melakukan permintaan baca tanpa chat berbayar.</p>{config?.providers.filter(p => p.id !== 'demo').map(p => <article className="integration-card" key={p.id}><header><strong>{p.id.toUpperCase()}</strong><span>{p.configured ? 'Dikonfigurasi' : 'Belum dikonfigurasi'}</span></header><p>{p.model}</p><button disabled={!p.configured || busy} onClick={() => action(async () => { const result = await api('/providers/test', 'POST', { provider: p.id }); setNotice(result.modelAvailable ? p.id + ': koneksi dan model tersedia.' : p.id + ': koneksi berhasil, model tidak ditemukan.'); })}>Uji koneksi</button></article>)}<article className="integration-card"><strong>Apify</strong><p>{config?.apify.configured ? 'Token tersedia' : 'APIFY_API_TOKEN belum tersedia'} · {config?.apify.actors.length} Actor disetujui</p><p>Setiap run memerlukan approval. Request batas charge Actor $0.10, 60 detik, 2 run/hari. Batas ini bergantung pada billing Actor dan bukan jaminan biaya total akun. Tidak ada Actor dijalankan otomatis.</p></article><article className="integration-card"><strong>Kontrol penggunaan</strong><p>100 panggilan model/hari · 10 pesan/menit · 3 langkah/task · 1.200 token output/request</p><p>Pasang/rotasi GROQ_API_KEY, GEMINI_API_KEY, APIFY_API_TOKEN melalui Cloudflare Pages → Settings → Secrets. Tidak ada key mentah di D1 atau browser.</p></article></section>
      : mode === 'agent' ? <section className="agent-panel"><div className="eyebrow">PLAN · APPROVE · EXECUTE</div><h1>Task yang dapat diaudit.</h1><p>Planner mengusulkan hingga 3 langkah. Anda meninjau input, menyetujui, lalu menjalankan satu langkah per request. Sintesis bukan browsing.</p><label>Tool<select aria-label="Pilih tool" value={tool} disabled={busy} onChange={e => setTool(e.target.value)}><option value="auto">AI planner {provider === 'demo' ? '(demo: text.stats)' : ''}</option>{config?.tools.map(t => <option key={t} value={t} disabled={t === 'apify.run' && !config?.apify.actors.length}>{t}</option>)}</select></label>{tool === 'apify.run' && <label>Actor<select value={actor} onChange={e => setActor(e.target.value)}>{config?.apify.actors.map(a => <option key={a.id}>{a.id}</option>)}</select></label>}
        {task && <article className="task-card"><header><strong>{task.task.status}</strong><small>{task.task.id.slice(0, 8)}</small></header><p>{task.task.input}</p>{task.steps.map(s => <section className="step" key={s.id}><strong>{s.position + 1}. {s.tool_name} <span>{s.status}</span></strong><pre>{s.input_json}</pre>{s.output_json && <pre>{s.output_json}</pre>}</section>)}{task.task.error && <p role="alert" className="notice">{task.task.error}</p>}<div className="task-actions">{task.task.status === 'waiting_approval' && <><button className="primary" disabled={busy} onClick={() => taskAction('approve')}>Setujui input & rencana</button><button disabled={busy} onClick={() => taskAction('reject')}>Tolak</button></>}{task.task.status === 'queued' && <button className="primary" disabled={busy} onClick={() => taskAction('run')}>Jalankan langkah berikutnya</button>}{['queued', 'waiting_approval'].includes(task.task.status) && <button disabled={busy} onClick={() => taskAction('cancel')}>Batalkan</button>}{task.logs.some(l => l.tool_name === 'apify.run' && l.status === 'succeeded') && <button disabled={busy} onClick={() => taskAction('apify-status')}>Periksa hasil Apify</button>}</div><button disabled={busy || task.task.status === 'running'} onClick={() => { if (window.confirm('Hapus task beserta execution log dan approval? Run eksternal yang sudah dimulai tidak akan dibatalkan.')) action(async () => { await api('/tasks/' + task.task.id, 'DELETE'); setTask(null); await refresh(); }); }}>Hapus task & log</button><details><summary>Execution log & approval</summary>{task.approvals.map(a => <p key={a.id}>Approval: {a.status} · {a.decided_at || 'belum diputuskan'}</p>)}{task.logs.map(l => <pre key={l.id}>{l.tool_name} · {l.status} · {l.duration_ms || 0}ms{'\n'}{l.output_json || l.error || 'Menunggu hasil'}</pre>)}</details></article>}
        <h2>Task tersimpan</h2><nav className="task-history">{tasks.map(t => <button key={t.id} disabled={busy} onClick={() => action(async () => setTask(await api('/tasks/' + t.id)))}><span>{t.input.slice(0, 80)}</span><small>{t.status}</small></button>)}</nav></section>
      : <section className={'conversation ' + (messages.length ? 'has-messages' : '')}>{!messages.length ? <section className="welcome"><div className="welcome-icon">AI</div><div className="eyebrow">YOUR PRIVATE WORKSPACE</div><h1>Apa yang ingin<br/><span>kita kerjakan?</span></h1><p>Berpikir, merangkum, dan menyelesaikan pekerjaan. Riwayat disimpan di D1 dan hanya dapat diakses setelah login.</p><div className="prompt-grid">{['Bantu saya menyusun rencana bisnis.', 'Jelaskan konsep AI agent dengan sederhana.', 'Buat checklist keamanan aplikasi web.'].map(p => <button className="prompt-card" key={p} disabled={busy} onClick={() => setInput(p)}>{p}</button>)}</div></section> : <section className="message-list">{messages.map(m => <article className={'message ' + (m.role === 'user' ? 'user-message' : 'assistant-message')} key={m.id}><div className="avatar">{m.role === 'user' ? 'K' : 'AI'}</div><section className="message-content"><div className="message-role">{m.role === 'user' ? 'Kamu' : 'AI Workspace'} {m.provider === 'demo' && '· DEMO'} {m.status === 'failed' && '· gagal'}</div><div className="message-text">{m.content}</div></section></article>)}<div ref={end}/></section>}</section>}
      <footer className="composer-wrap">{busy && <p role="status" className="thinking">Memproses permintaan…</p>}{notice && <div role="alert" className="notice">{notice}</div>}{retry && mode === 'chat' && <button disabled={busy} onClick={() => send(retry)}>Coba ulang pesan terakhir (ID sama)</button>}{mode !== 'settings' && <form className="composer" onSubmit={e => { e.preventDefault(); mode === 'agent' ? createTask() : send(); }}><textarea id="message-input" aria-label="Pesan atau objective" rows={2} maxLength={mode === 'agent' ? 4000 : 6000} value={input} disabled={busy} onChange={e => setInput(e.target.value)} placeholder={mode === 'agent' ? tool === 'github.repo_info' ? 'owner/repo GitHub publik' : tool === 'apify.run' ? 'Input Actor JSON (lihat skema owner)' : 'Objective atau teks input tool…' : 'Kirim pesan ke AI Workspace…'}/><div className="composer-footer"><small>{provider === 'demo' ? 'Mode demo — bukan provider AI' : selected?.model} · {input.length}/{mode === 'agent' ? 4000 : 6000}</small><button className="primary" disabled={busy || !input.trim()}>{mode === 'agent' ? 'Buat rencana' : 'Kirim'}</button></div></form>}<p className="disclaimer">AI dapat membuat kesalahan. Verifikasi informasi dan input tool sebelum menyetujui.</p></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
