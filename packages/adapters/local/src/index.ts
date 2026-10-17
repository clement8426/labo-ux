import { spawn } from 'node:child_process';
export async function command(executable: string, args: string[], options: { timeoutMs?: number; signal?: AbortSignal; maxBytes?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, signal: options.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(stdout); };
    const timer = setTimeout(() => { child.kill(); finish(new Error(`TIMEOUT : ${executable}`)); }, options.timeoutMs ?? 10000);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); if (Buffer.byteLength(stdout) > (options.maxBytes ?? 25_000_000)) { child.kill(); finish(new Error('Sortie trop volumineuse')); } });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000); });
    child.on('error', finish);
    child.on('close', code => finish(code === 0 ? undefined : new Error(`${executable} (${code}) : ${stderr}`)));
  });
}
