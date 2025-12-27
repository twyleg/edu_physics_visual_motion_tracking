import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const resultsRef = useRef([])
  const detectedPointsRef = useRef([])
  const manualMarkersRef = useRef([])
  const processingRef = useRef(false)
  const dragTargetRef = useRef(null)
  const savedLineAppliedRef = useRef(false)
  const magnifierRef = useRef(null)
  const savedScaleAppliedRef = useRef(false)
  const opencvErrorRef = useRef(false)
  const savedColorAppliedRef = useRef(false)
  const lastFrameTimeRef = useRef(null)
  const fallbackTimerRef = useRef(null)
  const prevFrameRef = useRef(null)
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
  const [currentTime, setCurrentTime] = useState(0)
  const [hoverPoint, setHoverPoint] = useState(null)
  const [opencvReady, setOpenCvReady] = useState(false)
  const [detectionTolerance, setDetectionTolerance] = useState(50)
  const [showMaskPreview, setShowMaskPreview] = useState(false)
  const [motionMode, setMotionMode] = useState(false)

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev.slice(-199), `${timestamp} · ${message}`])
  }, [])

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
    const handle = requestAnimationFrame(() => drawFrame())
    return () => cancelAnimationFrame(handle)
  }, [videoReady, startPoint, endPoint])

  useEffect(() => {
    let attempts = 0
    const timer = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setOpenCvReady(true)
        clearInterval(timer)
      } else if (attempts > 200) {
        clearInterval(timer)
      }
      attempts += 1
    }, 100)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (opencvReady) addLog('OpenCV.js ready: using HSV color tracking.')
  }, [addLog, opencvReady])

  useEffect(() => {
    if (status !== 'manual') return
    const handleKey = (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stepFrame(1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        stepFrame(-1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [status, frameStepSeconds])

  const drawFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (video.readyState < 2) {
      requestAnimationFrame(() => drawFrame())
      return
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    drawOverlay(ctx)
  }

  const getFrameKey = (time) => {
    const step = frameStepSeconds || 1 / 30
    return Number((Math.round(time / step) * step).toFixed(4))
  }

  const rgbToHsv = (r, g, b) => {
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const d = max - min
    let h = 0
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6
      else if (max === gn) h = (bn - rn) / d + 2
      else h = (rn - gn) / d + 4
    }
    let hue = Math.round(h * 30)
    if (hue < 0) hue += 180
    const s = max === 0 ? 0 : Math.round((d / max) * 255)
    const v = Math.round(max * 255)
    return { h: hue, s, v }
  }

  const findColorPositionOpenCv = (canvas, start, end, target, tolerance, returnMask = false) => {
    if (!window.cv || !window.cv.Mat) return null
    const cv = window.cv
    const src = cv.imread(canvas)
    const rgb = new cv.Mat()
    const hsv = new cv.Mat()
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)

    const targetHsv = rgbToHsv(target.r, target.g, target.b)
    const hTol = Math.round(4 + tolerance * 0.2)
    const sTol = Math.round(30 + tolerance * 1.4)
    const vTol = Math.round(30 + tolerance * 1.4)
    const lowerS = Math.max(0, targetHsv.s - sTol)
    const upperS = Math.min(255, targetHsv.s + sTol)
    const lowerV = Math.max(0, targetHsv.v - vTol)
    const upperV = Math.min(255, targetHsv.v + vTol)

    let mask = new cv.Mat()
    if (targetHsv.h - hTol < 0 || targetHsv.h + hTol > 179) {
      const low1 = new cv.Scalar((targetHsv.h - hTol + 180) % 180, lowerS, lowerV)
      const high1 = new cv.Scalar(179, upperS, upperV)
      const low2 = new cv.Scalar(0, lowerS, lowerV)
      const high2 = new cv.Scalar((targetHsv.h + hTol) % 180, upperS, upperV)
      const mask1 = new cv.Mat()
      const mask2 = new cv.Mat()
      cv.inRange(hsv, low1, high1, mask1)
      cv.inRange(hsv, low2, high2, mask2)
      cv.bitwise_or(mask1, mask2, mask)
      mask1.delete()
      mask2.delete()
    } else {
      const low = new cv.Scalar(targetHsv.h - hTol, lowerS, lowerV)
      const high = new cv.Scalar(targetHsv.h + hTol, upperS, upperV)
      cv.inRange(hsv, low, high, mask)
    }

    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel)
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)

    const lineMask = new cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1)
    const thickness = Math.max(6, Math.round(6 + tolerance * 0.2))
    const p1 = new cv.Point(Math.round(start.x), Math.round(start.y))
    const p2 = new cv.Point(Math.round(end.x), Math.round(end.y))
    cv.line(lineMask, p1, p2, new cv.Scalar(255, 255, 255, 255), thickness)
    const constrained = new cv.Mat()
    cv.bitwise_and(mask, lineMask, constrained)

    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(constrained, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let best = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area > bestArea) {
        if (best) best.delete()
        bestArea = area
        best = contour
      } else {
        contour.delete()
      }
    }

    let result = null
    let maskOut = null
    if (best && bestArea > 4) {
      const moments = cv.moments(best)
      if (moments.m00 !== 0) {
        const cx = moments.m10 / moments.m00
        const cy = moments.m01 / moments.m00
        const projection = projectToLine({ x: cx, y: cy }, start, end)
        if (projection) {
          result = { s: projection.s, x: projection.x, y: projection.y }
        }
      }
      best.delete()
    }
    if (returnMask) {
      maskOut = constrained.clone()
    }

    src.delete()
    rgb.delete()
    hsv.delete()
    mask.delete()
    lineMask.delete()
    constrained.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()

    return { detection: result, mask: maskOut }
  }

  const findMotionPositionOpenCv = (canvas, start, end, tolerance, returnMask = false) => {
    if (!window.cv || !window.cv.Mat) return null
    const cv = window.cv
    const src = cv.imread(canvas)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    if (!prevFrameRef.current) {
      prevFrameRef.current = gray.clone()
      src.delete()
      gray.delete()
      return { detection: null, mask: null }
    }

    const diff = new cv.Mat()
    cv.absdiff(prevFrameRef.current, gray, diff)
    prevFrameRef.current.delete()
    prevFrameRef.current = gray.clone()

    const blur = new cv.Mat()
    cv.GaussianBlur(diff, blur, new cv.Size(3, 3), 0)
    const motionMask = new cv.Mat()
    const thresholdValue = Math.max(8, Math.round(8 + tolerance * 0.5))
    cv.threshold(blur, motionMask, thresholdValue, 255, cv.THRESH_BINARY)

    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
    cv.morphologyEx(motionMask, motionMask, cv.MORPH_OPEN, kernel)
    cv.morphologyEx(motionMask, motionMask, cv.MORPH_CLOSE, kernel)

    const lineMask = new cv.Mat.zeros(motionMask.rows, motionMask.cols, cv.CV_8UC1)
    const thickness = Math.max(6, Math.round(6 + tolerance * 0.2))
    const p1 = new cv.Point(Math.round(start.x), Math.round(start.y))
    const p2 = new cv.Point(Math.round(end.x), Math.round(end.y))
    cv.line(lineMask, p1, p2, new cv.Scalar(255, 255, 255, 255), thickness)
    const constrained = new cv.Mat()
    cv.bitwise_and(motionMask, lineMask, constrained)

    const contours = new cv.MatVector()
    const hierarchy = new cv.Mat()
    cv.findContours(constrained, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let best = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area > bestArea) {
        if (best) best.delete()
        bestArea = area
        best = contour
      } else {
        contour.delete()
      }
    }

    let result = null
    let maskOut = null
    if (best && bestArea > 4) {
      const moments = cv.moments(best)
      if (moments.m00 !== 0) {
        const cx = moments.m10 / moments.m00
        const cy = moments.m01 / moments.m00
        const projection = projectToLine({ x: cx, y: cy }, start, end)
        if (projection) {
          result = { s: projection.s, x: projection.x, y: projection.y }
        }
      }
      best.delete()
    }
    if (returnMask) {
      maskOut = constrained.clone()
    }

    src.delete()
    gray.delete()
    diff.delete()
    blur.delete()
    motionMask.delete()
    lineMask.delete()
    constrained.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()

    return { detection: result, mask: maskOut }
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
    if (status === 'manual' && hoverPoint && startPoint && endPoint) {
      const dx = endPoint.x - startPoint.x
      const dy = endPoint.y - startPoint.y
      const length = Math.hypot(dx, dy)
      if (length > 0) {
        const nx = -dy / length
        const ny = dx / length
        const extent = Math.max(ctx.canvas.width, ctx.canvas.height)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(hoverPoint.x - nx * extent, hoverPoint.y - ny * extent)
        ctx.lineTo(hoverPoint.x + nx * extent, hoverPoint.y + ny * extent)
        ctx.stroke()
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
    if (manualMarkersRef.current.length) {
      const currentKey = getFrameKey(currentTime)
      manualMarkersRef.current.forEach((point) => {
        const isCurrent = Math.abs(point.time - currentKey) < 0.0006
        ctx.fillStyle = isCurrent ? 'rgba(220, 38, 38, 0.95)' : 'rgba(245, 245, 245, 0.95)'
        ctx.beginPath()
        ctx.arc(point.x, point.y, isCurrent ? 5 : 4, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    if (status === 'manual' && hoverPoint) {
      const zoom = 3
      const size = 90
      const sampleSize = Math.round(size / zoom)
      const sx = Math.max(0, Math.min(ctx.canvas.width - sampleSize, hoverPoint.x - sampleSize / 2))
      const sy = Math.max(0, Math.min(ctx.canvas.height - sampleSize, hoverPoint.y - sampleSize / 2))
      let mx = hoverPoint.x + 18
      let my = hoverPoint.y + 18
      if (mx + size > ctx.canvas.width) mx = hoverPoint.x - size - 18
      if (my + size > ctx.canvas.height) my = hoverPoint.y - size - 18
      if (mx < 0) mx = 10
      if (my < 0) my = 10
      try {
        if (!magnifierRef.current) {
          magnifierRef.current = document.createElement('canvas')
        }
        const magCanvas = magnifierRef.current
        magCanvas.width = sampleSize
        magCanvas.height = sampleSize
        const magCtx = magCanvas.getContext('2d')
        const imageData = ctx.getImageData(sx, sy, sampleSize, sampleSize)
        magCtx.putImageData(imageData, 0, 0)
        ctx.save()
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(mx - 4, my - 4, size + 8, size + 8)
        ctx.drawImage(magCanvas, mx, my, size, size)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 1
        ctx.strokeRect(mx, my, size, size)
        ctx.beginPath()
        ctx.moveTo(mx + size / 2, my)
        ctx.lineTo(mx + size / 2, my + size)
        ctx.moveTo(mx, my + size / 2)
        ctx.lineTo(mx + size, my + size / 2)
        ctx.stroke()
        ctx.restore()
      } catch (error) {
        // Ignore magnifier errors (e.g., tainted canvas).
      }
    }
    ctx.restore()
  }

  const setCookie = (name, value, days = 365) => {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
  }

  const getCookie = (name) => {
    const prefix = `${name}=`
    const entries = document.cookie.split('; ')
    const match = entries.find((entry) => entry.startsWith(prefix))
    return match ? decodeURIComponent(match.slice(prefix.length)) : ''
  }

  const clearCookie = (name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }

  useEffect(() => {
    if (!startPoint || !endPoint) return
    if (![startPoint.x, startPoint.y, endPoint.x, endPoint.y].every(Number.isFinite)) return
    const canvas = canvasRef.current
    const width = canvas?.width || videoMeta.width
    const height = canvas?.height || videoMeta.height
    if (!width || !height) return
    const payload = {
      start: { x: startPoint.x / width, y: startPoint.y / height },
      end: { x: endPoint.x / width, y: endPoint.y / height },
    }
    setCookie('tracker_line', JSON.stringify(payload))
  }, [endPoint, startPoint, videoMeta.height, videoMeta.width])

  useEffect(() => {
    if (savedScaleAppliedRef.current) return
    const raw = getCookie('tracker_scale')
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      const distance = payload?.distance
      const unit = payload?.unit
      if (distance != null && distance !== '') setRealDistance(String(distance))
      if (unit != null && unit !== '') setUnitLabel(String(unit))
      savedScaleAppliedRef.current = true
      addLog('Loaded saved scale from cookie.')
    } catch (error) {
      clearCookie('tracker_scale')
    }
  }, [addLog])

  useEffect(() => {
    if (realDistance === '' && unitLabel === '') return
    const payload = {
      distance: realDistance,
      unit: unitLabel,
    }
    setCookie('tracker_scale', JSON.stringify(payload))
  }, [realDistance, unitLabel])

  useEffect(() => {
    if (savedColorAppliedRef.current) return
    const raw = getCookie('tracker_color')
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      const hex = payload?.hex
      if (hex) {
        handleTargetColorChange(hex)
        savedColorAppliedRef.current = true
        addLog('Loaded saved target color from cookie.')
      }
    } catch (error) {
      clearCookie('tracker_color')
    }
  }, [addLog])

  useEffect(() => {
    if (!targetHex) return
    const payload = { hex: targetHex }
    setCookie('tracker_color', JSON.stringify(payload))
  }, [targetHex])

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

  const restoreSavedLine = (video) => {
    if (!video || savedLineAppliedRef.current) return
    const raw = getCookie('tracker_line')
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      const nextStart = payload?.start
      const nextEnd = payload?.end
      if (
        nextStart &&
        nextEnd &&
        Number.isFinite(nextStart.x) &&
        Number.isFinite(nextStart.y) &&
        Number.isFinite(nextEnd.x) &&
        Number.isFinite(nextEnd.y)
      ) {
        setStartPoint({
          x: nextStart.x * video.videoWidth,
          y: nextStart.y * video.videoHeight,
        })
        setEndPoint({
          x: nextEnd.x * video.videoWidth,
          y: nextEnd.y * video.videoHeight,
        })
        setSelectMode(null)
        setStatusNote('Loaded saved line points from previous session.')
        addLog('Loaded saved start/end points from cookie.')
        savedLineAppliedRef.current = true
      }
    } catch (error) {
      clearCookie('tracker_line')
    }
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
    manualMarkersRef.current = []
    savedLineAppliedRef.current = false
    setLogs([`Loaded file ${file.name}`])
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    updateCanvasSize(video)
    restoreSavedLine(video)
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
    setCurrentTime(getFrameKey(0))
    restoreSavedLine(video)
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
    if (status === 'manual' && startPoint && endPoint) {
      recordManualMarker(coords)
      drawFrame()
      return
    }
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

  const findManualMarkerIndex = (timeKey) =>
    manualMarkersRef.current.findIndex((marker) => Math.abs(marker.time - timeKey) < 0.0006)

  const upsertManualMarker = (timeKey, coords) => {
    const index = findManualMarkerIndex(timeKey)
    if (index >= 0) {
      manualMarkersRef.current[index] = { ...manualMarkersRef.current[index], ...coords, time: timeKey }
    } else {
      manualMarkersRef.current.push({ ...coords, time: timeKey })
    }
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
    if (status === 'manual') {
      const timeKey = getFrameKey(currentTime)
      const currentIndex = findManualMarkerIndex(timeKey)
      const currentMarker = currentIndex >= 0 ? manualMarkersRef.current[currentIndex] : null
      if (currentMarker && hitTestPoint(coords, currentMarker, 10)) {
        dragTargetRef.current = 'manual'
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
    }
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
    } else if (dragTargetRef.current === 'manual') {
      if (!startPoint || !endPoint) return
      const projection = projectToLine(clamped, startPoint, endPoint)
      if (!projection) return
      const timeKey = getFrameKey(currentTime)
      upsertManualMarker(timeKey, { x: projection.x, y: projection.y })
      const position = scale ? projection.s * scale : null
      const resultIndex = resultsRef.current.findIndex(
        (row) => Math.abs(row.time - timeKey) < 0.0006
      )
      if (resultIndex >= 0) {
        resultsRef.current[resultIndex] = { time: timeKey, position }
      } else {
        resultsRef.current.push({ time: timeKey, position })
      }
      setResults([...resultsRef.current])
      setProcessedFrames(resultsRef.current.length)
      drawFrame()
    }
  }

  const handlePointerUp = (event) => {
    if (!dragTargetRef.current) return
    dragTargetRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePointerLeave = () => {
    dragTargetRef.current = null
    setHoverPoint(null)
  }

  const handlePointerHover = (event) => {
    if (!videoReady || status !== 'manual' || dragTargetRef.current) return
    const coords = getCanvasCoords(event)
    if (!coords) return
    setHoverPoint(clampToCanvas(coords))
    drawFrame()
  }

  const resetPoints = () => {
    setStartPoint(null)
    setEndPoint(null)
    setSelectMode('start')
    setStatusNote('Click the canvas to set the start point.')
    detectedPointsRef.current = []
    manualMarkersRef.current = []
    clearCookie('tracker_line')
    savedLineAppliedRef.current = false
    addLog('Saved line points cleared.')
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

  const getRgbMatchParams = (tolerance) => ({
    intensityThreshold: Math.round(60 + tolerance * 1.4),
    dominance: Math.round(60 - tolerance * 0.4),
  })

  const findRedPosition = (imageData, start, end, target, tolerance) => {
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
    const { intensityThreshold, dominance } = getRgbMatchParams(tolerance)
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

  const processFrame = (mediaTime, shouldLog = false) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    let positionPx = null
    let detection = null
    if (opencvReady) {
      try {
        const result = motionMode
          ? findMotionPositionOpenCv(
              canvas,
              startPoint,
              endPoint,
              detectionTolerance,
              showMaskPreview
            )
          : findColorPositionOpenCv(
              canvas,
              startPoint,
              endPoint,
              targetColor,
              detectionTolerance,
              showMaskPreview
            )
        detection = result?.detection ?? null
        positionPx = detection?.s ?? null
        if (showMaskPreview && result?.mask) {
          window.cv.imshow(canvas, result.mask)
          result.mask.delete()
        }
      } catch (error) {
        if (!opencvErrorRef.current) {
          addLog('OpenCV error detected, falling back to RGB matcher.')
          opencvErrorRef.current = true
        }
        setOpenCvReady(false)
      }
    } else {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      if (showMaskPreview) {
        const { intensityThreshold, dominance } = getRgbMatchParams(detectionTolerance)
        const { r: tr, g: tg, b: tb } = targetColor
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i]
          const g = imageData.data[i + 1]
          const b = imageData.data[i + 2]
          const distance = Math.hypot(r - tr, g - tg, b - tb)
          if (!(distance < intensityThreshold && r >= tr - dominance)) {
            imageData.data[i] = 0
            imageData.data[i + 1] = 0
            imageData.data[i + 2] = 0
          }
        }
        ctx.putImageData(imageData, 0, 0)
      }
      positionPx = findRedPosition(imageData, startPoint, endPoint, targetColor, detectionTolerance)
    }
    if (positionPx != null && startPoint && endPoint) {
      if (detection) {
        detectedPointsRef.current.push({ x: detection.x, y: detection.y })
      } else {
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
    if (shouldLog) {
      if (positionPx != null && scale != null) {
        addLog(`Frame ${mediaTime.toFixed(3)} s · found at ${entry.position.toFixed(3)} ${unitLabel || 'units'}`)
      } else {
        addLog(`Frame ${mediaTime.toFixed(3)} s · target not found`)
      }
    }
  }

  const resetProcessingState = () => {
    resultsRef.current = []
    detectedPointsRef.current = []
    manualMarkersRef.current = []
    opencvErrorRef.current = false
    if (prevFrameRef.current) {
      prevFrameRef.current.delete()
      prevFrameRef.current = null
    }
    setResults([])
    setProcessedFrames(0)
  }

  const runAutoFrameByFrame = async (label) => {
    const video = videoRef.current
    if (!video) return
    setStatus('processing')
    setStatusNote('Analyzing frames (step mode)...')
    resetProcessingState()
    processingRef.current = true
    addLog(label)

    await seekVideo(video, 0)
    video.pause()

    const totalSteps = Math.ceil(video.duration / frameStepSeconds)
    for (let i = 0; i <= totalSteps; i += 1) {
      if (!processingRef.current) break
      const t = Math.min(i * frameStepSeconds, video.duration)
      await seekVideo(video, t)
      processFrame(t, true)
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
    let played = false
    try {
      await video.play()
      played = true
    } catch (error) {
      addLog('Video playback blocked; switching to step mode.')
    }
    if (!played || video.paused) {
      processingRef.current = false
      await runAutoFrameByFrame(
        `Tracking started (fallback step mode). Step: ${frameStepSeconds.toFixed(4)} s.`
      )
      return
    }

    const finish = () => {
      processingRef.current = false
      video.pause()
      setStatus('done')
      setStatusNote(`Finished. ${resultsRef.current.length} frames processed.`)
      setResults([...resultsRef.current])
      setProcessedFrames(resultsRef.current.length)
      addLog(`Tracking finished. Frames: ${resultsRef.current.length}.`)
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }
      video.removeEventListener('ended', finish)
    }

    video.addEventListener('ended', finish)

    if ('requestVideoFrameCallback' in video) {
      const handleFrame = (_now, metadata) => {
        if (!processingRef.current) return
        processFrame(metadata?.mediaTime ?? video.currentTime, true)
        lastFrameTimeRef.current = metadata?.mediaTime ?? video.currentTime
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
        processFrame(video.currentTime, true)
        lastFrameTimeRef.current = video.currentTime
        if (video.currentTime >= video.duration - 0.0005) {
          clearInterval(timer)
          finish()
        }
      }, frameInterval)
    }

    if (!fallbackTimerRef.current) {
      fallbackTimerRef.current = setInterval(() => {
        if (!processingRef.current) {
          clearInterval(fallbackTimerRef.current)
          fallbackTimerRef.current = null
          return
        }
        const current = video.currentTime
        if (lastFrameTimeRef.current == null || Math.abs(current - lastFrameTimeRef.current) > 0.0005) {
          processFrame(current, true)
          lastFrameTimeRef.current = current
        }
        if (current >= video.duration - 0.0005) {
          finish()
        }
      }, 100)
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
    await runAutoFrameByFrame(
      `Tracking started (frame-by-frame). Step: ${frameStepSeconds.toFixed(4)} s.`
    )
  }

  const projectToLine = (point, start, end) => {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (!length) return null
    const ux = dx / length
    const uy = dy / length
    const s = (point.x - start.x) * ux + (point.y - start.y) * uy
    return {
      s: Math.min(Math.max(s, 0), length),
      x: start.x + ux * Math.min(Math.max(s, 0), length),
      y: start.y + uy * Math.min(Math.max(s, 0), length),
    }
  }

  const recordManualMarker = (coords) => {
    if (!videoRef.current || !startPoint || !endPoint) return
    const projection = projectToLine(coords, startPoint, endPoint)
    if (!projection) return
    const timeKey = getFrameKey(videoRef.current.currentTime)
    upsertManualMarker(timeKey, { x: projection.x, y: projection.y })
    const position = scale ? projection.s * scale : null
    const resultIndex = resultsRef.current.findIndex((row) => Math.abs(row.time - timeKey) < 0.0006)
    if (resultIndex >= 0) {
      resultsRef.current[resultIndex] = { time: timeKey, position }
    } else {
      resultsRef.current.push({ time: timeKey, position })
    }
    setResults([...resultsRef.current])
    setProcessedFrames(resultsRef.current.length)
    addLog(
      `Manual marker at ${timeKey.toFixed(3)} s · ${position != null ? position.toFixed(3) : '—'}`
    )
  }

  const handleManualMode = async () => {
    const video = videoRef.current
    if (!video || !videoReady || !startPoint || !endPoint) {
      setStatusNote('Load a video and define both points first.')
      return
    }
    if (processingRef.current) return
    resetProcessingState()
    processingRef.current = false
    setStatus('manual')
    setStatusNote('Manual mode: click the object each frame to add a marker.')
    addLog('Manual marking mode enabled.')
    setHoverPoint(null)
    await seekVideo(video, 0)
    video.pause()
    setCurrentTime(getFrameKey(0))
    drawFirstFrame()
  }

  const handleExitManualMode = () => {
    setStatus('idle')
    setStatusNote('Manual mode exited.')
    addLog('Manual marking mode exited.')
    setHoverPoint(null)
  }

  const stepFrame = async (direction) => {
    const video = videoRef.current
    if (!video || !videoReady) return
    const nextTime = Math.min(
      Math.max(video.currentTime + direction * frameStepSeconds, 0),
      video.duration
    )
    await seekVideo(video, nextTime)
    setCurrentTime(getFrameKey(video.currentTime))
    drawFrame()
  }

  const handleStop = () => {
    if (!processingRef.current) return
    processingRef.current = false
    if (videoRef.current) videoRef.current.pause()
    setStatus('idle')
    setStatusNote('Processing stopped.')
    addLog('Tracking stopped by user.')
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
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
            <div className="tolerance-row">
              <label htmlFor="detection-tolerance">Detection tolerance</label>
              <input
                id="detection-tolerance"
                type="range"
                min="0"
                max="100"
                value={detectionTolerance}
                onChange={(event) => setDetectionTolerance(Number(event.target.value))}
              />
              <span>{detectionTolerance}</span>
            </div>
            <div className="toggle-row">
              <label htmlFor="mask-preview">Mask preview</label>
              <input
                id="mask-preview"
                type="checkbox"
                checked={showMaskPreview}
                onChange={(event) => setShowMaskPreview(event.target.checked)}
              />
            </div>
            <div className="toggle-row">
              <label htmlFor="motion-mode">Motion mode (OpenCV)</label>
              <input
                id="motion-mode"
                type="checkbox"
                checked={motionMode}
                onChange={(event) => setMotionMode(event.target.checked)}
              />
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
                <button className="ghost" type="button" onClick={handleManualMode} disabled={status === 'manual'}>
                  Manual marking mode
                </button>
                <button className="ghost" type="button" onClick={handleExitManualMode} disabled={status !== 'manual'}>
                  Exit manual mode
                </button>
                <button className="secondary" type="button" onClick={handleDownload} disabled={!results.length}>
                  Download CSV
                </button>
              </div>
              {status === 'manual' && (
                <div className="manual-controls">
                  <button type="button" className="secondary" onClick={() => stepFrame(-1)}>
                    Previous frame
                  </button>
                  <button type="button" className="secondary" onClick={() => stepFrame(1)}>
                    Next frame
                  </button>
                  <div className="manual-meta">Time: {currentTime.toFixed(3)} s</div>
                </div>
              )}
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
              onPointerMoveCapture={handlePointerHover}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
            {!videoReady && <div className="canvas-overlay">Load a video to preview frames.</div>}
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
