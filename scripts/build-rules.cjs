const fs=require('fs'),path=require('path');
const active="auth != null && root.child('access/profiles').child(auth.uid).child('status').val() === 'active' && (!root.child('access/profiles').child(auth.uid).child('validAfter').exists() || auth.token.auth_time >= root.child('access/profiles').child(auth.uid).child('validAfter').val())";
const superadmin="("+active+" && root.child('access/superadmins').child(auth.uid).val() === true)";
const admin="("+active+" && root.child('access/clubs').child($club).child('status').val() === 'approved' && root.child('access/members').child($club).child(auth.uid).child('status').val() === 'approved' && root.child('access/members').child($club).child(auth.uid).child('role').val() === 'admin')";
const gate=active+" && root.child('access/clubs').child($club).child('status').val() === 'approved' && (root.child('access/superadmins').child(auth.uid).val() === true || root.child('access/members').child($club).child(auth.uid).child('status').val() === 'approved')";
const rules={rules:{'.read':false,'.write':false,access:{'.read':superadmin,profiles:{$uid:{'.read':'auth != null && auth.uid === $uid'}},superadmins:{$uid:{'.read':'auth != null && auth.uid === $uid'}},clubs:{$club:{'.read':active+" && root.child('access/profiles').child(auth.uid).child('clubs').child($club).val() === true"}},members:{$club:{'.read':admin,$uid:{'.read':'auth != null && auth.uid === $uid'}}}},clubData:{$club:{'.read':gate,'.write':gate}},rateLimits:{'.indexOn':['expiresAt']}}};
// Restrict writes to the four app-owned collections. Metadata has no client writes.
rules.rules.clubData.$club.$other={'.validate':"$other === 'roster' || $other === 'stats' || $other === 'session' || $other === 'groupNames'"};
// Existing renderer interpolates player labels. Reject markup/attribute delimiters
// at the database boundary, including nested tournament/session names.
const safeString = "(!newData.isString() || (newData.val().length <= 256 && newData.val().matches(/^[^<>\\\"'&]*$/)))";
function safeTree(depth){const rule={'.validate':safeString};if(depth<12)rule['$value'+depth]=safeTree(depth+1);else rule['.validate']='!newData.hasChildren() && '+safeString;return rule;}
for(const collection of ['roster','stats','session','groupNames'])rules.rules.clubData.$club[collection]=safeTree(0);
// Stats keys are player names rendered in the legacy results table.
rules.rules.clubData.$club.stats.$value0['.validate'] += " && $value0.matches(/^[^<>\\\"'&]*$/)";
fs.writeFileSync(path.join(__dirname,'../database.rules.json'),JSON.stringify(rules,null,2)+'\n');
