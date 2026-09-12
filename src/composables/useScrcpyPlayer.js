/**
 * 解析本仓库 scrcpy UDP 视频载荷（与 C 客户端 demuxer 一致），
 * 用 WebCodecs 解码 H.264 并画到 canvas。
 */

const PACKET_HEADER_SIZE = 12
const PACKET_FLAG_CONFIG = 1n << 62n
const PACKET_FLAG_KEY_FRAME = 1n << 61n
const PACKET_PTS_MASK = PACKET_FLAG_KEY_FRAME - 1n
const CODEC_H264 = 0x68323634

function read32be(data, offset) {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

function read64be(data, offset) {
  const hi = read32be(data, offset)
  const lo = read32be(data, offset + 4)
  return (BigInt(hi) << 32n) | BigInt(lo)
}

function splitAnnexB(data) {
  const nals = []
  const findStart = (from) => {
    for (let p = from; p + 2 < data.length; p++) {
      if (data[p] === 0 && data[p + 1] === 0) {
        if (data[p + 2] === 1) return { start: p, sc: 3 }
        if (p + 3 < data.length && data[p + 2] === 0 && data[p + 3] === 1) {
          return { start: p, sc: 4 }
        }
      }
    }
    return null
  }
  let cur = findStart(0)
  while (cur) {
    const nalStart = cur.start + cur.sc
    const next = findStart(nalStart)
    const nalEnd = next ? next.start : data.length
    if (nalEnd > nalStart) nals.push(data.subarray(nalStart, nalEnd))
    cur = next
  }
  if (!nals.length && data.length) nals.push(data)
  return nals
}

function isAnnexB(data) {
  if (data.length < 4) return false
  return (
    (data[0] === 0 && data[1] === 0 && data[2] === 0 && data[3] === 1) ||
    (data[0] === 0 && data[1] === 0 && data[2] === 1)
  )
}

function toLengthPrefixed(data) {
  if (!isAnnexB(data)) return data
  const nals = splitAnnexB(data)
  let total = 0
  for (const nal of nals) total += 4 + nal.length
  const out = new Uint8Array(total)
  let off = 0
  for (const nal of nals) {
    out[off] = (nal.length >>> 24) & 0xff
    out[off + 1] = (nal.length >>> 16) & 0xff
    out[off + 2] = (nal.length >>> 8) & 0xff
    out[off + 3] = nal.length & 0xff
    out.set(nal, off + 4)
    off += 4 + nal.length
  }
  return out
}

function pickSpsPps(data) {
  const nals = isAnnexB(data) ? splitAnnexB(data) : splitLengthPrefixed(data)
  let sps = null
  let pps = null
  for (const nal of nals) {
    if (!nal.length) continue
    const type = nal[0] & 0x1f
    if (type === 7) sps = nal
    else if (type === 8) pps = nal
  }
  return { sps, pps }
}

function splitLengthPrefixed(data) {
  const nals = []
  let off = 0
  while (off + 4 <= data.length) {
    const size = read32be(data, off)
    off += 4
    if (size <= 0 || off + size > data.length) break
    nals.push(data.subarray(off, off + size))
    off += size
  }
  return nals
}

function codecFromSps(sps) {
  if (!sps || sps.length < 4) return 'avc1.42E01E'
  const profile = sps[1].toString(16).padStart(2, '0')
  const compat = sps[2].toString(16).padStart(2, '0')
  const level = sps[3].toString(16).padStart(2, '0')
  return `avc1.${profile}${compat}${level}`
}

function buildAvcC(sps, pps) {
  const spsList = sps ? [sps] : []
  const ppsList = pps ? [pps] : []
  let size = 7
  for (const n of spsList) size += 2 + n.length
  for (const n of ppsList) size += 2 + n.length
  const out = new Uint8Array(size)
  out[0] = 1
  out[1] = sps ? sps[1] : 0x42
  out[2] = sps ? sps[2] : 0xe0
  out[3] = sps ? sps[3] : 0x1e
  out[4] = 0xff
  out[5] = 0xe0 | (spsList.length & 0x1f)
  let off = 6
  for (const n of spsList) {
    out[off] = (n.length >> 8) & 0xff
    out[off + 1] = n.length & 0xff
    out.set(n, off + 2)
    off += 2 + n.length
  }
  out[off] = ppsList.length
  off += 1
  for (const n of ppsList) {
    out[off] = (n.length >> 8) & 0xff
    out[off + 1] = n.length & 0xff
    out.set(n, off + 2)
    off += 2 + n.length
  }
  return out
}

export function createScrcpyPlayer({ canvas, onSize, onStatus, onError }) {
  let decoder = null
  let configured = false
  let useLengthPrefixed = true
  let pendingConfig = null
  let lastConfig = null
  let videoSize = { width: 0, height: 0 }
  let codecId = 0
  let fallbackTs = 0
  let closed = false

  const emitStatus = (status) => {
    if (onStatus) onStatus(status)
  }

  const emitError = (msg) => {
    if (onError) onError(msg)
  }

  function resetDecoder() {
    if (decoder) {
      try {
        decoder.close()
      } catch {
        /* already closed */
      }
      decoder = null
    }
    configured = false
  }

  function drawFrame(frame) {
    const el = canvas()
    if (!el) {
      frame.close()
      return
    }
    const w = frame.displayWidth || frame.codedWidth
    const h = frame.displayHeight || frame.codedHeight
    if (w && h && (el.width !== w || el.height !== h)) {
      el.width = w
      el.height = h
      videoSize = { width: w, height: h }
      if (onSize) onSize(videoSize)
    }
    const ctx = el.getContext('2d')
    ctx.drawImage(frame, 0, 0, el.width, el.height)
    frame.close()
    emitStatus('streaming')
  }

  function ensureDecoder() {
    if (decoder) return decoder
    if (typeof VideoDecoder === 'undefined') {
      emitError('当前浏览器不支持 WebCodecs，无法播放 scrcpy')
      return null
    }
    decoder = new VideoDecoder({
      output: drawFrame,
      error: (err) => {
        configured = false
        emitError(err?.message || '视频解码失败')
      },
    })
    return decoder
  }

  async function configureFromConfig(configBytes) {
    const { sps, pps } = pickSpsPps(configBytes)
    if (!sps) {
      emitError('未找到 H.264 SPS')
      return false
    }
    const dec = ensureDecoder()
    if (!dec) return false
    const codec = codecFromSps(sps)
    const avcC = buildAvcC(sps, pps)
    const base = {
      codec,
      optimizeForLatency: true,
    }
    if (videoSize.width && videoSize.height) {
      base.codedWidth = videoSize.width
      base.codedHeight = videoSize.height
    }
    const withDesc = { ...base, description: avcC }
    try {
      const support = VideoDecoder.isConfigSupported
        ? await VideoDecoder.isConfigSupported(withDesc)
        : { supported: true }
      if (support.supported) {
        dec.configure(withDesc)
        useLengthPrefixed = true
      } else {
        dec.configure(base)
        useLengthPrefixed = false
      }
      configured = true
      return true
    } catch (e) {
      try {
        dec.configure(base)
        useLengthPrefixed = false
        configured = true
        return true
      } catch (e2) {
        emitError(e2?.message || e?.message || 'VideoDecoder 配置失败')
        return false
      }
    }
  }

  function decodeMedia(payload, isKey, pts) {
    const dec = ensureDecoder()
    if (!dec || !configured) return
    const data = useLengthPrefixed ? toLengthPrefixed(payload) : payload
    let ts = Number(pts)
    if (!Number.isFinite(ts) || ts < 0) {
      fallbackTs += 33333
      ts = fallbackTs
    } else {
      fallbackTs = ts
    }
    try {
      dec.decode(
        new EncodedVideoChunk({
          type: isKey ? 'key' : 'delta',
          timestamp: ts,
          data,
        })
      )
    } catch (e) {
      configured = false
      emitError(e?.message || '解码失败')
    }
  }

  async function push(buffer) {
    if (closed) return
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    if (data.length === 4) {
      codecId = read32be(data, 0)
      if (codecId !== CODEC_H264 && codecId !== 0) {
        emitError(`不支持的视频编码 0x${codecId.toString(16)}`)
      }
      return
    }
    if (data.length >= PACKET_HEADER_SIZE && data[0] & 0x80) {
      const width = read32be(data, 4)
      const height = read32be(data, 8)
      if (width && height) {
        videoSize = { width, height }
        if (onSize) onSize(videoSize)
        const el = canvas()
        if (el && (!el.width || !el.height)) {
          el.width = width
          el.height = height
        }
      }
      resetDecoder()
      pendingConfig = null
      lastConfig = null
      emitStatus('waiting')
      return
    }
    if (data.length < PACKET_HEADER_SIZE) return
    if (codecId && codecId !== CODEC_H264) return

    const ptsFlags = read64be(data, 0)
    const size = read32be(data, 8)
    if (!size || data.length < PACKET_HEADER_SIZE + size) return
    const payload = data.subarray(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + size)
    const isConfig = (ptsFlags & PACKET_FLAG_CONFIG) !== 0n
    const isKey = (ptsFlags & PACKET_FLAG_KEY_FRAME) !== 0n
    const pts = ptsFlags & PACKET_PTS_MASK

    if (isConfig) {
      pendingConfig = payload
      lastConfig = payload
      await configureFromConfig(payload)
      return
    }

    let media = payload
    if (pendingConfig) {
      const merged = new Uint8Array(pendingConfig.length + payload.length)
      merged.set(pendingConfig, 0)
      merged.set(payload, pendingConfig.length)
      media = merged
      pendingConfig = null
      if (!configured) await configureFromConfig(media)
    }

    if (!configured && lastConfig) {
      await configureFromConfig(lastConfig)
    }
    if (!configured) return
    if (decoder && decoder.decodeQueueSize > 8) {
      try {
        decoder.reset()
      } catch {
        /* ignore */
      }
      configured = false
      if (lastConfig) await configureFromConfig(lastConfig)
      return
    }
    decodeMedia(media, isKey, pts)
  }

  function dispose() {
    closed = true
    resetDecoder()
  }

  return { push, dispose, getSize: () => videoSize }
}
