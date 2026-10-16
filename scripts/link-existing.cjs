'use strict';
// Explicit admin operation to link another legacy email account to an ID.
const {initializeApp,applicationDefault}=require('../functions/node_modules/firebase-admin/app');
const {getAuth}=require('../functions/node_modules/firebase-admin/auth');
const {getDatabase}=require('../functions/node_modules/firebase-admin/database');
const D=require('../functions/domain');
const {transact}=require('../functions/access-store');
const [email,id,code]=process.argv.slice(2).filter(x=>x!=='--apply');
if(!email||!id||!code)throw Error('Usage: node scripts/link-existing.cjs EMAIL USERNAME CLUB_CODE [--apply]');
if(process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.FIREBASE_DATABASE_EMULATOR_HOST)throw Error('Remove emulator settings before explicit production migration.');
initializeApp({credential:applicationDefault(),projectId:'badminton-e0788',databaseURL:'https://badminton-e0788-default-rtdb.firebaseio.com'});
(async()=>{const user=await getAuth().getUserByEmail(email),username=D.username(id);if(user.disabled)throw Error('Account is disabled.');
 if(!process.argv.includes('--apply')){console.log('Dry-run: link existing account to '+username+'; membership will require approval. Password unchanged.');return;}
 await transact(getDatabase().ref('access'),a=>D.register(a,user.uid,{username,displayName:user.displayName||username,code},{now:Date.now()}));
 console.log('Linked. The club admin must approve membership.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
