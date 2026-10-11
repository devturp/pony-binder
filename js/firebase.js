import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const app = initializeApp({
  apiKey:'AIzaSyAIniVhsD61whKdzZEGMul9SSBjcYi2AfU',
  authDomain:'pony-binder.firebaseapp.com',
  projectId:'pony-binder',
  storageBucket:'pony-binder.firebasestorage.app',
  messagingSenderId:'410982357743',
  appId:'1:410982357743:web:d290ae255582761373191a'
});
const auth = getAuth(app), db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt:'select_account' });
export const cloud = {
  watchAuth:callback=>onAuthStateChanged(auth,callback),
  login:()=>signInWithPopup(auth,provider),
  logout:()=>signOut(auth),
  watchCards:(uid,next,error)=>onSnapshot(collection(db,'users',uid,'cards'),{includeMetadataChanges:true},snapshot=>next(Object.fromEntries(snapshot.docs.map(d=>[d.id,d.data()])),{fromCache:snapshot.metadata.fromCache}),error),
  // Transactions create complete records, but update only changed fields on existing cards.
  // Independent edits to wishlist, quantity and trade flags cannot replace each other.
  writeCard:(uid,id,patch)=>runTransaction(db,async transaction=>{
    const ref=doc(db,'users',uid,'cards',id), snapshot=await transaction.get(ref);
    if(snapshot.exists()) transaction.update(ref,patch);
    else transaction.set(ref,{q:0,w:false,t:false,...patch});
  })
};
