export const entry = (p,c) => p?.cards?.[c.id] || {q:0,w:false,t:false};
export function createState(store){
  const st={set:'BP02',q:'',rarity:'all',status:'all',shining:false,quick:false,statsExpanded:false};
  return {st,active:store.me,setEntry:store.setEntry};
}
