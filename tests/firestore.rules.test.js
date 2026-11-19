import { shareBackend } from '../js/share-backend.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, deleteDoc, serverTimestamp, onSnapshot, runTransaction } from 'firebase/firestore';

const A='a'.repeat(64),B='b'.repeat(64);
test('Firestore sharing access controls',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async t=>{
  const env=await initializeTestEnvironment({projectId:'demo-pony-binder',firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
  const auth=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
  const alice=auth('alice'),bob=auth('bob'),guest=env.unauthenticatedContext().firestore();
  const link=(db,token=A)=>doc(db,'sharedCollections',token);
  const config=(db,uid='alice')=>doc(db,'users',uid,'sharing','config');
  const card=(db,uid='alice')=>doc(db,'users',uid,'cards','bp04-c01');
  const payload=(ownerUid='alice')=>({ownerUid,name:'Shared collection',cards:{'bp04-c01':{q:3,w:true,t:false}},updatedAt:serverTimestamp()});
  async function publish(db,token=A,uid='alice',value=payload(uid)){
    const batch=writeBatch(db);batch.set(config(db,uid),{token});batch.set(link(db,token),value);return batch.commit();
  }
  try{
    await t.test('only the Google owner can access private cards and sharing settings',async()=>{
      await assertSucceeds(setDoc(card(alice),{q:2,w:false,t:false}));
      await assertSucceeds(getDoc(config(alice)));
      await assertFails(getDoc(card(guest)));await assertFails(getDoc(card(bob)));
      await assertFails(getDocs(collection(guest,'users','alice','cards')));
      await assertFails(getDoc(config(guest)));await assertFails(getDoc(config(bob)));
      await assertFails(setDoc(config(bob),{token:A}));
      const password=env.authenticatedContext('alice',{firebase:{sign_in_provider:'password'}}).firestore();
      await assertFails(getDoc(card(password)));
    });
    await t.test('owner atomically creates an unguessable link; guests can get it',async()=>{
      await assertSucceeds(getDoc(link(alice)));
      await assertSucceeds(publish(alice));
      await assertSucceeds(getDoc(link(guest)));await assertSucceeds(getDoc(link(bob)));
      await assertSucceeds(getDoc(card(alice)));
    });
    await t.test('no one can list or query share documents',async()=>{
      await assertFails(getDocs(collection(guest,'sharedCollections')));
      await assertFails(getDocs(collection(bob,'sharedCollections')));
      await assertFails(getDocs(collection(alice,'sharedCollections')));
    });
    await t.test('guests and other accounts cannot modify or delete the link',async()=>{
      await assertFails(setDoc(link(guest),payload()));await assertFails(deleteDoc(link(guest)));
      await assertFails(setDoc(link(bob),payload()));await assertFails(deleteDoc(link(bob)));
      await assertFails(publish(bob,A,'bob',payload('bob')));
    });
    await t.test('updates preserve ownership, schema and timestamp; owners can update cards',async()=>{
      await assertSucceeds(setDoc(link(alice),payload()));
      await assertFails(setDoc(link(alice),payload('bob')));
      await assertFails(setDoc(link(alice),{...payload(),email:'private@example.test'}));
      await assertFails(setDoc(link(alice),{...payload(),cards:[]}));
      await assertFails(setDoc(link(alice),{...payload(),updatedAt:0}));
      await assertFails(setDoc(card(alice),{q:64,w:false,t:false}));
    });
    await t.test('short or unlinked tokens cannot be published',async()=>{
      await assertFails(publish(alice,'short'));
      await assertFails(setDoc(link(alice,B),payload()));
      await assertFails(setDoc(config(alice),{token:B}));
    });
    await t.test('rotating the private pointer revokes old reads even if old data remains',async()=>{
      await assertSucceeds(publish(alice,B));
      await assertFails(getDoc(link(guest,A)));
      await assertSucceeds(getDoc(link(guest,B)));
      await assertFails(setDoc(link(alice,A),payload()));
    });
    await t.test('revocation removes the public document and prevents stale republishing',async()=>{
      const batch=writeBatch(alice);batch.delete(link(alice,B));batch.delete(config(alice));await assertSucceeds(batch.commit());
      await assertSucceeds(getDoc(link(guest,B)));
      await assertFails(setDoc(link(alice,B),payload()));
      await assertSucceeds(getDoc(card(alice)));
    });
    await t.test('real sharing transactions create, reuse, update, revoke and reject stale updates',async()=>{
      const api=shareBackend(alice,{doc,onSnapshot,runTransaction,serverTimestamp});
      const C='c'.repeat(64),D='d'.repeat(64);
      assert.equal(await api.createShare('alice',C,{'bp04-c01':{q:2,w:false,t:false}}),C);
      assert.equal(await api.createShare('alice',D,{'bp04-c01':{q:3,w:false,t:false}}),C);
      assert.equal(await api.updateShare('alice',C,{'bp04-c01':{q:4,w:true,t:false}}),true);
      assert.equal((await getDoc(link(guest,C))).data().cards['bp04-c01'].q,4);
      await api.revokeShare('alice');
      assert.equal((await getDoc(link(guest,C))).exists(),false);
      assert.equal(await api.updateShare('alice',C,{}),false);
      assert.equal(await api.createShare('alice',D,{}),D);
      assert.equal((await getDoc(link(guest,C))).exists(),false);
      await api.revokeShare('alice');
    });
  }finally{await env.cleanup();}
});
