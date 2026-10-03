#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projects = Object.freeze({
  trustless: 'context/trustless-escrow',
  anchor_reference: 'context/anchor-escrow-master',
  native_reference: 'context/solana-escrow',
});
const projectNames = Object.keys(projects);
const textExtensions = new Set(['.rs', '.toml', '.ts', '.js', '.json', '.md', '.txt', '.lock']);

function projectDir(name) {
  if (!Object.hasOwn(projects, name)) throw new Error(`Unknown project: ${name}`);
  return join(root, projects[name]);
}

function bounded(value, limit = 24000) {
  return value.length > limit ? `${value.slice(0, limit)}\n[output truncated]` : value;
}

async function run(command, args, cwd, timeoutMs = 120000) {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd, shell: false, env: { ...process.env, NO_DNA: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let finished = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
    }, timeoutMs);
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk) => { output = bounded(output + chunk.toString(), 48000); });
    }
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done({ exitCode: null, output: error.message });
    });
    child.on('close', (exitCode, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done({ exitCode, signal, output: bounded(output) });
    });
  });
}

async function safeFile(project, input) {
  if (typeof input !== 'string' || !input || isAbsolute(input) || input.includes('\\')) {
    throw new Error('Provide a relative project file path.');
  }
  const parts = input.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.') || ['node_modules', 'target', 'build', 'dist'].includes(part))) {
    throw new Error('This path is not available through the MCP server.');
  }
  if (parts.some((part) => /keypair|secret/i.test(part)) || parts.at(-1) === 'id.json') {
    throw new Error('Credential files are not available through the MCP server.');
  }
  if (!textExtensions.has(extname(input))) throw new Error('Only project text files can be read.');
  const base = await realpath(projectDir(project));
  const path = await realpath(join(base, input));
  if (relative(base, path).startsWith('..') || path === base) throw new Error('Path leaves the selected project.');
  const info = await stat(path);
  if (!info.isFile() || info.size > 65536) throw new Error('File is not a text file under 64 KiB.');
  return path;
}

const tools = [
  { name: 'project_overview', description: 'List escrow projects and installed tool versions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'search_project', description: 'Search source and configuration text in one escrow project.', inputSchema: { type: 'object', properties: { project: { type: 'string', enum: projectNames }, query: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['project', 'query'] } },
  { name: 'read_project_file', description: 'Read one small text file by path relative to an escrow project.', inputSchema: { type: 'object', properties: { project: { type: 'string', enum: projectNames }, path: { type: 'string' } }, required: ['project', 'path'] } },
  { name: 'run_local_check', description: 'Run an allowlisted local Rust or Anchor check. No deploy, signing, wallet, RPC write, or arbitrary command.', inputSchema: { type: 'object', properties: { project: { type: 'string', enum: ['trustless', 'anchor_reference'] }, check: { type: 'string', enum: ['cargo_fmt', 'cargo_check', 'cargo_test', 'anchor_build'] } }, required: ['project', 'check'] } },
];

async function callTool(name, args = {}) {
  if (name === 'project_overview') {
    const versions = await Promise.all([
      ['node', ['--version']], ['rustc', ['--version']], ['cargo', ['--version']],
      ['anchor', ['--version']], ['solana', ['--version']], ['surfpool', ['--version']],
    ].map(async ([command, argv]) => `${command}: ${(await run(command, argv, root, 10000)).output.trim()}`));
    return `Projects:\n${Object.entries(projects).map(([key, path]) => `- ${key}: ${path}`).join('\n')}\n\nToolchain:\n${versions.join('\n')}\n\nPrimary project: trustless (Anchor, Rust, TypeScript; devnet in Anchor.toml). The other two projects are reference implementations.`;
  }
  if (name === 'search_project') {
    const { project, query } = args;
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('Query must be 1–200 characters.');
    const result = await run('rg', ['-n', '-i', '-F', '--max-count', '20', '--glob', '!**/node_modules/**', '--glob', '!**/target/**', '--glob', '!**/.anchor/**', '--glob', '!**/*keypair*', '--glob', '!**/*secret*', '--glob', '!**/id.json', '--', query, '.'], projectDir(project), 10000);
    return result.exitCode === 1 ? 'No matches.' : `Exit code: ${result.exitCode}\n${result.output}`;
  }
  if (name === 'read_project_file') {
    const path = await safeFile(args.project, args.path);
    return bounded(await readFile(path, 'utf8'));
  }
  if (name === 'run_local_check') {
    if (!['trustless', 'anchor_reference'].includes(args.project)) throw new Error('Checks require an Anchor project.');
    const checks = {
      cargo_fmt: ['cargo', ['fmt', '--all', '--', '--check']],
      cargo_check: ['cargo', ['check', '--workspace', '--locked']],
      cargo_test: ['cargo', ['test', '--workspace', '--locked']],
      anchor_build: ['anchor', ['build']],
    };
    if (!Object.hasOwn(checks, args.check)) throw new Error('Unknown check.');
    const [command, argv] = checks[args.check];
    const result = await run(command, argv, projectDir(args.project), 300000);
    const report = `${command} ${argv.join(' ')}\nExit code: ${result.exitCode}${result.signal ? ` (${result.signal})` : ''}\n${result.output}`;
    if (result.exitCode !== 0) throw new Error(report);
    return report;
  }
  throw new Error(`Unknown tool: ${name}`);
}

function reply(id, payload) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...payload })}\n`);
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return;
  if (!Object.hasOwn(message, 'id')) return;
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    reply(id, { result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'solana-bestcrow-local', version: '1.0.0' } } });
  } else if (method === 'ping') {
    reply(id, { result: {} });
  } else if (method === 'tools/list') {
    reply(id, { result: { tools } });
  } else if (method === 'tools/call') {
    try {
      const value = await callTool(params.name, params.arguments || {});
      reply(id, { result: { content: [{ type: 'text', text: value }] } });
    } catch (error) {
      reply(id, { result: { content: [{ type: 'text', text: error.message }], isError: true } });
    }
  } else {
    reply(id, { error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  try { void handle(JSON.parse(line)); }
  catch (error) { process.stderr.write(`Invalid MCP input: ${error.message}\n`); }
});
