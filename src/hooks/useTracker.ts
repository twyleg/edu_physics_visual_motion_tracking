import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TranslateFn } from '../i18n'

type StatusNote = {
  key: string
  params?: Record<string, any>
}

export function useTracker(t: TranslateFn) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const resultsRef = useRef([])
  const manualMarkersRef = useRef([])
  const dragTargetRef = useRef(null)
  const savedLineAppliedRef = useRef(false)
  const magnifierRef = useRef(null)
  const savedScaleAppliedRef = useRef(false)
  const pendingSettingsRef = useRef(null)
  const fpsEstimateRef = useRef(60)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [videoReady, setVideoReady] = useState(false)
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0, duration: 0 })
  const [selectMode, setSelectMode] = useState('start')
  const [startPoint, setStartPoint] = useState(null)
  const [endPoint, setEndPoint] = useState(null)
  const [realDistance, setRealDistance] = useState('')
  const [unitLabel, setUnitLabel] = useState('m')
  const [status, setStatus] = useState('idle')
  const [processedFrames, setProcessedFrames] = useState(0)
  const [results, setResults] = useState([])
  const [logs, setLogs] = useState([])
  const [frameStepFrames, setFrameStepFrames] = useState(1)
  const [fpsOverride, setFpsOverride] = useState(240)
  const [currentTime, setCurrentTime] = useState(0)
  const [hoverPoint, setHoverPoint] = useState(null)

  const [statusNoteState, setStatusNoteState] = useState<StatusNote>({ key: 'note.loadVideo' })
  const statusNoteText = useMemo(
    () => t(statusNoteState.key, statusNoteState.params),
    [statusNoteState, t]
  )
  const updateStatusNote = useCallback(
    (key: string, params?: Record<string, any>) => setStatusNoteState({ key, params }),
    []
  )

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev.slice(-199), `${timestamp} · ${message}`])
  }, [])

  const normalizePoint = (point, width, height) => ({
    x: point.x / width,
    y: point.y / height,
  })

  const denormalizePoint = (point, width, height) => ({
    x: point.x * width,
    y: point.y * height,
  })

  const lineLength = useMemo(() => {
    if (!startPoint || !endPoint) return 0
    return Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y)
  }, [startPoint, endPoint])

  const scale = useMemo(() => {
    const distance = parseFloat(realDistance)
    if (!distance || !lineLength) return null
    return distance / lineLength
  }, [realDistance, lineLength])

  const modeLabel = useMemo(() => {
    if (selectMode === 'start') return t('details.modeStart')
    if (selectMode === 'end') return t('details.modeEnd')
    return t('details.modeLocked')
  }, [selectMode, t])

  useEffect(() => {
    if (!videoReady) return
    const handle = requestAnimationFrame(() => drawFrame())
    return () => cancelAnimationFrame(handle)
  }, [videoReady, startPoint, endPoint])

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
  }, [status, frameStepFrames])

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

  const getFpsEstimate = (video = videoRef.current) => {
    if (fpsOverride && fpsOverride > 0) return fpsOverride
    if (!video) return 30
    const duration = video.duration
    const quality = video.getVideoPlaybackQuality?.()
    const totalFrames = quality?.totalVideoFrames || video.webkitDecodedFrameCount
    if (totalFrames && duration) {
      fpsEstimateRef.current = totalFrames / duration
    }
    return fpsEstimateRef.current || 30
  }

  const getStepSeconds = (video = videoRef.current) => {
    const fps = getFpsEstimate(video)
    return 1 / fps
  }

  const getFrameKey = (time) => {
    const step = getStepSeconds() * Math.max(1, Math.round(frameStepFrames))
    return Number((Math.round(time / step) * step).toFixed(4))
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
    if (manualMarkersRef.current.length) {
      const currentKey = getFrameKey(currentTime)
      manualMarkersRef.current.forEach((point) => {
        if (startPoint && endPoint) {
          const dx = endPoint.x - startPoint.x
          const dy = endPoint.y - startPoint.y
          const length = Math.hypot(dx, dy)
          if (length > 0) {
            const nx = -dy / length
            const ny = dx / length
            const extent = Math.max(ctx.canvas.width, ctx.canvas.height)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 6])
            ctx.beginPath()
            ctx.moveTo(point.x - nx * extent, point.y - ny * extent)
            ctx.lineTo(point.x + nx * extent, point.y + ny * extent)
            ctx.stroke()
          }
        }
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
      addLog(t('log.scaleLoaded'))
    } catch (error) {
      clearCookie('tracker_scale')
    }
  }, [addLog, t])

  useEffect(() => {
    if (realDistance === '' && unitLabel === '') return
    const payload = {
      distance: realDistance,
      unit: unitLabel,
    }
    setCookie('tracker_scale', JSON.stringify(payload))
  }, [realDistance, unitLabel])

  const applySettings = (settings, video) => {
    if (!settings || !video) return
    const width = video.videoWidth || videoMeta.width
    const height = video.videoHeight || videoMeta.height
    if (!width || !height) return
    const nextStart = settings?.line?.start
    const nextEnd = settings?.line?.end
    if (nextStart && nextEnd) {
      setStartPoint(denormalizePoint(nextStart, width, height))
      setEndPoint(denormalizePoint(nextEnd, width, height))
      setSelectMode(null)
    }
    if (settings?.scale) {
      setRealDistance(settings.scale.distance ?? '')
      setUnitLabel(settings.scale.unit ?? 'm')
    }
    if (settings?.frameStepFrames) {
      setFrameStepFrames(settings.frameStepFrames)
    } else if (settings?.frameStepSeconds) {
      const fps = getFpsEstimate(video)
      setFrameStepFrames(Math.max(1, Math.round(settings.frameStepSeconds * fps)))
    }
    if (settings?.fps != null) {
      setFpsOverride(Number(settings.fps) || 30)
    }
    if (Array.isArray(settings?.markers)) {
      const markers = settings.markers.map((marker) => ({
        time: marker.time,
        ...denormalizePoint(marker, width, height),
      }))
      manualMarkersRef.current = markers
      const lineDx = nextEnd ? (nextEnd.x - nextStart.x) * width : 0
      const lineDy = nextEnd ? (nextEnd.y - nextStart.y) * height : 0
      const lineLen = Math.hypot(lineDx, lineDy)
      const distance = parseFloat(settings?.scale?.distance)
      resultsRef.current = markers.map((marker) => {
        let position = null
        if (lineLen && distance) {
          const s =
            ((marker.x - (nextStart?.x ?? 0) * width) * lineDx +
              (marker.y - (nextStart?.y ?? 0) * height) * lineDy) /
            lineLen
          position = (distance / lineLen) * Math.min(Math.max(s, 0), lineLen)
        }
        return { time: marker.time, position }
      })
      setResults([...resultsRef.current])
      setProcessedFrames(resultsRef.current.length)
    }
    setCurrentTime(settings?.currentTime ?? getFrameKey(0))
    updateStatusNote('note.settingsLoaded')
    addLog(t('log.settingsApplied'))
    drawFrame()
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
        updateStatusNote('note.savedLine')
        addLog(t('log.lineLoaded'))
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
    updateStatusNote('note.setStart')
    manualMarkersRef.current = []
    savedLineAppliedRef.current = false
    setLogs([`${new Date().toLocaleTimeString()} · ${t('log.loadedFile', { file: file.name })}`])
    pendingSettingsRef.current = null
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    updateCanvasSize(video)
    restoreSavedLine(video)
    if (pendingSettingsRef.current) {
      applySettings(pendingSettingsRef.current, video)
      pendingSettingsRef.current = null
    }
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
    updateStatusNote('note.setStart')
    addLog(t('log.videoReady'))
    if (pendingSettingsRef.current) {
      applySettings(pendingSettingsRef.current, video)
      pendingSettingsRef.current = null
    }
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
      updateStatusNote('note.setEnd')
      addLog(t('log.startPoint', { x: coords.x.toFixed(1), y: coords.y.toFixed(1) }))
    } else if (selectMode === 'end') {
      setEndPoint(coords)
      setSelectMode(null)
      updateStatusNote('note.enterDistance')
      addLog(t('log.endPoint', { x: coords.x.toFixed(1), y: coords.y.toFixed(1) }))
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
    updateStatusNote('note.setStart')
    manualMarkersRef.current = []
    clearCookie('tracker_line')
    savedLineAppliedRef.current = false
    addLog(t('log.lineCleared'))
  }

  const seekVideo = (video, time) =>
    new Promise<void>((resolve) => {
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked)
        resolve()
      }
      video.addEventListener('seeked', handleSeeked)
      video.currentTime = time
    })

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
      t('log.manualMarker', {
        time: timeKey.toFixed(3),
        position: position != null ? position.toFixed(3) : '—',
      })
    )
  }

  const resetManualState = () => {
    resultsRef.current = []
    manualMarkersRef.current = []
    setResults([])
    setProcessedFrames(0)
  }

  const handleManualMode = async () => {
    const video = videoRef.current
    if (!video || !videoReady || !startPoint || !endPoint) {
      updateStatusNote('note.missingLine')
      return
    }
    if (!manualMarkersRef.current.length && !resultsRef.current.length) {
      resetManualState()
    }
    setStatus('manual')
    updateStatusNote('note.manualInstruction')
    addLog(t('log.manualEnabled'))
    setHoverPoint(null)
    await seekVideo(video, 0)
    video.pause()
    setCurrentTime(getFrameKey(0))
    drawFirstFrame()
  }

  const handleExitManualMode = () => {
    setStatus('idle')
    updateStatusNote('note.manualExit')
    addLog(t('log.manualExited'))
    setHoverPoint(null)
  }

  const stepFrame = async (direction) => {
    const video = videoRef.current
    if (!video || !videoReady) return
    const stepFrames = Math.max(1, Math.round(frameStepFrames))
    const stepSeconds = getStepSeconds(video)
    const nextTime = Math.min(
      Math.max(video.currentTime + direction * stepSeconds * stepFrames, 0),
      video.duration
    )
    await seekVideo(video, nextTime)
    setCurrentTime(getFrameKey(video.currentTime))
    drawFrame()
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

  const buildSettingsPayload = () => {
    const canvas = canvasRef.current
    const width = canvas?.width || videoMeta.width
    const height = canvas?.height || videoMeta.height
    const line =
      startPoint && endPoint && width && height
        ? {
            start: normalizePoint(startPoint, width, height),
            end: normalizePoint(endPoint, width, height),
          }
        : null
    const markers =
      manualMarkersRef.current.length && width && height
        ? manualMarkersRef.current.map((marker) => ({
            time: marker.time,
            ...normalizePoint(marker, width, height),
          }))
        : []
    return {
      version: 1,
      videoName: videoName || null,
      frameStepFrames,
      fps: fpsOverride,
      scale: {
        distance: realDistance,
        unit: unitLabel,
      },
      line,
      markers,
      currentTime,
      exportedAt: new Date().toISOString(),
    }
  }

  const handleDownloadSettings = () => {
    const payload = buildSettingsPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${videoName || 'tracking'}.settings.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
    addLog(t('log.settingsDownload'))
  }

  const handleSettingsFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        if (typeof reader.result !== 'string') {
          throw new Error('Settings file is not valid text')
        }
        const settings = JSON.parse(reader.result)
        const video = videoRef.current
        if (video && (video.videoWidth || videoMeta.width)) {
          applySettings(settings, video)
        } else {
          pendingSettingsRef.current = settings
          addLog(t('log.settingsWaiting'))
          updateStatusNote('note.settingsWaiting')
        }
      } catch (error) {
        addLog(t('log.settingsParseFailed'))
      }
    }
    reader.readAsText(file)
  }

  const clearLogs = () => setLogs([])

  return {
    videoRef,
    canvasRef,
    videoUrl,
    videoName,
    videoReady,
    statusNoteText,
    lineLength,
    realDistance,
    setRealDistance,
    unitLabel,
    setUnitLabel,
    scale,
    status,
    handleManualMode,
    handleExitManualMode,
    handleDownloadSettings,
    handleDownload,
    results,
    currentTime,
    stepFrame,
    videoMeta,
    frameStepFrames,
    setFrameStepFrames,
    fpsOverride,
    setFpsOverride,
    logs,
    clearLogs,
    handleFileChange,
    handleSettingsFileChange,
    resetPoints,
    handleCanvasClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerHover,
    handlePointerUp,
    handlePointerLeave,
    handleLoadedMetadata,
    handleLoadedData,
    modeLabel,
    setSelectMode,
  }
}
