import { useCallback, useEffect, useState } from 'react'
import { supportedLanguages, translate, type TranslateFn } from './i18n'
import { useTracker } from './hooks/useTracker'
import './App.css'

const sampleVideos = [
  {
    href: new URL('./resources/example_clip_accelerated_motion.mp4', import.meta.url).href,
    labelKey: 'banner.sample1',
  },
  {
    href: new URL('./resources/example_clip_uniform_motion.mp4', import.meta.url).href,
    labelKey: 'banner.sample2',
  },
]

function App() {
  const [lang, setLang] = useState('en')
  const [showBanner, setShowBanner] = useState(true)
  const [showCookieNotice, setShowCookieNotice] = useState(false)

  const t: TranslateFn = useCallback((key, params) => translate(lang, key, params), [lang])
  const {
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
  } = useTracker(t)

  useEffect(() => {
    const accepted = localStorage.getItem('cookie_notice_accepted') === '1'
    setShowCookieNotice(!accepted)
  }, [])

  const handleFileChangeWithBanner = useCallback(
    (event) => {
      handleFileChange(event)
      setShowBanner(false)
    },
    [handleFileChange]
  )

  return (
    <div className="app">
      {showBanner && (
        <div className="top-banner">
          <div>
            <strong>{t('banner.title')}</strong>
            <p>{t('banner.desc')}</p>
          </div>
          <div className="banner-links">
            {sampleVideos.map((sample) => (
              <a key={sample.href} href={sample.href} target="_blank" rel="noreferrer">
                {t(sample.labelKey)}
              </a>
            ))}
          </div>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setShowBanner(false)}
            aria-label={t('banner.close')}
          >
            ×
          </button>
        </div>
      )}
      <header className="hero">
        <div>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('hero.title')}</h1>
          <p className="hero-sub">{t('hero.sub')}</p>
        </div>
        <div className="language-switcher">
          <label className="sr-only" htmlFor="language-select">
            {t('language.label')}
          </label>
          <select
            id="language-select"
            value={lang}
            onChange={(event) => setLang(event.target.value)}
            aria-label={t('language.label')}
          >
            {supportedLanguages.map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-block">
            <h2>{t('video.title')}</h2>
            <label className="file-input">
              <input type="file" accept="video/*" onChange={handleFileChangeWithBanner} />
              <span>{videoName || t('video.choose')}</span>
            </label>
            <label className="file-input secondary-input">
              <input type="file" accept=".json,application/json" onChange={handleSettingsFileChange} />
              <span>{t('video.loadSettings')}</span>
            </label>
            <p className="panel-note">{statusNoteText}</p>
          </div>

          <div className="panel-block">
            <h2>{t('line.title')}</h2>
            <div className="stack">
              <button className="secondary" type="button" onClick={() => setSelectMode('start')}>
                {t('line.selectStart')}
              </button>
              <button className="secondary" type="button" onClick={() => setSelectMode('end')}>
                {t('line.selectEnd')}
              </button>
              <button className="ghost" type="button" onClick={resetPoints}>
                {t('line.reset')}
              </button>
            </div>
            <div className="meta-row">
              <span>{t('line.length')}</span>
              <strong>{lineLength ? `${lineLength.toFixed(1)} px` : '—'}</strong>
            </div>
          </div>

          <div className="panel-block">
            <h2>{t('calibration.title')}</h2>
            <div className="input-row">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t('calibration.realDistance')}
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
              <span>{t('calibration.scale')}</span>
              <strong>
                {scale ? `${scale.toFixed(4)} ${unitLabel || t('calibration.defaultUnit')}/px` : '—'}
              </strong>
            </div>
          </div>

          <div className="panel-block">
            <h2>{t('manual.title')}</h2>
            <div className="stack">
              <button className="ghost" type="button" onClick={handleManualMode} disabled={status === 'manual'}>
                {t('manual.enter')}
              </button>
              <button className="ghost" type="button" onClick={handleExitManualMode} disabled={status !== 'manual'}>
                {t('manual.exit')}
              </button>
              <button className="secondary" type="button" onClick={handleDownloadSettings}>
                {t('manual.downloadSettings')}
              </button>
              <button className="secondary" type="button" onClick={handleDownload} disabled={!results.length}>
                {t('manual.downloadCsv')}
              </button>
            </div>
            {status === 'manual' && (
              <div className="manual-controls">
                <button type="button" className="secondary" onClick={() => stepFrame(-1)}>
                  {t('manual.prevFrame')}
                </button>
                <button type="button" className="secondary" onClick={() => stepFrame(1)}>
                  {t('manual.nextFrame')}
                </button>
                <div className="manual-meta">{t('manual.time', { time: currentTime.toFixed(3) })}</div>
              </div>
            )}
          </div>

          <div className="panel-block">
            <h2>{t('details.title')}</h2>
            <div className="meta-row">
              <span>{t('details.resolution')}</span>
              <strong>
                {videoMeta.width && videoMeta.height ? `${videoMeta.width} × ${videoMeta.height}` : '—'}
              </strong>
            </div>
            <div className="meta-row">
              <span>{t('details.duration')}</span>
              <strong>{videoMeta.duration ? `${videoMeta.duration.toFixed(2)} s` : '—'}</strong>
            </div>
            <div className="meta-row">
              <span>{t('details.mode')}</span>
              <strong>{modeLabel}</strong>
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
            {!videoReady && <div className="canvas-overlay">{t('overlay.prompt')}</div>}
          </div>
          <div className="log-panel">
            <div className="log-header">
              <span>{t('log.title')}</span>
              <div className="log-controls">
                <label htmlFor="frame-step">{t('log.step')}</label>
                <input
                  id="frame-step"
                  type="number"
                  min="1"
                  step="1"
                  value={frameStepFrames}
                  onChange={(event) => setFrameStepFrames(Number(event.target.value) || 1)}
                />
                <label htmlFor="fps-override">{t('log.fps')}</label>
                <input
                  id="fps-override"
                  type="number"
                  min="1"
                  step="1"
                  value={fpsOverride}
                  onChange={(event) => setFpsOverride(Number(event.target.value) || 30)}
                />
                <button type="button" className="ghost" onClick={clearLogs}>
                  {t('log.clear')}
                </button>
              </div>
            </div>
            <div className="log-body">
              {logs.length ? (
                logs.map((entry, index) => <div key={`${entry}-${index}`}>{entry}</div>)
              ) : (
                <div className="log-empty">{t('log.empty')}</div>
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
      {showCookieNotice && (
        <div className="cookie-banner">
          <div>
            <strong>{t('cookie.title')}</strong>
            <p>{t('cookie.desc')}</p>
          </div>
          <button
            type="button"
            className="cookie-ok"
            onClick={() => {
              localStorage.setItem('cookie_notice_accepted', '1')
              setShowCookieNotice(false)
            }}
          >
            {t('cookie.ok')}
          </button>
        </div>
      )}
    </div>
  )
}

export default App
