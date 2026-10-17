/* Read-only score summaries. A meeting is archived under its unique event ID. */
function resultList(value){return value&&typeof value==='object'?Object.values(value).filter(Boolean):[];}
function resultScore(value){if((typeof value!=='number'&&typeof value!=='string')||String(value).trim()==='')return null;var n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;}
function resultPlayers(team){return [team&&team.p1,team&&team.p2].map(function(player){return player&&typeof player.name==='string'?player.name:'';}).filter(Boolean);}
function resultGame(kind,id,label,team1,team2,score1,score2,options){
 options=options||{};var left=resultPlayers(team1),right=resultPlayers(team2),a=resultScore(score1),b=resultScore(score2),status='unscored';
 if(options.bye)status='bye';
 else if(left.length!==2||right.length!==2||new Set(left.concat(right)).size!==4)status='invalid';
 else if(a!==null&&b!==null){
  if(options.inProgress&&!options.done)status='unfinished';
  else if(options.winner&&((a>b&&options.winner!==String(team1.id))||(b>a&&options.winner!==String(team2.id))||a===b))status='invalid';
  else if(a!==b||options.done)status='scored';
  else status='unfinished';
 }
 return {kind:kind,id:String(id),label:label,left:left,right:right,score1:a,score2:b,status:status};
}
function buildMatchResult(event,completedAt){
 var state=event.state||{},teams=new Map(resultList(state.teams).map(function(team){return [String(team.id),team];})),games=[];
 resultList(state.matches).forEach(function(match,index){
  games.push(resultGame('match',match.id===undefined?index:match.id,'게임 '+(match.blockNum||index+1)+(match.court?' · '+match.court+'코트':''),teams.get(String(match.t1)),teams.get(String(match.t2)),match.s1,match.s2,{done:match.done,inProgress:match.inProgress}));
 });
 resultList(state.tBracket).forEach(function(round,r){resultList(round).forEach(function(match,m){
  games.push(resultGame('tournament',match.id||r+'-'+m,'토너먼트 '+(r+1)+'라운드 · '+(m+1)+'경기',match.t1,match.t2,match.score1,match.score2,{bye:match.bye,winner:match.winner?String(match.winner.id):null}));
 });});
 return {version:1,title:event.title||'대진',place:event.place||'',startAt:event.startAt,endAt:event.endAt,completedAt:completedAt,games:games};
}
function resultStandings(games){
 var people=new Map();
 resultList(games).forEach(function(game){
  if(game.status!=='scored')return;var a=resultScore(game.score1),b=resultScore(game.score2),left=resultList(game.left),right=resultList(game.right);
  if(a===null||b===null||left.length!==2||right.length!==2||new Set(left.concat(right)).size!==4)return;
  [left,right].forEach(function(names,side){var pf=side?b:a,pa=side?a:b;names.forEach(function(name){
   if(typeof name!=='string')return;if(!people.has(name))people.set(name,{name:name,w:0,l:0,d:0,g:0,pf:0,pa:0});
   var player=people.get(name);player.g++;player.pf+=pf;player.pa+=pa;if(pf>pa)player.w++;else if(pf<pa)player.l++;else player.d++;
  });});
 });
 var rows=Array.from(people.values()).sort(function(a,b){return b.w-a.w||(b.pf-b.pa)-(a.pf-a.pa)||a.name.localeCompare(b.name,'ko');});
 rows.forEach(function(player,index){player.rate=player.g?Math.round(player.w/player.g*100):0;player.rank=index&&player.w===rows[index-1].w?rows[index-1].rank:index+1;});return rows;
}
function resultRankingHtml(rows){
 if(!rows.length)return '<p class="sub">집계할 완료 경기 점수가 없습니다.</p>';
 var max=rows[0].w,leaders=rows.filter(function(row){return row.w===max;}).map(function(row){return row.name;});
 return (max?'<p><strong>🏅 최다승: '+authEscape(leaders.join(', '))+' · '+max+'승</strong></p>':'<p class="sub">아직 승리 기록이 없습니다.</p>')+'<div style="overflow-x:auto"><table class="result-table"><thead><tr><th>순위</th><th>이름</th><th>승</th><th>패</th><th>무</th><th>경기</th><th>승률</th></tr></thead><tbody>'+rows.map(function(row){return '<tr><td>'+row.rank+'</td><th scope="row">'+authEscape(row.name)+'</th><td>'+row.w+'</td><td>'+row.l+'</td><td>'+row.d+'</td><td>'+row.g+'</td><td>'+row.rate+'%</td></tr>';}).join('')+'</tbody></table></div><p class="sub">승리 수가 같으면 공동 순위입니다. 점수 미입력·미완료·부전승은 순위에 포함하지 않습니다.</p>';
}
function resultGamesHtml(games){
 var labels={scored:'완료',unscored:'점수 미입력',unfinished:'미완료',bye:'부전승',invalid:'선수·점수 확인 필요'};
 return resultList(games).map(function(game){var a=resultScore(game.score1),b=resultScore(game.score2),verdict=game.status==='scored'?(a===b?'무승부':(a>b?resultList(game.left):resultList(game.right)).join(' · ')+' 승리'):labels[game.status]||'확인 필요';return '<article class="card"><h3>'+authEscape(game.label)+'</h3><div class="result-score"><div>'+authEscape(resultList(game.left).join(' · ')||'미정')+'</div><strong>'+(a===null?'–':a)+' : '+(b===null?'–':b)+'</strong><div>'+authEscape(resultList(game.right).join(' · ')||'미정')+'</div></div><p class="sub">'+authEscape(verdict)+'</p></article>';}).join('')||'<p>생성된 경기가 없습니다.</p>';
}
function matchResultsHtml(){
 if(!EVENTS.loaded)return '<p role="status">전적을 불러오고 있어요.</p>';
 var records=EVENTS.results||{},ids=Object.keys(records).sort(function(a,b){return (records[b].completedAt||0)-(records[a].completedAt||0);});
 var live={};Object.keys(EVENTS.items).forEach(function(id){if(eventCanOpen(EVENTS.items[id]))live[id]=buildMatchResult(EVENTS.items[id],eventNow());});
 var selected=records[EVENTS.resultId]||live[EVENTS.resultId];
 if(selected)return '<button class="btn gho" data-result-action="list">← 전체 전적</button><section class="card portal-gap"><h1 class="ttl">'+authEscape(selected.title)+'</h1><p>'+authEscape(selected.place)+'</p><p class="sub">'+authEscape(eventTimeLabel(selected.startAt))+' ~ '+authEscape(eventTimeLabel(selected.endAt))+' (한국 시간)</p>'+(records[EVENTS.resultId]?'':'<p class="sub">진행 중인 대진 · 현재 입력된 완료 경기 기준입니다.</p>')+'<h2>이 대진의 선수별 전적</h2>'+resultRankingHtml(resultStandings(selected.games))+'</section><h2>경기별 점수</h2><div class="portal-grid">'+resultGamesHtml(selected.games)+'</div>';
 var all=[];ids.forEach(function(id){all=all.concat(resultList(records[id].games));});
 return '<h1 class="ttl">종료된 경기 전적</h1><p class="sub">종료된 일정의 경기 점수와 선수별 순위를 보관합니다. 앞으로 종료되는 경기부터 기록됩니다.</p><section class="card"><h2>보관된 경기 전체 순위</h2>'+resultRankingHtml(resultStandings(all))+'</section><h2>대진별 결과</h2><div class="portal-grid">'+(ids.map(function(id){var record=records[id],count=resultList(record.games).filter(function(game){return game.status==='scored';}).length;return '<section class="card"><h3>'+authEscape(record.title)+'</h3><p>'+authEscape(record.place)+'</p><p class="sub">'+authEscape(eventTimeLabel(record.startAt))+' · 점수 집계 '+count+'경기</p><button class="btn pri" data-result-action="open" data-result-id="'+authEscape(id)+'">점수·순위 보기</button></section>';}).join('')||'<p>아직 보관된 전적이 없습니다. 일정이 종료되면 자동으로 추가됩니다.</p>')+'</div>'+(Object.keys(live).length?'<h2>진행 중인 대진</h2><div class="portal-grid">'+Object.keys(live).map(function(id){var record=live[id];return '<section class="card"><h3>'+authEscape(record.title)+'</h3><p>'+authEscape(record.place)+'</p><button class="btn gho" data-result-action="open" data-result-id="'+authEscape(id)+'">현재 전적 보기</button></section>';}).join('')+'</div>':'');
}
async function finishMatchEvent(id,reason){
 if(!db||!clubCanUse())return;
 var ref=db.ref('session');
 return ref.transaction(function(session){
  var event=session&&session.events&&session.events[id];if(!event)return;
  if(reason==='expired'&&eventPhase(event,eventNow())!=='expired')return;
  if(reason!=='expired'&&!eventCanPrepare(event))return;
  var result=buildMatchResult(event,eventNow());
  if(reason!=='delete'||result.games.some(function(game){return game.status==='scored';})){
   session.results=session.results||{};
   if(!session.results[id])session.results[id]=result;
  }
  delete session.events[id];return session;
 },undefined,false);
}
document.addEventListener('click',function(event){
 var button=event.target.closest('[data-result-action]');if(!button||!clubCanUse())return;
 EVENTS.resultId=button.dataset.resultAction==='open'?button.dataset.resultId:null;S.tab='results';render();
});
