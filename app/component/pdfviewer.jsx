'use client'
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
const styles = {
  wrapper: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a1a',
    overflow: 'hidden',
  },
  canvasWrap: {
    flex: 1,
    minHeight: 0,          // ← fix: prevents flex item from growing beyond parent
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '20px',
    background: '#2a2a2a',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px',
    background: '#1f1f1f',
    borderTop: '1px solid #333',
    color: '#fff',
    fontSize: '14px',
    flexShrink: 0,         // ← fix: controls bar never squishes
  },
}

const PdfViewer = forwardRef(function PdfViewer({ pdfUrl }, ref) {
  const canvasRef   = useRef(null)
  const pdfRef      = useRef(null)
  const renderTaskRef = useRef(null)   // ← ref so cleanup always sees latest task
  const [pageNum, setPageNum]     = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale]         = useState(1.5)

  useImperativeHandle(ref, () => ({
    zoomIn: () => setScale(s => s + 0.2),
    zoomOut: () => setScale(s => Math.max(0.5, s - 0.2)),
    nextPage: () => setPageNum(p => Math.min(totalPages, p + 1)),
    prevPage: () => setPageNum(p => Math.max(1, p - 1)),
    getTextInRect: async (rect) => {
      if (!pdfRef.current) return '';
      try {
        const page = await pdfRef.current.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        // rect contains normalized coordinates (0 to 1) relative to canvas size
        const canvasX1 = rect.x1 * viewport.width;
        const canvasY1 = rect.y1 * viewport.height;
        const canvasX2 = rect.x2 * viewport.width;
        const canvasY2 = rect.y2 * viewport.height;
        
        const [pdfX1, pdfY1] = viewport.convertToPdfPoint(canvasX1, canvasY1);
        const [pdfX2, pdfY2] = viewport.convertToPdfPoint(canvasX2, canvasY2);
        
        const minX = Math.min(pdfX1, pdfX2);
        const maxX = Math.max(pdfX1, pdfX2);
        const minY = Math.min(pdfY1, pdfY2);
        const maxY = Math.max(pdfY1, pdfY2);
        
        const textContent = await page.getTextContent();
        const items = textContent.items;
        
        const selectedItems = items.filter(item => {
          const tx = item.transform[4];
          const ty = item.transform[5];
          const itemWidth = item.width || 0;
          const itemHeight = item.height || 0;
          
          return (
            tx + itemWidth >= minX &&
            tx <= maxX &&
            ty + itemHeight >= minY &&
            ty <= maxY
          );
        });
        
        return selectedItems.map(item => item.str).join(' ');
      } catch (err) {
        console.error("Error extracting text in rect:", err);
        return '';
      }
    },
    getCanvasElement: () => canvasRef.current,
  }));

//   useEffect(() => {
//     if (!pdfUrl) return
//   let cancelled = false 
// //   ek saath do baar render ho raha hai — React useEffect double fire kar raha hai!
//     const loadPdf = async () => {

//         //niche waliline, pdfjs se conn krne lkiye syd se
//       const pdfjsLib = await import('pdfjs-dist')
// //pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.7.284/pdf.worker.min.js`
// pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
//   'pdfjs-dist/build/pdf.worker.min.mjs',
//   import.meta.url
// ).toString()  
// /*
// pdf.js library load karo, aur uska worker file 
// CDN se lo — worker alag
//  thread mein PDF process karta hai taaki page freeze na ho!

//          */

//       const pdf = await pdfjsLib.getDocument(pdfUrl).promise
//       setTotalPages(pdf.numPages)

//       const page = await pdf.getPage(pageNum)
//       const viewport = page.getViewport({ scale })

//       const canvas = canvasRef.current
//       if (!canvas) return

// // ← ye add karo — purana render clear karo
// const ctx = canvas.getContext('2d')
// ctx.clearRect(0, 0, canvas.width, canvas.height)

// canvas.height = viewport.height
// canvas.width = viewport.width

// await page.render({
//   canvasContext: ctx,
//   viewport
// }).promise
//     }

//     loadPdf()
//   }, [pdfUrl, pageNum, scale])
// 1. PDF sirf ek baar load karo
useEffect(() => {
  if (!pdfUrl) return

  const loadPdf = async () => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()

    const pdf = await pdfjsLib.getDocument(pdfUrl).promise
    pdfRef.current = pdf        // ← ref mein save karo
    setTotalPages(pdf.numPages)
  }

  loadPdf()
}, [pdfUrl])   // ← sirf pdfUrl pe


// 2. Page render karo jab bhi page ya scale change ho
useEffect(() => {
  if (!pdfRef.current) return

  let cancelled = false

  const renderPage = async () => {
    // cancel any ongoing render first
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }

    const page = await pdfRef.current.getPage(pageNum)
    if (cancelled) return

    const viewport = page.getViewport({ scale })
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.height = viewport.height
    canvas.width  = viewport.width

    renderTaskRef.current = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport
    })

    try {
      await renderTaskRef.current.promise
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return
    } finally {
      renderTaskRef.current = null
    }
  }

  renderPage()

  return () => {
    cancelled = true
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }
  }
}, [pageNum, scale, totalPages])  // ← totalPages bhi rakho taaki pdfRef ready ho

  return (
    <div style={styles.wrapper}>

      {/* PDF canvas — yahan pdf.js draw karega */}
      <div style={styles.canvasWrap}>
        <canvas ref={canvasRef} />
      </div>

      {/* Controls — page aur zoom */}
      <div style={styles.controls}>
        <button onClick={() => setPageNum(p => Math.max(1, p - 1))}>◀ Prev</button>
        <span>{pageNum} / {totalPages}</span>
        <button onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}>Next ▶</button>
        <button onClick={() => setScale(s => s + 0.2)}>🔍+</button>
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>🔍-</button>
      </div>

    </div>
  )
})

export default PdfViewer