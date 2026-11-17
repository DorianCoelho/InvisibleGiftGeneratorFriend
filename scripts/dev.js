// Arranca la API (puerto 3000) y el frontend con Vite (puerto 5173) y los detiene juntos.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['server', 'client'].map((workspace) =>
  spawn(npm, ['run', 'dev', '--workspace', workspace], { stdio: 'inherit', shell: process.platform === 'win32' }),
);

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
