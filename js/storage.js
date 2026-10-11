import { BY_ID, COLORS } from './catalog.js';

export function createStore(backend,{saveDelay=750}={}){
  let user=null, profile=null, server={}, pending=[], unsubscribe=()=>{}, generation=0;
  let offline=false;
  let reconnect=()=>{};
  let loading=false, error='', authReady=false;
  const listeners=new Set();
  const editable=()=>!!user && !!profile && !loading && !error && !offline;
  const me=()=>profile;
  const status=()=>({user,loading,error,authReady,offline,pending:pending.length,failed:pending.some(op=>op.failed),editable:editable()});
  const emit=(type='status',ids=[])=>listeners.forEach(fn=>fn({type,ids,...status()}));
  function rebuild(){
    if(!profile) return;
    const cards=structuredClone(server);
    for(const op of pending) cards[op.id]={q:0,w:false,t:false,...cards[op.id],...op.patch};
    profile.cards=cards;
  }
  function connect(next){
    for(const op of pending) clearTimeout(op.timer);
    generation++;unsubscribe();offline=false;user=next;pending=[];server={};error='';authReady=true;loading=!!next;
    profile=next?{name:next.displayName||'Collector',color:COLORS[0],cards:{}}:null;
    emit('account');
    if(!next) return;
    const epoch=generation;
    const watch=()=>backend.watchCards(next.uid,(cards,meta={})=>{
      if(epoch!==generation) return;
      offline=!!meta.fromCache;
      if(offline){emit('account');return;}
      const ids=[...new Set([...Object.keys(server),...Object.keys(cards),...pending.map(op=>op.id)])];
      server=Object.fromEntries(Object.entries(cards).filter(([id])=>Object.hasOwn(BY_ID,id)));
      const first=loading;loading=false;error='';rebuild();emit(first?'account':'cards',ids);
    },()=>{if(epoch===generation){loading=false;error='Unable to load your collection. Check your connection and Firestore access rules.';emit('account');}});
    reconnect=()=>{unsubscribe();loading=true;error='';emit('account');unsubscribe=watch();};
    unsubscribe=watch();
  }
  async function send(op){
    op.failed=false;op.running=true;emit();
    try {
      await backend.writeCard(op.uid,op.id,op.patch);
      if(op.epoch!==generation) return;
      server[op.id]={q:0,w:false,t:false,...server[op.id],...op.patch};
      pending=pending.filter(item=>item!==op);rebuild();emit('cards',[op.id]);pump();
    } catch(e){
      if(op.epoch!==generation) return;
      op.running=false;op.failed=true;emit();pump();
    }
  }
  function pump(){
    const seen=new Set();let running=pending.filter(op=>op.running).length;
    for(const op of pending){
      if(seen.has(op.id)) continue;
      seen.add(op.id);
      if(op.ready && !op.running && !op.failed && running<6){running++;void send(op);}
    }
  }
  function setEntry(card,patch){
    if(!editable() || !Object.hasOwn(BY_ID,card.id)) return false;
    const clean={};
    if('q' in patch) clean.q=Math.max(0,Math.min(63,Math.trunc(Number(patch.q)||0)));
    if('w' in patch) clean.w=!!patch.w;
    if('t' in patch) clean.t=!!patch.t;
    // Only merge into the last unsent edit. Never mutate an in-flight transaction.
    let op=pending.findLast(item=>item.id===card.id);
    if(!op || op.running || op.failed){
      op={uid:user.uid,id:card.id,patch:{},epoch:generation,failed:false};
      pending.push(op);
    }
    Object.assign(op.patch,clean);
    clearTimeout(op.timer);
    op.ready=saveDelay===0;
    if(!op.ready) op.timer=setTimeout(()=>{
      if(op.epoch!==generation) return;
      op.ready=true;pump();
    },saveDelay);
    rebuild();emit('cards',[card.id]);pump();return true;
  }
  const retry=()=>{if(error){reconnect();return;}for(const op of pending)op.failed=false;pump();};
  async function logout(){
    if(pending.length) throw new Error('Wait for your changes to save, or retry failed changes before signing out.');
    await backend.logout();
  }
  return {attach:value=>{backend=value;},me,status,editable,setEntry,connect,retry,logout,login:()=>backend.login(),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},start:()=>backend.watchAuth(connect)};
}
