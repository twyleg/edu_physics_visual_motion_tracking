import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const resultsRef = useRef([])
  const detectedPointsRef = useRef([])
  const processingRef = useRef(false)
  const dragTargetRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [videoReady, setVideoReady] = useState(false)
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0, duration: 0 })
  const [selectMode, setSelectMode] = useState('start')
  const [startPoint, setStartPoint] = useState(null)
  const [endPoint, setEndPoint] = useState(null)
  const [realDistance, setRealDistance] = useState('')
  const [unitLabel, setUnitLabel] = useState('m')
  const [targetColor, setTargetColor] = useState({ r: 220, g: 40, b: 40 })
  const [targetHex, setTargetHex] = useState('#dc2828')
  const [status, setStatus] = useState('idle')
  const [statusNote, setStatusNote] = useState('Load a video to begin.')
  const [processedFrames, setProcessedFrames] = useState(0)
  const [results, setResults] = useState([])
  const [logs, setLogs] = useState([])
  const [frameStepSeconds, setFrameStepSeconds] = useState(1 / 30)

  const lineLength = useMemo(() => {
    if (!startPoint || !endPoint) return 0
    return Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
  }, [startPoint, endPoint])

  const scale = useMemo(() => {
    const distance = parseFloat(realDistance)
    if (!distance || !lineLength) return null
    return distance / lineLength
  }, [realDistance, lineLength])

  useEffect(() => {
    if (!videoReady) return
    drawFrame()
  }, [videoReady, startPoint, endPoint])

  const drawFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    drawOverlay(ctx)
  }

  const drawOverlay = (ctx) => {
    if (!ctx) return
    ctx.save()
    if (startPoint) {
      ctx.fillStyle = '#ffe66d'
      ctx.beginPath()
      ctx.arc(startPoint.x, startPoint.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (endPoint) {
      ctx.fillStyle = '#ff7a59'
      ctx.beginPath()
      ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }
    if (startPoint && endPoint) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(startPoint.x, startPoint.y)
      ctx.lineTo(endPoint.x, endPoint.y)
      ctx.stroke()

      const dx = endPoint.x - startPoint.x
      const dy = endPoint.y - startPoint.y
      const length = Math.hypot(dx, dy)
      if (length > 0) {
        const nx = -dy / length
        const ny = dx / length
        const extent = Math.max(ctx.canvas.width, ctx.canvas.height)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 8])
        const drawOrthogonal = (point) => {
          ctx.beginPath()
          ctx.moveTo(point.x - nx * extent, point.y - ny * extent)
          ctx.lineTo(point.x + nx * extent, point.y + ny * extent)
          ctx.stroke()
        }
        drawOrthogonal(startPoint)
        drawOrthogonal(endPoint)
      }
    }
    if (detectedPointsRef.current.length) {
      ctx.fillStyle = 'rgba(245, 245, 245, 0.85)'
      detectedPointsRef.current.forEach((point) => {
        ctx.beginPath()
        ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    ctx.restore()
  }

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev.slice(-199), `${timestamp} · ${message}`])
  }

  const updateCanvasSize = (video) => {
    const canvas = canvasRef.current
    if (!canvas || !video) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    setVideoMeta({
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    })
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const nextUrl = URL.createObjectURL(file)
    setVideoUrl(nextUrl)
    setVideoName(file.name)
    setVideoReady(false)
    setStartPoint(null)
    setEndPoint(null)
    setSelectMode('start')
    setResults([])
    setProcessedFrames(0)
    setStatus('idle')
    setStatusNote('Click the canvas to set the start point.')
    detectedPointsRef.current = []
    setLogs([`Loaded file ${file.name}`])
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    updateCanvasSize(video)
  }

  const drawFirstFrame = () => {
    const video = videoRef.current
    if (!video) return
    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => drawFrame())
    } else {
      requestAnimationFrame(() => drawFrame())
    }
  }

  const handleLoadedData = () => {
    const video = videoRef.current
    if (!video) return
    setVideoReady(true)
    setStatus('ready')
    video.pause()
    video.currentTime = 0
    drawFirstFrame()
    setStatusNote('Click the canvas to set the start point.')
    addLog('Video ready. First frame rendered.')
  }

  const getCanvasCoords = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const handleCanvasClick = (event) => {
    if (!videoReady) return
    if (dragTargetRef.current) return
    const coords = getCanvasCoords(event)
    if (!coords) return
    if (selectMode === 'start') {
      setStartPoint(coords)
      setSelectMode('end')
      setStatusNote('Now click to set the end point.')
      addLog(`Start point set at (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)})`)
    } else if (selectMode === 'end') {
      setEndPoint(coords)
      setSelectMode(null)
      setStatusNote('Enter the real distance and start tracking.')
      addLog(`End point set at (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)})`)
    }
  }

  const hitTestPoint = (coords, point, radius = 12) => {
    if (!coords || !point) return false
    return Math.hypot(coords.x - point.x, coords.y - point.y) <= radius
  }

  const clampToCanvas = (coords) => {
    const canvas = canvasRef.current
    if (!canvas) return coords
    return {
      x: Math.min(canvas.width, Math.max(0, coords.x)),
      y: Math.min(canvas.height, Math.max(0, coords.y)),
    }
  }

  const handlePointerDown = (event) => {
    if (!videoReady || status === 'processing') return
    const coords = getCanvasCoords(event)
    if (!coords) return
    if (hitTestPoint(coords, startPoint)) {
      dragTargetRef.current = 'start'
    } else if (hitTestPoint(coords, endPoint)) {
      dragTargetRef.current = 'end'
    } else {
      dragTargetRef.current = null
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (!dragTargetRef.current) return
    const coords = getCanvasCoords(event)
    if (!coords) return
    const clamped = clampToCanvas(coords)
    if (dragTargetRef.current === 'start') {
      setStartPoint(clamped)
    } else if (dragTargetRef.current === 'end') {
      setEndPoint(clamped)
    }
  }

  const handlePointerUp = (event) => {
    if (!dragTargetRef.current) return
    dragTargetRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePointerLeave = () => {
    dragTargetRef.current = null
  }

  const resetPoints = () => {
    setStartPoint(null)
    setEndPoint(null)
    setSelectMode('start')
    setStatusNote('Click the canvas to set the start point.')
    detectedPointsRef.current = []
  }

  const seekVideo = (video, time) =>
    new Promise((resolve) => {
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked)
        resolve()
      }
      video.addEventListener('seeked', handleSeeked)
      video.currentTime = time
    })

  const hexToRgb = (hex) => {
    const value = hex.replace('#', '').trim()
    if (value.length !== 6) return null
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
    return { r, g, b }
  }

  const handleTargetColorChange = (hex) => {
    setTargetHex(hex)
    const rgb = hexToRgb(hex)
    if (rgb) setTargetColor(rgb)
  }

  const findRedPosition = (imageData, start, end, target) => {
    const { data, width, height } = imageData
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (!length) return null
    const ux = dx / length
    const uy = dy / length
    const nx = -uy
    const ny = ux
    const sampleStep = 2
    const searchRadius = 6
    const intensityThreshold = 120
    const dominance = 45
    const { r: tr, g: tg, b: tb } = target

    for (let s = length; s >= 0; s -= sampleStep) {
      const cx = start.x + ux * s
      const cy = start.y + uy * s
      for (let o = -searchRadius; o <= searchRadius; o += 1) {
        const x = Math.round(cx + nx * o)
        const y = Math.round(cy + ny * o)
        if (x < 0 || x >= width || y < 0 || y >= height) continue
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        const distance = Math.hypot(r - tr, g - tg, b - tb)
        if (distance < intensityThreshold && r >= tr - dominance) {
          return s
        }
      }
    }
    return null
  }

  const processFrame = (mediaTime) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const positionPx = findRedPosition(imageData, startPoint, endPoint, targetColor)
    if (positionPx != null && startPoint && endPoint) {
      const dx = endPoint.x - startPoint.x
      const dy = endPoint.y - startPoint.y
      const length = Math.hypot(dx, dy)
      if (length > 0) {
        detectedPointsRef.current.push({
          x: startPoint.x + (dx / length) * positionPx,
          y: startPoint.y + (dy / length) * positionPx,
        })
      }
    }
    drawOverlay(ctx)
    const entry = {
      time: mediaTime,
      position: positionPx != null && scale ? positionPx * scale : null,
    }
    resultsRef.current.push(entry)
    if (resultsRef.current.length % 10 === 0) {
      setProcessedFrames(resultsRef.current.length)
    }
  }

  const resetProcessingState = () => {
    resultsRef.current = []
    detectedPointsRef.current = []
    setResults([])
    setProcessedFrames(0)
  }

  const handleProcess = async () => {
    const video = videoRef.current
    if (!video || !videoReady || !startPoint || !endPoint) {
      setStatusNote('Load a video and define both points first.')
      return
    }
    if (!scale) {
      setStatusNote('Enter the real distance between points to calibrate.')
      return
    }
    if (processingRef.current) return
    setStatus('processing')
    setStatusNote('Analyzing frames...')
    resetProcessingState()
    processingRef.current = true
    addLog('Tracking started (video playback).')

    await seekVideo(video, 0)
    await video.play()

    const finish = () => {
      processingRef.current = false
      video.pause()
      setStatus('done')
      setStatusNote(`Finished. ${resultsRef.current.length} frames processed.`)
      setResults([...resultsRef.current])
      setProcessedFrames(resultsRef.current.length)
      addLog(`Tracking finished. Frames: ${resultsRef.current.length}.`)
    }

    if ('requestVideoFrameCallback' in video) {
      const handleFrame = (_now, metadata) => {
        if (!processingRef.current) return
        processFrame(metadata?.mediaTime ?? video.currentTime)
        if (video.currentTime >= video.duration - 0.0005) {
          finish()
          return
        }
        video.requestVideoFrameCallback(handleFrame)
      }
      video.requestVideoFrameCallback(handleFrame)
    } else {
      const frameInterval = 1000 / 30
      const timer = setInterval(() => {
        if (!processingRef.current) {
          clearInterval(timer)
          return
        }
        processFrame(video.currentTime)
        if (video.currentTime >= video.duration - 0.0005) {
          clearInterval(timer)
          finish()
        }
      }, frameInterval)
    }
  }

  const handleProcessFrameByFrame = async () => {
    const video = videoRef.current
    if (!video || !videoReady || !startPoint || !endPoint) {
      setStatusNote('Load a video and define both points first.')
      return
    }
    if (!scale) {
      setStatusNote('Enter the real distance between points to calibrate.')
      return
    }
    if (processingRef.current) return
    setStatus('processing')
    setStatusNote('Analyzing frames (step mode)...')
    resetProcessingState()
    processingRef.current = true
    addLog(`Tracking started (frame-by-frame). Step: ${frameStepSeconds.toFixed(4)} s.`)

    await seekVideo(video, 0)
    video.pause()

    const totalSteps = Math.ceil(video.duration / frameStepSeconds)
    for (let i = 0; i <= totalSteps; i += 1) {
      if (!processingRef.current) break
      const t = Math.min(i * frameStepSeconds, video.duration)
      await seekVideo(video, t)
      processFrame(t)
      if (i % 30 === 0) {
        addLog(`Processed frame ${i}/${totalSteps}`)
      }
    }

    processingRef.current = false
    setStatus('done')
    setStatusNote(`Finished. ${resultsRef.current.length} frames processed.`)
    setResults([...resultsRef.current])
    setProcessedFrames(resultsRef.current.length)
    addLog(`Tracking finished. Frames: ${resultsRef.current.length}.`)
  }

  const handleStop = () => {
    if (!processingRef.current) return
    processingRef.current = false
    if (videoRef.current) videoRef.current.pause()
    setStatus('idle')
    setStatusNote('Processing stopped.')
    addLog('Tracking stopped by user.')
  }

  const handleDownload = () => {
    if (!results.length) return
    const header = `time_seconds,position_${unitLabel || 'units'}`
    const lines = results.map((row) => {
      const time = row.time != null ? row.time.toFixed(4) : ''
      const position = row.position != null ? row.position.toFixed(5) : ''
      return `${time},${position}`
    })
    const blob = new Blob([header, '\n', lines.join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${videoName || 'tracking'}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Visual Motion Tracker</p>
          <h1>Track a red object along a straight line.</h1>
          <p className="hero-sub">
            Load a video, click the start and end points, set the real distance, and export time-position data
            as CSV.
          </p>
        </div>
        <div className="hero-badge">
          <div>
            <span>Frames</span>
            <strong>{processedFrames}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{status}</strong>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-block">
            <h2>1. Video</h2>
            <label className="file-input">
              <input type="file" accept="video/*" onChange={handleFileChange} />
              <span>{videoName || 'Choose a video file'}</span>
            </label>
            <p className="panel-note">{statusNote}</p>
          </div>

          <div className="panel-block">
            <h2>2. Line setup</h2>
            <div className="stack">
              <button className="secondary" type="button" onClick={() => setSelectMode('start')}>
                Select start
              </button>
              <button className="secondary" type="button" onClick={() => setSelectMode('end')}>
                Select end
              </button>
              <button className="ghost" type="button" onClick={resetPoints}>
                Reset points
              </button>
            </div>
            <div className="meta-row">
              <span>Line length</span>
              <strong>{lineLength ? `${lineLength.toFixed(1)} px` : '—'}</strong>
            </div>
          </div>

          <div className="panel-block">
            <h2>3. Calibration</h2>
            <div className="input-row">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Real distance"
                value={realDistance}
                onChange={(event) => setRealDistance(event.target.value)}
              />
              <input
                type="text"
                maxLength={6}
                value={unitLabel}
                onChange={(event) => setUnitLabel(event.target.value)}
              />
            </div>
            <div className="meta-row">
              <span>Scale</span>
              <strong>{scale ? `${scale.toFixed(4)} ${unitLabel || 'units'}/px` : '—'}</strong>
            </div>
            <div className="color-row">
              <label htmlFor="target-color">Target color</label>
              <input
                id="target-color"
                type="color"
                value={targetHex}
                onChange={(event) => handleTargetColorChange(event.target.value)}
              />
              <span className="color-value">
                {targetColor.r}, {targetColor.g}, {targetColor.b}
              </span>
            </div>
          </div>

            <div className="panel-block">
              <h2>4. Analyze</h2>
              <div className="stack">
                <button type="button" onClick={handleProcess} disabled={status === 'processing'}>
                  Start tracking
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={handleProcessFrameByFrame}
                  disabled={status === 'processing'}
                >
                  Start tracking (frame-by-frame)
                </button>
                <button className="ghost" type="button" onClick={handleStop} disabled={status !== 'processing'}>
                  Stop
                </button>
                <button className="secondary" type="button" onClick={handleDownload} disabled={!results.length}>
                  Download CSV
                </button>
              </div>
            </div>

          <div className="panel-block">
            <h2>Details</h2>
            <div className="meta-row">
              <span>Resolution</span>
              <strong>
                {videoMeta.width && videoMeta.height ? `${videoMeta.width} × ${videoMeta.height}` : '—'}
              </strong>
            </div>
            <div className="meta-row">
              <span>Duration</span>
              <strong>{videoMeta.duration ? `${videoMeta.duration.toFixed(2)} s` : '—'}</strong>
            </div>
            <div className="meta-row">
              <span>Mode</span>
              <strong>{selectMode || 'locked'}</strong>
            </div>
          </div>
        </section>

        <section className="stage">
          <div className="canvas-shell">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
            {!videoReady && <div className="canvas-overlay">Load a video to preview frames.</div>}
          </div>
          <div className="tips">
            <p>
              <span>Tip:</span> Use a video where the moving object is clearly red and stays near the line between
              the two calibration points.
            </p>
          </div>
          <div className="log-panel">
            <div className="log-header">
              <span>Tracking log</span>
              <div className="log-controls">
                <label htmlFor="frame-step">Step (s)</label>
                <input
                  id="frame-step"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={frameStepSeconds}
                  onChange={(event) => setFrameStepSeconds(Number(event.target.value) || 1 / 30)}
                />
                <button type="button" className="ghost" onClick={() => setLogs([])}>
                  Clear
                </button>
              </div>
            </div>
            <div className="log-body">
              {logs.length ? (
                logs.map((entry, index) => <div key={`${entry}-${index}`}>{entry}</div>)
              ) : (
                <div className="log-empty">No log entries yet.</div>
              )}
            </div>
          </div>
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            className="hidden-video"
          />
        </section>
      </main>
    </div>
  )
}

export default App
