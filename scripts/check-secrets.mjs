import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const excluded=new Set(['.git','node_modules','.netlify','coverage']);
const patterns=[/sb_secret_[A-Za-z0-9_-]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/];
let failed=false;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory()){await walk(p);continue;}if(e.name.startsWith('.env')&&e.name!=='.env.example'){console.error('Excluded local environment file exists; do not package:',p);continue;}const text=await readFile(p,'utf8');if(patterns.some(r=>r.test(text))){console.error('Potential credential detected in',p);failed=true;}if(p.startsWith('src/')&&/SUPABASE_SERVICE_ROLE_KEY/.test(text)){console.error('Server key reference in frontend',p);failed=true;}if(p.startsWith('dist/')&&text.includes('ORBIZ_SERVER_ONLY_CANARY_2026')){console.error('Server-only canary leaked into build',p);failed=true;}}}
await walk('.');if(failed)process.exit(1);console.log('PASS: credential patterns and frontend server-key references absent');
