/* Each scheduled meeting owns its own match state; roster and career remain club-wide. */
var EVENTS={items:{},results:{},resultId:null,selected:null,loaded:false,offset:0,timeReady:false,connected:false,stops:[],timer:null,pending:{},signature:'',stateJson:null,legacy:null,error:''};
function eventNow(){return Date.now()+EVENTS.offset;}
function eventPhase(event,now){if(!event||!Number.isFinite(event.startAt)||!Number.isFinite(event.endAt)||event.endAt<=event.startAt)return 'invalid';return now>=event.endAt?'expired':now<event.startAt?'scheduled':'active';}
function eventCanPrepare(event){return !!(AUTH.user&&(event.ownerUid===AUTH.user.uid||canManageClub(AUTH.clubId)));}
function eventCanOpen(event){var phase=eventPhase(event,eventNow());return phase==='active'||(phase==='scheduled'&&eventCanPrepare(event));}
function resetEventState(){
 var initial=JSON.parse(initialAppState),roster=S.roster,career=S.career,theme=S.theme,tab=S.tab;
 S=initial;S.roster=roster;S.career=career;S.theme=theme;S.tab=tab;
 EVENTS.stateJson=null;
}
function applyEventState(state){
 var json=JSON.stringify(state||{});if(json===EVENTS.stateJson)return;
 var tab=S.tab;resetEventState();
 Object.keys(state||{}).forEach(function(key){if(Object.prototype.hasOwnProperty.call(S,key)&&!['roster','career','theme','tab'].includes(key))S[key]=state[key];});
 S.tab=tab;EVENTS.stateJson=json;
}
function stopEventSchedule(){
 EVENTS.stops.splice(0).forEach(function(stop){stop();});clearTimeout(EVENTS.timer);
 EVENTS.items={};EVENTS.results={};EVENTS.resultId=null;EVENTS.selected=null;EVENTS.loaded=false;EVENTS.timeReady=false;EVENTS.connected=false;EVENTS.pending={};EVENTS.signature='';EVENTS.stateJson=null;EVENTS.legacy=null;EVENTS.error='';
}
function startEventSchedule(){
 var generation=authGeneration,sessionRef=db.ref('session');
 function current(){return generation===authGeneration&&clubCanUse();}
 function listen(ref,callback){var cb=function(snap){if(current())callback(snap.val());};ref.on('value',cb,function(){if(current()){EVENTS.error='대진 일정을 불러오지 못했습니다. 연결과 권한을 확인해 주세요.';render();}});EVENTS.stops.push(function(){ref.off('value',cb);});}
 listen(rawDb.ref('.info/serverTimeOffset'),function(value){EVENTS.offset=Number(value)||0;EVENTS.timeReady=true;eventTick();});
 listen(rawDb.ref('.info/connected'),function(value){EVENTS.connected=value===true;eventTick();});
 listen(sessionRef,function(value){
  value=value||{};EVENTS.items=value.events||{};EVENTS.results=value.results||{};EVENTS.loaded=true;
  EVENTS.legacy=!value.legacyImported&&(value.teams||value.matches||value.tTeams)?value:null;
  var selected=EVENTS.items[EVENTS.selected];if(selected&&eventCanOpen(selected))applyEventState(selected.state);
  eventTick();render();
 });
}
function eventTick(){
 clearTimeout(EVENTS.timer);
 if(!clubCanUse())return;
 var now=eventNow(),signature=Object.keys(EVENTS.items).sort().map(function(id){return id+':'+eventPhase(EVENTS.items[id],now);}).join('|');
 var selected=EVENTS.items[EVENTS.selected];
 if(EVENTS.selected&&(!selected||!eventCanOpen(selected))){EVENTS.selected=null;resetEventState();}
 if(EVENTS.loaded&&EVENTS.timeReady&&EVENTS.connected){
  Object.keys(EVENTS.items).forEach(function(id){
   if(eventPhase(EVENTS.items[id],now)!=='expired'||EVENTS.pending[id])return;
   var generation=authGeneration;EVENTS.pending[id]=true;
   finishMatchEvent(id,'expired').catch(function(){/* Retry on the next connected tick. */}).finally(function(){if(generation===authGeneration)delete EVENTS.pending[id];});
  });
 }
 if(signature!==EVENTS.signature){EVENTS.signature=signature;render();}
 var next=30000;
 Object.values(EVENTS.items).forEach(function(event){[event.startAt,event.endAt].forEach(function(time){if(time>now)next=Math.min(next,time-now+20);});});
 EVENTS.timer=setTimeout(eventTick,Math.max(20,next));
}
function eventSessionSave(state){
 var id=EVENTS.selected,event=EVENTS.items[id];
 if(!db||!event||!eventCanOpen(event)){toast('대진 일정을 선택하거나 이용 시간을 확인해 주세요.');return Promise.resolve();}
 var ref=db.ref('session/events/'+id),generation=authGeneration;
 return ref.transaction(function(value){if(!value||!eventCanOpen(value))return;value.state=state;return value;},undefined,false).then(function(result){if(generation===authGeneration&&!result.committed)toast('종료되거나 삭제된 대진에는 저장할 수 없습니다.');}).catch(function(){if(generation===authGeneration)toast('대진 저장에 실패했습니다. 연결과 권한을 확인해 주세요.');});
}
function eventClearSession(){return eventSessionSave({});}
function eventLocalInput(time){return new Date(time+9*3600000).toISOString().slice(0,16);}
function eventParseTime(value){return /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)?Date.parse(value+':00+09:00'):NaN;}
function eventTimeLabel(time){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(time);}
function eventBar(){var event=EVENTS.items[EVENTS.selected];return event?'<section class="card"><div class="brow"><div><strong>'+authEscape(event.title)+' · '+authEscape(event.place)+'</strong><p class="sub">'+authEscape(eventTimeLabel(event.startAt))+' ~ '+authEscape(eventTimeLabel(event.endAt))+' (한국 시간)'+(eventPhase(event,eventNow())==='scheduled'?' · 시작 전 준비 중':'')+'</p></div><button class="btn gho" data-event-action="list">다른 대진 / 새 대진</button>'+(eventCanPrepare(event)?'<button class="btn pri" data-event-action="finish" data-event-id="'+authEscape(EVENTS.selected)+'">경기 종료·전적 보관</button>':'')+'</div></section>':'';}
function eventListHtml(){
 var now=eventNow(),ids=Object.keys(EVENTS.items).filter(function(id){return !['expired','invalid'].includes(eventPhase(EVENTS.items[id],now));}).sort(function(a,b){return EVENTS.items[a].startAt-EVENTS.items[b].startAt||a.localeCompare(b);});
 var cards=ids.map(function(id){var event=EVENTS.items[id],phase=eventPhase(event,now);return '<section class="card"><h2>'+authEscape(event.title)+'</h2><p><strong>'+authEscape(event.place)+'</strong></p><p class="sub">'+authEscape(eventTimeLabel(event.startAt))+' ~ '+authEscape(eventTimeLabel(event.endAt))+' (한국 시간)</p><p>'+ (phase==='active'?'진행 중':'시작 대기')+'</p><div class="brow">'+(EVENTS.timeReady&&eventCanOpen(event)?'<button class="btn pri" data-event-action="open" data-event-id="'+authEscape(id)+'">'+(phase==='active'?'대진 열기':'미리 준비하기')+'</button>':'<span class="sub">시작 시간이 되면 대진이 공개됩니다.</span>')+(eventCanPrepare(event)?'<button class="btn dan" data-event-action="delete" data-event-id="'+authEscape(id)+'">일정 삭제</button>':'')+'</div></section>';}).join('');
 var start=Math.ceil(now/300000)*300000,end=start+2*3600000;
 return '<h1 class="ttl">대진 일정</h1><p class="sub">장소와 시간별로 대진을 따로 관리합니다. 종료된 대진은 자동으로 정리됩니다.</p>'+(EVENTS.error?'<p role="alert">'+authEscape(EVENTS.error)+'</p>':'')+(!EVENTS.loaded||!EVENTS.timeReady?'<p role="status">대진 일정을 확인하고 있어요.</p>':'<div class="portal-grid">'+(cards||'<p>예정된 대진이 없습니다. 새 일정을 만들어 주세요.</p>')+'</div>')+
 '<details class="card"><summary>새 대진 만들기</summary><form id="event-form">'+field('event-title','대진 이름','text','required maxlength="60" placeholder="예: 토요일 오전 모임"')+field('event-place','장소','text','required maxlength="80" placeholder="예: 시민체육관 1번 코트"')+field('event-start','시작 날짜·시간 (한국 시간)','datetime-local','required value="'+eventLocalInput(start)+'"')+field('event-end','종료 날짜·시간 (한국 시간)','datetime-local','required value="'+eventLocalInput(end)+'"')+(EVENTS.legacy?'<label><input id="event-import" type="checkbox" checked> 기존 대진을 이 일정으로 가져오기</label><p class="sub">시간이 설정되지 않은 기존 대진이 있습니다. 일정을 지정하면 이어서 이용할 수 있습니다.</p>':'')+'<p class="sub">시작 전에는 작성자와 관리자가 준비할 수 있습니다. 종료 후 대진표는 정리되고 경기별 점수와 선수별 순위는 전적에 보관됩니다. 기존 누적 전적과 동호회 명단도 유지됩니다.</p><p id="event-error" role="alert"></p><button class="btn pri" type="submit"'+(!EVENTS.timeReady?' disabled':'')+'>대진 일정 생성</button></form></details>';
}
async function createMatchEvent(input){
 if(!clubCanUse()||!EVENTS.timeReady)throw Error('동호회와 서버 시간을 확인한 뒤 다시 시도해 주세요.');
 var title=String(input.title||'').trim(),place=String(input.place||'').trim(),startAt=eventParseTime(input.start),endAt=eventParseTime(input.end);
 if(!title||title.length>60||!place||place.length>80)throw Error('대진 이름과 장소를 입력해 주세요.');
 if(/[<>"'&]/.test(title+place))throw Error('이름과 장소에는 꺾쇠·따옴표·&를 사용할 수 없습니다.');
 if(!Number.isFinite(startAt)||!Number.isFinite(endAt)||endAt<=startAt||endAt<=eventNow())throw Error('종료 시간은 시작 시간과 현재 시간보다 뒤여야 합니다.');
 var id=db.ref('session/events').push().key,record={title:title,place:place,startAt:startAt,endAt:endAt,ownerUid:AUTH.user.uid,createdAt:eventNow()},updates={};
 if(input.importLegacy&&EVENTS.legacy){record.state={};Object.keys(JSON.parse(initialAppState)).forEach(function(key){if(!['roster','career','theme','tab'].includes(key)&&EVENTS.legacy[key]!==undefined)record.state[key]=EVENTS.legacy[key];});updates.legacyImported=true;}
 updates['events/'+id]=record;await db.ref('session').update(updates);return id;
}
function openMatchEvent(id){
 var event=EVENTS.items[id];if(!EVENTS.timeReady||!eventCanOpen(event)){toast('대진 이용 시간을 확인해 주세요.');return;}
 EVENTS.selected=id;EVENTS.stateJson=null;S.tab='match';applyEventState(event.state);render();
}
function bindEventForms(){
 var form=document.getElementById('event-form');if(!form)return;
 form.onsubmit=async function(event){event.preventDefault();var button=form.querySelector('button[type=submit]');button.disabled=true;var generation=authGeneration;
  try{await createMatchEvent({title:form.querySelector('#event-title').value,place:form.querySelector('#event-place').value,start:form.querySelector('#event-start').value,end:form.querySelector('#event-end').value,importLegacy:!!form.querySelector('#event-import:checked')});if(generation===authGeneration)toast('대진 일정이 생성되었습니다.');}
  catch(error){if(generation===authGeneration){var target=document.getElementById('event-error');if(target)target.textContent=error.message;}}
  finally{button.disabled=false;}
 };
}
document.addEventListener('click',function(event){
 var button=event.target.closest('[data-event-action]');if(!button||!clubCanUse())return;
 var action=button.dataset.eventAction,id=button.dataset.eventId;
 if(action==='open')openMatchEvent(id);
 else if(action==='list'){EVENTS.selected=null;resetEventState();render();}
 else if(['delete','finish'].includes(action)&&eventCanPrepare(EVENTS.items[id]||{})&&confirm(action==='finish'?'경기를 종료하고 점수와 순위를 전적에 보관할까요?':'이 일정을 삭제할까요? 완료된 경기 점수는 전적에 보관됩니다.')){var generation=authGeneration;finishMatchEvent(id,action).then(function(result){if(generation===authGeneration&&result&&result.committed){S.tab='results';EVENTS.resultId=id;render();}}).catch(function(){toast('전적 보관에 실패했습니다. 일정은 유지됩니다. 다시 시도해 주세요.');});}
});
window.addEventListener('online',function(){if(clubCanUse())eventTick();});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&clubCanUse())eventTick();});
