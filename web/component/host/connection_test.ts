import { Api, apiGetHost } from "../../api"

export type ConnectionTestResult = {
    averageMs: number
    minimumMs: number
    jitterMs: number
    samples: number[]
}

/**
 * Measures authenticated round-trip time through the existing host refresh API.
 * This reaches the selected Sunshine host through the same client service path
 * used by the library and does not contact any third-party service.
 */
export async function testHostConnection(api: Api, hostId: number, sampleCount = 5): Promise<ConnectionTestResult> {
    const samples: number[] = []

    for (let index = 0; index < sampleCount; index++) {
        const start = performance.now()
        const host = await apiGetHost(api, { host_id: hostId })
        const elapsed = performance.now() - start
        if (host.server_state == null) {
            throw new Error("Selected server is offline")
        }
        samples.push(elapsed)
    }

    const averageMs = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
    const minimumMs = Math.min(...samples)
    // Mean absolute change between successive round trips.
    const jitterMs = samples.length > 1
        ? samples.slice(1).reduce((sum, sample, index) => sum + Math.abs(sample - samples[index]), 0) / (samples.length - 1)
        : 0

    const oneDecimal = (value: number) => Math.round(value * 10) / 10
    return {
        averageMs: oneDecimal(averageMs),
        minimumMs: oneDecimal(minimumMs),
        jitterMs: oneDecimal(jitterMs),
        samples,
    }
}
