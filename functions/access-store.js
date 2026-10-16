'use strict';
// Keep the server snapshot in the local cache while the transaction authorizes it.
// RTDB may otherwise invoke the first transaction callback with null.
async function transact(ref,change){
 const keep=()=>{};ref.on('value',keep);
 try{
  await ref.once('value');let failure;
  const result=await ref.transaction(current=>{try{failure=null;return change(current);}catch(error){failure=error;return;}},undefined,false);
  if(!result.committed)throw failure||Object.assign(new Error('다시 시도해 주세요.'),{code:'aborted'});
  return result;
 }finally{ref.off('value',keep);}
}
module.exports={transact};
