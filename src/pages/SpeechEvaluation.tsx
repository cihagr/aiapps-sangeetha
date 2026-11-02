import { useState, useRef, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeft,
  Mic,
  Upload,
  Play,
  StopCircle,
  Volume2,
  Bell,
  Settings,
  FileText,
  Clock,
  CheckCircle,
  Eye,
  BarChart3,
  Target,
  Headphones,
  Waves,
  Radio,
  Sparkles,
  Download,
  X,
  Pause,
  Square,
  TrendingUp
} from "lucide-react"
import { Loader2 } from "lucide-react"
import { PageLoader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
import AudioPlayer from "@/components/AudioPlayer/AudioPlayer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProfileDropdown } from "@/components/ProfileDropdown"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { getApiBase } from "@/api/base"
import { SPEECH_EVAL_API_URL } from "@/config"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
// MP3 recording polyfill
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import AudioRecorder from 'audio-recorder-polyfill'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import mpegEncoder from 'audio-recorder-polyfill/mpeg-encoder'

// --- Audio compatibility helpers (convert WebM/Opus to WAV if needed) ---
const isServerSupportedAudio = (type: string) => /audio\/mpeg|audio\/mp3|audio\/wav/i.test(type)

const toWavFile = async (file: File): Promise<File> => {
  const arrayBuf = await file.arrayBuffer()
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0))
  const wavBuffer = encodeWAV(audioBuffer)
  const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' })
  const name = file.name.replace(/\.(webm|mp4|ogg|m4a|mp3|wav)?$/i, '') + '.wav'
  return new File([wavBlob], name, { type: 'audio/wav' })
}

function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const numOfChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const samples = audioBuffer.getChannelData(0)
  const buffer = new ArrayBuffer(44 + samples.length * 2 * numOfChannels)
  const view = new DataView(buffer)

  /* RIFF identifier */
  writeString(view, 0, 'RIFF')
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2 * numOfChannels, true)
  /* RIFF type */
  writeString(view, 8, 'WAVE')
  /* format chunk identifier */
  writeString(view, 12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, 1, true)
  /* channel count */
  view.setUint16(22, numOfChannels, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChannels * 2, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChannels * 2, true)
  /* bits per sample */
  view.setUint16(34, 16, true)
  /* data chunk identifier */
  writeString(view, 36, 'data')
  /* data chunk length */
  view.setUint32(40, samples.length * 2 * numOfChannels, true)

  // Interleave channel data
  let offset = 44
  const channelData: Float32Array[] = []
  for (let i = 0; i < numOfChannels; i++) channelData.push(audioBuffer.getChannelData(i))
  for (let i = 0; i < samples.length; i++) {
    for (let ch = 0; ch < numOfChannels; ch++) {
      // clamp and convert to 16-bit PCM
      const s = Math.max(-1, Math.min(1, channelData[ch][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
  }
  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

const ensureCompatibleAudio = async (file: File): Promise<File> => {
  try {
    if (isServerSupportedAudio(file.type)) return file
    // Convert unsupported formats (e.g., webm/opus) to WAV
    return await toWavFile(file)
  } catch (e) {
    // If conversion fails, fall back to original file
    console.warn('Audio conversion failed, sending original file', e)
    return file
  }
}
  // --- end helpers ---

  // Configure polyfill to produce MP3, but only use it if MediaRecorder is not available
  ; (AudioRecorder as any).encoder = mpegEncoder
  ; (AudioRecorder as any).prototype.mimeType = 'audio/mpeg'
if (typeof (window as any).MediaRecorder === 'undefined') {
  ; (window as any).MediaRecorder = AudioRecorder
}

const SpeechEvaluation = () => {
  const { toast } = useToast()
  const [languages, setLanguages] = useState<{ value: string; label: string; sampleQuestions: string[] }[]>([]);
  const [isLangLoading, setIsLangLoading] = useState<boolean>(true);

  const [selectedLanguage, setSelectedLanguage] = useState("en-IN")
  const [sampleTexts, setSampleTexts] = useState<string[]>([])
  const [selectedText, setSelectedText] = useState("")
  const [customText, setCustomText] = useState("")
  const [attemptCount, setAttemptCount] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [showResultDetail, setShowResultDetail] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [speakingAttemptCount, setSpeakingAttemptCount] = useState(0)
  const [isSubmittingReading, setIsSubmittingReading] = useState(false)
  const [isSubmittingSpeaking, setIsSubmittingSpeaking] = useState(false)
  // Speaking-specific state
  const [speakingLanguages, setSpeakingLanguages] = useState<{ value: string; label: string; sampleQuestions: string[] }[]>([])
  const [selectedSpeakingLanguage, setSelectedSpeakingLanguage] = useState("")
  const [speakingTopics, setSpeakingTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState("")
  const [isSpeakingResultVisible, setIsSpeakingResultVisible] = useState(false)
  const [speakingHasAudio, setSpeakingHasAudio] = useState(false)
  // Track active tab to trigger data fetch when switching to Speaking
  const [activeTab, setActiveTab] = useState<'reading' | 'speaking'>("reading")
  const [pendingTab, setPendingTab] = useState<'reading' | 'speaking' | null>(null)

  // Recording/File upload logic state (shared)
  const [recordingStatus, setRecordingStatus] = useState<'inactive' | 'recording'>("inactive")
  const [seconds, setSeconds] = useState(0)
  const [readingRecordedDuration, setReadingRecordedDuration] = useState<number | null>(null)
  const [audioSelected, setAudioSelected] = useState<'recorded' | 'uploaded' | ''>('')
  const [serverAudioFile, setServerAudioFile] = useState<File | null>(null)
  const [uploadedAudioFile, setUploadedAudioFile] = useState<File | null>(null)
  const [audio, setAudio] = useState<string>("")
  const [isRecordingTouched, setIsRecordingTouched] = useState(false)

  const recordingInterval = useRef<NodeJS.Timeout | null>(null)
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null)
  const playbackInterval = useRef<NodeJS.Timeout | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const timeoutInterval = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerCountInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileUploadRef = useRef<HTMLInputElement | null>(null)
  // Avoid showing the unsaved popup repeatedly during the same unsaved session
  const suppressUnsavedRef = useRef<boolean>(false)
  const prevUnsavedRef = useRef<boolean>(false)
  // When true, skip one unsaved-warning cycle (used after explicit submit)
  const skipUnsavedOnceRef = useRef<boolean>(false)

  // MediaRecorder listener refs to safely remove/rebind
  const dataHandlerRef = useRef<((e: BlobEvent) => void) | null>(null)
  const stopHandlerRef = useRef<(() => void) | null>(null)
  // Periodic flush to force dataavailable in some environments
  const requestDataIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Attempts/result state
  // Audio playback state for result preview
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Track object URL created for playback/download so we can revoke it
  const playbackObjectUrlRef = useRef<string | null>(null)
  const [duration, setDuration] = useState(0) // seconds

  // Toggle play/pause using the native audio element. If the current audio src
  // is a remote HTTP(S) URL, fetch it as a blob first and play the local object URL
  const togglePlayPause = async () => {
    const el = audioRef.current
    if (!el) return

    try {
      // If the source is remote (http/https) and not already a blob URL, fetch it
      const currentSrc = el.src || audio
      if (currentSrc && /^https?:\/\//i.test(currentSrc) && !currentSrc.startsWith('blob:')) {
        try {
          // Fetch audio as blob with credentials to respect auth cookies
          const fetched = await fetch(currentSrc, { cache: 'no-store', credentials: 'include' })
          if (!fetched.ok) throw new Error(`Failed to fetch audio (${fetched.status})`)
          const audioBlob = await fetched.blob()
          // Revoke previous object URL if any
          if (playbackObjectUrlRef.current) {
            try { URL.revokeObjectURL(playbackObjectUrlRef.current) } catch { }
            playbackObjectUrlRef.current = null
          }
          const objectUrl = URL.createObjectURL(audioBlob)
          playbackObjectUrlRef.current = objectUrl
          el.src = objectUrl
        } catch (err) {
          console.error('Failed to fetch audio for inline playback:', err)
          // Fall back to whatever src is set; playback may still work or fail silently
        }
      }

      if (isPlaying) {
        el.pause()
        setIsPlaying(false)
      } else {
        await el.play()
        setIsPlaying(true)
      }
    } catch (err) {
      console.error('Playback error', err)
      setIsPlaying(false)
    }
  }

  // Submit Speaking assessment: send binary audio file and metadata with Bearer token
  const submitSpeakingAssessment = async () => {
    try {
      if (isSubmittingSpeaking) return
      setIsSubmittingSpeaking(true)
      // Skip unsaved prompt while/after submitting
      skipUnsavedOnceRef.current = true
      suppressUnsavedRef.current = true
      // Validate inputs
      if (!selectedTopic) {
        toast({ title: 'Missing topic', description: 'Please select a sample topic.' })
        return
      }
      if (!selectedSpeakingLanguage) {
        toast({ title: 'Missing language', description: 'Please choose a language.' })
        return
      }
      const file: File | null = audioSelected === 'recorded' ? serverAudioFile : uploadedAudioFile
      if (!file) {
        toast({ title: 'Missing audio', description: 'Record or upload an audio file before submitting.' })
        return
      }

      const compatibleFile = await ensureCompatibleAudio(file)

      const formData = new FormData()
      // Match exact field names from your working old project
      formData.append('UserId', '11111111-1111-1111-1111-111111111111')
      formData.append('AudioFile', compatibleFile)
      formData.append('Type', 'Speaking')
      formData.append('QuestionText', selectedTopic)
      formData.append('Language', selectedSpeakingLanguage)

      // No auth required now - use API_BASE directly
      const submitUrl = `${SPEECH_EVAL_API_URL}/assessments`
      const res = await fetch(submitUrl, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        body: formData,
      })
      if (!res.ok) {
        const msg = await res.text()
        console.error('[speaking] 400 error details:', { status: res.status, response: msg })
        // Log FormData for debugging
        const formEntries: any[] = []
        for (const [key, value] of formData.entries()) {
          formEntries.push({ key, value: value instanceof File ? `File(${value.name}, ${value.size}b)` : value })
        }
        console.error('[speaking] FormData sent:', formEntries)
        throw new Error(msg || 'Failed to submit assessment')
      }
      toast({ title: 'Submitted', description: 'Your audio has been submitted successfully.' })
      // Do not open the Speaking Assessment Result automatically; user will click "Show Result" to view it.

      // Refresh speaking attempts list
      try { await fetchSpeakingAttempts() } catch { }

      // Clear unsaved state so tab switch does not warn after submit
      resetRecording()
      setAudioSelected('')
      setSpeakingHasAudio(false)
    } catch (err: any) {
      toast({ title: 'Submit error', description: err?.message || 'Something went wrong.' })
    } finally {
      setIsSubmittingSpeaking(false)
      // Allow tab switch without prompt immediately after submit
      setTimeout(() => { skipUnsavedOnceRef.current = false; suppressUnsavedRef.current = false }, 500)
    }
  }

  // Speaking handler aligned to provided reference (toggle start/stop)
  const handleSpeakingRecordAudio = async () => {
    try {
      if (audioSelected === 'uploaded') return
      if (recordingStatus === 'inactive') {
        // Preflight: see current microphone permission state if supported
        try {
          const perm: any = await (navigator as any).permissions?.query?.({ name: 'microphone' as any })
          if (perm?.state) {
            console.debug('[reading] mic permission state:', perm.state)
          }
        } catch { }
        let audioChunksLoaded: Array<Blob> = []
        // clear any previous chunks before a fresh start
        audioChunks.current = []
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        let mediaRecorder: MediaRecorder
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        } catch {
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/mpeg' })
          } catch {
            mediaRecorder = new MediaRecorder(stream)
          }
        }
        recorderRef.current = mediaRecorder
        streamRef.current = stream
        // (re)bind listeners
        if (dataHandlerRef.current) {
          try { mediaRecorder.removeEventListener('dataavailable', dataHandlerRef.current as any) } catch { }
        }
        if (stopHandlerRef.current) {
          try { mediaRecorder.removeEventListener('stop', stopHandlerRef.current as any) } catch { }
        }
        const onError = (e: any) => {
          console.error('[speaking] MediaRecorder error', e?.error || e)
        }
        const onData = (event: BlobEvent) => {
          const part = (event as any).data || (event as any)
          if (part && part.size > 0) {
            audioChunksLoaded.push(part as Blob)
            audioChunks.current = [...audioChunksLoaded]
          }
        }

        const onStop = async () => {
          if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
          if (timerCountInterval.current) { clearInterval(timerCountInterval.current); timerCountInterval.current = null }
          // UI state cleanup for consistency
          if (requestDataIntervalRef.current) { clearInterval(requestDataIntervalRef.current); requestDataIntervalRef.current = null }
          setIsRecording(false)
          setIsPaused(false)
          setRecordingTime(0)
          // Release microphone tracks
          try { stream.getTracks().forEach(t => t.stop()) } catch { }
          const total = audioChunks.current.reduce((a, b) => a + b.size, 0)
          if (!total) {
            setRecordingStatus('inactive')
            setAudioSelected('')
            toast({ title: 'No audio captured', description: 'Please try recording again.' })
            try { mediaRecorder.removeEventListener('dataavailable', onData as any) } catch { }
            try { mediaRecorder.removeEventListener('stop', onStop as any) } catch { }
            try { mediaRecorder.removeEventListener('error', onError as any) } catch { }
            return
          }
          const mimeType = (audioChunks.current[0] as any)?.type || 'audio/mpeg'
          const audioBlob = new Blob(audioChunks.current, { type: mimeType })
          audioChunks.current = []
          audioChunksLoaded = []
          const fileName = mimeType.includes('mpeg') ? 'my-audio.mp3' : 'my-audio.webm'
          const fileAudioBlob = new File([audioBlob], fileName, { type: mimeType })
          setServerAudioFile(fileAudioBlob)
          const prevUrl = audio
          const audioUrl = URL.createObjectURL(audioBlob)
          setAudio(audioUrl)
          if (prevUrl) setTimeout(() => URL.revokeObjectURL(prevUrl), 500)
          setRecordingStatus('inactive')
          setAudioSelected('recorded')

          const arrayBuffer = await audioBlob.arrayBuffer()
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
          const audioCtx = new AudioCtx()
          const decoded = await audioCtx.decodeAudioData(arrayBuffer)
          const durationSec = decoded.duration
          //setReadingRecordedDuration(durationSec)
          // setDuration(durationSec)

          setReadingRecordedDuration(durationSec)
          setDuration(durationSec)
          setSeconds(0)
          setSpeakingHasAudio(true)
          //console.log('[reading] decoded duration1:', seconds)
          //console.log('[speaking] stop -> bytes:', fileAudioBlob.size, 'kb:', Math.round((fileAudioBlob.size / 1024) * 10) / 10, 'mime:', mimeType)
          toast({ title: 'Recording complete', description: ` Click Submit or Reset to try again.` })
          try { mediaRecorder.removeEventListener('dataavailable', onData as any) } catch { }
          try { mediaRecorder.removeEventListener('stop', onStop as any) } catch { }
          try { mediaRecorder.removeEventListener('error', onError as any) } catch { }
        }

        mediaRecorder.addEventListener('dataavailable', onData as any)
        mediaRecorder.addEventListener('stop', onStop as any)
        mediaRecorder.addEventListener('error', onError as any)
        dataHandlerRef.current = onData
        stopHandlerRef.current = onStop

        mediaRecorder.start(250)
        // start periodic requestData flush
        if (requestDataIntervalRef.current) { clearInterval(requestDataIntervalRef.current) }
        requestDataIntervalRef.current = setInterval(() => {
          try { mediaRecorder.requestData?.() } catch { }
        }, 1000)
        setRecordingStatus('recording')
        setIsRecordingTouched(true)

        if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
        timeoutInterval.current = setTimeout(() => {
          try { mediaRecorder.requestData?.() } catch { }
          mediaRecorder.stop()
        }, 20000)
        if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
        timerCountInterval.current = setInterval(() => setSeconds(prev => prev + 1), 1000)
      }
      else if (recordingStatus === 'recording') {
        // Flush any pending data and stop
        try { recorderRef.current?.requestData?.() } catch { }
        if (requestDataIntervalRef.current) { clearInterval(requestDataIntervalRef.current); requestDataIntervalRef.current = null }
        recorderRef.current?.stop()
      }
    } catch (e) {
      console.error('Speaking record error', e)
      toast({ title: 'Recording error', description: 'Microphone not available or permission denied.' })
    }
  }

  // Download the current audio as a blob and trigger a download without navigating away.
  // Download the current audio as a blob and trigger a download without navigating away.
  const handleDownloadAudio = async () => {
    const src = audioRef.current?.src || audio
    if (!src) return

    try {
      // If the src is already a blob URL, download directly by fetching it
      if (src.startsWith('blob:')) {
        const fetched = await fetch(src)
        const blob = await fetched.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = 'my-audio.mp3'
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 500)
        return
      }

      // For remote URLs (Show Result audio), fetch as blob so we can download without leaving page
      // For remote URLs (Show Result audio), just create a download link without fetch
      if (/^https?:\/\//i.test(src)) {
        const a = document.createElement('a')
        a.href = src
        a.download = 'my-audio.mp3'
        // open in same tab; with download attribute most browsers just download
        a.target = '_self'
        document.body.appendChild(a)
        a.click()
        a.remove()
        return
      }
    } catch (err: any) {
      console.error('Download failed', err)
      toast({ title: 'Download failed', description: err?.message || 'Unable to download audio' })
    }
  }

  // On metadata loaded set duration
  const handleLoadedMetadata = () => {
    const el = audioRef.current
    if (!el) return
    // Use the full duration of the audio
    const raw = Number.isFinite(el.duration) ? el.duration : 0
    setDuration(raw)
  }

  // Keep playback time in sync with the audio element
  // Re-bind listeners whenever the audio source changes so listeners are
  // attached even if the audio element was not mounted at initial component mount.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => {
      const ct = el.currentTime || 0
      setPlaybackTime(ct)
    }
    const onEnd = () => {
      setIsPlaying(false)
      setPlaybackTime(0)
      try { el.currentTime = 0 } catch { }
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    return () => {
      try { el.removeEventListener('timeupdate', onTime) } catch { }
      try { el.removeEventListener('ended', onEnd) } catch { }
    }
    // Re-run effect when `audio` changes so listeners attach to the current element
  }, [audio])

  // Reset on new audio source
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    setIsPlaying(false)
    setPlaybackTime(0)
  }, [audio])

  // Format mm:ss
  const formatTime = (t: number) => {
    if (!t || Number.isNaN(t)) return '00:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    const mm = m < 10 ? `0${m}` : `${m}`
    const ss = s < 10 ? `0${s}` : `${s}`
    return `${mm}:${ss}`
  }

  // Progress value for <Progress> based on a 20s cap
  const progressValue = (playbackTime / 20) * 100
  // Use actual clip duration (capped in handleLoadedMetadata) for UI progress
  const progressValueDynamic = duration > 0 ? (playbackTime / duration) * 100 : 0
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null)
  const [resultLoading, setResultLoading] = useState(false)
  const [resultError, setResultError] = useState<string | null>(null)
  type AssessmentResult = {
    Id: string
    RecognitionStatus: string
    Offset: number
    Duration: number
    Channel: number
    DisplayText?: string
    SNR?: number
    NBest?: Array<{
      Confidence?: number
      Display?: string
      PronunciationAssessment?: {
        AccuracyScore?: number
        FluencyScore?: number
        ProsodyScore?: number
        CompletenessScore?: number
        PronScore?: number
      }
      Words?: Array<{ Word: string }>
    }>
  }
  const [resultData, setResultData] = useState<AssessmentResult | null>(null)

  // Error analysis derived state, computed after render to avoid TDZ
  const [errorAnalysis, setErrorAnalysis] = useState({ mispronCount: 0, omissionCount: 0, insertionCount: 0, unexpectedBreak: 0, missingBreak: 0, monotone: 0 })
  useEffect(() => {
    const base = { mispronCount: 0, omissionCount: 0, insertionCount: 0, unexpectedBreak: 0, missingBreak: 0, monotone: 0 }
    try {
      const nbest0: any = (resultData as any)?.NBest?.[0]
      const words: any[] = Array.isArray(nbest0?.Words) ? nbest0.Words : []
      for (const w of words) {
        const err = (w?.ErrorType || w?.errorType || '').toString().toLowerCase()
        if (err.includes('mispron')) base.mispronCount += 1
        else if (err.includes('omiss')) base.omissionCount += 1
        else if (err.includes('insert')) base.insertionCount += 1
        else if (err.includes('unexpected') && err.includes('break')) base.unexpectedBreak += 1
        else if ((err.includes('missing') || err.includes('lack')) && err.includes('break')) base.missingBreak += 1
      }
      const prosody = nbest0?.PronunciationAssessment?.ProsodyScore
      if (typeof prosody === 'number' && prosody < 50) base.monotone = Math.max(base.monotone, 1)
    } catch { }
    setErrorAnalysis(base)
  }, [resultData])


  // Centralized API base: '/api' in dev (proxied), absolute URL in production
  const API_BASE = getApiBase()

  // Guard: if running in production and API_BASE is relative, warn so we don't hit the app origin
  useEffect(() => {
    if (!import.meta.env.DEV && (API_BASE === '' || API_BASE.startsWith('/'))) {
      console.error('[SpeechEvaluation] Invalid API base in production:', API_BASE)
      console.error('Set VITE_API_BASE to an absolute URL like https://ai.excelsoftcorp.com/ai-apps/api')
    }
  }, [API_BASE])

  // Auth removed – endpoints do not require tokens

  // Ref and helper for smooth scrolling to the Reading "Error Analysis" section
  const errorAnalysisRef = useRef<HTMLDivElement | null>(null)
  const scrollToErrorAnalysis = () => {
    try {
      const el = errorAnalysisRef.current
      if (!el) return
      const headerOffset = 80
      const y = el.getBoundingClientRect().top + window.pageYOffset - headerOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    } catch { }
  }

  // Speaking: smooth scroll to Error Analysis
  const speakingErrorAnalysisRef = useRef<HTMLDivElement | null>(null)
  const scrollToSpeakingError = () => {
    try {
      const el = speakingErrorAnalysisRef.current
      if (!el) return
      const headerOffset = 80
      const y = el.getBoundingClientRect().top + window.pageYOffset - headerOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    } catch { }
  }

  // After panels become visible AND data is loaded, scroll to Error Analysis
  useEffect(() => {
    if (showResultDetail && !resultLoading) {
      requestAnimationFrame(() => scrollToErrorAnalysis())
    }
  }, [showResultDetail, resultLoading])

  useEffect(() => {
    if (isSpeakingResultVisible && !resultLoading) {
      requestAnimationFrame(() => scrollToSpeakingError())
    }
  }, [isSpeakingResultVisible, resultLoading])

  const handleShowResult = async (assessmentId: string) => {
    try {
      setSelectedAttemptId(assessmentId)
      // Open the correct result panel based on the active tab
      if (activeTab === 'speaking') {
        setIsSpeakingResultVisible(true)
        // Scroll to Speaking Error Analysis after panel renders
        setTimeout(scrollToSpeakingError, 150)
      } else {
        setShowResultDetail(true)
        // Scroll to Error Analysis after the panel renders
        setTimeout(scrollToErrorAnalysis, 150)
      }
      setResultError(null)
      setResultLoading(true)
      setResultData(null)
      const endpoint = `${SPEECH_EVAL_API_URL}/assessments/${assessmentId}/result?_=${Date.now()}`
      const res = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
      if (!res.ok) throw new Error(`Result fetch failed (${res.status})`)
      const data: AssessmentResult = await res.json()
      setResultData(data)

      // Try to fetch assessment details to resolve server audio URL for playback
      try {
        // Use access token for details as well
        const detailsUrl = `${SPEECH_EVAL_API_URL}/assessments/${assessmentId}?_=${Date.now()}`
        const detailsRes = await fetch(detailsUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
        if (detailsRes.ok) {
          const details: any = await detailsRes.json()
          // Heuristics to find an audio URL or file name/id
          const audioUrl: string | undefined = details.audioUrl || details.audioURL || details.audio || details.audioLink
          const audioFile: string | undefined = details.audioFileName || details.audioFile || details.fileName || details.audioId
          if (audioUrl && typeof audioUrl === 'string') {
            const sep = audioUrl.includes('?') ? '&' : '?'
            setAudio(`${audioUrl}${sep}_=${Date.now()}`)
          } else if (audioFile && typeof audioFile === 'string') {
            const hasExt = /\.(mp3|wav|m4a|aac)$/i.test(audioFile)
            const finalName = hasExt ? audioFile : `${audioFile}.mp3`
            setAudio(`${SPEECH_EVAL_API_URL}/audio_files/${finalName}?_=${Date.now()}`)
          }
        }
      } catch (e) {
        // Non-fatal if details fetch fails; keep any existing audio
      }
    } catch (e: any) {
      console.error('Load result error', e)
      setResultError(e?.message || 'Unable to load result')
    } finally {
      setResultLoading(false)
    }
  }

  // Recording helpers (fixed to 20s recording; preview playback capped to 7s)
  const durationLimitSec = 20

  const clearTimers = () => {
    if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
    if (timerCountInterval.current) { clearInterval(timerCountInterval.current); timerCountInterval.current = null }
  }

  const stopMediaTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const resetAudio = () => {
    if (audio) try { URL.revokeObjectURL(audio) } catch { }
    if (playbackObjectUrlRef.current) try { URL.revokeObjectURL(playbackObjectUrlRef.current) } catch { }
    playbackObjectUrlRef.current = null
    setAudio('')
    setServerAudioFile(null)
    setUploadedAudioFile(null)
    setAudioSelected('')
    setSeconds(0)
    // Clear the hidden file input so selecting the same file triggers onChange again
    try { if (fileUploadRef.current) (fileUploadRef.current as any).value = '' } catch { }
    // Reset preview playback state
    try {
      const el = audioRef.current
      if (el) { el.pause(); el.currentTime = 0 }
    } catch { }
  }

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        setIsLangLoading(true)
        const url = `${SPEECH_EVAL_API_URL}/assessments/languages?_=${Date.now()}`
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        });
        const data = await response.json();
        const readingLanguages = data.reading.map((lang: any) => ({
          value: lang.language,
          label: lang.languageName,
          sampleQuestions: lang.sampleQuestions,
        }));
        setLanguages(readingLanguages);

        const defaultLang = readingLanguages.find((lang: any) => lang.value === 'en-IN');
        if (defaultLang) {
          setSampleTexts(defaultLang.sampleQuestions);
          setSelectedText(defaultLang.sampleQuestions[0] || '');
        }

        // Prepare speaking languages separately
        const apiSpeaking = Array.isArray(data.speaking) ? data.speaking : []
        const mappedSpeaking = apiSpeaking.map((lang: any) => ({
          value: lang.language,
          label: lang.languageName,
          sampleQuestions: Array.isArray(lang.sampleQuestions) ? lang.sampleQuestions : [],
        }))
        setSpeakingLanguages(mappedSpeaking)
        // Prefer English (United States) if present; else first option; else empty string
        const defaultSpeaking = mappedSpeaking.find((l: any) => l.value === 'en-US') || mappedSpeaking[0]
        setSelectedSpeakingLanguage(defaultSpeaking ? defaultSpeaking.value : "")
        // Initialize topics and first topic selection for Speaking
        const initialTopics = defaultSpeaking?.sampleQuestions || []
        setSpeakingTopics(initialTopics)
        setSelectedTopic(initialTopics[0] || '')
      } catch (error) {
        console.error('Failed to fetch languages:', error);
      } finally {
        setIsLangLoading(false)
      }
    };

    fetchLanguages();
  }, [])

  const handleLanguageChange = (value: string) => {
    setSelectedLanguage(value);
    const selectedLang = languages.find(lang => lang.value === value);
    if (selectedLang) {
      setSampleTexts(selectedLang.sampleQuestions);
      setSelectedText(selectedLang.sampleQuestions[0] || '');
    } else {
      setSampleTexts([]);
      setSelectedText('');
    }
  };

  // Speaking: set language, derive topics, and select first topic
  const handleSpeakingLanguageChange = (value: string) => {
    setSelectedSpeakingLanguage(value)
    const lang = speakingLanguages.find((l: any) => l.value === value)
    const topics = lang?.sampleQuestions || []
    setSpeakingTopics(topics)
    setSelectedTopic(topics[0] || '')
  }



  type AttemptRow = {
    id: string
    text: string
    language: string
    createdDate: string
    status: string
    result: string
  }
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [attemptsError, setAttemptsError] = useState<string | null>(null)
  // Speaking attempts state
  const [speakingAttempts, setSpeakingAttempts] = useState<AttemptRow[]>([])
  const [speakingAttemptsLoading, setSpeakingAttemptsLoading] = useState(false)
  const [speakingAttemptsError, setSpeakingAttemptsError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        setAttemptsLoading(true)
        setAttemptsError(null)
        const userId = '11111111-1111-1111-1111-111111111111'
        const url = `${SPEECH_EVAL_API_URL}/assessments?userId=${encodeURIComponent(userId)}&type=Reading&_=${Date.now()}`
        const res = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
        if (!res.ok) throw new Error(`Failed to load attempts (${res.status})`)
        const data: any[] = await res.json()
        const mapped: AttemptRow[] = (data || []).map(item => ({
          id: item.id,
          text: String(item.questionText ?? '').trim(),
          language: item.languageName ?? item.language ?? '',
          createdDate: new Date(item.createdDate).toLocaleString(),
          status: item.status ?? '—',
          result: 'Show Result',
        }))
        setAttempts(mapped)
      } catch (e: any) {
        console.error('Load attempts error', e)
        setAttemptsError(e?.message || 'Unable to load attempts')
      } finally {
        setAttemptsLoading(false)
      }
    }
    fetchAttempts()
  }, [])

  // Fetch Speaking attempts dynamically
  const fetchSpeakingAttempts = async () => {
    try {
      setSpeakingAttemptsLoading(true)
      setSpeakingAttemptsError(null)
      const userId = '11111111-1111-1111-1111-111111111111'
      const url = `${SPEECH_EVAL_API_URL}/assessments?userId=${encodeURIComponent(userId)}&type=Speaking&_=${Date.now()}`
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
      if (!res.ok) throw new Error(`Failed to load speaking attempts (${res.status})`)
      const data: any[] = await res.json()
      const mapped: AttemptRow[] = (data || []).map(item => ({
        id: item.id,
        text: String(item.questionText ?? '').trim(),
        language: item.languageName ?? item.language ?? '',
        createdDate: new Date(item.createdDate).toLocaleString(),
        status: item.status ?? '—',
        result: 'Show Result',
      }))
      setSpeakingAttempts(mapped)
    } catch (e: any) {
      console.error('Load speaking attempts error', e)
      setSpeakingAttemptsError(e?.message || 'Unable to load speaking attempts')
    } finally {
      setSpeakingAttemptsLoading(false)
    }
  }

  // Trigger fetch when the Speaking tab becomes active
  useEffect(() => {
    if (activeTab === 'speaking' && !speakingAttemptsLoading && speakingAttempts.length === 0 && !speakingAttemptsError) {
      fetchSpeakingAttempts()
    }
  }, [activeTab])

  const handleTextSelect = (text: string) => {
    setSelectedText(text)
    setCustomText("")
  }

  const handleCustomTextConfirm = () => {
    if (customText.trim()) {
      setSelectedText(customText.trim())
    }
  }

  // Start/Stop recording using MediaRecorder for up to 20s, producing an mp3 file
  const startRecording = () => {
    handleRecordAudio()
  }

  const handleRecordAudio = async () => {
    try {
      // Require either selected sample text or custom text before recording
      if (!selectedText && !customText.trim()) {
        toast({
          title: "Please select or enter a text first",
          description: "Pick a sample text or type your own before starting the recording.",
        })
        return
      }
      if (audioSelected === 'uploaded') return
      if (recordingStatus === 'inactive') {
        // Always acquire a fresh stream and recorder for Reading to avoid stale stream reuse
        let audioChunksLoaded: Array<Blob> = []
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        // Pick best supported mime type
        const prefer = ['audio/webm;codecs=opus', 'audio/mpeg']
        let opted: MediaRecorder
        const can = (mt: string) => (typeof (window as any).MediaRecorder?.isTypeSupported === 'function') && (window as any).MediaRecorder.isTypeSupported(mt)
        try {
          if (can(prefer[0])) opted = new MediaRecorder(stream, { mimeType: prefer[0] })
          else if (can(prefer[1])) opted = new MediaRecorder(stream, { mimeType: prefer[1] })
          else opted = new MediaRecorder(stream)
        } catch {
          // Fallback chain if isTypeSupported missing or throws
          try { opted = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' }) } catch {
            try { opted = new MediaRecorder(stream, { mimeType: 'audio/mpeg' }) } catch { opted = new MediaRecorder(stream) }
          }
        }
        recorderRef.current = opted
        streamRef.current = stream
        setIsRecording(true)
        setIsPaused(false)
        setRecordingTime(0)
        if (recordingInterval.current) { clearInterval(recordingInterval.current); recordingInterval.current = null }
        recordingInterval.current = setInterval(() => {
          setRecordingTime(prev => {
            if (prev >= 200) return 200
            return prev + 1
          })
        }, 100)
        if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
        timeoutInterval.current = setTimeout(() => {
          try { recorderRef.current?.requestData?.() } catch { }
          recorderRef.current?.stop()
        }, durationLimitSec * 1000)
        if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
        timerCountInterval.current = setInterval(() => setSeconds(prev => prev + 1), 1000)
        setRecordingStatus('recording')
        setIsRecordingTouched(true)

        const onData = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            audioChunksLoaded.push(event.data)
          }
          audioChunks.current = [...audioChunksLoaded]
        }
        const onStop = async () => {
          clearTimers()
          setIsRecording(false)
          setIsPaused(false)
          if (recordingInterval.current) {
            clearInterval(recordingInterval.current)
            recordingInterval.current = null
          }
          setRecordingTime(0)
          try { stream.getTracks().forEach(t => t.stop()) } catch { }

          const total = audioChunks.current.reduce((a, b) => a + b.size, 0)
          if (!total) {
            setRecordingStatus('inactive')
            setAudioSelected('')
            toast({ title: 'No audio captured', description: 'Please try recording again.' })
            try { opted.removeEventListener('dataavailable', onData as any) } catch { }
            try { opted.removeEventListener('error', onError as any) } catch { }
            try { opted.removeEventListener('stop', onStop as any) } catch { }
            return
          }

          const mimeType = (audioChunks.current[0] as any)?.type || 'audio/webm'
          const audioBlob = new Blob(audioChunks.current, { type: mimeType })
          audioChunks.current = []
          audioChunksLoaded = []
          const fileName = mimeType.includes('mpeg') ? 'my-audio.mp3' : 'my-audio.webm'
          const fileAudioBlob = new File([audioBlob], fileName, { type: mimeType })
          setServerAudioFile(fileAudioBlob)

          const prevUrl = audio
          const audioUrl = URL.createObjectURL(audioBlob)
          setAudio(audioUrl)
          if (prevUrl) setTimeout(() => URL.revokeObjectURL(prevUrl), 500)

          setRecordingStatus('inactive')
          setAudioSelected('recorded')

          // Compute real duration from the audio blob
          try {
            const arrayBuffer = await audioBlob.arrayBuffer()
            const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
            const audioCtx = new AudioCtx()
            const decoded = await audioCtx.decodeAudioData(arrayBuffer)
            const durationSec = decoded.duration
            setReadingRecordedDuration(durationSec)
            setDuration(durationSec)
          } catch (e) {
            console.warn('[reading] failed to decode blob for duration, falling back to seconds:', seconds, e)
            setReadingRecordedDuration(seconds)
            setDuration(seconds)
          }

          setSeconds(0)
          setAttemptCount(prev => prev + 1)
          // console.log(
          //   '[reading] stop -> bytes:',
          //   fileAudioBlob.size,
          //   'kb:',
          //   Math.round((fileAudioBlob.size / 1024) * 10) / 10,
          //   'mime:',
          //   mimeType
          // )
          toast({
            title: 'Recording complete',
            description: 'Recording has been completed, please click on Submit OR Reset to try again.'
          })

          try { opted.removeEventListener('dataavailable', onData as any) } catch { }
          try { opted.removeEventListener('error', onError as any) } catch { }
          try { opted.removeEventListener('stop', onStop as any) } catch { }
        }
        const onError = (e: any) => { console.error('[reading] MediaRecorder error', e?.error || e) }
        opted.addEventListener('dataavailable', onData as any)
        opted.addEventListener('stop', onStop as any)
        opted.addEventListener('error', onError as any)
        opted.start(250)
      }
      else if (recordingStatus === 'recording') {
        recorderRef.current?.stop()
      }
    } catch (e) {
      const name = (e as any)?.name || 'Error'
      const msg = (e as any)?.message || String(e)
      console.error('[reading] Recording error:', name, msg, e)
      let hint = 'Microphone not available or permission denied.'
      if (name === 'NotAllowedError') hint = 'Microphone permission was denied. Please allow mic access in your browser settings and try again.'
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') hint = 'No microphone was found. Please connect a microphone and try again.'
      else if (name === 'NotReadableError') hint = 'Microphone is in use by another application. Close other apps using the mic and try again.'
      else if (name === 'SecurityError') hint = 'Microphone requires a secure context (HTTPS or localhost). Please use HTTPS or run locally.'
      toast({ title: 'Recording error', description: hint })
      setRecordingStatus('inactive')
      clearTimers()
      stopMediaTracks()
    }
  }

  const startSpeakingRecording = () => {
    if (isRecording) return
    setIsRecording(true)
    setIsPaused(false)
    setRecordingTime(0)

    // Kick off actual MediaRecorder for Speaking using reference-aligned handler
    handleSpeakingRecordAudio()

    // Recording timer - 20 seconds for speaking mode visuals
    if (recordingInterval.current) { clearInterval(recordingInterval.current); recordingInterval.current = null }
    recordingInterval.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 199) {
          stopRecording()
          return 200
        }
        return prev + 1
      })
    }, 100)

    // Audio level animation
    if (audioLevelInterval.current) { clearInterval(audioLevelInterval.current); audioLevelInterval.current = null }
    audioLevelInterval.current = setInterval(() => {
      setAudioLevel(Math.random() * 100)
    }, 100)
  }

  // Speaking-specific recorder (mirrors reference behavior, 20s limit)
  const startSpeakingMediaRecorder = async () => {
    try {
      let audioChunksLoaded: Blob[] = []
      if (isRecordingTouched && recorderRef.current) {
        // Reuse existing recorder
        try { recorderRef.current.requestData?.() } catch { }
        recorderRef.current.start(250)
        // ensure we stop at 20s
        if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
        timeoutInterval.current = setTimeout(() => {
          try { recorderRef.current?.requestData() } catch { }
          recorderRef.current?.stop()
        }, 20000)
        if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
        timerCountInterval.current = setInterval(() => setSeconds(prev => prev + 1), 1000)
        setRecordingStatus('recording')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      let mediaRecorder: MediaRecorder
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/mpeg' })
      } catch {
        mediaRecorder = new MediaRecorder(stream)
      }
      recorderRef.current = mediaRecorder
      streamRef.current = stream
      setRecordingStatus('recording')
      setIsRecordingTouched(true)

      const onData = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksLoaded.push(event.data)
        }
        audioChunks.current = [...audioChunksLoaded]
      }
      const onStop = async () => {
        // Clear timers
        if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
        if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
        if (recordingInterval.current) { clearInterval(recordingInterval.current); recordingInterval.current = null }

        setIsRecording(false)
        setIsPaused(false)
        setRecordingTime(0)

        const totalSize = audioChunks.current.reduce((acc, b) => acc + b.size, 0)
        if (!totalSize) {
          setRecordingStatus('inactive')
          setAudioSelected('')
          toast({ title: 'No audio captured', description: 'Please try recording again.' })
          try { mediaRecorder.removeEventListener('dataavailable', onData as any) } catch { }
          try { mediaRecorder.removeEventListener('stop', onStop as any) } catch { }
          return
        }
        const mimeType = (audioChunks.current[0] as any)?.type || 'audio/webm'
        const audioBlob = new Blob(audioChunks.current, { type: mimeType })
        audioChunks.current = []
        audioChunksLoaded = []
        const fileName = mimeType.includes('mpeg') ? 'my-audio.mp3' : 'my-audio.webm'
        const fileAudioBlob = new File([audioBlob], fileName, { type: mimeType })
        setServerAudioFile(fileAudioBlob)
        const prevUrl = audio
        const audioUrl = URL.createObjectURL(audioBlob)
        setAudio(audioUrl)
        if (prevUrl) setTimeout(() => URL.revokeObjectURL(prevUrl), 500)
        setRecordingStatus('inactive')
        setAudioSelected('recorded')
        setReadingRecordedDuration(seconds)
        //console.log('[reading] decoded duration2:', seconds)
        setDuration(seconds)
        setSeconds(0)


        setSpeakingHasAudio?.(true)
        toast({ title: 'Recording complete', description: 'Recording has been completed, please click on Submit OR Reset to try again.' })
      }

      mediaRecorder.addEventListener('dataavailable', onData as any)
      mediaRecorder.addEventListener('stop', onStop as any)
      mediaRecorder.start(250)

      // safety auto-stop at 20s
      if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
      timeoutInterval.current = setTimeout(() => {
        try { mediaRecorder.requestData?.() } catch { }
        mediaRecorder.stop()
      }, 20000)
      if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
      timerCountInterval.current = setInterval(() => setSeconds(prev => prev + 1), 1000)
    } catch (e) {
      console.error('Speaking recording error', e)
      toast({ title: 'Recording error', description: 'Microphone not available or permission denied.' })
      setRecordingStatus('inactive')
      if (timeoutInterval.current) { clearTimeout(timeoutInterval.current); timeoutInterval.current = null }
      if (timerCountInterval.current) { clearInterval(timerCountInterval.current) }
    }
  }

  const pauseRecording = () => {
    setIsPaused(true)
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current)
      recordingInterval.current = null
    }
    if (audioLevelInterval.current) {
      clearInterval(audioLevelInterval.current)
      audioLevelInterval.current = null
    }
  }

  const resumeRecording = () => {
    setIsPaused(false)

    // Resume recording timer
    recordingInterval.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 199) {
          stopRecording()
          return 200
        }
        return prev + 1
      })
    }, 100)

    // Resume audio level animation
    audioLevelInterval.current = setInterval(() => {
      setAudioLevel(Math.random() * 100)
    }, 100)
  }

  const stopRecording = () => {
    setIsRecording(false)
    setIsPaused(false)
    setRecordingTime(0)
    setAudioLevel(0)
    if (recordingInterval.current) { clearInterval(recordingInterval.current); recordingInterval.current = null }
    if (audioLevelInterval.current) { clearInterval(audioLevelInterval.current); audioLevelInterval.current = null }
    if (recordingStatus === 'recording') {
      try { recorderRef.current?.requestData() } catch { }
      recorderRef.current?.stop()
    }
  }

  // File upload handlers
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    if (recordingStatus === 'recording') {
      toast({ title: 'Recording in progress', description: 'Please stop the recording before uploading a file.' })
      return
    }
    const ok = /audio\/mpeg|audio\/wav|audio\/mp3|audio\/x-m4a|audio\/m4a/i.test(file.type) || /\.(mp3|wav|m4a)$/i.test(file.name)
    if (!ok) {
      toast({ title: 'Invalid file type', description: 'Only .mp3 and .wav files are allowed.' })
      return
    }

    // Prefer using WebAudio decodeAudioData for robust duration measurement
    const objectUrl = URL.createObjectURL(file)
    let durationSec = 0
    try {
      const arrayBuf = await file.arrayBuffer()
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      // decodeAudioData may throw for some containers; wrap in try
      try {
        const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0))
        durationSec = decoded.duration || 0
      } catch (e) {
        // fallback to using HTMLAudioElement metadata
        const audioEl = new Audio(objectUrl)
        durationSec = await new Promise<number>((resolve) => {
          const cleanup = () => { try { audioEl.removeEventListener('loadedmetadata', onLoaded) } catch { } }
          const onLoaded = () => { cleanup(); resolve(Number.isFinite(audioEl.duration) ? audioEl.duration : 0) }
          audioEl.addEventListener('loadedmetadata', onLoaded, { once: true } as any)
          audioEl.addEventListener('error', () => { cleanup(); resolve(0) }, { once: true } as any)
        })
      } finally {
        try { audioCtx.close?.() } catch { }
      }
    } catch (err) {
      console.warn('Duration detection via WebAudio failed, falling back to metadata', err)
      // final fallback to HTMLAudioElement
      const audioEl = new Audio(objectUrl)
      durationSec = await new Promise<number>((resolve) => {
        const onLoaded = () => { try { audioEl.removeEventListener('loadedmetadata', onLoaded) } catch { }; resolve(Number.isFinite(audioEl.duration) ? audioEl.duration : 0) }
        audioEl.addEventListener('loadedmetadata', onLoaded, { once: true } as any)
        audioEl.addEventListener('error', () => resolve(0), { once: true } as any)
      })
    }

    // Enforce maximum duration of 20.0 seconds (recording limit)
    if (!durationSec || durationSec > 20.0) {
      URL.revokeObjectURL(objectUrl)
      toast({ title: 'Audio too long', description: 'Maximum allowed duration is 20 seconds.' })
      return
    }

    // Accept file: attach and cleanup existing audio object url
    if (audio) try { URL.revokeObjectURL(audio) } catch { }
    setUploadedAudioFile(file)
    setServerAudioFile(null)
    setAudioSelected('uploaded')
    setAudio(objectUrl)
    // Reset player state and cap preview duration to 7s via listeners
    setIsPlaying(false)
    setPlaybackTime(0)
    // Show success toast
    toast({ title: 'Audio File attached', description: `File Name : ${file.name} • ${Math.round(durationSec * 10) / 10}s` })
    // Clear file input so same file can be picked again without page refresh
    try { if (fileUploadRef.current) (fileUploadRef.current as any).value = '' } catch { }
    if (activeTab === 'speaking') {
      setSpeakingHasAudio(true)
      setIsSpeakingResultVisible(false)
    }
  }

  // Optional reset for reading flow
  const resetRecording = () => {
    if (recordingStatus === 'recording') recorderRef.current?.stop()
    clearTimers()
    stopMediaTracks()
    resetAudio()
    setReadingRecordedDuration(null)
  }

  // Submit assessment: send binary audio file and metadata with Bearer token
  const submitAssessment = async () => {
    try {
      if (isSubmittingReading) return
      setIsSubmittingReading(true)
      // Skip unsaved prompt while/after submitting
      skipUnsavedOnceRef.current = true
      suppressUnsavedRef.current = true
      const questionText = selectedText || customText.trim()
      if (!questionText) {
        toast({ title: 'Missing text', description: 'Please select or enter a text first.' })
        return
      }
      const file: File | null = audioSelected === 'recorded' ? serverAudioFile : uploadedAudioFile
      if (!file) {
        toast({ title: 'Missing audio', description: 'Record or upload an audio file before submitting.' })
        return
      }
      // Ensure the audio is in a format the server accepts (mp3/wav)
      const compatibleFile = await ensureCompatibleAudio(file)
      const formData = new FormData()
      formData.append('UserId', '11111111-1111-1111-1111-111111111111') // hardcoded per request
      formData.append('AudioFile', compatibleFile)
      formData.append('Type', 'Reading')
      formData.append('QuestionText', questionText)
      formData.append('Language', selectedLanguage)
      const submitUrl = `${SPEECH_EVAL_API_URL}/assessments`
      const res = await fetch(submitUrl, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        body: formData,
      })
      if (!res.ok) {
        const msg = await res.text()
        console.error('[reading] submit failed', { status: res.status, msg })
        throw new Error(msg || 'Failed to submit assessment')
      }
      toast({ title: 'Submitted', description: 'Your audio has been submitted successfully.' })
      // Immediately refresh the Reading attempts list to show the new result
      try {
        const userId = '11111111-1111-1111-1111-111111111111'
        const url = `${SPEECH_EVAL_API_URL}/assessments?userId=${encodeURIComponent(userId)}&type=Reading&_=${Date.now()}`
        const refreshed = await fetch(url, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
        if (refreshed.ok) {
          const data: any[] = await refreshed.json()
          const mapped: AttemptRow[] = (data || []).map(item => ({
            id: item.id,
            text: String(item.questionText ?? '').trim(),
            language: item.languageName ?? item.language ?? '',
            createdDate: new Date(item.createdDate).toLocaleString(),
            status: item.status ?? '—',
            result: 'Show Result',
          }))
          setAttempts(mapped)
        }
      } catch { }
      // Clear unsaved state so tab switch does not warn after submit
      resetRecording()
      setAudioSelected('')
      // Uploaded/recorded files cleared
      // serverAudioFile and uploadedAudioFile are reset by resetAudio() inside resetRecording()
    } catch (err: any) {
      toast({ title: 'Submit error', description: err?.message || 'Something went wrong.' })
    }
    finally {
      setIsSubmittingReading(false)
      // Allow tab switch without prompt immediately after submit
      setTimeout(() => { skipUnsavedOnceRef.current = false; suppressUnsavedRef.current = false }, 500)
    }
  }

  const handleLabelInputClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (serverAudioFile !== null || recordingStatus === 'recording') return
    fileUploadRef.current?.click()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutInterval.current) clearTimeout(timeoutInterval.current)
      if (timerCountInterval.current) clearInterval(timerCountInterval.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audio) URL.revokeObjectURL(audio)
    }
  }, [audio])

  // Always open page at top on mount
  useEffect(() => {
    try { window.scrollTo(0, 0) } catch { }
  }, [])

  // Also scroll to top when switching to Reading tab to avoid landing at the bottom
  useEffect(() => {
    if (activeTab === 'reading') {
      try { window.scrollTo(0, 0) } catch { }
    }
  }, [activeTab])
  useEffect(() => {
    // console.log(
    //   '[reading] duration states => recorded:',
    //   readingRecordedDuration,
    //   'raw duration:',
    //   duration
    // )
  }, [readingRecordedDuration, duration])
  // Unsaved/recording prompt for Reading
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false)

  // Show prompt when user switches window/tab while recording or with unsaved audio (Reading/Speaking)
  useEffect(() => {
    const hasUnsavedReading = (
      isRecording || (
        !!audioSelected && (serverAudioFile !== null || uploadedAudioFile !== null)
      )
    )
    const hasUnsavedSpeaking = (
      isRecording || speakingHasAudio
    )
    const hasUnsavedOnActiveTab = activeTab === 'reading' ? hasUnsavedReading : hasUnsavedSpeaking

    const onVisChange = () => {
      if (document.hidden && hasUnsavedOnActiveTab && !suppressUnsavedRef.current && !skipUnsavedOnceRef.current) {
        setShowUnsavedPrompt(true)
        suppressUnsavedRef.current = true
      }
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedOnActiveTab && !skipUnsavedOnceRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [activeTab, isRecording, audioSelected, serverAudioFile, uploadedAudioFile, speakingHasAudio])

  // Reset suppression ONLY when unsaved state transitions from false -> true (new unsaved session)
  useEffect(() => {
    const hasUnsaved = isRecording || !!audioSelected || speakingHasAudio || !!serverAudioFile || !!uploadedAudioFile
    if (hasUnsaved !== prevUnsavedRef.current) {
      if (hasUnsaved === true) {
        // new unsaved session begins; allow one prompt
        suppressUnsavedRef.current = false
      } else {
        // unsaved cleared; reset trackers
        suppressUnsavedRef.current = false
      }
      prevUnsavedRef.current = hasUnsaved
    }
  }, [isRecording, audioSelected, speakingHasAudio, serverAudioFile, uploadedAudioFile])

  // When recording stops but unsaved data remains, ensure the prompt can appear once
  const prevIsRecordingRef = useRef<boolean>(false)
  useEffect(() => {
    const hadRecording = prevIsRecordingRef.current
    const nowRecording = isRecording
    const hasUnsavedNow = (!!audioSelected) || (!!serverAudioFile) || (!!uploadedAudioFile) || speakingHasAudio
    if (hadRecording && !nowRecording && hasUnsavedNow) {
      // Recording just ended and we still have unsaved data; allow prompt on next tab switch
      suppressUnsavedRef.current = false
    }
    prevIsRecordingRef.current = nowRecording
  }, [isRecording, audioSelected, serverAudioFile, uploadedAudioFile, speakingHasAudio])

  const globalLoading = isLangLoading || resultLoading || attemptsLoading || speakingAttemptsLoading || isSubmittingReading || isSubmittingSpeaking;
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20">
      {globalLoading && <PageLoader text="Loading stats..." />}
      {showUnsavedPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowUnsavedPrompt(false); suppressUnsavedRef.current = true; setPendingTab(null) }} />
          <div className="relative z-[101] w-[90%] max-w-sm rounded-xl bg-white shadow-2xl border border-gray-200 p-5">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">Unsaved recording</h3>
              <p className="text-sm text-gray-600">You have an ongoing/unsaved recording. Would you like to submit before continuing?</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  // Stay on current tab; do not switch
                  setPendingTab(null)
                  setShowUnsavedPrompt(false)
                  // After continuing, keep suppression ON until state changes
                  suppressUnsavedRef.current = true
                }}
              >
                Continue
              </Button>
              <Button
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                onClick={async () => {
                  try {
                    if (activeTab === 'reading') {
                      await submitAssessment()
                    } else {
                      await submitSpeakingAssessment()
                    }
                  } finally {
                    if (pendingTab) {
                      setActiveTab(pendingTab)
                      setPendingTab(null)
                    }
                    setShowUnsavedPrompt(false)
                    // After submitting, suppression can be turned off (no longer unsaved)
                    suppressUnsavedRef.current = false
                  }
                }}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-gray-900">Speech Evaluation</span>
                <span className="text-xs text-gray-500">AI-Powered Speech Analysis</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                <Mic className="w-2 h-2 text-white" />
              </div>
              <span className="text-sm text-indigo-700 font-medium">Ready to Analyze</span>
            </div>
            <Link to="/dashboard">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-gray-600">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Dashboard
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go back to the dashboard</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Persistent hidden audio element used by both Reading and Speaking panels */}
        <div className="hidden">
          <audio
            ref={audioRef}
            src={audio || undefined}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
        {/* Page Title */}
        <div className="flex flex-col items-center text-center space-y-3 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
            <Headphones className="w-4 h-4" />
            Speech Analysis Platform
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-purple-800 bg-clip-text text-transparent leading-snug pb-2">
            Speech Evaluation System
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Analyze pronunciation, fluency and speaking skills with AI-powered speech evaluation
          </p>
        </div>

        {/* Enhanced Tabs */}
        <Card className="border-gray-200 shadow-xl bg-white/90 backdrop-blur-sm">
          <Tabs value={activeTab} onValueChange={(val) => {
            const next = val as 'reading' | 'speaking'
            // Hard block: do not allow tab switching while recording
            if (isRecording) {
              toast({ title: 'Recording in progress', description: 'Please stop or submit your recording before switching tabs.' })
              return
            }
            // Unsaved checks
            const leavingReadingWithUnsaved = (
              activeTab === 'reading' && next === 'speaking' && (
                isRecording || (
                  !!audioSelected && (serverAudioFile !== null || uploadedAudioFile !== null)
                )
              )
            )
            const leavingSpeakingWithUnsaved = (
              activeTab === 'speaking' && next === 'reading' && (
                isRecording || speakingHasAudio
              )
            )
            if ((leavingReadingWithUnsaved || leavingSpeakingWithUnsaved) && !suppressUnsavedRef.current) {
              if (skipUnsavedOnceRef.current) { setActiveTab(next); return }
              setPendingTab(next)
              setShowUnsavedPrompt(true)
              suppressUnsavedRef.current = true
              return
            }
            setActiveTab(next)
          }} className="w-full">
            <div className="bg-gradient-to-r from-indigo-100 via-purple-100 to-indigo-100 border-b border-indigo-300/70 px-8 pt-8 pb-4">
              <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm border-2 border-indigo-300 shadow-2xl h-20 rounded-xl p-2">
                <TabsTrigger
                  value="reading"
                  disabled={isRecording}
                  className="relative flex items-center justify-center gap-3 text-gray-800 font-bold text-base transition-all duration-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-800 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:scale-105 data-[state=active]:z-10 hover:bg-indigo-100 hover:scale-102 rounded-lg mx-1 h-full px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileText className="w-5 h-5" />
                  <span className="font-bold">Reading</span>
                </TabsTrigger>
                <TabsTrigger
                  value="speaking"
                  disabled={isRecording}
                  className="relative flex items-center justify-center gap-3 text-gray-800 font-bold text-base transition-all duration-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-indigo-800 data-[state=active]:text-white data-[state=active]:shadow-2xl data-[state=active]:scale-105 data-[state=active]:z-10 hover:bg-purple-100 hover:scale-102 rounded-lg mx-1 h-full px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Mic className="w-5 h-5" />
                  <span className="font-bold">Speaking</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="reading" className="p-6 space-y-6">
              {/* Step 1: Choose Language */}
              <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                      1
                    </div>
                    <span className="text-lg font-semibold text-gray-900">Choose a Language</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Select value={selectedLanguage} onValueChange={handleLanguageChange} disabled={isLangLoading}>
                      <SelectTrigger className="w-64 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {languages.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value} className="hover:bg-indigo-50">
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Select or Enter Text */}
              {selectedLanguage && (
                <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        2
                      </div>
                      <span className="text-lg font-semibold text-gray-900">Select</span>
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-2">
                      Pick one of the sample texts below. This text will be used for the Speaking activity.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {isLangLoading ? (
                      <div className="flex items-center justify-center p-10">
                        <div className="flex items-center gap-3 text-indigo-700">
                          <Clock className="w-5 h-5 animate-spin" />
                          <span className="font-medium">Loading language sample texts...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-gray-800">Sample Texts</h4>
                        <div className="space-y-2">
                          {sampleTexts.length === 0 ? (
                            <div className="p-4 border border-gray-200 rounded-lg text-sm text-gray-600">
                              No sample texts available for this language.
                            </div>
                          ) : (
                            sampleTexts.map((text, index) => (
                              <div
                                key={index}
                                className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${selectedText === text
                                  ? "border-indigo-500 bg-indigo-50/50 shadow-md"
                                  : "border-gray-200 hover:border-indigo-300"
                                  }`}
                                onClick={() => handleTextSelect(text)}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-sm font-medium text-gray-500 mt-0.5">
                                    {index + 1}.
                                  </span>
                                  <span className="text-sm text-gray-700 leading-relaxed flex-1">{text}</span>
                                  {selectedText === text && (
                                    <CheckCircle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}




                  </CardContent>
                </Card>
              )}

              {/* Step 3: Enhanced Record or Upload Audio */}
              {selectedText && (
                <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        3
                      </div>
                      <span className="text-lg font-semibold text-gray-900">Record or Upload Audio</span>
                    </CardTitle>
                    <div className="flex items-center gap-4 mt-3">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        <Target className="w-3 h-3 mr-1" />
                        Max 20 seconds each
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Enhanced Option A: Record Audio */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            A
                          </div>
                          <h4 className="font-semibold text-gray-800">Record Audio</h4>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-6 min-h-[480px] flex flex-col">
                          <ul className="text-sm text-gray-600 space-y-2 mb-6">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              Click to start recording with smart controls
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              Recording stops automatically after 20 seconds
                            </li>
                          </ul>

                          <div className="flex flex-col items-center gap-6 flex-1 justify-center">
                            {/* Enhanced Recording Controls */}
                            <div className="relative">
                              <div className={`absolute -inset-4 rounded-full transition-all duration-1000 ${isRecording && !isPaused
                                ? "bg-gradient-to-r from-blue-400/30 to-emerald-400/30 animate-pulse"
                                : "bg-transparent"
                                }`}></div>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="lg"
                                      onClick={startRecording}
                                      disabled={isRecording}
                                      className={`relative w-20 h-20 rounded-full transition-all duration-500 border-4 ${isRecording
                                        ? "bg-gradient-to-br from-blue-500 to-emerald-500 border-blue-300 shadow-lg"
                                        : "bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 border-emerald-300 shadow-lg hover:scale-105"
                                        } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                                    >
                                      <Mic className="h-8 w-8 text-white" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Start recording</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            {/* Recording Controls */}
                            {isRecording && (
                              <div className="flex items-center gap-3">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={stopRecording}
                                        className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                      >
                                        <Square className="h-4 w-4 mr-1" />
                                        Stop
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Stop recording</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}

                            {/* Recording Status */}
                            <div className="text-center space-y-2">
                              <span className={`text-sm font-medium transition-colors duration-200 ${isRecording
                                ? "text-blue-600"
                                : "text-gray-700"
                                }`}>
                                {isRecording
                                  ? "Recording..."
                                  : "Ready to Record"
                                }
                              </span>

                              {isRecording && (
                                <div className="flex flex-col items-center gap-2">
                                  <Progress
                                    value={(recordingTime / 200) * 100}
                                    className="w-32 h-2 bg-blue-100"
                                  />
                                  <span className="text-xs text-blue-600 font-mono">
                                    {Math.max(0, 20 - Math.floor(recordingTime / 10))}s remaining
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Calmer Audio Visualization */}
                            {isRecording && (
                              <div className="flex items-center justify-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-2 bg-gradient-to-t from-blue-400 to-emerald-400 rounded-full transition-all duration-300"
                                    style={{
                                      height: `${8 + Math.sin((Date.now() / 200) + i) * 6}px`,
                                      opacity: 0.7 + Math.sin((Date.now() / 300) + i) * 0.3
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Enhanced Option B: Upload Audio */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            B
                          </div>
                          <h4 className="font-semibold text-gray-800">Upload Audio File</h4>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 min-h-[480px] flex flex-col">
                          <ul className="text-sm text-gray-600 space-y-2 mb-6">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Upload audio files or click to browse
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Supported formats: .mp3, .wav, .m4a
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Maximum duration: 20 seconds
                            </li>
                          </ul>

                          <div
                            className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group flex-1 flex items-center justify-center"
                            onClick={handleLabelInputClick}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.code === 'Space') handleLabelInputClick(e)
                            }}
                            role="button"
                          >
                            <div className="flex flex-col items-center gap-4">
                              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center group-hover:from-blue-200 group-hover:to-indigo-200 transition-all">
                                <Upload className="h-8 w-8 text-blue-600 group-hover:scale-110 transition-transform" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-800">Drop audio files here</p>
                                <p className="text-xs text-gray-500">or click to browse your computer</p>
                              </div>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileUploadRef.current?.click() }}
                                    >
                                      <Upload className="w-4 h-4" />
                                      Browse Files
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Browse your computer for an audio file</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          {/* Hidden file input for Reading upload */}
                          <input
                            type="file"
                            accept="audio/mpeg, audio/wav, audio/mp3, audio/x-m4a, audio/m4a"
                            onChange={handleFileChange}
                            ref={fileUploadRef}
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Audio Preview & Download - Centered */}
                    {audio && (
                      <div className="mt-6 w-full">
                        <h4 className="font-semibold text-gray-800 mb-3 text-center">Preview</h4>
                        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-indigo-100 shadow-sm w-full">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={togglePlayPause}
                            className="border-indigo-200 text-indigo-700 hover:bg-indigo-100/50"
                          >
                            {isPlaying ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                            {isPlaying ? "Pause" : "Play"}
                          </Button>
                          <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(playbackTime)}</span>
                          <div className="flex-1 max-w-[200px]">
                            <Progress value={progressValueDynamic} className="h-2 bg-gray-100" />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap 1">
                            {formatTime(playbackTime)} / {formatTime(readingRecordedDuration ?? playbackTime)}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Action toolbar above Attempts & Results (Reading) */}
              <div className="flex items-center justify-center gap-3 mt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={resetRecording}
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Reset
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset current selection and recording</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={!selectedLanguage || isSubmittingReading}
                        onClick={submitAssessment}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium px-6 shadow-lg disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSubmittingReading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>) : 'Submit'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Submit audio for assessment</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Enhanced Attempts & Results (Reading) */}
              {Array.isArray(attempts) && attempts.length > 0 && (
                <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <BarChart3 className="h-6 w-6 text-indigo-600" />
                      <span className="text-lg font-semibold text-gray-900">Attempts & Results</span>
                    </CardTitle>
                    <p className="text-sm text-gray-600 mt-2">
                      Track your speech evaluation attempts and view detailed analysis results
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gradient-to-r from-gray-50 to-gray-100">
                            <TableHead className="font-semibold text-gray-700">Question Text</TableHead>
                            <TableHead className="font-semibold text-gray-700">Language</TableHead>
                            <TableHead className="font-semibold text-gray-700">Created Date</TableHead>
                            <TableHead className="font-semibold text-gray-700">Status</TableHead>
                            <TableHead className="font-semibold text-gray-700">Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attempts.map((attempt) => (
                            <TableRow key={attempt.id} className="hover:bg-indigo-50/30 transition-colors">
                              <TableCell className="max-w-md">
                                <div className="truncate text-indigo-700 font-medium" title={attempt.text}>
                                  {attempt.text}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-gray-200 text-gray-700">
                                  {attempt.language}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-gray-600 text-sm">{attempt.createdDate}</TableCell>
                              <TableCell>
                                <Badge className={`${String(attempt.status || '').toLowerCase() === 'completed' ? 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'} flex items-center gap-1 w-fit`}>
                                  <CheckCircle className="h-3 w-3" />
                                  {attempt.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => handleShowResult(attempt.id)}
                                        disabled={String(attempt.status || '').toLowerCase() !== 'completed'}
                                      >
                                        <Eye className="h-4 w-4 mr-1" />
                                        {attempt.result}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{String(attempt.status || '').toLowerCase() === 'completed' ? 'View detailed result' : 'Result not ready yet'}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Assessment Result - Inline Below Attempts Table */}
              {showResultDetail && (
                <Card className="bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 border border-indigo-200 shadow-2xl">
                  <CardHeader className="border-b border-indigo-200 bg-gradient-to-r from-indigo-100 via-purple-100 to-blue-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                          <BarChart3 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-indigo-700 to-purple-800 bg-clip-text text-transparent">
                            Assessment Result
                          </CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Detailed analysis of your speech performance</p>
                        </div>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowResultDetail(false)}
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                            >
                              <X className="w-5 h-5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Close</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* Audio Player with Enhanced Transcript */}
                    <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-indigo-100 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center shadow-sm">
                            <Headphones className="w-3 h-3 text-white" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900">Audio Analysis</h3>
                        </div>
                        {/* Audio is driven by a single persistent hidden <audio> element mounted at the top of the page */}

                        <div className="flex items-center gap-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={togglePlayPause}
                                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-100/50"
                                >
                                  {isPlaying ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                                  {isPlaying ? "Pause" : "Play"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Play or pause audio</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(playbackTime)}</span>
                          <Progress
                            value={progressValueDynamic}
                            className="w-24 h-1"
                          />
                          <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(duration)}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" className="border-gray-200 text-gray-600 hover:bg-gray-100/50" onClick={handleDownloadAudio}>
                                  <Download className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download audio</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Enhanced Transcript with highlighting */}
                      <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Volume2 className="w-4 h-4 text-indigo-600" />
                          <span className="font-semibold text-gray-800">Speech Transcript</span>
                        </div>
                        {resultLoading && (
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="animate-spin h-4 w-4 text-indigo-600" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span>Fetching transcript…</span>
                          </div>
                        )}
                        {resultError && (
                          <p className="text-sm text-red-600">{resultError}</p>
                        )}
                        {!resultLoading && !resultError && (
                          <p className="text-base leading-relaxed text-gray-900">
                            {resultData?.NBest?.[0]?.Display || resultData?.DisplayText || '—'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Compact Two Column Layout */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Types of Errors - Compact */}
                      <div ref={errorAnalysisRef} className="space-y-3">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-md flex items-center justify-center shadow-sm">
                            <Target className="w-3 h-3 text-white" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900">Error Analysis</h3>
                        </div>
                        <div className="space-y-2">
                          {[
                            { type: "Mispronunciations", count: errorAnalysis.mispronCount, color: "bg-orange-100 text-orange-800 border-orange-300", bgColor: "bg-orange-50" },
                            { type: "Omissions", count: errorAnalysis.omissionCount, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Insertions", count: errorAnalysis.insertionCount, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Unexpected break", count: errorAnalysis.unexpectedBreak, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Missing break", count: errorAnalysis.missingBreak, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Monotone", count: errorAnalysis.monotone, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" }
                          ].map((error, index) => (
                            <div key={index} className={`flex items-center justify-between p-2 ${error.bgColor} border border-gray-200 rounded-lg hover:bg-gray-100/50 transition-all`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${error.count > 0 ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
                                <span className="text-sm font-medium text-gray-800">{error.type}</span>
                              </div>
                              <Badge className={`${error.color} text-sm px-2 py-0.5`}>
                                {error.count}
                              </Badge>
                            </div>
                          ))}
                        </div>

                        {/* Pronunciation Score Meter */}
                        <div className="bg-white/90 backdrop-blur-sm border border-green-200 rounded-lg p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-md flex items-center justify-center shadow-sm">
                              <CheckCircle className="w-3 h-3 text-white" />
                            </div>
                            <h4 className="text-sm font-semibold text-gray-900">Pronunciation Score</h4>
                          </div>

                          {/* Score Display */}
                          <div className="text-center mb-4">
                            <span className="text-2xl font-bold text-green-600">
                              {resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore !== undefined
                                ? `${Number(resultData.NBest[0].PronunciationAssessment.PronScore).toFixed(1)}%`
                                : '—'}
                            </span>
                            <p className="text-xs text-gray-600">Overall Pronunciation</p>
                          </div>

                          {/* Meter Visualization */}
                          <div className="space-y-3">
                            <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                              <div className="absolute inset-0 flex">
                                <div className="w-[59%] bg-red-400"></div>
                                <div className="w-[20%] bg-yellow-400"></div>
                                <div className="w-[21%] bg-green-400"></div>
                              </div>
                              <div
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-2000 ease-out"
                                style={{ width: `${resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore ?? 0}%` }}
                              ></div>
                              <div
                                className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-white border-2 border-gray-800 rounded-full shadow-md transition-all duration-2000 ease-out"
                                style={{ left: `${resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore ?? 0}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                              ></div>
                            </div>

                            {/* Scale Labels */}
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Poor (0-59)</span>
                              <span>Good (60-79)</span>
                              <span>Excellent (80-100)</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Compact Score Breakdown */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-md flex items-center justify-center shadow-sm">
                            <Sparkles className="w-3 h-3 text-white" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900">Performance Breakdown</h3>
                        </div>
                        <div className="space-y-3">
                          {[
                            { label: "Accuracy Score", score: resultData?.NBest?.[0]?.PronunciationAssessment?.AccuracyScore ?? 0, maxScore: 100, color: "from-green-500 to-emerald-600", bgColor: "bg-green-50", textColor: "text-green-700" },
                            { label: "Fluency Score", score: resultData?.NBest?.[0]?.PronunciationAssessment?.FluencyScore ?? 0, maxScore: 100, color: "from-blue-500 to-indigo-600", bgColor: "bg-blue-50", textColor: "text-blue-700" },
                            { label: "Completeness Score", score: resultData?.NBest?.[0]?.PronunciationAssessment?.CompletenessScore ?? 0, maxScore: 100, color: "from-purple-500 to-violet-600", bgColor: "bg-purple-50", textColor: "text-purple-700" },
                            { label: "Prosody Score", score: resultData?.NBest?.[0]?.PronunciationAssessment?.ProsodyScore ?? 0, maxScore: 100, color: "from-orange-500 to-red-600", bgColor: "bg-orange-50", textColor: "text-orange-700" }
                          ].map((item, index) => (
                            <div key={index} className={`${item.bgColor} border border-gray-200 rounded-lg p-3 hover:bg-gray-100/30 transition-all`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 bg-gradient-to-r ${item.color} rounded-full`}></div>
                                  <span className="text-sm font-medium text-gray-800">{item.label}</span>
                                </div>
                                <span className={`text-sm font-semibold ${item.textColor} bg-white px-2 py-1 rounded`}>
                                  {Number(item.score).toFixed(1)}/{item.maxScore}
                                </span>
                              </div>
                              <div className="w-full bg-white/80 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full bg-gradient-to-r ${item.color} transition-all duration-2000 ease-out`}
                                  style={{ width: `${(Number(item.score) / item.maxScore) * 100}%` }}
                                ></div>
                              </div>
                              <div className="mt-1 text-right">
                                <span className={`text-sm ${item.textColor}`}>
                                  {((Number(item.score) / item.maxScore) * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="speaking" className="p-6 space-y-6">
              {/* Step 1: Choose Language and Topic */}
              <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                      1
                    </div>
                    <span className="text-lg font-semibold text-gray-900">Choose Language & Topic</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
                    {/* Choose Language */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Choose a language</label>
                      <Select value={selectedSpeakingLanguage} onValueChange={handleSpeakingLanguageChange}>
                        <SelectTrigger className="border-gray-300 focus:border-purple-500 focus:ring-purple-500">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200">
                          {speakingLanguages.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value} className="hover:bg-purple-50">
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                    </div>

                    {/* Select Sample Topic */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Select a sample topic</label>
                      <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                        <SelectTrigger className="border-gray-300 focus:border-purple-500 focus:ring-purple-500">
                          <SelectValue placeholder="Select a topic" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-gray-200">
                          {speakingTopics.map((topic) => (
                            <SelectItem key={topic} value={topic} className="hover:bg-purple-50">
                              {topic}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Action Buttons */}

                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Enhanced Record or Upload Audio */}
              {selectedTopic && (
                <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                        2
                      </div>
                      <span className="text-lg font-semibold text-gray-900">Record or Upload Audio</span>
                    </CardTitle>
                    {/* <div className="flex items-center gap-4 mt-3">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        <Target className="w-3 h-3 mr-1" />
                        Max 20 seconds each
                      </Badge>
                    </div> */}
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Enhanced Option A: Record Audio */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            A
                          </div>
                          <h4 className="font-semibold text-gray-800">Record Audio</h4>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-6 min-h-[480px] flex flex-col">
                          <ul className="text-sm text-gray-600 space-y-2 mb-6">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              Click to start recording with smart controls
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                              Recording stops automatically after 20 seconds
                            </li>
                          </ul>

                          <div className="flex flex-col items-center gap-6 flex-1 justify-center">
                            {/* Enhanced Recording Controls */}
                            <div className="relative">
                              <div className={`absolute -inset-4 rounded-full transition-all duration-1000 ${isRecording && !isPaused
                                ? "bg-gradient-to-r from-blue-400/30 to-emerald-400/30 animate-pulse"
                                : "bg-transparent"
                                }`}></div>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="lg"
                                      onClick={startSpeakingRecording}
                                      disabled={isRecording}
                                      className={`relative w-20 h-20 rounded-full transition-all duration-500 border-4 ${isRecording
                                        ? "bg-gradient-to-br from-blue-500 to-emerald-500 border-blue-300 shadow-lg"
                                        : "bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 border-emerald-300 shadow-lg hover:scale-105"
                                        } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                                    >
                                      <Mic className="h-8 w-8 text-white" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Start recording</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            {/* Recording Controls */}
                            {isRecording && (
                              <div className="flex items-center gap-3">
                                {/* <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={isPaused ? resumeRecording : pauseRecording}
                                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                  {isPaused ? (
                                    <>
                                      <Play className="h-4 w-4 mr-1" />
                                      Resume
                                    </>
                                  ) : (
                                    <>
                                      <Pause className="h-4 w-4 mr-1" />
                                      Pause
                                    </>
                                  )}
                                </Button> */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={stopRecording}
                                  className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                >
                                  <Square className="h-4 w-4 mr-1" />
                                  Stop
                                </Button>
                              </div>
                            )}

                            {/* Recording Status */}
                            <div className="text-center space-y-2">
                              <span className={`text-sm font-medium transition-colors duration-200 ${isRecording ? "text-blue-600" : "text-gray-700"
                                }`}>
                                {isRecording ? "Recording..." : "Ready to Record"}
                              </span>

                              {isRecording && (
                                <div className="flex flex-col items-center gap-2">
                                  <Progress
                                    value={(recordingTime / 200) * 100}
                                    className="w-32 h-2 bg-blue-100"
                                  />
                                  <span className="text-xs text-blue-600 font-mono">
                                    {`${Math.max(0, 20 - Math.floor(recordingTime / 10))}s remaining`}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Calmer Audio Visualization */}
                            {isRecording && (
                              <div className="flex items-center justify-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <div
                                    key={i}
                                    className="w-2 bg-gradient-to-t from-blue-400 to-emerald-400 rounded-full transition-all duration-300"
                                    style={{
                                      height: `${8 + Math.sin((Date.now() / 200) + i) * 6}px`,
                                      opacity: 0.7 + Math.sin((Date.now() / 300) + i) * 0.3
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Enhanced Option B: Upload Audio */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            B
                          </div>
                          <h4 className="font-semibold text-gray-800">Upload Audio File</h4>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 min-h-[480px] flex flex-col">
                          <ul className="text-sm text-gray-600 space-y-2 mb-6">
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Upload audio files or click to browse
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Supported formats: .mp3, .wav, .m4a
                            </li>
                            <li className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              Maximum duration: 20 seconds
                            </li>
                          </ul>

                          <div
                            className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer group flex-1 flex items-center justify-center"
                            onClick={handleLabelInputClick}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.code === 'Space') handleLabelInputClick(e) }}
                            role="button"
                          >
                            <div className="flex flex-col items-center gap-4">
                              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center group-hover:from-blue-200 group-hover:to-indigo-200 transition-all">
                                <Upload className="h-8 w-8 text-blue-600 group-hover:scale-110 transition-transform" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-800">Upload audio files here</p>
                                <p className="text-xs text-gray-500">or click to browse your computer</p>
                              </div>
                              <Button
                                className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileUploadRef.current?.click() }}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                Browse Files
                              </Button>
                            </div>
                          </div>
                          {/* Hidden file input for Speaking upload */}
                          <input
                            type="file"
                            accept="audio/mpeg, audio/wav, audio/mp3, audio/x-m4a, audio/m4a"
                            onChange={handleFileChange}
                            ref={fileUploadRef}
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Audio Preview (Speaking) - Centered */}
                    {speakingHasAudio && (
                      <div className="mt-6 w-full">
                        <h4 className="font-semibold text-gray-800 mb-3 text-center">Preview</h4>
                        <div className="flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-indigo-100 shadow-sm w-full">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={togglePlayPause}
                            className="border-indigo-200 text-indigo-700 hover:bg-indigo-100/50"
                          >
                            {isPlaying ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                            {isPlaying ? "Pause" : "Play"}
                          </Button>
                          <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(playbackTime)}</span>
                          <Progress value={progressValueDynamic} className="w-32 h-1" />
                          <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded 2"> {formatTime(playbackTime)} / {formatTime(readingRecordedDuration ?? playbackTime)}</span>
                          {/* <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(duration)}</span> */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" className="border-gray-200 text-gray-600 hover:bg-gray-100/50" onClick={handleDownloadAudio}>
                                  <Download className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download audio</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 4: Attempts and Results (Speaking) */}
              {/* Action toolbar above Attempts & Results (Speaking) */}
              <div className="flex items-center justify-center gap-3 mt-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        onClick={() => {
                          resetRecording()
                          setSpeakingHasAudio(false)
                          setIsSpeakingResultVisible(false)
                          const topics = speakingLanguages.find(l => l.value === selectedSpeakingLanguage)?.sampleQuestions || []
                          setSpeakingTopics(topics)
                          setSelectedTopic(topics[0] || '')
                        }}
                      >
                        Reset
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset current selection and recording</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={!selectedSpeakingLanguage || !selectedTopic || isSubmittingSpeaking}
                        onClick={submitSpeakingAssessment}
                        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium px-6 shadow-lg disabled:opacity-50 flex items-center gap-2"
                      >
                        {isSubmittingSpeaking ? (<><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>) : 'Submit'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Submit audio for assessment</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {selectedTopic && !speakingAttemptsLoading && !speakingAttemptsError && Array.isArray(speakingAttempts) && speakingAttempts.length > 0 && (
                <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">Attempts & Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200">
                          <TableHead className="text-blue-600 font-semibold">QUESTION TEXT</TableHead>
                          <TableHead className="text-blue-600 font-semibold">LANGUAGE</TableHead>
                          <TableHead className="text-blue-600 font-semibold">CREATED DATE</TableHead>
                          <TableHead className="text-blue-600 font-semibold">STATUS</TableHead>
                          <TableHead className="text-blue-600 font-semibold">RESULT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {speakingAttempts.map((attempt) => (
                          <TableRow key={attempt.id} className="border-gray-200 hover:bg-gray-50/50">
                            <TableCell className="text-gray-700">{attempt.text}</TableCell>
                            <TableCell className="text-gray-600">{attempt.language}</TableCell>
                            <TableCell className="text-gray-600">{attempt.createdDate}</TableCell>
                            <TableCell>
                              <Badge className={`${String(attempt.status || '').toLowerCase() === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'}`}>
                                {attempt.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={String(attempt.status || '').toLowerCase() !== 'completed'}
                                      onClick={() => handleShowResult(attempt.id)}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      {attempt.result}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {String(attempt.status || '').toLowerCase() === 'completed' ? 'View detailed result' : 'Result not ready yet'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Speaking Assessment Result */}
              {isSpeakingResultVisible && (
                <Card className="bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/20 border border-indigo-200 shadow-2xl">
                  <CardHeader className="border-b border-indigo-200 bg-gradient-to-r from-indigo-100 via-purple-100 to-blue-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                          <BarChart3 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-indigo-700 to-purple-800 bg-clip-text text-transparent">
                            Assessment Result
                          </CardTitle>
                          <p className="text-sm text-gray-600 mt-1">Detailed analysis of your speech performance</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSpeakingResultVisible(false)}
                        className="text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                      >
                        <X className="w-5 h-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* First Row: Audio Analysis and Error Analysis side by side */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Audio Player with Enhanced Transcript */}
                      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-indigo-100 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center shadow-sm">
                              <Headphones className="w-3 h-3 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">Audio Analysis</h3>
                          </div>
                          {/* Hidden audio element removed here to avoid duplicate mounts */}
                          <div className="flex items-center gap-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={togglePlayPause}
                                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-100/50"
                                  >
                                    {isPlaying ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                                    {isPlaying ? "Pause" : "Play"}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Play or pause audio</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(playbackTime)}</span>
                            <Progress
                              value={progressValueDynamic}
                              className="w-24 h-1"
                            />
                            <span className="text-xs text-gray-600 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{formatTime(duration)}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" className="border-gray-200 text-gray-600 hover:bg-gray-100/50" onClick={handleDownloadAudio}>
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download audio</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>

                        {/* Enhanced Transcript with highlighting */}
                        <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Volume2 className="w-4 h-4 text-indigo-600" />
                            <span className="font-semibold text-gray-800">Speech Transcript</span>
                          </div>
                          {resultLoading && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <svg className="animate-spin h-4 w-4 text-indigo-600" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                              </svg>
                              <span>Fetching transcript…</span>
                            </div>
                          )}
                          {resultError && (
                            <p className="text-sm text-red-600">{resultError}</p>
                          )}
                          {!resultLoading && !resultError && (
                            <p className="text-base leading-relaxed text-gray-900">
                              {resultData?.NBest?.[0]?.Display || resultData?.DisplayText || '—'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Error Analysis */}
                      <div ref={speakingErrorAnalysisRef} className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-orange-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-md flex items-center justify-center shadow-sm">
                            <Target className="w-3 h-3 text-white" />
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900">Error Analysis</h3>
                        </div>
                        <div className="space-y-2">
                          {[
                            { type: "Mispronunciations", count: errorAnalysis.mispronCount, color: "bg-orange-100 text-orange-800 border-orange-300", bgColor: "bg-orange-50" },
                            { type: "Omissions", count: errorAnalysis.omissionCount, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Insertions", count: errorAnalysis.insertionCount, color: "bg-yellow-100 text-yellow-800 border-yellow-300", bgColor: "bg-yellow-50" },
                            { type: "Unexpected break", count: errorAnalysis.unexpectedBreak, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" },
                            { type: "Missing break", count: errorAnalysis.missingBreak, color: "bg-blue-100 text-blue-800 border-blue-300", bgColor: "bg-blue-50" },
                            { type: "Monotone", count: errorAnalysis.monotone, color: "bg-gray-100 text-gray-600 border-gray-200", bgColor: "bg-gray-50" }
                          ].map((error, index) => (
                            <div key={index} className={`flex items-center justify-between p-2 ${error.bgColor} border border-gray-200 rounded-lg hover:bg-gray-100/50 transition-all`}>
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${error.count > 0 ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
                                <span className="text-sm font-medium text-gray-800">{error.type}</span>
                              </div>
                              <Badge className={`${error.color} text-sm px-2 py-0.5`}>
                                {error.count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Second Row: Pronunciation Score and Content Score side by side */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {/* Pronunciation Score Meter */}
                      <div className="bg-white/90 backdrop-blur-sm border border-green-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-md flex items-center justify-center shadow-sm">
                            <CheckCircle className="w-3 h-3 text-white" />
                          </div>
                          <h4 className="text-sm font-semibold text-gray-900">Pronunciation Score</h4>
                        </div>

                        {/* Score Display */}
                        <div className="text-center mb-4">
                          <span className="text-2xl font-bold text-green-600">
                            {resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore !== undefined
                              ? `${Number(resultData.NBest[0].PronunciationAssessment.PronScore).toFixed(1)}%`
                              : '—'}
                          </span>
                          <p className="text-xs text-gray-600">Overall Pronunciation</p>
                        </div>

                        {/* Meter Visualization */}
                        <div className="space-y-3">
                          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                            <div className="absolute inset-0 flex">
                              <div className="w-[59%] bg-red-400"></div>
                              <div className="w-[20%] bg-yellow-400"></div>
                              <div className="w-[21%] bg-green-400"></div>
                            </div>
                            <div
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-2000 ease-out"
                              style={{ width: `${resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore ?? 0}%` }}
                            ></div>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-white border-2 border-gray-800 rounded-full shadow-md transition-all duration-2000 ease-out"
                              style={{ left: `${resultData?.NBest?.[0]?.PronunciationAssessment?.PronScore ?? 0}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                            ></div>
                          </div>

                          {/* Scale Labels */}
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Poor (0-59)</span>
                            <span>Good (60-79)</span>
                            <span>Excellent (80-100)</span>
                          </div>
                        </div>

                        {/* Score Breakdown */}
                        <div className="mt-4 space-y-2 border-t border-gray-200 pt-3">
                          <h5 className="text-sm font-semibold text-gray-800 mb-2">Score Breakdown</h5>
                          {[
                            { label: "Accuracy Score", score: Number(resultData?.NBest?.[0]?.PronunciationAssessment?.AccuracyScore ?? 0), maxScore: 100, color: "from-green-500 to-emerald-600" },
                            { label: "Fluency Score", score: Number(resultData?.NBest?.[0]?.PronunciationAssessment?.FluencyScore ?? 0), maxScore: 100, color: "from-blue-500 to-indigo-600" },
                            { label: "Prosody Score", score: Number(resultData?.NBest?.[0]?.PronunciationAssessment?.ProsodyScore ?? 0), maxScore: 100, color: "from-purple-500 to-violet-600" }
                          ].map((item, index) => (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-700 font-medium">{item.label}</span>
                                <span className="font-bold text-gray-900">{item.score}/{item.maxScore}</span>
                              </div>
                              <div className="relative">
                                <Progress value={item.score} className="h-2" />
                                <div className={`absolute top-0 left-0 h-full bg-gradient-to-r ${item.color} rounded-full transition-all duration-1000`}
                                  style={{ width: `${item.score}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Content Score */}
                      <div className="bg-white/90 backdrop-blur-sm border border-orange-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-md flex items-center justify-center shadow-sm">
                            <FileText className="w-3 h-3 text-white" />
                          </div>
                          <h4 className="text-sm font-semibold text-gray-900">Content Score</h4>
                        </div>

                        {/* Score Display */}
                        <div className="text-center mb-4">
                          <span className="text-2xl font-bold text-orange-600">
                            {(() => {
                              const s: number | undefined = (resultData as any)?.NBest?.[0]?.ContentAssessment?.ContentScore ?? (resultData as any)?.ContentAssessment?.ContentScore
                              return typeof s === 'number' ? `${s.toFixed(1)}%` : '—'
                            })()}
                          </span>
                          <p className="text-xs text-gray-600">Overall Score</p>
                        </div>

                        {/* Meter Visualization */}
                        <div className="space-y-3">
                          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                            <div className="absolute inset-0 flex">
                              <div className="w-[59%] bg-red-400"></div>
                              <div className="w-[20%] bg-yellow-400"></div>
                              <div className="w-[21%] bg-green-400"></div>
                            </div>
                            <div
                              className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-red-600 transition-all duration-2000 ease-out"
                              style={{ width: `${(() => { const s: number | undefined = (resultData as any)?.NBest?.[0]?.ContentAssessment?.ContentScore ?? (resultData as any)?.ContentAssessment?.ContentScore; return typeof s === 'number' ? s : 0 })()}%` }}
                            ></div>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-white border-2 border-gray-800 rounded-full shadow-md transition-all duration-2000 ease-out"
                              style={{ left: `${(() => { const s: number | undefined = (resultData as any)?.NBest?.[0]?.ContentAssessment?.ContentScore ?? (resultData as any)?.ContentAssessment?.ContentScore; return typeof s === 'number' ? s : 0 })()}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                            ></div>
                          </div>

                          {/* Scale Labels */}
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Poor (0-59)</span>
                            <span>Good (60-79)</span>
                            <span>Excellent (80-100)</span>
                          </div>
                        </div>

                        {/* Score Breakdown */}
                        <div className="space-y-2 border-t border-gray-200 pt-3">
                          <h5 className="text-sm font-semibold text-gray-800 mb-2">Score Breakdown</h5>
                          {[
                            { label: "Vocabulary Score", score: Number(((resultData as any)?.NBest?.[0]?.ContentAssessment?.VocabularyScore ?? (resultData as any)?.ContentAssessment?.VocabularyScore) ?? 0), maxScore: 100, color: "from-orange-500 to-yellow-600" },
                            { label: "Grammar Score", score: Number(((resultData as any)?.NBest?.[0]?.ContentAssessment?.GrammarScore ?? (resultData as any)?.ContentAssessment?.GrammarScore) ?? 0), maxScore: 100, color: "from-red-500 to-pink-600" },
                            { label: "Topic Score", score: Number(((resultData as any)?.NBest?.[0]?.ContentAssessment?.TopicScore ?? (resultData as any)?.ContentAssessment?.TopicScore) ?? 0), maxScore: 100, color: "from-gray-400 to-gray-600" }
                          ].map((item, index) => (
                            <div key={index} className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-700 font-medium">{item.label}</span>
                                <span className="font-bold text-gray-900">{item.score}/{item.maxScore}</span>
                              </div>
                              <div className="relative">
                                <Progress value={item.score} className="h-2" />
                                <div className={`absolute top-0 left-0 h-full bg-gradient-to-r ${item.color} rounded-full transition-all duration-1000`}
                                  style={{ width: `${item.score}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}

export default SpeechEvaluation