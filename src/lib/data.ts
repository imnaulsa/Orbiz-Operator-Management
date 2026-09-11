import {useEffect,useRef,useState} from 'react';
import {db,errorText} from './supabase';
import type {Profile,Assignment,Slot,Submission,Leave,Rate} from './domain';
// Fetch every page: the Supabase REST row cap must never silently truncate exports or calendars.
export async function allPages<T>(query:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>) {
 const rows:T[]=[];for(let from=0;;from+=500){const {data,error}=await query(from,from+499);if(error)throw error;rows.push(...(data??[]));if(!data||data.length<500)return rows;}
}
export type Data={profiles:Profile[];assignments:Assignment[];slots:Slot[];submissions:Submission[];leaves:Leave[];rates:Rate[]};
const empty:Data={profiles:[],assignments:[],slots:[],submissions:[],leaves:[],rates:[]};
export function useData(location:string,start:string,end:string,staff:boolean,revision:number) {
 const [data,setData]=useState<Data>(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[live,setLive]=useState(false);const seq=useRef(0);const scope=useRef('');
 useEffect(()=>{
  let disposed=false;let running=false;let queued=false;
  const load=async()=>{
   if(running){queued=true;return;} running=true; const n=++seq.current;
   try{
    if(!start||!end||start>end||Date.parse(end)-Date.parse(start)>366*86400000)throw new Error('Pilih rentang valid maksimal 367 hari');
    const [profiles,assignments,slots,submissions,leaves,rates]=await Promise.all([
     allPages<Profile>((a,b)=>db().from('profiles').select('*').or(`location_id.eq.${location},role.eq.super_admin`).order('id').range(a,b)),
     allPages<Assignment>((a,b)=>db().from('schedule_assignments').select('*').eq('location_id',location).eq('layer',staff?'published':'draft').is('cancelled_at',null).gte('work_date',start).lte('work_date',end).order('work_date').order('operator_id').order('hour').range(a,b)),
     allPages<Slot>((a,b)=>db().from('availability_slots').select('*').eq('location_id',location).gte('work_date',start).lte('work_date',end).order('id').range(a,b)),
     allPages<Submission>((a,b)=>db().from('availability_submissions').select('*').eq('location_id',location).order('submitted_at',{ascending:false}).order('id').range(a,b)),
     allPages<Leave>((a,b)=>db().from('leave_requests').select('*').eq('location_id',location).order('submitted_at',{ascending:false}).order('id').range(a,b)),
     allPages<Rate>((a,b)=>db().from('operator_rates').select('*').eq('location_id',location).order('effective_date',{ascending:false}).order('id').range(a,b)),
    ]);
    if(!disposed&&n===seq.current){setData({profiles,assignments,slots,submissions,leaves,rates});setError('');}
   }catch(e){if(!disposed&&n===seq.current){setData(empty);setError(errorText(e));}}
   finally{running=false;if(!disposed){setLoading(false);if(queued){queued=false;void load();}}}
  };
  const nextScope=[location,start,end,staff].join(':');if(scope.current!==nextScope){setData(empty);setLoading(true);scope.current=nextScope;}setLive(false);void load();
  const channel=db().channel('location-'+location).on('postgres_changes',{event:'*',schema:'public',table:'schedule_signals',filter:'location_id=eq.'+location},()=>void load()).subscribe(status=>{if(!disposed)setLive(status==='SUBSCRIBED');});
  const timer=setInterval(()=>void load(),15000);const focus=()=>void load();window.addEventListener('focus',focus);
  return()=>{disposed=true;seq.current++;clearInterval(timer);window.removeEventListener('focus',focus);void db().removeChannel(channel);};
 },[location,start,end,staff,revision]);
 return{data,loading,error,live};
}
