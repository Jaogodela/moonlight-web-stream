import { globalObject } from "../util"
import { Logger } from "./log"
import { Pipe } from "./pipeline/index"
import { Transport } from "./transport/index"

export type StatValue = string | number

export type StreamStatsData = {
    videoPipeline: string | null
    audioPipeline: string | null
    transport: Record<string, StatValue>
    video: Record<string, StatValue>
    audio: Record<string, StatValue>
}

export type StreamStatsMode = "off" | "minimal" | "full"

export type StreamStatsHudData = {
    fps: string
    latency: string
    bitrate: string
    packetLoss: string
    resolution: string
    codec: string
}

function finiteNumber(value: StatValue | undefined): number | null {
    return typeof value == "number" && Number.isFinite(value) ? value : null
}

function firstNumber(stats: Record<string, StatValue>, keys: string[]): number | null {
    for (const key of keys) {
        const value = finiteNumber(stats[key])
        if (value != null) {
            return value
        }
    }
    return null
}

function formatFixed(value: number | null, digits: number, suffix = ""): string {
    return value == null ? "—" : `${value.toFixed(digits)}${suffix}`
}

function formatCodec(value: StatValue | undefined): string {
    if (typeof value != "string" || !value.trim()) {
        return "—"
    }

    const codec = value.trim()
    const normalized = codec.toLowerCase()
    if (normalized.startsWith("h264") || normalized.startsWith("avc1")) {
        return "H.264"
    }
    if (normalized.startsWith("h265") || normalized.startsWith("hevc") || normalized.startsWith("hvc1")) {
        return "H.265"
    }
    if (normalized.startsWith("av1")) {
        return "AV1"
    }
    if (normalized.startsWith("vp9")) {
        return "VP9"
    }
    if (normalized.startsWith("vp8")) {
        return "VP8"
    }
    return codec.toUpperCase()
}

export function streamStatsToHudData(statsData: StreamStatsData): StreamStatsHudData {
    const transport = statsData.transport
    const video = statsData.video

    const resolution = typeof transport.resolution == "string"
        ? transport.resolution.match(/(?:width\s*:\s*)?(\d+)\s*[,×x ]+\s*(?:height\s*:\s*)?(\d+)/i)
        : null
    const fpsFromResolution = typeof transport.resolution == "string"
        ? transport.resolution.match(/fps\s*:\s*([\d.]+)/i)
        : null
    const fps = firstNumber(transport, ["currentFps", "fps"]) ?? firstNumber(video, ["currentFps", "fps"])
        ?? (fpsFromResolution ? Number(fpsFromResolution[1]) : null)

    const bitrateMbps = firstNumber(transport, ["bitrateMbps"])
    const bitrateKbps = firstNumber(transport, ["bitrateKbps"])

    const packetsLost = firstNumber(transport, ["packetsLost"])
    const packetsReceived = firstNumber(transport, ["packetsReceived"])
    const lossPercent = packetsLost != null && packetsReceived != null
        ? Math.max(0, packetsLost) / Math.max(1, Math.max(0, packetsLost) + Math.max(0, packetsReceived)) * 100
        : null

    const latencyMs = firstNumber(transport, ["currentRoundTripTimeMs", "relayToClientRttMs", "roundTripTimeMs", "hostToRelayRttMs"])

    return {
        fps: formatFixed(fps, 1),
        latency: formatFixed(latencyMs, 1, " ms"),
        bitrate: bitrateMbps != null
            ? formatFixed(bitrateMbps, 2, " Mbps")
            : bitrateKbps != null
                ? formatFixed(bitrateKbps / 1000, 2, " Mbps")
                : "—",
        packetLoss: formatFixed(lossPercent, 2, "%"),
        resolution: resolution ? `${resolution[1]}×${resolution[2]}` : "—",
        codec: formatCodec(transport.codec),
    }
}

function num(value: number | null | undefined, suffix?: string): string | null {
    if (value == null) {
        return null
    } else {
        return `${value.toFixed(2)}${suffix ?? ""}`
    }
}

export function streamStatsToText(statsData: StreamStatsData): string {
    let text = `stats:
video pipeline: ${statsData.videoPipeline}
audio pipeline: ${statsData.audioPipeline}
`
    for (const key in statsData.transport) {
        const value = statsData.transport[key]
        let valuePretty = value

        if (typeof value == "number" && key.endsWith("Ms")) {
            valuePretty = `${num(value, "ms")}`
        }

        text += `${key}: ${valuePretty}\n`
    }

    for (const key in statsData.video) {
        const value = statsData.video[key]
        let valuePretty = value

        if (typeof value == "number" && key.endsWith("Ms")) {
            valuePretty = `${num(value, "ms")}`
        }

        text += `${key}: ${valuePretty}\n`
    }

    for (const key in statsData.audio) {
        const value = statsData.audio[key]
        let valuePretty = value

        if (typeof value == "number" && key.endsWith("Ms")) {
            valuePretty = `${num(value, "ms")}`
        }

        text += `${key}: ${valuePretty}\n`
    }

    return text
}

export class StreamStats {

    private logger: Logger | null = null

    private mode: StreamStatsMode = "off"
    private transport: Transport | null = null
    private updateIntervalId: number | null = null
    private lastBytesReceived: number | null = null
    private lastBytesReceivedAt: number | null = null

    private videoPipe: Pipe | null = null
    private audioPipe: Pipe | null = null
    private statsData: StreamStatsData = {
        videoPipeline: null,
        audioPipeline: null,
        transport: {},
        video: {},
        audio: {}
    }

    constructor(logger?: Logger) {
        if (logger) {
            this.logger = logger
        }
    }

    setTransport(transport: Transport) {
        this.transport = transport
        this.lastBytesReceived = null
        this.lastBytesReceivedAt = null
    }
    setEnabled(enabled: boolean) {
        this.setMode(enabled ? "full" : "off")
    }
    setMode(mode: StreamStatsMode) {
        this.mode = mode
        if (mode == "off") {
            this.lastBytesReceived = null
            this.lastBytesReceivedAt = null
        }
        this.checkEnabled()
    }
    isEnabled(): boolean {
        return this.mode != "off"
    }
    getMode(): StreamStatsMode {
        return this.mode
    }
    cycleMode(): StreamStatsMode {
        const nextMode: Record<StreamStatsMode, StreamStatsMode> = {
            off: "minimal",
            minimal: "full",
            full: "off",
        }
        this.setMode(nextMode[this.mode])
        return this.mode
    }
    toggle() {
        this.cycleMode()
    }

    private checkEnabled() {
        if (this.isEnabled() && this.updateIntervalId == null) {
            this.updateIntervalId = globalObject().setInterval(this.updateLocalStats.bind(this), 100)
        } else if (!this.isEnabled() && this.updateIntervalId != null) {
            globalObject().clearInterval(this.updateIntervalId)
            this.updateIntervalId = null
        }
    }

    private async updateLocalStats() {
        Promise.all([
            this.updateTransportStats(),
            this.updateVideoStats(),
            this.updateAudioStats(),
        ])
    }
    private async updateTransportStats() {
        if (!this.transport) {
            console.debug("Cannot query stats without transport")
            return
        }

        const stats = await this.transport.getStats()
        const nextStats: Record<string, StatValue> = { ...stats }
        const bytesReceived = finiteNumber(stats.bytesReceived)
        const now = Date.now()
        if (bytesReceived != null) {
            if (this.lastBytesReceived != null && this.lastBytesReceivedAt != null
                && bytesReceived >= this.lastBytesReceived && now > this.lastBytesReceivedAt) {
                nextStats.bitrateMbps = (bytesReceived - this.lastBytesReceived) * 8 / ((now - this.lastBytesReceivedAt) * 1000)
            }
            this.lastBytesReceived = bytesReceived
            this.lastBytesReceivedAt = now
        } else {
            this.lastBytesReceived = null
            this.lastBytesReceivedAt = null
        }
        this.statsData.transport = nextStats
    }
    private async updateVideoStats() {
        const stats = {}

        if (this.videoPipe && this.videoPipe.reportStats) {
            this.videoPipe.reportStats(stats)
        }

        this.statsData.video = stats
    }
    private async updateAudioStats() {
        const stats = {}

        if (this.audioPipe && this.audioPipe.reportStats) {
            this.audioPipe.reportStats(stats)
        }

        this.statsData.audio = stats
    }

    setVideoPipeline(name: string, pipe: Pipe | null) {
        this.statsData.videoPipeline = name
        this.videoPipe = pipe
    }
    setAudioPipeline(name: string, pipe: Pipe | null) {
        this.statsData.audioPipeline = name
        this.audioPipe = pipe
    }

    getCurrentStats(): StreamStatsData {
        const data = {}
        Object.assign(data, this.statsData)
        return data as StreamStatsData
    }
}
