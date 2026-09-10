import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { processImage } from '@/lib/image-processing';

const TRANSCODE_TIMEOUT_MS = 5 * 60_000;
const MAX_DURATION_S = 180;

export interface VideoProbeResult {
  width: number;
  height: number;
  durationS: number;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

/** Semáforo: máximo 1 transcodificación concurrente en el proceso Node. */
let activeTranscodes = 0;
const transcodeQueue: Array<() => void> = [];

async function acquireTranscodeSlot(): Promise<void> {
  if (activeTranscodes < 1) {
    activeTranscodes++;
    return;
  }
  return new Promise((resolve) => {
    transcodeQueue.push(() => {
      activeTranscodes++;
      resolve();
    });
  });
}

function releaseTranscodeSlot(): void {
  activeTranscodes--;
  const next = transcodeQueue.shift();
  if (next) next();
}

function spawnWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGKILL');
        reject(new Error(`Proceso expiró tras ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `Proceso terminó con código ${code}`));
      }
    });
  });
}

function parseFfprobeJson(stdout: string): VideoProbeResult {
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error('ffprobe devolvió JSON inválido.');
  }

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream?.width || !videoStream?.height) {
    throw new Error('No se encontró stream de video.');
  }

  const durationRaw = parsed.format?.duration;
  const duration = durationRaw ? parseFloat(durationRaw) : NaN;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Duración de video inválida.');
  }

  return {
    width: videoStream.width,
    height: videoStream.height,
    durationS: Math.round(duration),
  };
}

/**
 * ffprobe: dimensiones y duración. Valida que sea video real y duración ≤ 180s.
 */
export async function probeVideo(inputPath: string): Promise<VideoProbeResult> {
  const args = [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height,codec_type',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    inputPath,
  ];

  const { stdout } = await spawnWithTimeout('ffprobe', args, 30_000);
  const result = parseFfprobeJson(stdout);

  if (result.durationS > MAX_DURATION_S) {
    throw new Error(
      `El video supera la duración máxima permitida (${MAX_DURATION_S}s).`,
    );
  }

  return result;
}

/**
 * Transcodifica a H.264/MP4 ~540p con audio AAC. Prioridad baja (nice -n 15).
 */
export async function transcodeVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await acquireTranscodeSlot();
  try {
    const ffmpegArgs = [
      '-n',
      '15',
      'ffmpeg',
      '-threads',
      '1',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '24',
      '-preset',
      'medium',
      '-vf',
      "scale='min(960,iw)':-2",
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-map_metadata',
      '-1',
      '-y',
      outputPath,
    ];

    await spawnWithTimeout('nice', ffmpegArgs, TRANSCODE_TIMEOUT_MS);
  } finally {
    releaseTranscodeSlot();
  }
}

/**
 * Extrae frame en t=1s como JPG y convierte a WebP con sharp.
 */
export async function extractPoster(
  inputPath: string,
  posterJpgPath: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const ffmpegArgs = [
    '-n',
    '15',
    'ffmpeg',
    '-threads',
    '1',
    '-ss',
    '1',
    '-i',
    inputPath,
    '-frames:v',
    '1',
    '-y',
    posterJpgPath,
  ];

  await spawnWithTimeout('nice', ffmpegArgs, 60_000);

  const jpgBuffer = await readFile(posterJpgPath);
  const processed = await processImage(jpgBuffer, { maxWidth: 960 });
  return { buffer: processed.buffer, contentType: processed.contentType };
}
