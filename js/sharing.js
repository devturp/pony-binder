import { BY_ID, COLORS } from './catalog.js';

export const validShareToken = token => typeof token==='string' && /^[a-f0-9]{64}$/.test(token);
export function shareRoute(hash=''){
  const shared=hash.startsWith('#share=');
  const token=shared?hash.slice(7):null;
  return {shared,token:validShareToken(token)?token:null};
}
export function newShareToken(){
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function shareURL(token,href=window.location.href){
  if(!validShareToken(token)) throw new Error('Invalid share link.');
  const url=new URL(href);url.search='';url.hash=`share=${token}`;return url.href;
}
// Share only known card IDs and quantities/flags. Never copy account data.
export function sharedCards(cards={}){
  if(!cards || typeof cards!=='object' || Array.isArray(cards)) return {};
  const clean={};
  for(const [id,value] of Object.entries(cards)){
    if(!Object.hasOwn(BY_ID,id) || !value || typeof value!=='object') continue;
    const q=Number.isInteger(value.q)?Math.max(0,Math.min(63,value.q)):0;
    const w=value.w===true,t=value.t===true;
    if(q || w || t) clean[id]={q,w,t};
  }
  return Object.fromEntries(Object.entries(clean).sort(([a],[b])=>a.localeCompare(b)));
}

export function createSharing(store,{syncDelay=1500}={}){
  let backend,uid=null,epoch=0,token=null,ready=false,busy=false,error='',dirty=false;
  let stopWatch=()=>{},timer,lastPublished=null,pointerRevision=0;
  const listeners=new Set();
  const status=()=>({token,ready,busy,error,pending:dirty||busy});
  const emit=()=>listeners.forEach(fn=>fn(status()));
  const clean=()=>store.editable() && !store.status().pending;
  const snapshot=()=>sharedCards(store.me()?.cards);
  function schedule(){
    clearTimeout(timer);
    if(!token || !ready) return;
    dirty=JSON.stringify(snapshot())!==lastPublished;
    if(dirty && clean() && !busy && !error) timer=setTimeout(()=>{void update().catch(()=>{});},syncDelay);
    emit();
  }
  function account(){
    const next=store.status().user?.uid||null;
    if(next!==uid){
      epoch++;clearTimeout(timer);stopWatch();uid=next;token=null;ready=false;busy=false;error='';dirty=false;lastPublished=null;
      if(uid && backend?.watchSharing){
        const version=epoch;
        stopWatch=backend.watchSharing(uid,(value,meta={})=>{
          if(version!==epoch || meta.fromCache) return;
          const nextToken=validShareToken(value)?value:null;
          if(token!==nextToken){pointerRevision++;token=nextToken;lastPublished=null;error='';}
          ready=true;if(!token)dirty=false;schedule();emit();
        },()=>{if(version===epoch){ready=false;error='Sharing is unavailable. Check the connection and updated Firestore rules.';emit();}});
      }
      emit();
    }
    schedule();
  }
  async function create(){
    if(!uid || !ready || !clean() || busy) throw new Error('Wait for your collection to finish loading and saving before sharing.');
    if(token) return token;
    const version=epoch,revision=pointerRevision,cards=snapshot();busy=true;error='';emit();
    try{
      const result=await backend.createShare(uid,newShareToken(),cards);
      if(version!==epoch) return null;
      if(revision!==pointerRevision && token!==result)return token;
      token=result;lastPublished=JSON.stringify(cards);dirty=false;return token;
    }catch(e){if(version===epoch)error='Could not create a link. Check your connection and Firestore rules.';throw e;}
    finally{if(version===epoch){busy=false;schedule();emit();}}
  }
  async function update(){
    clearTimeout(timer);
    if(!token || !uid) return;
    if(busy || !clean()) throw new Error('Wait for your collection to finish saving.');
    const version=epoch,current=token,cards=snapshot();busy=true;error='';emit();
    try{
      const updated=await backend.updateShare(uid,current,cards);
      if(version!==epoch || token!==current) return;
      if(updated){lastPublished=JSON.stringify(cards);dirty=false;}
      else{token=null;dirty=false;lastPublished=null;}
    }catch(e){if(version===epoch)error='Your collection is saved, but its shared view could not update. Open Share and retry.';throw e;}
    finally{if(version===epoch){busy=false;schedule();emit();}}
  }
  async function revoke(){
    if(!uid || !ready || busy) throw new Error('Wait for the current sharing operation to finish.');
    const version=epoch;clearTimeout(timer);busy=true;error='';emit();
    try{
      await backend.revokeShare(uid);
      if(version!==epoch)return;
      token=null;dirty=false;lastPublished=null;
    }catch(e){if(version===epoch)error='Could not stop sharing. The existing link may still work. Please retry.';throw e;}
    finally{if(version===epoch){busy=false;emit();}}
  }
  return {status,create,update,revoke,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    attach:value=>{backend=value;store.subscribe(account);account();},
    retry:()=>{uid=null;account();},
    flush:async()=>{if(busy)throw new Error('Wait for the shared view to finish updating.');if(token && dirty)await update();}};
}

export function createSharedStore(token){
  let backend,profile=null,loading=true,error='',stop=()=>{},generation=0;
  const listeners=new Set();
  const status=()=>({user:null,shared:true,loading,error,authReady:true,offline:false,pending:0,failed:false,editable:false});
  const emit=()=>listeners.forEach(fn=>fn({type:'account',...status()}));
  function start(){
    stop();const version=++generation;profile=null;loading=true;error='';emit();
    const unavailable=()=>{if(version!==generation)return;profile=null;loading=false;error='This shared collection is unavailable. The link may be invalid or sharing may have been stopped.';emit();};
    if(!validShareToken(token)){unavailable();return;}
    stop=backend.watchSharedCollection(token,(value,meta={})=>{
      if(version!==generation)return;
      if(meta.fromCache){profile=null;loading=true;emit();return;}
      if(!value){unavailable();return;}
      profile={name:'Shared collection',color:COLORS[0],cards:sharedCards(value.cards)};
      loading=false;error='';emit();
    },unavailable);
  }
  return {attach:value=>{backend=value;},me:()=>profile,status,editable:()=>false,setEntry:()=>false,
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},start,retry:start};
}
