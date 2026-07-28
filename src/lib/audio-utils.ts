import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { once } from "node:events";
import decodeMp3 from "@audio/decode-mp3";
import type { OutputFormat } from "./types";

const PCM_AUDIO_FORMAT = 1;
const MASTER_SAMPLE_RATE = 48_000;
const MASTER_CHANNELS = 1;
const MASTER_BITS_PER_SAMPLE = 24;

interface ParsedWav {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Buffer;
}

interface ParsedWavFile extends Omit<ParsedWav, "data"> {
  filePath: string;
  dataStart: number;
  dataSize: number;
}

export interface PcmWavConversionResult {
  wav: Buffer;
  remoteFormat: OutputFormat;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

async function readExact(
  handle: FileHandle,
  length: number,
  position: number,
) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("Invalid WAV file.");
  }

  return buffer;
}

async function parsePcmWavFile(filePath: string): Promise<ParsedWavFile> {
  const handle = await fs.open(filePath, "r");

  try {
    const header = await readExact(handle, 12, 0);
    if (
      header.toString("ascii", 0, 4) !== "RIFF" ||
      header.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new Error("Invalid WAV file.");
    }

    const stat = await handle.stat();
    let position = 12;
    let fmt: Omit<ParsedWav, "data"> | undefined;
    let dataStart: number | undefined;
    let dataSize: number | undefined;

    while (position + 8 <= stat.size) {
      const chunkHeader = await readExact(handle, 8, position);
      const chunkId = chunkHeader.toString("ascii", 0, 4);
      const chunkSize = chunkHeader.readUInt32LE(4);
      const chunkDataStart = position + 8;

      if (chunkId === "fmt ") {
        if (chunkSize < 16) {
          throw new Error("Invalid WAV format chunk.");
        }

        const format = await readExact(handle, 16, chunkDataStart);
        fmt = {
          audioFormat: format.readUInt16LE(0),
          channels: format.readUInt16LE(2),
          sampleRate: format.readUInt32LE(4),
          byteRate: format.readUInt32LE(8),
          blockAlign: format.readUInt16LE(12),
          bitsPerSample: format.readUInt16LE(14),
        };
      }

      if (chunkId === "data") {
        dataStart = chunkDataStart;
        dataSize = chunkSize;
      }

      if (fmt && dataStart !== undefined && dataSize !== undefined) {
        break;
      }

      position = chunkDataStart + chunkSize + (chunkSize % 2);
    }

    if (!fmt || dataStart === undefined || dataSize === undefined) {
      throw new Error("WAV file is missing audio data.");
    }

    if (fmt.audioFormat !== PCM_AUDIO_FORMAT) {
      throw new Error("Only PCM WAV audio is supported.");
    }

    return {
      ...fmt,
      filePath,
      dataStart,
      dataSize,
    };
  } finally {
    await handle.close();
  }
}

function parsePcmWavBuffer(buffer: Buffer): ParsedWav {
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Invalid WAV file.");
  }

  let position = 12;
  let fmt: Omit<ParsedWav, "data"> | undefined;
  let data: Buffer | undefined;

  while (position + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", position, position + 4);
    const chunkSize = buffer.readUInt32LE(position + 4);
    const chunkDataStart = position + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;

    if (chunkDataEnd > buffer.length) {
      throw new Error("Invalid WAV chunk size.");
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("Invalid WAV format chunk.");
      }

      fmt = {
        audioFormat: buffer.readUInt16LE(chunkDataStart),
        channels: buffer.readUInt16LE(chunkDataStart + 2),
        sampleRate: buffer.readUInt32LE(chunkDataStart + 4),
        byteRate: buffer.readUInt32LE(chunkDataStart + 8),
        blockAlign: buffer.readUInt16LE(chunkDataStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkDataStart + 14),
      };
    }

    if (chunkId === "data") {
      data = buffer.subarray(chunkDataStart, chunkDataEnd);
    }

    if (fmt && data) {
      break;
    }

    position = chunkDataEnd + (chunkSize % 2);
  }

  if (!fmt || !data) {
    throw new Error("WAV file is missing audio data.");
  }

  if (fmt.audioFormat !== PCM_AUDIO_FORMAT) {
    throw new Error("Only PCM WAV audio is supported.");
  }

  return { ...fmt, data };
}

function createPcmWavHeader(
  wav: Omit<ParsedWav, "data">,
  dataSize: number,
) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(wav.audioFormat, 20);
  header.writeUInt16LE(wav.channels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(wav.byteRate, 28);
  header.writeUInt16LE(wav.blockAlign, 32);
  header.writeUInt16LE(wav.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

function writePart(stream: ReturnType<typeof createWriteStream>, part: Buffer) {
  if (!stream.write(part)) {
    return once(stream, "drain").then(() => undefined);
  }

  return Promise.resolve();
}

export function detectAudioBufferFormat(bytes: Uint8Array): OutputFormat {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "wav";
  }

  if (
    (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") ||
    (buffer.length >= 2 &&
      buffer[0] === 0xff &&
      (buffer[1] & 0xe0) === 0xe0)
  ) {
    return "mp3";
  }

  throw new Error("Unsupported remote audio response.");
}

export async function detectAudioFileFormat(
  filePath: string,
): Promise<OutputFormat> {
  const handle = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return detectAudioBufferFormat(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function decodePcmSample(
  data: Buffer,
  position: number,
  bitsPerSample: number,
) {
  if (bitsPerSample === 16) {
    return data.readInt16LE(position) / 0x8000;
  }

  if (bitsPerSample === 24) {
    return data.readIntLE(position, 3) / 0x800000;
  }

  if (bitsPerSample === 32) {
    return data.readInt32LE(position) / 0x80000000;
  }

  throw new Error(`Unsupported PCM WAV bit depth: ${bitsPerSample}.`);
}

function pcmWavToChannelData(wav: ParsedWav) {
  if (wav.sampleRate !== MASTER_SAMPLE_RATE) {
    throw new Error(
      `Remote WAV sample rate changed: expected ${MASTER_SAMPLE_RATE}Hz.`,
    );
  }

  const bytesPerSample = wav.bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || wav.blockAlign <= 0) {
    throw new Error("Invalid PCM WAV block alignment.");
  }

  const sampleCount = Math.floor(wav.data.length / wav.blockAlign);
  const channels = Array.from(
    { length: wav.channels },
    () => new Float32Array(sampleCount),
  );

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < wav.channels; channelIndex += 1) {
      channels[channelIndex][sampleIndex] = decodePcmSample(
        wav.data,
        sampleIndex * wav.blockAlign + channelIndex * bytesPerSample,
        wav.bitsPerSample,
      );
    }
  }

  return channels;
}

export function encodePcm24Wav(
  channelData: Float32Array[],
  sampleRate: number,
) {
  if (sampleRate !== MASTER_SAMPLE_RATE) {
    throw new Error(
      `Remote audio sample rate changed: expected ${MASTER_SAMPLE_RATE}Hz.`,
    );
  }

  if (!channelData.length || channelData.some((channel) => channel.length === 0)) {
    throw new Error("Remote audio must contain at least one non-empty channel.");
  }

  const sampleCount = Math.min(...channelData.map((channel) => channel.length));
  const bytesPerSample = MASTER_BITS_PER_SAMPLE / 8;
  const blockAlign = MASTER_CHANNELS * bytesPerSample;
  const byteRate = MASTER_SAMPLE_RATE * blockAlign;
  const pcmData = Buffer.alloc(sampleCount * blockAlign);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const mixedSample =
      channelData.reduce((sum, channel) => sum + channel[sampleIndex], 0) /
      channelData.length;
    // A NaN/Infinity sample (e.g. from a corrupt MP3 decode) would make writeIntLE throw
    // RangeError and crash the whole merge. Treat non-finite samples as silence.
    const finiteSample = Number.isFinite(mixedSample) ? mixedSample : 0;
    const sample = Math.max(-1, Math.min(1, finiteSample));
    const integerSample =
      sample < 0
        ? Math.round(sample * 0x800000)
        : Math.round(sample * 0x7fffff);
    pcmData.writeIntLE(integerSample, sampleIndex * blockAlign, bytesPerSample);
  }

  const format: Omit<ParsedWav, "data"> = {
    audioFormat: PCM_AUDIO_FORMAT,
    channels: MASTER_CHANNELS,
    sampleRate: MASTER_SAMPLE_RATE,
    byteRate,
    blockAlign,
    bitsPerSample: MASTER_BITS_PER_SAMPLE,
  };

  return Buffer.concat([createPcmWavHeader(format, pcmData.length), pcmData]);
}

export async function convertRemoteAudioToPcm24Wav(
  bytes: Buffer,
): Promise<PcmWavConversionResult> {
  const remoteFormat = detectAudioBufferFormat(bytes);
  const decoded =
    remoteFormat === "mp3"
      ? await decodeMp3(bytes)
      : {
          channelData: pcmWavToChannelData(parsePcmWavBuffer(bytes)),
          sampleRate: MASTER_SAMPLE_RATE,
        };
  const { channelData, sampleRate } = decoded;

  const wav = encodePcm24Wav(channelData, sampleRate);
  validatePcm24MasterBuffer(wav);

  return {
    wav,
    remoteFormat,
    sampleRate,
    channels: MASTER_CHANNELS,
    bitsPerSample: MASTER_BITS_PER_SAMPLE,
  };
}

// Playback length of a PCM master buffer, used to detect VoxCPM "bad cases" (a take far longer
// than the text warrants — a repeat or a leaked reference echo) by its chars-per-second.
export function pcm24DurationSeconds(buffer: Buffer) {
  const wav = parsePcmWavBuffer(buffer);
  return wav.byteRate > 0 ? wav.data.length / wav.byteRate : 0;
}

export function validatePcm24MasterBuffer(buffer: Buffer) {
  const wav = parsePcmWavBuffer(buffer);

  if (
    wav.audioFormat !== PCM_AUDIO_FORMAT ||
    wav.sampleRate !== MASTER_SAMPLE_RATE ||
    wav.channels !== MASTER_CHANNELS ||
    wav.bitsPerSample !== MASTER_BITS_PER_SAMPLE
  ) {
    throw new Error("Generated WAV chunk does not match the PCM master format.");
  }
}

export function getPunctuationAwarePauseMilliseconds(scriptChunk: string) {
  const trimmed = scriptChunk.trim();

  if (/[။.!?]$/u.test(trimmed)) {
    return 260;
  }

  if (/[၊,;:]$/u.test(trimmed)) {
    return 160;
  }

  return 120;
}

const INT24_MAX = 0x7fffff;
const INT24_MIN = -0x800000;
// Master to -1 dBFS so output level is consistent and "produced" without inter-sample clipping.
const MASTER_PEAK_TARGET_DBFS = -1;
// Short edge fades remove the start/end click of a hard PCM cut.
const MASTER_FADE_MILLISECONDS = 4;
// Cap the lift so a quiet/near-silent take is not amplified into its own noise floor.
const MASTER_MAX_GAIN = 6;
// Skip very long files to keep this in-memory pass bounded (~25 min at the master format).
const MASTER_MAX_DATA_BYTES = 256 * 1024 * 1024;

// A chunk counts as voiced above this fraction of its own peak (~ -36 dBFS relative).
const SILENCE_THRESHOLD_RATIO = 0.015;
// Always keep this much audio around the voiced region so a soft onset/tail is never clipped.
const SILENCE_GUARD_MILLISECONDS = 25;

// Trim leading/trailing near-silence from one 24-bit chunk so the only inter-chunk gap is the
// controlled punctuation pause (VoxCPM pads each chunk with variable silence → choppy rhythm).
// Conservative by design: a per-chunk relative threshold plus a guard margin, so worst case it
// trims slightly less, never into speech.
export async function trimSilenceEdges(filePath: string) {
  const wav = await parsePcmWavFile(filePath);
  const bytesPerSample = wav.bitsPerSample / 8;
  if (bytesPerSample !== 3 || wav.dataSize === 0) return;

  const handle = await fs.open(filePath, "r");
  let data: Buffer;
  try {
    data = Buffer.alloc(wav.dataSize);
    const { bytesRead } = await handle.read(data, 0, wav.dataSize, wav.dataStart);
    if (bytesRead !== wav.dataSize) return;
  } finally {
    await handle.close();
  }

  const sampleCount = Math.floor(wav.dataSize / bytesPerSample);
  if (sampleCount === 0) return;

  let peak = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const magnitude = Math.abs(data.readIntLE(i * bytesPerSample, bytesPerSample));
    if (magnitude > peak) peak = magnitude;
  }
  if (peak === 0) return; // entirely silent — leave it for the merge/pause logic

  const threshold = peak * SILENCE_THRESHOLD_RATIO;
  let first = 0;
  while (first < sampleCount && Math.abs(data.readIntLE(first * bytesPerSample, bytesPerSample)) <= threshold) first += 1;
  let last = sampleCount - 1;
  while (last > first && Math.abs(data.readIntLE(last * bytesPerSample, bytesPerSample)) <= threshold) last -= 1;
  if (first >= last) return;

  const guard = Math.round((wav.sampleRate * SILENCE_GUARD_MILLISECONDS) / 1000);
  const start = Math.max(0, first - guard);
  const end = Math.min(sampleCount, last + 1 + guard);
  if (start === 0 && end === sampleCount) return; // nothing to trim

  const trimmed = data.subarray(start * bytesPerSample, end * bytesPerSample);
  const header = createPcmWavHeader(wav, trimmed.length);
  await fs.writeFile(filePath, Buffer.concat([header, trimmed]));
}

interface ChunkLoudness {
  filePath: string;
  wav: ParsedWavFile;
  rms: number;
  peak: number;
}

async function measureChunkLoudness(filePath: string): Promise<ChunkLoudness> {
  const wav = await parsePcmWavFile(filePath);
  const bytesPerSample = wav.bitsPerSample / 8;
  if (bytesPerSample !== 3 || wav.dataSize === 0) return { filePath, wav, rms: 0, peak: 0 };

  const handle = await fs.open(filePath, "r");
  try {
    const data = Buffer.alloc(wav.dataSize);
    const { bytesRead } = await handle.read(data, 0, wav.dataSize, wav.dataStart);
    if (bytesRead !== wav.dataSize) return { filePath, wav, rms: 0, peak: 0 };
    const sampleCount = Math.floor(data.length / bytesPerSample);
    let peak = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      peak = Math.max(peak, Math.abs(data.readIntLE(i * bytesPerSample, bytesPerSample)) / INT24_MAX);
    }
    if (peak === 0) return { filePath, wav, rms: 0, peak: 0 };

    const activeThreshold = peak * 0.02;
    let sumSquares = 0;
    let activeSamples = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const sample = data.readIntLE(i * bytesPerSample, bytesPerSample) / INT24_MAX;
      if (Math.abs(sample) < activeThreshold) continue;
      sumSquares += sample * sample;
      activeSamples += 1;
    }
    return {
      filePath,
      wav,
      rms: activeSamples > 0 ? Math.sqrt(sumSquares / activeSamples) : 0,
      peak
    };
  } finally {
    await handle.close();
  }
}

// Match each generated chunk to the median active-speech RMS before merging. The adjustment is
// deliberately capped at ±3 dB and is peak-safe, which smooths obvious level jumps without
// flattening the performance dynamics that make movie-recap and emotional styles expressive.
export async function matchChunkLoudness(filePaths: string[], maxAdjustmentDb = 3) {
  if (filePaths.length < 2) return { adjustedChunks: 0, targetRms: 0 };
  const measurements = await Promise.all(filePaths.map(measureChunkLoudness));
  const validRms = measurements.map((item) => item.rms).filter((value) => value > 0).sort((a, b) => a - b);
  if (validRms.length < 2) return { adjustedChunks: 0, targetRms: validRms[0] || 0 };
  const middle = Math.floor(validRms.length / 2);
  const targetRms = validRms.length % 2 ? validRms[middle] : (validRms[middle - 1] + validRms[middle]) / 2;
  const maxLinear = Math.pow(10, maxAdjustmentDb / 20);
  const minLinear = 1 / maxLinear;
  const peakCeiling = Math.pow(10, MASTER_PEAK_TARGET_DBFS / 20);
  let adjustedChunks = 0;

  for (const measurement of measurements) {
    if (measurement.rms <= 0 || measurement.peak <= 0) continue;
    const desired = Math.max(minLinear, Math.min(maxLinear, targetRms / measurement.rms));
    const gain = Math.min(desired, peakCeiling / measurement.peak);
    if (!Number.isFinite(gain) || Math.abs(gain - 1) < 0.01) continue;

    const handle = await fs.open(measurement.filePath, "r+");
    try {
      const data = Buffer.alloc(measurement.wav.dataSize);
      const { bytesRead } = await handle.read(data, 0, measurement.wav.dataSize, measurement.wav.dataStart);
      if (bytesRead !== measurement.wav.dataSize) continue;
      for (let offset = 0; offset + 2 < data.length; offset += 3) {
        const value = Math.round(data.readIntLE(offset, 3) * gain);
        data.writeIntLE(Math.max(INT24_MIN, Math.min(INT24_MAX, value)), offset, 3);
      }
      await handle.write(data, 0, data.length, measurement.wav.dataStart);
      adjustedChunks += 1;
    } finally {
      await handle.close();
    }
  }

  return { adjustedChunks, targetRms };
}

// Peak-normalize a finished 24-bit master in place and apply tiny edge fades. Both operations are
// purely multiplicative, so inserted silence stays silent and no sample can exceed the target.
export async function normalizeMasterPeak(filePath: string) {
  const wav = await parsePcmWavFile(filePath);
  const bytesPerSample = wav.bitsPerSample / 8;
  if (bytesPerSample !== 3 || wav.dataSize === 0 || wav.dataSize > MASTER_MAX_DATA_BYTES) return;

  const handle = await fs.open(filePath, "r+");
  try {
    const data = Buffer.alloc(wav.dataSize);
    const { bytesRead } = await handle.read(data, 0, wav.dataSize, wav.dataStart);
    if (bytesRead !== wav.dataSize) return;

    const sampleCount = Math.floor(wav.dataSize / bytesPerSample);
    if (sampleCount === 0) return;

    let peak = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const magnitude = Math.abs(data.readIntLE(i * bytesPerSample, bytesPerSample));
      if (magnitude > peak) peak = magnitude;
    }
    if (peak === 0) return;

    const targetInt = Math.pow(10, MASTER_PEAK_TARGET_DBFS / 20) * INT24_MAX;
    const gain = Math.min(MASTER_MAX_GAIN, targetInt / peak);
    const fadeSamples = Math.min(
      Math.floor(sampleCount / 2),
      Math.round((wav.sampleRate * MASTER_FADE_MILLISECONDS) / 1000)
    );

    for (let i = 0; i < sampleCount; i += 1) {
      let value = data.readIntLE(i * bytesPerSample, bytesPerSample) * gain;
      if (fadeSamples > 0) {
        if (i < fadeSamples) value *= (i + 1) / fadeSamples;
        else if (i >= sampleCount - fadeSamples) value *= (sampleCount - i) / fadeSamples;
      }
      const clamped = Math.max(INT24_MIN, Math.min(INT24_MAX, Math.round(value)));
      data.writeIntLE(clamped, i * bytesPerSample, bytesPerSample);
    }

    await handle.write(data, 0, wav.dataSize, wav.dataStart);
  } finally {
    await handle.close();
  }
}

export async function validatePcm24MasterFile(filePath: string) {
  const wav = await parsePcmWavFile(filePath);

  if (
    wav.audioFormat !== PCM_AUDIO_FORMAT ||
    wav.sampleRate !== MASTER_SAMPLE_RATE ||
    wav.channels !== MASTER_CHANNELS ||
    wav.bitsPerSample !== MASTER_BITS_PER_SAMPLE
  ) {
    throw new Error("Generated WAV file does not match the PCM master format.");
  }
}

export async function mergeWavFiles(
  filePaths: string[],
  outputFilePath: string,
  gapMilliseconds: number | number[] = 180,
) {
  if (filePaths.length === 0) {
    throw new Error("No audio chunks were generated.");
  }

  const wavFiles = await Promise.all(filePaths.map(parsePcmWavFile));
  const [first, ...rest] = wavFiles;

  for (const wav of rest) {
    if (
      wav.audioFormat !== first.audioFormat ||
      wav.channels !== first.channels ||
      wav.sampleRate !== first.sampleRate ||
      wav.byteRate !== first.byteRate ||
      wav.blockAlign !== first.blockAlign ||
      wav.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("Generated WAV chunks have incompatible formats.");
    }
  }

  if (
    first.audioFormat !== PCM_AUDIO_FORMAT ||
    first.sampleRate !== MASTER_SAMPLE_RATE ||
    first.channels !== MASTER_CHANNELS ||
    first.bitsPerSample !== MASTER_BITS_PER_SAMPLE
  ) {
    throw new Error("Generated WAV chunks do not match the PCM master format.");
  }

  const silenceSizes = filePaths.slice(0, -1).map((_, index) => {
    const milliseconds = Array.isArray(gapMilliseconds)
      ? (gapMilliseconds[index] ?? 120)
      : gapMilliseconds;
    return (
      Math.round((first.byteRate * milliseconds) / 1000 / first.blockAlign) *
      first.blockAlign
    );
  });
  const dataSize =
    wavFiles.reduce((sum, wav) => sum + wav.dataSize, 0) +
    silenceSizes.reduce((sum, size) => sum + size, 0);
  const output = createWriteStream(outputFilePath);

  try {
    await writePart(output, createPcmWavHeader(first, dataSize));

    for (const [index, wav] of wavFiles.entries()) {
      const input = createReadStream(wav.filePath, {
        start: wav.dataStart,
        end: wav.dataStart + wav.dataSize - 1,
      });

      for await (const part of input) {
        await writePart(output, Buffer.from(part));
      }

      const silenceSize = silenceSizes[index];
      if (silenceSize) {
        await writePart(output, Buffer.alloc(silenceSize));
      }
    }

    output.end();
    await once(output, "finish");
    await validatePcm24MasterFile(outputFilePath);
  } catch (error) {
    output.destroy();
    await fs.rm(outputFilePath, { force: true });
    throw error;
  }
}
