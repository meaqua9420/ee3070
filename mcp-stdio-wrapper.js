#!/usr/bin/env node

/**
 * MCP stdio wrapper for Smart Cat Home HTTP MCP server
 * Converts stdin/stdout MCP protocol to HTTP calls
 */

const http = require('http');
const readline = require('readline');

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://127.0.0.1:4000/mcp/invoke';

// Read JSON-RPC messages from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);

    // Handle different JSON-RPC methods
    if (request.method === 'tools/list') {
      // Fetch tools from backend
      const tools = await fetchTools();
      sendResponse(request.id, { tools });
    }
    else if (request.method === 'tools/call') {
      // Call tool via HTTP
      const { name, arguments: args } = request.params;
      const result = await callTool(name, args);
      sendResponse(request.id, { content: [{ type: 'text', text: result.output }] });
    }
    else if (request.method === 'initialize') {
      sendResponse(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'smart-cat-home-mcp',
          version: '1.0.0'
        }
      });
    }
    else {
      sendError(request.id, -32601, 'Method not found');
    }
  } catch (error) {
    console.error('[mcp-wrapper] Error:', error);
    sendError(null, -32603, error.message);
  }
});

async function fetchTools() {
  return new Promise((resolve, reject) => {
    const url = new URL(MCP_SERVER_URL.replace('/invoke', '/tools'));
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          // Convert to MCP tool format
          const tools = (response.data?.tools || []).map(tool => ({
            name: tool.function.name,
            description: tool.function.description || '',
            inputSchema: tool.function.parameters || { type: 'object', properties: {} }
          }));
          resolve(tools);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function callTool(name, args) {
  return new Promise((resolve, reject) => {
    const url = new URL(MCP_SERVER_URL);
    const payload = JSON.stringify({ tool: name, args: args || {} });

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            resolve({ output: response.output || response.data });
          } else {
            reject(new Error(response.message || 'Tool call failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id,
    result
  };
  console.log(JSON.stringify(response));
}

function sendError(id, code, message) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
  console.log(JSON.stringify(response));
}
