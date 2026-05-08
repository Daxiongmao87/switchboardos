import { Socket } from 'net';

export interface ProbeInput {
  address: string;
  port: number;
  timeoutMs: number;
}

export interface ProbeResult {
  success: boolean;
  addressTried: string;
  portTried: number;
  latencyMs: number;
  banner?: string;
  protocolDetected: 'ssh' | 'unknown';
  errorCode?: string;
  errorMessage?: string;
}

const BANNER_READ_WINDOW_MS = 1500;
const BANNER_MAX_BYTES = 256;

export async function probeHost(input: ProbeInput): Promise<ProbeResult> {
  const { address, port, timeoutMs } = input;
  const startedAt = Date.now();

  if (!address) {
    return {
      success: false,
      addressTried: '',
      portTried: port,
      latencyMs: 0,
      protocolDetected: 'unknown',
      errorCode: 'EADDRMISSING',
      errorMessage: 'Host has no address or hostname configured.',
    };
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      success: false,
      addressTried: address,
      portTried: port,
      latencyMs: 0,
      protocolDetected: 'unknown',
      errorCode: 'EPORTRANGE',
      errorMessage: `Invalid port ${port}. Must be 1-65535.`,
    };
  }

  return new Promise<ProbeResult>((resolve) => {
    const socket = new Socket();
    let settled = false;
    let bannerBuffer = Buffer.alloc(0);
    let bannerTimer: NodeJS.Timeout | null = null;

    const finish = (result: ProbeResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (bannerTimer) {
        clearTimeout(bannerTimer);
        bannerTimer = null;
      }
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once('timeout', () => {
      finish({
        success: false,
        addressTried: address,
        portTried: port,
        latencyMs: Date.now() - startedAt,
        protocolDetected: 'unknown',
        errorCode: 'ETIMEDOUT',
        errorMessage: `Timed out after ${timeoutMs} ms while connecting to ${address}:${port}.`,
      });
    });

    socket.once('error', (err: NodeJS.ErrnoException) => {
      finish({
        success: false,
        addressTried: address,
        portTried: port,
        latencyMs: Date.now() - startedAt,
        protocolDetected: 'unknown',
        errorCode: err.code ?? 'EUNKNOWN',
        errorMessage: err.message || 'Connection failed.',
      });
    });

    const completeWithBanner = (): void => {
      const bannerText = bannerBuffer.toString('utf8').replace(/[\r\n]+$/, '').trim();
      const protocolDetected: 'ssh' | 'unknown' = bannerText.startsWith('SSH-') ? 'ssh' : 'unknown';
      finish({
        success: true,
        addressTried: address,
        portTried: port,
        latencyMs: Date.now() - startedAt,
        banner: bannerText || undefined,
        protocolDetected,
      });
    };

    socket.once('connect', () => {
      socket.setTimeout(0);
      bannerTimer = setTimeout(completeWithBanner, BANNER_READ_WINDOW_MS);

      socket.on('data', (chunk: Buffer) => {
        bannerBuffer = Buffer.concat([bannerBuffer, chunk]);
        const newlineIndex = bannerBuffer.indexOf(0x0a);
        if (newlineIndex !== -1 || bannerBuffer.length >= BANNER_MAX_BYTES) {
          if (newlineIndex !== -1) {
            bannerBuffer = bannerBuffer.subarray(0, newlineIndex);
          } else {
            bannerBuffer = bannerBuffer.subarray(0, BANNER_MAX_BYTES);
          }
          completeWithBanner();
        }
      });

      socket.once('end', () => {
        completeWithBanner();
      });
    });

    socket.connect({ host: address, port });
  });
}
