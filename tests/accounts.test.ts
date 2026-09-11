import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({getUser:vi.fn(),single:vi.fn(),invite:vi.fn(),rpc:vi.fn(),create:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:mock.create}));
import handler from '../netlify/functions/accounts';
beforeEach(()=>{vi.resetAllMocks();process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_ANON_KEY='public-test';process.env.SUPABASE_SERVICE_ROLE_KEY='server-test';process.env.APP_ORIGIN='https://test.example';process.env.CONTEXT='production';mock.create.mockImplementation((_url,key)=>key==='server-test'?{auth:{admin:{inviteUserByEmail:mock.invite}}}:{auth:{getUser:mock.getUser},from:()=>({select:()=>({eq:()=>({single:mock.single})})}),rpc:mock.rpc});mock.getUser.mockResolvedValue({data:{user:{id:'manager'}},error:null});mock.single.mockResolvedValue({data:{active:true,role:'operator_manager',location_id:'jakarta'}});mock.invite.mockResolvedValue({data:{user:{id:'new-staff'}},error:null});mock.rpc.mockResolvedValue({error:null});});
const body={email:'dummy@example.invalid',name:'DUMMY',role:'staff',location:'jakarta',employment:'mitra',fee:20000,effective:'2026-09-11'};
const request=(change={},token=true)=>new Request('https://test.example/.netlify/functions/accounts',{method:'POST',headers:{Origin:'https://test.example','Content-Type':'application/json',...(token?{Authorization:'Bearer test-token'}:{})},body:JSON.stringify({...body,...change})});
describe('Netlify account boundary',()=>{
 it('rejects missing token before Admin API',async()=>{expect((await handler(request({},false))).status).toBe(401);expect(mock.invite).not.toHaveBeenCalled();});
 it('verifies token with Auth server',async()=>{mock.getUser.mockResolvedValue({data:{user:null},error:{message:'bad'}});expect((await handler(request())).status).toBe(401);expect(mock.getUser).toHaveBeenCalledWith('test-token');expect(mock.invite).not.toHaveBeenCalled();});
 it('rejects staff actor',async()=>{mock.single.mockResolvedValue({data:{active:true,role:'staff',location_id:'jakarta'}});expect((await handler(request())).status).toBe(403);expect(mock.invite).not.toHaveBeenCalled();});
 it('rejects inactive or profileless actor',async()=>{mock.single.mockResolvedValue({data:null});expect((await handler(request())).status).toBe(403);});
 it('rejects manipulated location',async()=>{expect((await handler(request({location:'bandung'}))).status).toBe(403);expect(mock.invite).not.toHaveBeenCalled();});
 it('rejects manager promoting invite',async()=>{expect((await handler(request({role:'super_admin'}))).status).toBe(403);expect(mock.invite).not.toHaveBeenCalled();});
 it('writes profile with caller client, never service role',async()=>{expect((await handler(request())).status).toBe(201);expect(mock.rpc).toHaveBeenCalledWith('manage_account',expect.objectContaining({p_location:'jakarta',p_role:'staff'}));});
 it('returns explicit repair state if Auth succeeds but profile fails',async()=>{mock.rpc.mockResolvedValue({error:{message:'secret SQL'}});const r=await handler(request());expect(r.status).toBe(409);expect(await r.text()).not.toContain('secret SQL');});
 it('rejects invalid fee before Auth side effect',async()=>{expect((await handler(request({fee:-1}))).status).toBe(400);expect(mock.invite).not.toHaveBeenCalled();});
});
