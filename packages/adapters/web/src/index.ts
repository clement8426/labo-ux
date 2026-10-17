import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Context, Output } from '../../../contracts/src/index.js';

export async function isolatedWebTask(task: string, context: Context): Promise<Output> {
  return new Promise((resolve, reject) => {
    const worker = fork(fileURLToPath(new URL('./worker.js', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true, execArgv: [] });
    let settled = false, logs = '', killTimer: ReturnType<typeof setTimeout> | undefined;
    worker.stderr?.on('data', (b: Buffer) => { logs = (logs + b.toString()).slice(-4000); });
    const abort = () => {
      if (worker.connected) worker.send({ cancel: true });
      killTimer = setTimeout(() => {
        if (process.platform === 'win32' && worker.pid) spawn('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else worker.kill('SIGKILL');
      }, 1500);
    };
    const finish = (err?: Error, result?: Output) => { if (settled) return; settled = true; context.signal.removeEventListener('abort', abort); clearTimeout(killTimer); if (err) reject(err); else resolve(result!); };
    let response: { result?: Output; error?: string } | undefined;
    worker.on('message', (data: any) => { response = data; });
    worker.on('error', e => finish(e));
    worker.on('exit', code => {
      if (context.signal.aborted) finish(new Error('CANCELLED'));
      else if (response?.result) finish(undefined, response.result);
      else finish(new Error(response?.error ?? `Processus web arrêté (${code}) : ${logs}`));
    });
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    else worker.send({ task, plan: context.plan, target: context.target, artifactDir: context.artifactDir });
  });
}
