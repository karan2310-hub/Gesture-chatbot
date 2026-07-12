'use client'
import { useState, useRef } from 'react'
import PdfViewer from './component/pdfviewer' //iframe htake pdfjs lga rhe
// ─── Main App ────────────────────────────────────────────────────────────────
export default function Home() {
  const [pdfUrl, setPdfUrl]     = useState(null)
  const [pdfName, setPdfName]   = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const fileInputRef            = useRef(null)
  const msgEndRef               = useRef(null)

  const handleFile = (file) => {
    if (!file || file.type !== 'application/pdf') return
    setPdfName(file.name)
    setPdfUrl(URL.createObjectURL(file))
    setMessages([{
      role: 'bot',
      text: `"${file.name}" upload ho gaya! Ab is PDF ke baare mein kuch bhi poocho. ✅`
    }])
  }

  const sendMessage = async () => {
    if (!input.trim()) return
    const userMsg = { role: 'user', text: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: 'FastAPI backend Step 3 mein connect hoga! Abhi placeholder response. 🚧'
      }])
      setLoading(false)
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 800)
  }

  // ── Split screen (PDF uploaded) ──────────────────────────────────────────
  if (pdfUrl) {
    return (
      <div style={s.splitRoot}>

        {/* LEFT — PDF Viewer */}
        <div style={s.pdfSide}>
          <div style={s.sideHeader}>
            <span style={s.dot} />
            <span style={s.sideTitle}>📄 {pdfName}</span>
          </div>
           <PdfViewer pdfUrl={pdfUrl} />
        </div>

        {/* DIVIDER */}
        <div style={s.divider} />

        {/* RIGHT — Chatbot */}
        <div style={s.chatSide}>
          <div style={s.sideHeader}>
            <span style={s.dot} />
            <span style={s.sideTitle}>PDF Chat</span>
          </div>

          <div style={s.msgList}>
            {messages.map((m, i) => (
              <div key={i} style={{
                ...s.bubble,
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? '#2f6feb' : '#2a2a2a',
              }}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div style={{ ...s.bubble, alignSelf: 'flex-start', background: '#2a2a2a', color: '#888' }}>
                ● ● ●
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          <div style={s.inputBar}>
            <button style={s.plusBtn} onClick={() => fileInputRef.current.click()} title="Naya PDF upload karo">
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])}
            />
            <input
              style={s.textInput}
              placeholder="PDF ke baare mein kuch bhi poocho..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button style={s.sendBtn} onClick={sendMessage}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>

      </div>
    )
  }

  // ── Landing page — Claude/GPT style ─────────────────────────────────────
  return (
    <div style={s.landingRoot}>

      {/* center greeting */}
      <div style={s.centerContent}>
        <h1 style={s.greeting}>Hello, Sir! 👋</h1>
        <p style={s.subGreeting}>
          Main aapka PDF assistant hoon.<br />
          PDF upload karein ya seedha kuch poochen.
        </p>

        {/* quick prompt chips */}
        <div style={s.promptGrid}>
          {[
            'Is PDF ka summary do',
            'Main topics kya hain?',
            'Important points nikalo',
            'Koi bhi sawaal poocho',
          ].map(p => (
            <button
              key={p}
              style={s.promptChip}
              onClick={() => setInput(p)}
              onMouseEnter={e => e.currentTarget.style.background = '#333'}
              onMouseLeave={e => e.currentTarget.style.background = '#2a2a2a'}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* bottom input — exactly like Claude/ChatGPT */}
      <div style={s.landingInputWrap}>
        <div style={s.landingInputBox}>

          {/* + button → PDF upload */}
          <button
            style={s.plusBtn}
            onClick={() => fileInputRef.current.click()}
            title="PDF Upload karo"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])}
          />

          <input
            style={s.landingTextInput}
            placeholder="PDF upload karo (+) ya seedha kuch poocho..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />

          <button style={s.sendBtn} onClick={sendMessage}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <p style={s.hint}>
          + dabao → PDF upload → split view mein khulega
        </p>
      </div>

    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  // ── landing ──
  landingRoot: {
    height: '100vh',
    background: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#ececec',
    padding: '60px 20px 28px',
    boxSizing: 'border-box',
  },
  centerContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    flex: 1,
    justifyContent: 'center',
  },
  greeting: {
    fontSize: '38px',
    fontWeight: '600',
    margin: 0,
    color: '#fff',
  },
  subGreeting: {
    fontSize: '15px',
    color: '#777',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.7,
  },
  promptGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'center',
    maxWidth: '500px',
    marginTop: '8px',
  },
  promptChip: {
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: '10px',
    color: '#bbb',
    padding: '10px 16px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },

  // bottom input area
  landingInputWrap: {
    width: '100%',
    maxWidth: '680px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  landingInputBox: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#2a2a2a',
    border: '1px solid #3d3d3d',
    borderRadius: '16px',
    padding: '10px 14px',
    boxSizing: 'border-box',
  },
  landingTextInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '15px',
    padding: '4px 0',
    fontFamily: 'inherit',
  },
  hint: {
    fontSize: '12px',
    color: '#444',
    margin: 0,
  },

  // ── split screen ──
  splitRoot: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    background: '#1a1a1a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#ececec',
    boxSizing: 'border-box',
  },
  pdfSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chatSide: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sideHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '13px 18px',
    borderBottom: '1px solid #2a2a2a',
    background: '#1f1f1f',
    flexShrink: 0,
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2f6feb',
    display: 'inline-block',
    flexShrink: 0,
  },
  sideTitle: {
    fontSize: '13px',
    color: '#999',
    fontWeight: '500',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iframe: {
    flex: 1,
    border: 'none',
    width: '100%',
    height: '100%',
    background: '#fff',
  },
  divider: {
    width: '1px',
    background: '#2a2a2a',
    flexShrink: 0,
  },
  msgList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  bubble: {
    maxWidth: '78%',
    padding: '11px 15px',
    borderRadius: '14px',
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#ececec',
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    borderTop: '1px solid #2a2a2a',
    background: '#1f1f1f',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: '10px',
    padding: '10px 14px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
  },

  // shared buttons
  plusBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: '#2f6feb',
    border: 'none',
    color: '#fff',
    fontSize: '22px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1,
    fontFamily: 'inherit',
  },
  sendBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: '#2f6feb',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
}