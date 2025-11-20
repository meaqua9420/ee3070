import mp3Duration from 'mp3-duration'
import * as googleTtsApi from 'google-tts-api'
import type { options as EdgeTtsOptions } from 'edge-tts/out/index.js'

type TransformersModule = typeof import('@xenova/transformers')

interface VoicePreset {
  id: string
  label: string
  language: string
  speakerId: string
  edgeVoice?: string
  googleLanguage?: string
  gain?: number
  playbackRate?: number
  description?: string
}

interface VoicePresetSummary {
  id: string
  label: string
  language: string
  speakerId: string
  description?: string
  playbackRate?: number
}

const VOICE_PRESETS: VoicePreset[] = [
  {
    id: 'warm-guide',
    label: 'Warm Guide (EN)',
    language: 'en',
    speakerId: 'en_female_1',
    edgeVoice: 'en-US-JennyNeural',
    googleLanguage: 'en-US',
    gain: 1.08,
    playbackRate: 1.05,
    description: 'Friendly English guide voice with gentle brightness.',
  },
  {
    id: 'gentle-baritone',
    label: 'Gentle Baritone (EN)',
    language: 'en',
    speakerId: 'en_male_1',
    edgeVoice: 'en-GB-RyanNeural',
    googleLanguage: 'en-GB',
    gain: 1.02,
    playbackRate: 0.98,
    description: 'Calm baritone suited for bedtime or low-energy updates.',
  },
  {
    id: 'soothing-mandarin',
    label: '柔光中文',
    language: 'zh',
    speakerId: 'zh_female_0',
    edgeVoice: 'zh-TW-HsiaoYuNeural',
    googleLanguage: 'zh-TW',
    gain: 1.05,
    playbackRate: 0.96,
    description: '自然柔和的台灣中文語音，適合每日陪伴與提醒。',
  },
  {
    id: 'bright-mandarin',
    label: '晨光中文',
    language: 'zh',
    speakerId: 'zh_female_0',
    edgeVoice: 'zh-CN-XiaoxiaoMultilingualNeural',
    googleLanguage: 'zh-CN',
    gain: 1.08,
    playbackRate: 1.02,
    description: '清爽有活力的中文語音，適合早晨播報與互動。',
  },
  {
    id: 'playful-mentor',
    label: 'Playful Mentor (EN)',
    language: 'en',
    speakerId: 'en_female_0',
    edgeVoice: 'en-US-AriaNeural',
    gain: 1.1,
    playbackRate: 1.08,
    description: 'Brighter tone for quick nudges and playful advice.',
  },
]

type TextToSpeechPipeline = (
  text: string,
  options?: {
    speaker_id?: string
    language?: string
  },
) => Promise<{
  audio: Float32Array
  sampling_rate?: number
}>

export interface SynthesizeSpeechOptions {
  text: string
  language?: string
  speakerId?: string
  voiceId?: string
  speed?: number
  volume?: number
  tone?: string
}

export interface SynthesizedSpeech {
  audioBase64: string
  sampleRate: number
  durationSeconds: number
  format: 'audio/wav' | 'audio/mpeg'
  voiceId?: string
  playbackRate?: number
}

const DEFAULT_MODEL_ID = process.env.TTS_MODEL_ID || 'Xenova/xtts-v2'
const DEFAULT_LANGUAGE = process.env.TTS_LANGUAGE || 'en'
const DEFAULT_SPEAKER = process.env.TTS_SPEAKER_ID || 'en_female_1'
const DEFAULT_VOICE_ID = process.env.TTS_DEFAULT_VOICE_ID || ''
const MAX_TEXT_LENGTH = Number.parseInt(process.env.TTS_MAX_CHARACTERS || '500', 10)
const FALLBACK_EDGE_VOICE = process.env.EDGE_TTS_VOICE || 'en-US-JennyNeural'
const DEFAULT_GOOGLE_LANGUAGE = process.env.GOOGLE_TTS_LANGUAGE || 'en-US'
const EDGE_RATE_LIMIT = 40
const EDGE_VOLUME_LIMIT = 50

type TtsEngine = 'xenova' | 'edge' | 'google'

function resolveTtsEngine(): TtsEngine {
  const value = (process.env.TTS_ENGINE ?? 'xenova').toLowerCase()
  if (value === 'edge') return 'edge'
  if (value === 'google') return 'google'
  return 'xenova'
}

const SELECTED_TTS_ENGINE: TtsEngine = resolveTtsEngine()

let transformersModulePromise: Promise<TransformersModule> | null = null
let ttsPipelinePromise: Promise<TextToSpeechPipeline> | null = null
let edgeTtsModulePromise: Promise<typeof import('edge-tts/out/index.js')> | null = null

function resolveVoicePreset(id?: string | null): VoicePreset | null {
  if (!id) return null
  const target = id.trim().toLowerCase()
  if (!target) return null
  return VOICE_PRESETS.find((preset) => preset.id.toLowerCase() === target) ?? null
}

const TONE_VOICE_MAP: Record<
  string,
  {
    zh?: string
    en?: string
    default?: string
  }
> = {
  gentle: { zh: 'soothing-mandarin', en: 'warm-guide' },
  calm: { zh: 'soothing-mandarin', en: 'gentle-baritone' },
  soothing: { zh: 'soothing-mandarin', en: 'gentle-baritone' },
  relax: { zh: 'soothing-mandarin', en: 'gentle-baritone' },
  urgent: { zh: 'bright-mandarin', en: 'playful-mentor' },
  alert: { zh: 'bright-mandarin', en: 'playful-mentor' },
  celebrate: { zh: 'bright-mandarin', en: 'playful-mentor' },
  upbeat: { zh: 'bright-mandarin', en: 'playful-mentor' },
  neutral: { zh: 'warm-guide', en: 'warm-guide' },
}

function pickToneVoiceId(tone: string | undefined, language: string): string | null {
  if (!tone) return null
  const normalized = tone.trim().toLowerCase()
  if (!normalized) return null
  const entry =
    TONE_VOICE_MAP[normalized] ??
    (normalized.includes('calm') ? TONE_VOICE_MAP.calm : null) ??
    (normalized.includes('gentle') ? TONE_VOICE_MAP.gentle : null) ??
    (normalized.includes('urgent') ? TONE_VOICE_MAP.urgent : null)
  if (!entry) return null
  const locale = language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  return entry[locale as 'zh' | 'en'] ?? entry.default ?? null
}

export function listVoicePresets(): VoicePresetSummary[] {
  return VOICE_PRESETS.map((preset) => {
    const summary: VoicePresetSummary = {
      id: preset.id,
      label: preset.label,
      language: preset.language,
      speakerId: preset.speakerId,
    }
    if (preset.description) {
      summary.description = preset.description
    }
    if (typeof preset.playbackRate === 'number') {
      summary.playbackRate = preset.playbackRate
    }
    return summary
  })
}

interface ResolvedSynthConfig {
  text: string
  language: string
  speakerId: string
  gain: number
  playbackRate: number
  preset: VoicePreset | null
  requestedVoiceId?: string
  rawSpeakerOption?: string
  tone?: string
  toneVoiceId?: string
}

function formatPercentOffset(value: number, limit: number): string | undefined {
  const clamped = Math.round(Math.max(-limit, Math.min(limit, value)))
  if (clamped === 0) return undefined
  return `${clamped > 0 ? '+' : ''}${clamped}%`
}

function sanitizeSpeechText(text: string): string {
  if (!text) return ''
  // 移除 emoji 與圖像符號，避免語音模型唸出不自然內容
  const withoutEmoji = text.replace(/\p{Extended_Pictographic}/gu, '')
  // 過濾常見的符號組合，以空白替換保持節奏自然
  const withoutSymbols = withoutEmoji.replace(/[_\-*&^]+/g, ' ')
  return withoutSymbols.replace(/\s{2,}/g, ' ').trim()
}

async function getMp3DurationSeconds(buffer: Buffer): Promise<number | null> {
  if (buffer.length === 0) return null
  try {
    const duration = await mp3Duration(buffer)
    if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
      return duration
    }
  } catch (error) {
    console.warn('[tts] Failed to derive MP3 duration', error)
  }
  return null
}

function deriveMp3SampleRate(buffer: Buffer): number | null {
  if (buffer.length < 4) return null
  const versions = ['2.5', 'x', '2', '1']
  const sampleRateTable: Record<string, number[]> = {
    '1': [44100, 48000, 32000],
    '2': [22050, 24000, 16000],
    '2.5': [11025, 12000, 8000],
  }
  for (let offset = 0; offset < buffer.length - 3; offset++) {
    const byte0 = buffer[offset]
    const byte1 = buffer[offset + 1]
    const byte2 = buffer[offset + 2]
    if (byte0 === undefined || byte1 === undefined || byte2 === undefined) {
      continue
    }
    if (byte0 === 0xff && (byte1 & 0xe0) === 0xe0) {
      const versionBits = (byte1 & 0x18) >> 3
      const versionKey = versions[versionBits]
      const rates = sampleRateTable[versionKey as keyof typeof sampleRateTable]
      if (!rates) continue
      const sampleRateIdx = (byte2 & 0x0c) >> 2
      const sampleRate = rates[sampleRateIdx]
      if (typeof sampleRate === 'number' && sampleRate > 0) {
        return sampleRate
      }
    }
  }
  return null
}

async function getTransformersModule(): Promise<TransformersModule> {
  if (!transformersModulePromise) {
    transformersModulePromise = import('@xenova/transformers').then((module) => {
      module.env.allowLocalModels = true
      return module
    })
  }
  return transformersModulePromise
}

async function getPipeline(): Promise<TextToSpeechPipeline> {
  if (!ttsPipelinePromise) {
    ttsPipelinePromise = getTransformersModule().then(({ pipeline }) => {
      return pipeline('text-to-speech', DEFAULT_MODEL_ID) as unknown as Promise<TextToSpeechPipeline>
    })
  }
  return ttsPipelinePromise
}

async function loadEdgeTtsModule() {
  if (!edgeTtsModulePromise) {
    edgeTtsModulePromise = import('edge-tts/out/index.js')
  }
  return edgeTtsModulePromise
}

function enhanceAudio(samples: Float32Array, gain = 1): Float32Array {
  const safeGain = Number.isFinite(gain) ? Math.min(Math.max(gain, 0.6), 1.5) : 1
  const enhanced = new Float32Array(samples.length)
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const source = samples[i] ?? 0
    const normalized = Number.isFinite(source) ? source : 0
    const value = normalized * safeGain
    enhanced[i] = value
    const abs = Math.abs(value)
    if (abs > peak) peak = abs
  }

  if (peak > 0.001) {
    const limiter = peak > 0.98 ? 0.98 / peak : 1
    if (limiter !== 1) {
      for (let i = 0; i < enhanced.length; i++) {
        const current = enhanced[i] ?? 0
        enhanced[i] = current * limiter
      }
    }
  }

  applyFades(enhanced, 320)
  return enhanced
}

function applyFades(buffer: Float32Array, fadeSamples: number) {
  if (buffer.length === 0) return
  const total = buffer.length
  const length = Math.min(fadeSamples, Math.max(1, Math.floor(total / 12)))
  for (let i = 0; i < length; i++) {
    const factor = i / length
    const headValue = buffer[i] ?? 0
    buffer[i] = headValue * factor
    const tailIndex = total - 1 - i
    const tailValue = buffer[tailIndex] ?? 0
    buffer[tailIndex] = tailValue * factor
  }
}

async function synthesizeWithXenova(config: ResolvedSynthConfig): Promise<SynthesizedSpeech> {
  const synthesizer = await getPipeline()
  const output = await synthesizer(config.text, {
    speaker_id: config.speakerId,
    language: config.language,
  })
  const sampleRate = output.sampling_rate ?? 22050
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('Invalid sample rate returned by TTS model')
  }
  const enhanced = enhanceAudio(output.audio, config.gain)
  const wavBuffer = floatToWavBuffer(enhanced, sampleRate)
  const synthesized: SynthesizedSpeech = {
    audioBase64: wavBuffer.toString('base64'),
    sampleRate,
    durationSeconds: Number((enhanced.length / sampleRate).toFixed(2)),
    format: 'audio/wav',
  }
  const selectedVoiceId = config.preset?.id ?? config.requestedVoiceId
  if (selectedVoiceId) {
    synthesized.voiceId = selectedVoiceId
  }
  if (config.playbackRate !== 1) {
    synthesized.playbackRate = config.playbackRate
  }
  return synthesized
}

function pickEdgeVoice(config: ResolvedSynthConfig): string {
  const candidates = [
    config.preset?.edgeVoice,
    typeof config.rawSpeakerOption === 'string' && config.rawSpeakerOption.includes('-') ? config.rawSpeakerOption : undefined,
    FALLBACK_EDGE_VOICE,
  ]
  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return FALLBACK_EDGE_VOICE
}

async function synthesizeWithEdge(config: ResolvedSynthConfig): Promise<SynthesizedSpeech> {
  const voice = pickEdgeVoice(config)
  const edgeOptions: EdgeTtsOptions & { voice: string } = { voice }

  const ratePercent = Math.round((config.playbackRate - 1) * 100)
  const formattedRate = formatPercentOffset(ratePercent, EDGE_RATE_LIMIT)
  if (formattedRate) {
    edgeOptions.rate = formattedRate
  }

  const volumePercent = Math.round((config.gain - 1) * 100)
  const formattedVolume = formatPercentOffset(volumePercent, EDGE_VOLUME_LIMIT)
  if (formattedVolume) {
    edgeOptions.volume = formattedVolume
  }

  const { tts: edgeTts } = await loadEdgeTtsModule()
  const mp3Buffer = await edgeTts(config.text, edgeOptions)
  if (!Buffer.isBuffer(mp3Buffer) || mp3Buffer.length === 0) {
    throw new Error('edge-tts-empty-buffer')
  }

  const durationSecondsRaw = await getMp3DurationSeconds(mp3Buffer)
  const durationSeconds =
    durationSecondsRaw && durationSecondsRaw > 0
      ? Number(durationSecondsRaw.toFixed(2))
      : Number(Math.max(config.text.length / 18, 1).toFixed(2))

  const sampleRate = deriveMp3SampleRate(mp3Buffer) ?? 24000

  const synthesized: SynthesizedSpeech = {
    audioBase64: mp3Buffer.toString('base64'),
    sampleRate,
    durationSeconds,
    format: 'audio/mpeg',
  }

  const voiceId = config.preset?.id ?? config.requestedVoiceId ?? voice
  if (voiceId) {
    synthesized.voiceId = voiceId
  }

  if (!formattedRate && config.playbackRate !== 1) {
    synthesized.playbackRate = config.playbackRate
  }

  return synthesized
}

function pickGoogleLanguage(config: ResolvedSynthConfig): string {
  if (config.preset?.googleLanguage) {
    return config.preset.googleLanguage
  }
  if (config.language.startsWith('zh')) {
    return 'zh-CN'
  }
  if (config.language.startsWith('en')) {
    return 'en-US'
  }
  return DEFAULT_GOOGLE_LANGUAGE
}

interface GoogleTtsSegment {
  url: string
  shortText?: string
}

type GoogleTtsOptions = {
  lang?: string
  slow?: boolean
  host?: string
  splitPunct?: string
}

function resolveGoogleTtsApi(): {
  getAllAudioUrls?: (text: string, options: GoogleTtsOptions) => unknown
  getAudioUrl?: (text: string, options: GoogleTtsOptions) => unknown
} {
  const candidate = (googleTtsApi as unknown as { default?: unknown })?.default ?? googleTtsApi
  if (candidate && typeof candidate === 'object') {
    return candidate as {
      getAllAudioUrls?: (text: string, options: GoogleTtsOptions) => unknown
      getAudioUrl?: (text: string, options: GoogleTtsOptions) => unknown
    }
  }
  return {}
}

function getGoogleSegments(text: string, options: GoogleTtsOptions): GoogleTtsSegment[] {
  const moduleApi = resolveGoogleTtsApi()
  if (typeof moduleApi.getAllAudioUrls === 'function') {
    return moduleApi.getAllAudioUrls(text, options) as GoogleTtsSegment[]
  }
  if (typeof moduleApi.getAudioUrl === 'function') {
    const url = moduleApi.getAudioUrl(text, options)
    if (typeof url === 'string' && url.length > 0) {
      return [{ url, shortText: text }]
    }
  }
  throw new Error('google-tts-unavailable')
}

async function synthesizeWithGoogle(config: ResolvedSynthConfig): Promise<SynthesizedSpeech> {
  const language = pickGoogleLanguage(config)
  const segments = getGoogleSegments(config.text, {
    lang: language,
    slow: false,
    host: 'https://translate.google.com',
    splitPunct: ',;:。！？.!?',
  })

  if (segments.length === 0) {
    throw new Error('google-tts-no-segments')
  }

  const buffers: Buffer[] = []
  let estimatedDuration = 0
  for (const segment of segments) {
    const response = await fetch(segment.url)
    if (!response.ok) {
      throw new Error(`google-tts-fetch-failed:${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    buffers.push(Buffer.from(arrayBuffer))
    const chars = segment.shortText?.length ?? config.text.length / segments.length
    estimatedDuration += Math.max(chars / 16, 0.6)
  }

  const mp3Buffer = Buffer.concat(buffers)
  if (mp3Buffer.length === 0) {
    throw new Error('google-tts-empty-buffer')
  }

  const synthesized: SynthesizedSpeech = {
    audioBase64: mp3Buffer.toString('base64'),
    sampleRate: 22050,
    durationSeconds: Number(estimatedDuration.toFixed(2)),
    format: 'audio/mpeg',
  }

  const voiceId = config.requestedVoiceId ?? config.preset?.id ?? `google-${language}`
  if (voiceId) {
    synthesized.voiceId = voiceId
  }
  if (config.playbackRate !== 1) {
    synthesized.playbackRate = config.playbackRate
  }

  return synthesized
}

export async function synthesizeSpeech(options: SynthesizeSpeechOptions): Promise<SynthesizedSpeech> {
  const text = options.text?.trim()
  if (!text) {
    throw new Error('Text is required for synthesis')
  }
  const sanitizedText = sanitizeSpeechText(text)
  if (!sanitizedText) {
    throw new Error('Text became empty after removing unsupported symbols')
  }

  if (sanitizedText.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text is too long. Maximum characters supported: ${MAX_TEXT_LENGTH}`)
  }

  let preset = resolveVoicePreset(options.voiceId ?? DEFAULT_VOICE_ID)
  const normalizedSpeakerOption =
    typeof options.speakerId === 'string' && options.speakerId.trim().length > 0
      ? options.speakerId.trim()
      : undefined
  let language = options.language || preset?.language || DEFAULT_LANGUAGE
  const toneVoiceId = options.voiceId ? null : pickToneVoiceId(options.tone, language)
  if (!options.voiceId && toneVoiceId) {
    const tonePreset = resolveVoicePreset(toneVoiceId)
    if (tonePreset) {
      preset = tonePreset
      language = options.language || tonePreset.language || language
    }
  }
  if (!preset) {
    const fallbackPreset =
      resolveVoicePreset(DEFAULT_VOICE_ID) ??
      VOICE_PRESETS.find((candidate) => candidate.language === language) ??
      VOICE_PRESETS[0] ??
      null
    preset = fallbackPreset
    if (preset?.language && !options.language) {
      language = preset.language
    }
  }
  const speakerId = normalizedSpeakerOption || preset?.speakerId || DEFAULT_SPEAKER
  let gain = options.volume ?? preset?.gain ?? 1
  if (!options.volume && options.tone) {
    const tone = options.tone.toLowerCase()
    if (tone.includes('urgent') || tone.includes('alert')) {
      gain = Math.min(gain + 0.12, 1.35)
    } else if (tone.includes('gentle') || tone.includes('calm') || tone.includes('sooth')) {
      gain = Math.max(gain - 0.08, 0.8)
    }
  }
  let playbackRateCandidate = options.speed ?? preset?.playbackRate ?? 1
  if (!options.speed && options.tone) {
    const tone = options.tone.toLowerCase()
    if (tone.includes('urgent') || tone.includes('alert')) {
      playbackRateCandidate = playbackRateCandidate + 0.08
    } else if (tone.includes('gentle') || tone.includes('calm') || tone.includes('sooth')) {
      playbackRateCandidate = playbackRateCandidate - 0.05
    }
  }
  const playbackRate = Number.isFinite(playbackRateCandidate)
    ? Number(Math.min(Math.max(playbackRateCandidate, 0.8), 1.25).toFixed(2))
    : 1
  const requestedVoiceId = options.voiceId ?? toneVoiceId ?? preset?.id ?? undefined

  const resolvedConfig: ResolvedSynthConfig = {
    text: sanitizedText,
    language,
    speakerId,
    gain,
    playbackRate,
    preset,
  }
  if (normalizedSpeakerOption) {
    resolvedConfig.rawSpeakerOption = normalizedSpeakerOption
  }
  if (requestedVoiceId) {
    resolvedConfig.requestedVoiceId = requestedVoiceId
  }
  if (options.tone) {
    resolvedConfig.tone = options.tone
  }
  if (toneVoiceId) {
    resolvedConfig.toneVoiceId = toneVoiceId
  }
  const pipelineOrder: Array<{ name: string; handler: () => Promise<SynthesizedSpeech> }> = []
  if (SELECTED_TTS_ENGINE === 'google') {
    pipelineOrder.push({ name: 'google-tts', handler: () => synthesizeWithGoogle(resolvedConfig) })
    pipelineOrder.push({ name: 'edge-tts', handler: () => synthesizeWithEdge(resolvedConfig) })
    pipelineOrder.push({ name: 'xenova', handler: () => synthesizeWithXenova(resolvedConfig) })
  } else if (SELECTED_TTS_ENGINE === 'edge') {
    pipelineOrder.push({ name: 'edge-tts', handler: () => synthesizeWithEdge(resolvedConfig) })
    pipelineOrder.push({ name: 'xenova', handler: () => synthesizeWithXenova(resolvedConfig) })
  } else {
    pipelineOrder.push({ name: 'xenova', handler: () => synthesizeWithXenova(resolvedConfig) })
    pipelineOrder.push({ name: 'edge-tts', handler: () => synthesizeWithEdge(resolvedConfig) })
    pipelineOrder.push({ name: 'google-tts', handler: () => synthesizeWithGoogle(resolvedConfig) })
  }

  let lastError: unknown = null
  for (const step of pipelineOrder) {
    try {
      return await step.handler()
    } catch (error) {
      lastError = error
      console.warn(`[tts] ${step.name} pipeline failed`, error)
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('tts-all-pipelines-failed')
}

function floatToWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size (PCM)
  view.setUint16(20, 1, true) // Audio format
  view.setUint16(22, 1, true) // Num channels
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // Byte rate
  view.setUint16(32, 2, true) // Block align
  view.setUint16(34, 16, true) // Bits per sample
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)
  floatTo16BitPCM(view, 44, samples)

  return buffer
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function floatTo16BitPCM(view: DataView, offset: number, samples: Float32Array) {
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sampleValue = samples[i] ?? 0
    const rawSample = Number.isFinite(sampleValue) ? sampleValue : 0
    const clamped = Math.max(-1, Math.min(1, rawSample))
    const converted = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff)
    view.setInt16(offset, converted, true)
  }
}
