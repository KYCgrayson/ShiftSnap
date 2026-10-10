// Synthetic Supabase HTTP boundary for native simulator QA. No production data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const userId = '00000000-0000-4000-8000-000000000001';
const groupId = '00000000-0000-4000-8000-000000000010';
const personId = '00000000-0000-4000-8000-000000000030';
const now = new Date();
const day = (n) => `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
const group = {id:groupId,name:'QA Team',invite_code:'QA-ONLY',created_by:userId,settings:{},created_at:now.toISOString()};
const person = {id:personId,name:'Alex QA',owner_id:userId,group_id:groupId,canonical_person_id:personId,color:'#4A9DAD',created_at:now.toISOString()};
const shifts = [10,11,12].map((n) => ({id:`00000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,schedule_id:'00000000-0000-4000-8000-000000000020',user_id:userId,person_id:personId,date:day(n),shift_code:'D',start_time:'09:00:00',end_time:'17:00:00',is_day_off:false,source:'self_scan',name_on_schedule:'Alex QA',comparison_status:'pending',calendar_event_id:null,synced_at:null,schedules:{group_id:groupId},is_personal:true}));
const codes = [{id:'00000000-0000-4000-8000-000000000040',user_id:userId,group_id:groupId,code:'D',meaning:'Day shift',start_time:'09:00:00',end_time:'17:00:00',is_day_off:false,is_confirmed:true,is_group_shared:true}];
let offline=false;
const requests=[];
const artifact = path.resolve('artifacts/qa/2026-10-10/native-http-boundary.json');
const save=()=>{ fs.mkdirSync(path.dirname(artifact),{recursive:true});fs.writeFileSync(artifact,JSON.stringify({boundary:'Synthetic localhost Supabase HTTP; real iOS app, storage and views',requests},null,2)); };
http.createServer(async(req,res)=>{
 const u = new URL(req.url,'http://127.0.0.1:55439');
 let raw=''; for await (const chunk of req) raw+=chunk;
 const body=raw ? JSON.parse(raw) : {};
 res.setHeader('Content-Type','application/json');
 if(u.pathname==='/qa/mode'){offline=body.offline===true;res.end(JSON.stringify({offline}));return;}
 if(u.pathname==='/qa/session'){
  const exp=Math.floor(Date.now()/1000)+3600;
  const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  res.end(JSON.stringify({access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:userId,exp,role:'authenticated'})}.qa-only`,refresh_token:'qa-only-local-refresh',token_type:'bearer',expires_in:3600,expires_at:exp,user:{id:userId,email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{display_name:'Alex QA'},created_at:now.toISOString()}}));return;
 }
 requests.push({at:new Date().toISOString(),method:req.method,path:u.pathname,offline});save();
 if(offline){res.statusCode=503;res.end(JSON.stringify({message:'QA simulated backend unavailable'}));return;}
 let data=[];
 if(u.pathname.endsWith('/group_members')) data=[{group_id:groupId,user_id:userId,role:'admin',groups:group}];
 else if(u.pathname.endsWith('/groups'))data=[group];
 else if(u.pathname.endsWith('/persons'))data=[person];
 else if(u.pathname.endsWith('/shift_codes'))data=codes;
 else if(u.pathname.endsWith('/rpc/get_group_member_profiles'))data=[{user_id:userId,display_name:'Alex QA',role:'admin',claimed_person_id:personId}];
 else if(u.pathname.endsWith('/shifts') || u.pathname.endsWith('/rpc/get_my_schedule_shifts')){
  data=shifts.filter(s=>{
   if(u.searchParams.get('user_id')?.startsWith('neq.'))return false;
   for(const filter of u.searchParams.getAll('date')){const [op,...v]=filter.split('.');if(op==='gte'&&s.date<v.join('.'))return false;if(op==='lte'&&s.date>v.join('.'))return false;}
   if(body.p_start_date&&s.date<body.p_start_date)return false;if(body.p_end_date&&s.date>body.p_end_date)return false;return true;
  });
 } else if(u.pathname.endsWith('/auth/v1/user')) data={id:userId,email:'qa@example.invalid',user_metadata:{display_name:'Alex QA'}};
 res.end(JSON.stringify(data));
}).listen(55439,'127.0.0.1',()=>console.log('Isolated native QA fixture server listening on 55439'));
