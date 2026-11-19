import { validShareToken } from './sharing.js';

// The SDK is injected so transactions can be tested without browser CDN imports.
export function shareBackend(db,{doc,onSnapshot,runTransaction,serverTimestamp}){
  const config=uid=>doc(db,'users',uid,'sharing','config');
  const shared=token=>doc(db,'sharedCollections',token);
  const payload=(uid,cards)=>({ownerUid:uid,name:'Shared collection',cards,updatedAt:serverTimestamp()});
  return {
    watchSharing:(uid,next,error)=>onSnapshot(config(uid),{includeMetadataChanges:true},snapshot=>next(snapshot.exists()?snapshot.data().token:null,{fromCache:snapshot.metadata.fromCache}),error),
    watchSharedCollection:(token,next,error)=>onSnapshot(shared(token),{includeMetadataChanges:true},snapshot=>next(snapshot.exists()?snapshot.data():null,{fromCache:snapshot.metadata.fromCache}),error),
    createShare:(uid,candidate,cards)=>runTransaction(db,async tx=>{
      const ref=config(uid),current=await tx.get(ref);
      const token=current.exists()?current.data().token:candidate;
      if(!validShareToken(token))throw new Error('Invalid share token.');
      // Read before writes to catch the unlikely random-token collision safely.
      const target=shared(token),existing=await tx.get(target);
      if(existing.exists() && existing.data().ownerUid!==uid)throw new Error('Share token collision. Retry.');
      tx.set(ref,{token});tx.set(target,payload(uid,cards));return token;
    }),
    updateShare:(uid,token,cards)=>runTransaction(db,async tx=>{
      const current=await tx.get(config(uid));
      // A stale tab must never republish a revoked link.
      if(!current.exists() || current.data().token!==token)return false;
      tx.set(shared(token),payload(uid,cards));return true;
    }),
    revokeShare:uid=>runTransaction(db,async tx=>{
      const ref=config(uid),current=await tx.get(ref);
      if(!current.exists())return;
      tx.delete(shared(current.data().token));tx.delete(ref);
    })
  };
}
