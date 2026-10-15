export const emptyState = () => ({version:1,tasks:[],runs:[]});
export const activeRun = state => state.runs.find(r=>r.end===null);
export const elapsed = (run,now=Date.now()) => Math.max(0,(run.end ?? now)-run.start);
export const taskElapsed = (state,id,now=Date.now()) => state.runs.filter(r=>r.taskId===id).reduce((sum,r)=>sum+elapsed(r,now),0);
export function addTask(state,name,now=Date.now(),id=crypto.randomUUID()) {
  name=name.trim(); if (!name || name.length>120) throw Error('Enter a task name between 1 and 120 characters.');
  state.tasks.unshift({id,name,created:now,completed:null}); return id;
}
export function stopRun(state,now=Date.now()) { const run=activeRun(state); if(run) run.end=Math.max(run.start,now); }
export function startRun(state,taskId,targetMinutes,now=Date.now(),id=crypto.randomUUID()) {
  const task=state.tasks.find(t=>t.id===taskId);
  if(!task || task.completed!==null) throw Error('Choose an open task.');
  if(!Number.isFinite(targetMinutes) || targetMinutes<=0 || targetMinutes>10080) throw Error('Set a target greater than 0 and up to 10,080 minutes.');
  stopRun(state,now); state.runs.push({id,taskId,start:now,end:null,targetMs:Math.round(targetMinutes*60000)});
}
export function completeTask(state,id,now=Date.now()) {
  const task=state.tasks.find(t=>t.id===id); if(!task) throw Error('Task not found.');
  if(activeRun(state)?.taskId===id) stopRun(state,now); task.completed=now;
}
export function parseState(raw) {
  const s=JSON.parse(raw);
  if(s?.version!==1 || !Array.isArray(s.tasks) || !Array.isArray(s.runs)) throw Error('Invalid saved data');
  const ids=new Set();
  for(const t of s.tasks) { if(typeof t.id!=='string'||ids.has(t.id)||typeof t.name!=='string'||!t.name.trim()||!Number.isFinite(t.created)||(t.completed!==null&&!Number.isFinite(t.completed))) throw Error('Invalid task'); ids.add(t.id); }
  const runIds=new Set(); let active=0;
  for(const r of s.runs) { if(typeof r.id!=='string'||runIds.has(r.id)||!ids.has(r.taskId)||!Number.isFinite(r.start)||!Number.isFinite(r.targetMs)||r.targetMs<=0||(r.end!==null&&(!Number.isFinite(r.end)||r.end<r.start))) throw Error('Invalid run'); runIds.add(r.id); if(r.end===null) { active++; if(s.tasks.find(t=>t.id===r.taskId).completed!==null) throw Error('Completed task is running'); } }
  if(active>1) throw Error('Multiple active runs'); return s;
}
