// Reading the input: the configuration file, a saved log, and the folder of the repository. Each file is opened once and
// its type and size are taken from the open handle, so a file swapped for a link or a pipe after it was named is refused.
// The tool never reads a file of the working tree: from the repository it only checks that the folder holds .git, and git
// reads the history.

import { lstat, open, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = { maxConfigBytes: 1024 * 1024, maxLogBytes: 256 * 1024 * 1024 };

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The whole file, or an error when it is not a regular file or is over the limit.
export async function readBounded(path, maxBytes) {
  let handle;
  try {
    handle = await open(resolve(path), 'r');
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

const toPosix = (path) => (sep === '/' ? path : path.split(sep).join('/'));

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

const isUtf16 = (buffer) => buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff));

// A file named on the command line, as bytes: { file, buffer }. A path named on the command line may be a symbolic link,
// because the person who runs the tool named it.
export async function readNamedFile(path, base, maxBytes) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  const buffer = await readBounded(full, maxBytes).catch((error) => {
    throw fileError(shown, error.reason ?? error.message);
  });
  if (isUtf16(buffer)) throw fileError(shown, 'is UTF-16; only UTF-8 is read');
  return { file: shown, buffer };
}

// The configuration file as text: UTF-8, no null byte, no leading byte order mark.
export async function readConfigFile(path, base = process.cwd(), maxBytes = FILE_LIMITS.maxConfigBytes) {
  const { file, buffer } = await readNamedFile(path, base, maxBytes);
  if (buffer.includes(0)) throw fileError(file, 'holds binary data (a null byte)');
  const text = buffer.toString('utf8');
  return { file, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
}

// The folder of a repository: it must be a folder that holds .git, a folder or the file git writes for a worktree. A .git
// that is a symbolic link is refused, so the history read is the history of this folder. Gives { full, shown }.
export async function checkRepository(path, base = process.cwd()) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  let info;
  try {
    info = await stat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (!info.isDirectory()) throw fileError(shown, 'not a folder; give the top folder of a git working copy');
  let dotGit;
  try {
    dotGit = await lstat(resolve(full, '.git'));
  } catch {
    throw fileError(shown, 'holds no .git; give the top folder of a git working copy, or a saved log with --log');
  }
  if (dotGit.isSymbolicLink()) throw fileError(shown, '.git is a symbolic link; give the folder it points to');
  if (!dotGit.isDirectory() && !dotGit.isFile()) throw fileError(shown, '.git is not a folder or a file');
  return { full, shown };
}
