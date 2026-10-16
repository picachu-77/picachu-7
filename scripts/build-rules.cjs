const fs=require('fs'),path=require('path');
const profile="root.child('access/profiles').child(auth.uid)";
const active=`auth != null && ${profile}.child('status').val() === 'active'`;
const superadmin=`(${active} && root.child('access/superadmins').child(auth.uid).val() === true)`;
const club="root.child('access/clubs').child($club)";
const admin=`(${active} && ${club}.child('status').val() === 'approved' && root.child('access/members').child($club).child(auth.uid).child('status').val() === 'approved' && root.child('access/members').child($club).child(auth.uid).child('role').val() === 'admin')`;
const gate=`${active} && ${club}.child('status').val() === 'approved' && (root.child('access/superadmins').child(auth.uid).val() === true || root.child('access/members').child($club).child(auth.uid).child('status').val() === 'approved')`;
const owner="root.child('access/system/ownerUid').val()";
const self="auth != null && auth.uid === $uid";
const string=(max)=>`newData.isString() && newData.val().length > 0 && newData.val().length <= ${max}`;
const immutable="!data.exists() || newData.val() === data.val()";
const access={'.read':superadmin,system:{'.read':`${active}`,ownerUid:{'.write':`!data.exists() && (${active}) && auth.token.email === 'rnftm312@gmail.com' && newData.val() === auth.uid`,'.validate':'newData.isString()'}},profiles:{$uid:{
 '.read':self,
 '.write':`newData.exists() && ((${self} && (!data.exists() || data.child('status').val() === 'active')) || (${superadmin} && data.exists()))`,
 '.validate':"newData.hasChildren(['username','displayName','status','createdAt'])",
 username:{'.validate':`${string(24)} && newData.val().matches(/^[a-z0-9][a-z0-9_]{3,23}$/) && (${immutable}) && (data.exists() || (auth.uid === $uid && ((newData.val() !== 'chease312' && auth.token.email === newData.val() + '@users.badminton.invalid') || (auth.token.email === 'rnftm312@gmail.com' && newData.val() === 'chease312'))))`},
 displayName:{'.validate':`${string(40)} && (${immutable})`},
 createdAt:{'.validate':`newData.isNumber() && (${immutable}) && (data.exists() || newData.val() <= now)`},
 status:{'.validate':`newData.val().matches(/^(active|suspended|removed)$/) && ((!data.exists() && newData.val() === 'active') || newData.val() === data.val() || (${superadmin} && $uid !== ${owner} && $uid !== auth.uid && root.child('access/superadmins').child($uid).val() !== true))`},
 clubs:{$club:{'.validate':"newData.val() === true && newData.parent().parent().parent().parent().child('members').child($club).child($uid).exists()"}},
 '$other':{'.validate':false}
}},superadmins:{$uid:{
 '.read':self,
 '.write':`(${superadmin} && $uid !== ${owner} && root.child('access/profiles').child($uid).child('status').val() === 'active') || (!data.exists() && (${active}) && auth.uid === $uid && auth.token.email === 'rnftm312@gmail.com' && newData.val() === true && newData.parent().parent().child('system/ownerUid').val() === auth.uid)`,
 '.validate':"newData.val() === true"
}}};
// Future sibling values in atomic multipath updates are inspected using newData parents.
const futureClub="newData.parent().parent().parent().child('clubs').child($club)";
const newOwnerMember="newData.parent().parent().child('members').child($club).child(newData.child('ownerUid').val())";
access.clubs={$club:{
 '.read':active,
 '.write':`newData.exists() && (${active}) && ((!data.exists() && newData.child('ownerUid').val() === auth.uid && newData.child('status').val() === 'pending') || (${superadmin} && data.exists()))`,
 '.validate':`$club.matches(/^[A-Z0-9]{10}$/) && newData.hasChildren(['name','code','ownerUid','status','createdAt']) && (newData.child('status').val() !== 'approved' || (${newOwnerMember}.child('role').val() === 'admin' && ${newOwnerMember}.child('status').val() === 'approved'))`,
 name:{'.validate':string(60)},code:{'.validate':"newData.val() === $club"},
 ownerUid:{'.validate':`newData.isString() && ((!data.exists() && newData.val() === auth.uid) || newData.val() === data.val() || (${superadmin} && root.child('access/members').child($club).child(newData.val()).child('role').val() === 'admin' && root.child('access/members').child($club).child(newData.val()).child('status').val() === 'approved' && root.child('access/profiles').child(newData.val()).child('status').val() === 'active'))`},
 status:{'.validate':"newData.isString() && ((!data.exists() && newData.val() === 'pending') || (data.val() === 'pending' && newData.val().matches(/^(pending|approved|rejected)$/)) || (data.val().matches(/^(approved|suspended)$/) && newData.val().matches(/^(approved|suspended)$/)) || (data.val() === 'rejected' && newData.val() === 'rejected'))"},
 createdAt:{'.validate':`newData.isNumber() && (${immutable}) && (data.exists() || newData.val() <= now)`},
 '$other':{'.validate':false}
}};
const newMember=`(!data.exists() && ${self} && (${active}) && ((newData.child('role').val() === 'member' && newData.child('status').val() === 'pending' && ${club}.child('status').val() === 'approved') || (newData.child('role').val() === 'admin' && newData.child('status').val() === 'pending' && ${futureClub}.child('ownerUid').val() === auth.uid && ${futureClub}.child('status').val() === 'pending'))) `;
const changeMember=`(data.exists() && (${superadmin} || ${admin}) && (${superadmin} || data.child('role').val() !== 'admin' || $uid === auth.uid) && (($uid !== ${club}.child('ownerUid').val() && ${club}.child('status').val() === 'approved') || (${superadmin} && $uid === ${club}.child('ownerUid').val() && newData.child('role').val() === 'admin' && (newData.child('status').val() === 'approved' || (${club}.child('status').val() === 'pending' && newData.child('status').val() === 'rejected')))))`;
access.members={$club:{'.read':admin,$uid:{
 '.read':self,
 '.write':`newData.exists() && (${newMember} || ${changeMember})`,
 '.validate':"newData.hasChildren(['username','displayName','role','status','createdAt'])",
 username:{'.validate':"newData.val() === root.child('access/profiles').child($uid).child('username').val()"},
 displayName:{'.validate':"newData.val() === root.child('access/profiles').child($uid).child('displayName').val()"},
 role:{'.validate':"newData.isString() && newData.val().matches(/^(member|admin)$/)"},
 status:{'.validate':"newData.isString() && newData.val().matches(/^(pending|approved|rejected|removed)$/) && (newData.val() !== 'approved' || root.child('access/profiles').child($uid).child('status').val() === 'active')"},
 createdAt:{'.validate':`newData.isNumber() && (${immutable}) && (data.exists() || newData.val() <= now)`},
 '$other':{'.validate':false}
}}};
const rules={rules:{'.read':false,'.write':false,access,clubData:{$club:{'.read':gate,'.write':gate}}}};
// The original shared records are read-only to global admins for one-time migration.
for(const legacy of ['roster','stats','session','groupNames'])rules.rules[legacy]={'.read':superadmin};
rules.rules.clubData.$club.$other={'.validate':"$other === 'roster' || $other === 'stats' || $other === 'session' || $other === 'groupNames'"};
const safeString="(!newData.isString() || (newData.val().length <= 256 && newData.val().matches(/^[^<>\\\"'&]*$/)))";
function safeTree(depth){const rule={'.validate':safeString};if(depth<12)rule['$value'+depth]=safeTree(depth+1);else rule['.validate']='!newData.hasChildren() && '+safeString;return rule;}
for(const collection of ['roster','stats','session','groupNames'])rules.rules.clubData.$club[collection]=safeTree(0);
rules.rules.clubData.$club.stats.$value0['.validate']+=" && $value0.matches(/^[^<>\\\"'&]*$/)";
fs.writeFileSync(path.join(__dirname,'../database.rules.json'),JSON.stringify(rules,null,2)+'\n');
