'use client'
import React, { useEffect, useRef, useState } from 'react'
import { isFist, isPinching, isThreeFingerHold, getHandScale, dist, getThumbSwipeDirection } from '../utils/gestureUtils'

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
  [0, 5], [5, 9], [9, 13], [13, 17], [0, 17]
]

export default function GestureLayer({ pdfViewerRef, setInput }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  const [statusMessage, setStatusMessage]         = useState('Camera & model loading...')
  const [gestureMode, setGestureMode]             = useState(false)
  const [currentGesture, setCurrentGesture]       = useState('None')
  const [showPreview, setShowPreview]             = useState(true)
  const [cursorPos, setCursorPos]                 = useState(null)
  const [hoverProgress, setHoverProgress]         = useState(0)
  const [selectionRect, setSelectionRect]         = useState(null)
  const [showSelectionMenu, setShowSelectionMenu] = useState(false)
  const [menuPosition, setMenuPosition]           = useState({ x: 0, y: 0 })
  const [highlights, setHighlights]               = useState([])

  // REFS — single source of truth for the rAF loop (synchronous)
  const gestureModeRef       = useRef(false)
  const isSelectingRef       = useRef(false)
  const showSelectionMenuRef = useRef(false)
  const selectionRectRef     = useRef(null)
  const pdfCanvasRectRef     = useRef(null)

  const fistStartTimeRef     = useRef(null)
  const fistStartPosRef      = useRef(null)
  const cooldownRef          = useRef(0)
  const fistActiveFramesRef  = useRef(0)

  const prevPinchDistRef     = useRef(null)
  const zoomCooldownRef      = useRef(0)

  const thumbSwipeStartTimeRef  = useRef(null)
  const thumbSwipeDirectionRef  = useRef(null)
  const swipeCooldownRef        = useRef(0)

  const threeFingerStartTimeRef = useRef(null)

  const hoverStartTimeRef    = useRef(null)
  const hoverStartPosRef     = useRef(null)
  const hoverCooldownRef     = useRef(0)

  const selectionStillStartTimeRef = useRef(null)
  const selectionStillStartPosRef  = useRef(null)

  // Keep gestureModeRef in sync with state
  useEffect(() => { gestureModeRef.current = gestureMode }, [gestureMode])

  // Sync helpers — update BOTH the ref and React state atomically
  const setSelectingSync = (val) => { isSelectingRef.current = val }
  const setSelectionMenuSync = (val) => { showSelectionMenuRef.current = val; setShowSelectionMenu(val) }
  const updateSelectionRect = (rect) => { selectionRectRef.current = rect; setSelectionRect(rect) }

  // MediaPipe init + rAF loop
  useEffect(() => {
    let active = true
    let stream = null
    let landmarker = null
    let animationId = null

    const initLandmarker = async () => {
      try {
        setStatusMessage('Loading MediaPipe models...')
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        )
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1
        })
        if (!active) return

        setStatusMessage('Starting webcam...')
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
        if (!active) return

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play()
              setStatusMessage('Gesture detection ready')
              animationId = requestAnimationFrame(predictLoop)
            }
          }
        }
      } catch (err) {
        console.error('GestureLayer init error:', err)
        setStatusMessage('Error: ' + err.message)
      }
    }

    const predictLoop = () => {
      if (!active) return
      const video  = videoRef.current
      const canvas = canvasRef.current

      // Always refresh PDF canvas rect each frame (synchronous, cheap)
      const canvasEl = pdfViewerRef.current?.getCanvasElement?.()
      if (canvasEl) {
        const r = canvasEl.getBoundingClientRect()
        pdfCanvasRectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
      }

      if (video && video.readyState >= 2 && landmarker) {
        const results = landmarker.detectForVideo(video, performance.now())
        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (results.landmarks && results.landmarks.length > 0) {
            const lm = results.landmarks[0]
            ctx.strokeStyle = '#00ffd0'; ctx.lineWidth = 3
            HAND_CONNECTIONS.forEach(([i, j]) => {
              if (lm[i] && lm[j]) {
                ctx.beginPath()
                ctx.moveTo(lm[i].x * canvas.width, lm[i].y * canvas.height)
                ctx.lineTo(lm[j].x * canvas.width, lm[j].y * canvas.height)
                ctx.stroke()
              }
            })
            ctx.fillStyle = '#ff0055'
            lm.forEach(p => { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 2 * Math.PI); ctx.fill() })
            processGestures(lm)
          } else {
            handleHandLost()
          }
        }
      }
      animationId = requestAnimationFrame(predictLoop)
    }

    initLandmarker()
    return () => {
      active = false
      if (stream) stream.getTracks().forEach(t => t.stop())
      if (animationId) cancelAnimationFrame(animationId)
    }
  }, [])

  const handleHandLost = () => {
    fistStartTimeRef.current = null; fistStartPosRef.current = null
    prevPinchDistRef.current = null; threeFingerStartTimeRef.current = null
    hoverStartTimeRef.current = null; thumbSwipeStartTimeRef.current = null
    thumbSwipeDirectionRef.current = null
    selectionStillStartTimeRef.current = null; selectionStillStartPosRef.current = null
    setHoverProgress(0); setCursorPos(null)
  }

  const processHoverClick = (screenX, screenY) => {
    const now = Date.now()
    if (now < hoverCooldownRef.current) return
    if (hoverStartTimeRef.current === null) {
      hoverStartTimeRef.current = now; hoverStartPosRef.current = { x: screenX, y: screenY }; setHoverProgress(0)
    } else {
      const dx = screenX - hoverStartPosRef.current.x, dy = screenY - hoverStartPosRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 22) {
        hoverStartTimeRef.current = now; hoverStartPosRef.current = { x: screenX, y: screenY }; setHoverProgress(0)
      } else {
        const elapsed = now - hoverStartTimeRef.current
        setHoverProgress(Math.min(100, (elapsed / 2500) * 100))
        if (elapsed >= 2500) {
          const el = document.elementFromPoint(screenX, screenY)
          if (el) {
            let t = el
            while (t && t !== document.body) {
              if (['BUTTON','INPUT','A'].includes(t.tagName) || t.onclick || t.style.cursor === 'pointer') break
              t = t.parentElement
            }
            const tgt = (t && t !== document.body) ? t : el
            try { const ac = new AudioContext(); const o = ac.createOscillator(); const g = ac.createGain(); o.frequency.value=1000; g.gain.value=0.3; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+0.1) } catch {}
            tgt.click(); setStatusMessage(`Clicked: ${tgt.tagName}`)
          }
          hoverCooldownRef.current = now + 1500; hoverStartTimeRef.current = null; setHoverProgress(0)
        }
      }
    }
  }

  const handleAskAI = async () => {
    const rect = selectionRectRef.current
    if (pdfViewerRef.current && rect) {
      const mapped = { x1: Math.min(rect.x1,rect.x2), y1: Math.min(rect.y1,rect.y2), x2: Math.max(rect.x1,rect.x2), y2: Math.max(rect.y1,rect.y2) }
      setStatusMessage('Extracting selected text...')
      const text = await pdfViewerRef.current.getTextInRect(mapped)
      if (text?.trim()) { setInput(text); setStatusMessage('Text populated into chatbot') }
      else setStatusMessage('No text found in region')
    }
    setSelectionMenuSync(false); updateSelectionRect(null); setSelectingSync(false)
  }

  const handleHighlight = () => {
    const rect = selectionRectRef.current
    if (rect) { setHighlights(prev => [...prev, rect]); setStatusMessage('Region highlighted') }
    setSelectionMenuSync(false); updateSelectionRect(null); setSelectingSync(false)
  }

  const processGestures = (lm) => {
    const now     = Date.now()
    const indexTip = lm[8]
    const screenX  = (1 - indexTip.x) * window.innerWidth
    const screenY  = indexTip.y * window.innerHeight
    setCursorPos({ x: screenX, y: screenY })

    // 1. FIST HOLD — toggle gesture mode (always active)
    const fistActive = isFist(lm)
    fistActiveFramesRef.current = fistActive ? Math.min(10, fistActiveFramesRef.current + 1) : Math.max(0, fistActiveFramesRef.current - 1)
    const fistDebounced = fistActiveFramesRef.current >= 4

    if (fistDebounced && now > cooldownRef.current) {
      const wrist = lm[0]
      if (fistStartTimeRef.current === null) {
        fistStartTimeRef.current = now; fistStartPosRef.current = { x: wrist.x, y: wrist.y }
        setCurrentGesture('Fist (starting...)')
      } else {
        if (dist(wrist, fistStartPosRef.current) > 0.12) {
          fistStartTimeRef.current = now; fistStartPosRef.current = { x: wrist.x, y: wrist.y }
        } else {
          const held = now - fistStartTimeRef.current
          setCurrentGesture(`Fist held: ${(held / 1000).toFixed(1)}s`)
          if (held >= 2000) {
            if (isSelectingRef.current) {
              setSelectingSync(false); updateSelectionRect(null); setSelectionMenuSync(false)
              selectionStillStartTimeRef.current = null; threeFingerStartTimeRef.current = null
              setStatusMessage('Selection cancelled')
            } else {
              const newMode = !gestureModeRef.current
              gestureModeRef.current = newMode      // sync immediately!
              setGestureMode(newMode)
              setStatusMessage(`Gesture Mode: ${newMode ? 'ON' : 'OFF'}`)
              try { const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = newMode ? 880 : 440; o.connect(ac.destination); o.start(); o.stop(ac.currentTime+0.15) } catch {}
            }
            cooldownRef.current = now + 3000; fistStartTimeRef.current = null; fistStartPosRef.current = null; fistActiveFramesRef.current = 0
            setCurrentGesture('None')
          }
        }
      }
    } else if (fistActiveFramesRef.current === 0) {
      fistStartTimeRef.current = null; fistStartPosRef.current = null
    }

    if (!gestureModeRef.current) return

    // GATE: selection menu open
    if (showSelectionMenuRef.current) { processHoverClick(screenX, screenY); return }

    // GATE: drag selection active — index finger controls endpoint
    if (isSelectingRef.current) {
      const pcr = pdfCanvasRectRef.current
      if (pcr) {
        const cx = Math.max(0, Math.min(1, (screenX - pcr.left) / pcr.width))
        const cy = Math.max(0, Math.min(1, (screenY - pcr.top)  / pcr.height))
        const prev = selectionRectRef.current
        updateSelectionRect(prev ? { ...prev, x2: cx, y2: cy } : { x1: cx, y1: cy, x2: cx, y2: cy })

        if (selectionStillStartTimeRef.current === null) {
          selectionStillStartTimeRef.current = now
          selectionStillStartPosRef.current  = { x: screenX, y: screenY }
          setCurrentGesture('Move index finger to select')
        } else {
          const dx = screenX - selectionStillStartPosRef.current.x
          const dy = screenY - selectionStillStartPosRef.current.y
          if (Math.sqrt(dx * dx + dy * dy) > 18) {
            selectionStillStartTimeRef.current = now
            selectionStillStartPosRef.current  = { x: screenX, y: screenY }
            setCurrentGesture('Selecting (dragging...)')
          } else {
            const still = now - selectionStillStartTimeRef.current
            setCurrentGesture(`Hold still to confirm: ${(still / 1000).toFixed(1)}s / 2.0s`)
            if (still >= 2000) {
              setSelectingSync(false); setSelectionMenuSync(true)
              setMenuPosition({ x: screenX, y: screenY })
              selectionStillStartTimeRef.current = null; selectionStillStartPosRef.current = null
              setStatusMessage('Selection done — hover-click an option'); setCurrentGesture('Selection complete!')
              try { const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value=650; o.connect(ac.destination); o.start(); o.stop(ac.currentTime+0.15) } catch {}
            }
          }
        }
      }
      return
    }

    // Normal mode
    processHoverClick(screenX, screenY)

    // 2. THREE-FINGER HOLD → start selection
    const threeFingerActive = isThreeFingerHold(lm)
    if (threeFingerActive) {
      if (threeFingerStartTimeRef.current === null) {
        threeFingerStartTimeRef.current = now
        setCurrentGesture('Three-Finger Hold — keep holding...')
      } else {
        const held = now - threeFingerStartTimeRef.current
        setCurrentGesture(`Selection start: ${(held / 1000).toFixed(1)}s / 2.0s`)
        if (held >= 2000) {
          const pcr = pdfCanvasRectRef.current
          const sx = pcr ? Math.max(0, Math.min(1, (screenX - pcr.left) / pcr.width)) : 0.1
          const sy = pcr ? Math.max(0, Math.min(1, (screenY - pcr.top)  / pcr.height)) : 0.1
          updateSelectionRect({ x1: sx, y1: sy, x2: sx, y2: sy })
          setSelectingSync(true)                  // ← synchronous, takes effect next frame
          selectionStillStartTimeRef.current = null
          threeFingerStartTimeRef.current    = null
          prevPinchDistRef.current           = null
          setStatusMessage('Selection started! Move index finger to draw box, hold still 2s to confirm')
          setCurrentGesture('Selecting...')
          try { const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value=600; o.connect(ac.destination); o.start(); o.stop(ac.currentTime+0.1) } catch {}
        }
      }
      prevPinchDistRef.current = null
      return
    } else {
      threeFingerStartTimeRef.current = null
    }

    // 3. THUMB SWIPE — page navigation
    const thumbDir = getThumbSwipeDirection(lm)
    if (thumbDir) {
      // Reset fist counter while thumb swipe pose is held — prevents accidental gesture mode toggle
      fistActiveFramesRef.current = 0
      fistStartTimeRef.current = null

      if (thumbSwipeDirectionRef.current !== thumbDir) { thumbSwipeDirectionRef.current = thumbDir; thumbSwipeStartTimeRef.current = now }
      else {
        const elapsed = now - thumbSwipeStartTimeRef.current
        // left thumb = Previous page, right thumb = Next page (intuitive direction)
        setCurrentGesture(`Swipe ${thumbDir === 'left' ? '← Prev' : 'Next →'}: ${(elapsed/1000).toFixed(1)}s / 0.5s`)
        if (elapsed >= 500 && now > swipeCooldownRef.current) {
          if (thumbDir === 'left') { pdfViewerRef.current?.prevPage(); setStatusMessage('← Previous Page') }
          else { pdfViewerRef.current?.nextPage(); setStatusMessage('Next Page →') }
          swipeCooldownRef.current = now + 1500; thumbSwipeStartTimeRef.current = null; thumbSwipeDirectionRef.current = null
        }
      }
      prevPinchDistRef.current = null; return
    } else {
      thumbSwipeStartTimeRef.current = null; thumbSwipeDirectionRef.current = null
    }

    // 4. PINCH ZOOM
    const pinchActive = isPinching(lm)
    if (pinchActive) {
      const hs = getHandScale(lm), cpd = dist(lm[4], lm[8]) / hs
      setCurrentGesture('Pinching')
      if (now > zoomCooldownRef.current) {
        if (prevPinchDistRef.current !== null) {
          const diff = cpd - prevPinchDistRef.current
          if (diff > 0.04)       { pdfViewerRef.current?.zoomIn();  setCurrentGesture('Zooming In');  prevPinchDistRef.current = cpd; zoomCooldownRef.current = now + 500 }
          else if (diff < -0.04) { pdfViewerRef.current?.zoomOut(); setCurrentGesture('Zooming Out'); prevPinchDistRef.current = cpd; zoomCooldownRef.current = now + 500 }
        } else { prevPinchDistRef.current = cpd }
      }
    } else { prevPinchDistRef.current = null }
  }

  const renderSelectionHighlight = () => {
    const rect = selectionRect, pcr = pdfCanvasRectRef.current
    if (!rect || !pcr) return null
    return (
      <div style={{
        position:'fixed',
        left:  `${pcr.left + Math.min(rect.x1,rect.x2) * pcr.width}px`,
        top:   `${pcr.top  + Math.min(rect.y1,rect.y2) * pcr.height}px`,
        width: `${Math.abs(rect.x1-rect.x2) * pcr.width}px`,
        height:`${Math.abs(rect.y1-rect.y2) * pcr.height}px`,
        border:'2px dashed #00ffd0', borderRadius:'4px',
        background:'rgba(0,255,208,0.18)', boxShadow:'0 0 10px rgba(0,255,208,0.5)',
        pointerEvents:'none', zIndex:99999,
      }} />
    )
  }

  return (
    <>
      {renderSelectionHighlight()}

      {highlights.map((rect, idx) => {
        const pcr = pdfCanvasRectRef.current
        if (!pcr) return null
        return (
          <div key={idx} style={{
            position:'fixed',
            left:  `${pcr.left + Math.min(rect.x1,rect.x2) * pcr.width}px`,
            top:   `${pcr.top  + Math.min(rect.y1,rect.y2) * pcr.height}px`,
            width: `${Math.abs(rect.x1-rect.x2) * pcr.width}px`,
            height:`${Math.abs(rect.y1-rect.y2) * pcr.height}px`,
            background:'rgba(255,230,0,0.35)', borderRadius:'2px',
            pointerEvents:'none', zIndex:99998,
          }} />
        )
      })}

      {showSelectionMenu && menuPosition && (
        <div style={{
          position:'fixed', left:`${menuPosition.x}px`, top:`${menuPosition.y-60}px`,
          display:'flex', gap:'8px',
          background:'rgba(20,20,20,0.95)', backdropFilter:'blur(10px)',
          border:'1px solid #00ffd0', boxShadow:'0 0 15px rgba(0,255,208,0.4)',
          borderRadius:'10px', padding:'8px', zIndex:100000, pointerEvents:'auto',
        }}>
          <button id="btn-selection-ask-ai"    onClick={handleAskAI}    style={s.menuBtn}>🤖 Ask AI</button>
          <button id="btn-selection-highlight" onClick={handleHighlight} style={{ ...s.menuBtn, borderColor:'#ffcc00', color:'#ffcc00' }}>🖍️ Highlight</button>
          <button id="btn-selection-cancel"    onClick={() => { setSelectionMenuSync(false); updateSelectionRect(null); setSelectingSync(false) }} style={{ ...s.menuBtn, borderColor:'#ff3b30', color:'#ff3b30' }}>✕</button>
        </div>
      )}

      {gestureMode && cursorPos && (
        <div style={{
          position:'fixed', left:`${cursorPos.x-10}px`, top:`${cursorPos.y-10}px`,
          width:'20px', height:'20px', borderRadius:'50%', backgroundColor:'#00ffd0',
          boxShadow: isSelectingRef.current
            ? '0 0 0 3px #ff0055, 0 0 15px #00ffd0, 0 0 30px #00ffd0'
            : '0 0 15px #00ffd0, 0 0 30px #00ffd0',
          pointerEvents:'none', zIndex:999999, transform:'translate3d(0,0,0)',
        }}>
          {hoverProgress > 0 && (
            <svg style={{ position:'absolute', top:'-6px', left:'-6px', width:'32px', height:'32px', transform:'rotate(-90deg)' }}>
              <circle cx="16" cy="16" r="13" stroke="#ff0055" strokeWidth="3" fill="transparent"
                strokeDasharray={2 * Math.PI * 13}
                strokeDashoffset={2 * Math.PI * 13 * (1 - hoverProgress / 100)}
                style={{ transition:'stroke-dashoffset 0.1s ease' }}
              />
            </svg>
          )}
        </div>
      )}

      <div style={s.floatingPanel}>
        <div style={s.header}>
          <div style={s.statusBadge}>
            <span style={{ ...s.statusDot, background: gestureMode ? '#00ffd0':'#ff3b30', boxShadow: gestureMode ? '0 0 10px #00ffd0':'0 0 10px #ff3b30' }} />
            <span style={s.statusTitle}>Gesture Mode: <strong>{gestureMode ? 'ON' : 'OFF'}</strong></span>
          </div>
          <button style={s.toggleBtn} onClick={() => setShowPreview(!showPreview)}>{showPreview ? '👁️' : '👁️‍🗨️'}</button>
        </div>
        {showPreview && (
          <div style={s.videoWrapper}>
            <video ref={videoRef} style={s.video} width="240" height="180" muted playsInline />
            <canvas ref={canvasRef} style={s.canvas} width="240" height="180" />
          </div>
        )}
        <div style={s.console}>
          <div style={s.consoleLine}>
            <span style={s.label}>Active Gesture:</span>
            <span style={{ ...s.value, color: currentGesture !== 'None' ? '#00ffd0':'#888' }}>{currentGesture}</span>
          </div>
          <div style={s.consoleLine}>
            <span style={s.label}>Status:</span>
            <span style={s.statusText}>{statusMessage}</span>
          </div>
        </div>
      </div>
    </>
  )
}

const s = {
  menuBtn:      { background:'rgba(30,30,30,0.95)', border:'1px solid #00ffd0', color:'#00ffd0', borderRadius:'8px', padding:'6px 12px', fontSize:'12px', fontWeight:'bold', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s ease' },
  floatingPanel:{ position:'fixed', bottom:'24px', left:'24px', width:'260px', background:'rgba(30,30,30,0.75)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'16px', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', overflow:'hidden', zIndex:9999, fontFamily:'system-ui,-apple-system,sans-serif', color:'#ececec' },
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'rgba(0,0,0,0.2)', borderBottom:'1px solid rgba(255,255,255,0.05)' },
  statusBadge:  { display:'flex', alignItems:'center', gap:'8px' },
  statusDot:    { width:'8px', height:'8px', borderRadius:'50%', display:'inline-block' },
  statusTitle:  { fontSize:'12px', letterSpacing:'0.3px' },
  toggleBtn:    { background:'none', border:'none', color:'#aaa', fontSize:'13px', cursor:'pointer', padding:'2px', borderRadius:'4px' },
  videoWrapper: { position:'relative', width:'260px', height:'195px', background:'#000', overflow:'hidden' },
  video:        { position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)' },
  canvas:       { position:'absolute', top:0, left:0, width:'100%', height:'100%', transform:'scaleX(-1)', pointerEvents:'none' },
  console:      { padding:'12px 14px', background:'rgba(0,0,0,0.1)', fontSize:'11px', display:'flex', flexDirection:'column', gap:'6px' },
  consoleLine:  { display:'flex', justifyContent:'space-between', alignItems:'center' },
  label:        { color:'#888' },
  value:        { fontWeight:'bold' },
  statusText:   { color:'#aaa', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' },
}
