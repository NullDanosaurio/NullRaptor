import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const client=new Client({name:'ruflo-local-check',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'node_modules/ruflo/bin/ruflo.js'),'mcp','start'],cwd:project,stderr:'pipe'});
const timeout=setTimeout(()=>{console.error('MCP check timed out');process.exit(1)},25000);
try {
  await client.connect(transport);
  const result=await client.listTools();
  console.log(JSON.stringify({connected:true,tools:result.tools.length,memoryTools:result.tools.filter(t=>t.name.includes('memory')).map(t=>t.name)},null,2));
} finally {clearTimeout(timeout);await client.close();}
