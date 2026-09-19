import { defineConfig,loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
 const env={...loadEnv(mode,process.cwd(),''),...process.env};
 const key=env.VITE_SUPABASE_ANON_KEY??'';
 if(env.NETLIFY==='true'){
  if(env.CONTEXT==='production')throw new Error('Production Ops is staging-only: do not deploy this branch to production before UAT approval.');
  const ref=env.STAGING_SUPABASE_PROJECT_REF;
  if(!ref||!/^[a-z0-9]+$/.test(ref)||env.VITE_SUPABASE_URL!==`https://${ref}.supabase.co`||env.SUPABASE_URL!==env.VITE_SUPABASE_URL)throw new Error('Preview requires explicit STAGING_SUPABASE_PROJECT_REF and matching frontend/backend staging URLs. Never use production credentials.');
 }
 if(env.NETLIFY==='true'&&(!env.VITE_SUPABASE_URL||!key))throw new Error('Configure both public Supabase variables before a Netlify build');
 if(env.VITE_SUPABASE_URL){const url=new URL(env.VITE_SUPABASE_URL);if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid Supabase URL');}
 if(key.startsWith('sb_secret_'))throw new Error('A server secret cannot be used as a VITE key');
 if(key.split('.').length===3){try{const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(claims.role==='service_role')throw new Error('SERVICE_ROLE_IN_FRONTEND');}catch(e){if(e instanceof Error&&e.message==='SERVICE_ROLE_IN_FRONTEND')throw new Error('A service role key cannot be used as a VITE key');}}
 if(Object.keys(env).some(k=>k.startsWith('VITE_')&&/SERVICE_ROLE|SECRET|PASSWORD/.test(k)))throw new Error('Server secrets must not have a VITE_ prefix');
 if(mode==='production'&&Boolean(env.VITE_SUPABASE_URL)!==Boolean(key))throw new Error('Both public Supabase variables must be configured together');
 return {plugins:[react()]};
});
