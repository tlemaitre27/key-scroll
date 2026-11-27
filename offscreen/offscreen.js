// Offscreen document: tab capture → frames resampled onto a strict constant frame-rate grid
// (60 fps by default) → H.264 encoding (WebCodecs) → MP4 (mp4-muxer).
//
// Why: tab capture delivers frames at an irregular pace (8 / 16 / 25 ms apart on a 120 Hz
// display, 120 fps bursts in Opera). MediaRecorder kept those timestamps as they were, which
// caused small stutters. Here every slot (16.67 ms at 60 fps) gets the closest captured frame
// with an exact timestamp: the video has a constant frame rate.
//
// Fallback: if WebCodecs accepts no H.264 configuration, MediaRecorder is used instead.

const MIMES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

let session = null; // current recording
let keepAlive = null;

const toBackground = (msg) => chrome.runtime.sendMessage({ target: 'background', ...msg });
const fail = (error) => toBackground({ type: 'offscreen-error', error: String((error && error.message) || error) });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    start(msg)
      .then((info) => sendResponse({ ok: true, info }))
      .catch((e) => {
        cleanup();
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      });
    return true;
  }
  if (msg.type === 'pagelog') {
    // Events sent by the page (scroll start / end, slow frames), stamped in absolute time.
    if (session && session.log)
      session.log.page.push([+(msg.epoch - performance.timeOrigin).toFixed(1), msg.event, msg.value ?? null]);
    return;
  }
  if (msg.type === 'stop') {
    stopRecording();
    sendResponse({ ok: true });
  }
});

async function start({ streamId, fps, bitrate, width, height }) {
  if (session) throw new Error('A recording is already in progress');
  // Fixed size = viewport size. Without it, Chromium captures at the screen size and adds
  // black bars (letterboxing) when the aspect ratios differ.
  // Capture rate capped at twice the output rate: more frames to choose from means a closer
  // match for each slot. The video itself stays at `fps`.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        minWidth: width,
        maxWidth: width,
        minHeight: height,
        maxHeight: height,
        maxFrameRate: fps * 2
      }
    }
  });
  const track = stream.getVideoTracks()[0];
  track.onended = () => {
    if (session && !session.stopping) fail('The capture stream ended (tab closed or capture interrupted).');
  };

  const config = await pickEncoderConfig(width, height, fps, bitrate);
  const info = config
    ? startWebCodecs(stream, track, config, { width, height, fps })
    : startMediaRecorder(stream, track, bitrate);

  // Keeps the service worker awake during the recording.
  keepAlive = setInterval(() => toBackground({ type: 'ping' }), 20000);
  return { ...info, trackSettings: track.getSettings() };
}

function stopRecording() {
  if (!session || session.stopping) return;
  session.stopping = true;
  session.stop();
}

function cleanup() {
  clearInterval(keepAlive);
  if (session) session.stream.getTracks().forEach((t) => t.stop());
  session = null;
}

async function deliver(blob, mime, stats, log) {
  if (!blob.size) {
    cleanup();
    await fail(`Empty recording (0 bytes). Frames captured: ${stats.framesCaptured ?? '?'}.`);
    return;
  }
  const url = URL.createObjectURL(blob);
  const logUrl = log ? URL.createObjectURL(new Blob([JSON.stringify(log)], { type: 'application/json' })) : null;
  cleanup();
  await toBackground({ type: 'done', url, logUrl, mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm', stats });
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (logUrl) URL.revokeObjectURL(logUrl);
  }, 120000);
}

// =====================================================================
// WebCodecs: constant frame-rate grid
// =====================================================================

// H.264 levels: [code, max macroblocks per frame, max macroblocks per second].
const AVC_LEVELS = [
  ['28', 8192, 245760], // 4.0
  ['2a', 8704, 522240], // 4.2
  ['32', 22080, 589824], // 5.0
  ['33', 36864, 983040], // 5.1
  ['34', 36864, 2073600], // 5.2
  ['3c', 139264, 4177920], // 6.0
  ['3d', 139264, 8355840], // 6.1
  ['3e', 139264, 16711680] // 6.2
];

async function pickEncoderConfig(width, height, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined' || typeof MediaStreamTrackProcessor === 'undefined') return null;
  const mbPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const levels = AVC_LEVELS.filter(([, fs, mbps]) => mbPerFrame <= fs && mbPerFrame * fps <= mbps);
  for (const [lvl] of levels) {
    for (const profile of ['6400', '4d00']) {
      // High, then Main
      const config = {
        codec: `avc1.${profile}${lvl}`,
        width,
        height,
        bitrate,
        bitrateMode: 'variable',
        framerate: fps,
        latencyMode: 'quality',
        avc: { format: 'avc' } // format expected inside an MP4
      };
      try {
        const r = await VideoEncoder.isConfigSupported(config);
        if (r.supported) return r.config;
      } catch (e) {
        /* try the next configuration */
      }
    }
  }
  return null;
}

function startWebCodecs(stream, track, config, { width, height, fps }) {
  const { Muxer, ArrayBufferTarget } = Mp4Muxer;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e;
      fail('Encoding error: ' + ((e && e.message) || e));
      stopRecording();
    }
  });
  encoder.configure(config);

  const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  const slotUs = 1e6 / fps;
  const keyEvery = fps * 2; // one key frame every 2 s
  const startedAt = performance.now();

  // Captured frames: { f: VideoFrame, used: bool }. `prev` is the latest one received.
  let prev = null;
  let slot = 0; // next slot to fill
  let t0 = null; // timestamp (µs) of the first frame
  let clockOffset = 0; // performance.now() (µs) − capture timestamp
  let resizeCanvas = null;
  let lastUsed = null; // frame used for the previous slot (to count duplicates)
  let lastTs = null;
  let lastMismatch = null; // last frame size that differed from the capture size (window resized)
  // Diagnostic log. Times in ms on this document's clock (performance.now()).
  //  frames: [arrival, capture timestamp, encoder queue size]
  //  waits:  [start, duration] of pauses waiting for the encoder
  //  page:   [time, event, value] sent by the page
  const log = { version: 1, fps, width, height, startedAt: +startedAt.toFixed(1), frames: [], waits: [], page: [] };
  const stats = { framesCaptured: 0, framesWritten: 0, duplicated: 0, skipped: 0, maxCaptureGapMs: 0, sizeMismatch: 0 };

  // Encodes frame `item` into slot `slot` with an exact timestamp.
  function encodeSlot(item) {
    const frame = item.f;
    let src = frame;
    if (frame.displayWidth !== width || frame.displayHeight !== height) {
      // The window was resized during the recording: fit the frame without distorting it.
      stats.sizeMismatch++;
      const sz = `${frame.displayWidth}x${frame.displayHeight}`;
      if (sz !== lastMismatch) {
        lastMismatch = sz;
        log.page.push([+performance.now().toFixed(1), 'window-resize', sz]);
      }
      src = fitFrame(frame);
    } else lastMismatch = null;
    const out = new VideoFrame(src, { timestamp: Math.round(slot * slotUs), duration: Math.round(slotUs) });
    if (src !== frame) src.close();
    encoder.encode(out, { keyFrame: slot % keyEvery === 0 });
    out.close();
    if (lastUsed === item) stats.duplicated++;
    lastUsed = item;
    item.used = true;
    stats.framesWritten++;
    slot++;
  }

  function fitFrame(frame) {
    if (!resizeCanvas) resizeCanvas = new OffscreenCanvas(width, height);
    const ctx = resizeCanvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const s = Math.min(width / frame.displayWidth, height / frame.displayHeight);
    const w = frame.displayWidth * s,
      h = frame.displayHeight * s;
    ctx.drawImage(frame, (width - w) / 2, (height - h) / 2, w, h);
    return new VideoFrame(resizeCanvas, { timestamp: frame.timestamp });
  }

  // Fills the slots up to `untilUs` (capture time) with whichever of `prev` and `next` is
  // closest. `next` is null at the end of the recording.
  function fillSlots(next, untilUs) {
    while (prev && t0 + slot * slotUs <= untilUs) {
      const s = t0 + slot * slotUs;
      const usePrev = !next || s - prev.f.timestamp <= next.f.timestamp - s;
      encodeSlot(usePrev ? prev : next);
    }
  }

  function release(item) {
    if (!item.used) stats.skipped++; // frame from a burst above the output rate: expected, it was the closest to no slot
    item.f.close();
  }

  async function pump() {
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done || !frame) break;
      if (session.stopping || encodeError) {
        frame.close();
        break;
      }
      stats.framesCaptured++;
      log.frames.push([+performance.now().toFixed(1), +(frame.timestamp / 1000).toFixed(1), encoder.encodeQueueSize]);
      if (lastTs != null) stats.maxCaptureGapMs = Math.max(stats.maxCaptureGapMs, (frame.timestamp - lastTs) / 1000);
      lastTs = frame.timestamp;
      const item = { f: frame, used: false };

      if (t0 == null) {
        t0 = frame.timestamp;
        clockOffset = performance.now() * 1000 - frame.timestamp;
        prev = item;
        continue;
      }
      fillSlots(item, frame.timestamp);
      release(prev);
      prev = item;

      // Safety net: if the encoder falls behind, wait for its queue to drain.
      if (encoder.encodeQueueSize > 30) {
        const w0 = performance.now();
        while (encoder.encodeQueueSize > 30) await new Promise((r) => setTimeout(r, 5));
        log.waits.push([+w0.toFixed(1), +(performance.now() - w0).toFixed(1)]);
      }
    }
  }

  const pumping = pump().catch((e) => {
    fail(e);
  });

  session = {
    stream,
    log,
    stopping: false,
    async stop() {
      log.stopAt = +performance.now().toFixed(1);
      log.t0CaptureMs = t0 != null ? +(t0 / 1000).toFixed(1) : null;
      log.clockOffsetMs = +(clockOffset / 1000).toFixed(1);
      const stopUs = performance.now() * 1000 - clockOffset;
      try {
        await reader.cancel();
      } catch (e) {}
      await pumping;
      // A still page at the end of the recording barely produces frames: extend the last
      // one up to the moment Stop was pressed.
      if (prev && t0 != null) fillSlots(null, stopUs);
      if (prev) {
        release(prev);
        prev = null;
      }
      try {
        await encoder.flush();
        encoder.close();
        muxer.finalize();
      } catch (e) {
        cleanup();
        await fail('Could not finalize the video: ' + ((e && e.message) || e));
        return;
      }
      const blob = new Blob([target.buffer], { type: 'video/mp4' });
      await deliver(
        blob,
        'video/mp4',
        {
          pipeline: 'webcodecs',
          codec: config.codec,
          seconds: +((performance.now() - startedAt) / 1000).toFixed(2),
          sizeMB: +(blob.size / 1048576).toFixed(2),
          fps,
          ...stats,
          maxCaptureGapMs: +stats.maxCaptureGapMs.toFixed(1),
          videoSize: `${width}x${height}`
        },
        log
      );
    }
  };

  return { mime: `video/mp4 (WebCodecs ${config.codec}, ${fps} fps constant)`, videoSize: `${width}x${height}` };
}

// =====================================================================
// Fallback: MediaRecorder (variable frame rate)
// =====================================================================

function startMediaRecorder(stream, track, bitrate) {
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  if (!mime) throw new Error('No encoder available (neither WebCodecs nor MediaRecorder)');
  const chunks = [];
  const startedAt = performance.now();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.onerror = (e) => fail(e.error || e);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const s = track.getSettings();
    deliver(blob, mime, {
      pipeline: 'mediarecorder (fallback, variable frame rate)',
      seconds: +((performance.now() - startedAt) / 1000).toFixed(2),
      sizeMB: +(blob.size / 1048576).toFixed(2),
      videoSize: `${s.width}x${s.height}`
    });
  };
  recorder.start(1000);
  session = {
    stream,
    stopping: false,
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
    }
  };
  return { mime: mime + ' (MediaRecorder fallback)', videoSize: '' };
}
