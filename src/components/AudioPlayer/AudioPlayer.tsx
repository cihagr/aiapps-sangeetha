import { useCallback, useEffect, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import "./AudioPlayer.css"

interface Props {
  audioTrack: string
}

const AudioPlayer = ({ audioTrack }: Props) => {
  const [timeProgress, setTimeProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const progressBarRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playAnimationRef = useRef<number | null>(null)
  const [duration, setDuration] = useState<number>(0)

  const togglePlayPause = () => setIsPlaying(prev => !prev)

  useEffect(() => {
    // Reset on new track; duration will be set from metadata
    setDuration(0)
    setTimeProgress(0)
    if (progressBarRef.current) {
      progressBarRef.current.value = "0"
      progressBarRef.current.style.setProperty("--range-progress", "0%")
    }
  }, [audioTrack])

  const handleDownloadAudio = () => {
    (async () => {
      try {
        // If it's already a blob URL or data URL, just trigger download directly
        if (audioTrack.startsWith('blob:') || audioTrack.startsWith('data:')) {
          const a = document.createElement('a')
          a.href = audioTrack
          a.download = 'my-audio.mp3'
          a.click()
          a.remove()
          return
        }

        // Fetch the resource and download as blob to ensure it happens in the same window
        const resp = await fetch(audioTrack, { credentials: 'include' })
        if (!resp.ok) throw new Error(`Network error: ${resp.status}`)
        const blob = await resp.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'my-audio.mp3'
        a.click()
        // Revoke object URL shortly after download is triggered
        setTimeout(() => URL.revokeObjectURL(url), 15000)
        a.remove()
      } catch (err) {
        // Graceful fallback: open in same window (will navigate), or log
        try { window.open(audioTrack, '_self') } catch (e) { console.error('Download failed', err) }
      }
    })()
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateProgress = () => {
      const current = Math.floor(audio.currentTime || 0)
      setTimeProgress(current)
      if (progressBarRef.current && Number.isFinite(audio.duration) && audio.duration > 0) {
        // Keep the input.value as seconds (0..duration) and separately update the CSS progress
        try {
          progressBarRef.current.value = String(current)
          const percent = (current / Math.max(1, Math.round(audio.duration))) * 100
          progressBarRef.current.style.setProperty('--range-progress', `${percent}%`)
        } catch {}
      }
    }
    const onEnded = () => {
      setIsPlaying(false)
      setTimeProgress(0)
      try { if (progressBarRef.current) progressBarRef.current.value = '0' } catch {}
      try { audio.currentTime = 0 } catch {}
    }
    audio.addEventListener('timeupdate', updateProgress)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', updateProgress)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const repeat = useCallback(() => {
    const currentTime = (audioRef.current?.currentTime ?? 0)
    setTimeProgress(currentTime)
    if (progressBarRef.current) {
      progressBarRef.current.value = String(currentTime)
      progressBarRef.current.style.setProperty(
        "--range-progress",
        `${(Number(progressBarRef.current.value) / Math.round(duration || 1)) * 100}%`
      )
    }
    playAnimationRef.current = requestAnimationFrame(repeat)
  }, [duration])

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play()
    } else {
      if (audioRef.current?.currentTime === duration) return
      audioRef.current?.pause()
    }
    playAnimationRef.current = requestAnimationFrame(repeat)
    return () => cancelAnimationFrame(playAnimationRef.current as number)
  }, [isPlaying, repeat, duration])

  useEffect(() => {
    const id = setInterval(() => {
      const ct = audioRef.current?.currentTime ?? 0
      if (ct && ct >= duration && duration > 0) {
        if (progressBarRef.current) {
          progressBarRef.current.style.setProperty("--range-progress", "0%")
          progressBarRef.current.value = "0"
        }
        setIsPlaying(false)
        setTimeProgress(0)
      }
    }, 200)
    return () => clearInterval(id)
  }, [duration])

  const handleProgressChange = () => {
    if (audioRef.current && progressBarRef.current) {
      audioRef.current.currentTime = Number(progressBarRef.current.value)
      progressBarRef.current.style.setProperty(
        "--range-progress",
        `${(Number(progressBarRef.current.value) / Math.round(duration || 1)) * 100}%`
      )
    }
  }

  const onLoadedMetadata = () => {
    const el = audioRef.current
    if (!el) return
    const applyDuration = (val: number) => {
      // Cap duration at 20 seconds for UI playback
      const d = Math.min(20, Math.max(0, Math.round(val || 0)))
      setDuration(d)
      if (progressBarRef.current) {
        progressBarRef.current.max = String(d)
      }
    }
    // Some browsers report Infinity or 0 for blob recordings until we seek
    const raw = el.duration
    if (!isFinite(raw) || raw === 0) {
      const onTimeUpdate = () => {
        try {
          el.removeEventListener('timeupdate', onTimeUpdate)
        } catch {}
        // After forcing a seek, duration should be available (or fallback to currentTime)
        const computed = isFinite(el.duration) && el.duration > 0 ? el.duration : el.currentTime || 0
        applyDuration(computed)
        // Reset position back to start for correct playback
        try { el.currentTime = 0 } catch {}
        try { el.pause() } catch {}
      }
      try {
        el.addEventListener('timeupdate', onTimeUpdate)
        // Force a large seek; this triggers duration calculation
        el.currentTime = 24 * 60 * 60
        // Nudge playback to fire timeupdate in some browsers
        el.play().then(() => el.pause()).catch(() => {})
      } catch {
        applyDuration(0)
      }
    } else {
      applyDuration(raw)
    }
  }

  const formatTime = (time: number) => {
    if (time && !isNaN(time)) {
      const minutes = Math.floor(time / 60)
      const formatMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`
      const seconds = Math.floor(time % 60)
      const formatSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`
      return `${formatMinutes}:${formatSeconds}`
    }
    return "00:00"
  }

  return (
    <div className="audio-player-container w-full mt-4">
      <div className="hidden">
        <audio src={audioTrack} ref={audioRef} onLoadedMetadata={onLoadedMetadata} />
      </div>
      <div className="flex justify-center items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="audio-controls sm:w-10 sm:h-10 w-6 h-6 bg-slate-400 flex justify-center rounded-full items-center cursor-pointer"
                onClick={togglePlayPause}
                tabIndex={0}
                aria-label="Play or pause audio"
                title={isPlaying ? "Pause" : "Play"}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.code === "Space") togglePlayPause()
                }}
              >
                {isPlaying ? (
                  <span className="text-[10px] sm:text-[14px]">❚❚</span>
                ) : (
                  <span className="text-[10px] sm:text-[14px]">►</span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>Play or pause audio</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="audio-progressbar flex justify-center items-center grow ml-4">
          <div className="time current w-12 mr-1" title="Elapsed time">{formatTime(timeProgress)}</div>
          <div className="grow">
            <input
              aria-label="audio player"
              type="range"
              ref={progressBarRef}
              onChange={handleProgressChange}
              defaultValue="0"
              title="Seek position"
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") handleProgressChange()
              }}
            />
          </div>
          <div className="time ml-2" title="Total time">{formatTime(Math.round(duration))}</div>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="audio-download ml-4 cursor-pointer"
                onClick={handleDownloadAudio}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleDownloadAudio()
                }}
                aria-label="Download audio"
                title="Download audio"
              >
                ⬇
              </div>
            </TooltipTrigger>
            <TooltipContent>Download audio</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}

export default AudioPlayer
