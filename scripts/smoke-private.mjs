import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const isolatedHome = path.resolve('..', 'runtime', 'smoke-home');
fs.mkdirSync(isolatedHome, { recursive: true, mode: 0o700 });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js', '--no-onboarding'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOME: isolatedHome,
    DESKTOP_COMMANDER_DISABLE_TELEMETRY: '1',
    KARIS_DISABLE_TOOL_HISTORY: '1',
  },
  stderr: 'pipe',
});
const client = new Client({ name: 'karis-private-mcp-smoke', version: '1.0.0' }, { capabilities: {} });
try {
  await client.connect(transport);
  const response = await client.listTools();
  assert.ok(response.tools.length > 10, 'MCP tools should still be available');
  const names = response.tools.map(x => x.name);
  console.log(`MCP tools available: ${response.tools.length}`);
  assert.ok(names.includes('get_config'), 'get_config MCP tool is required');
  const result = await client.callTool({ name: 'get_config', arguments: {} });
  assert.equal(result.isError, undefined, 'get_config must succeed');
  assert.ok(!fs.existsSync(path.join(isolatedHome, '.claude-server-commander', 'tool-history.jsonl')), 'tool history was unexpectedly written');
  assert.ok(!fs.existsSync(path.join(isolatedHome, '.claude-server-commander', 'claude_tool_call.log')), 'tool call logging was unexpectedly enabled');
  console.log('PASS: get_config executed; no argument/output logs written.');
} finally {
  await client.close();
}
