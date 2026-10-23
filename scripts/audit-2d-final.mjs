#!/usr/bin/env node
/**
 * Final 2D delivery gate metadata audit.
 *
 * A green result means the evidence STATE IS CONSISTENT, not that art quality
 * or gameplay is approved. Never promote an unverified gate automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PHASES=Array.from({length:10},(_,i)=>'F'+i);
export const GATES=Array.from({length:10},(_,i)=>'G'+String(i+1).padStart(2,'0'));
export const DEPENDENCIES={
 F0:[],F1:['F0'],F2:['F1'],F3:['F2'],F4:['F1'],F5:['F3','F4'],
 F6:['F2','F5'],F7:['F3','F6'],F8:['F0','F1','F2','F3','F4','F5','F6','F7'],F9:['F8']
};
export const PHASE_GATES={
 F0:[], F1:['G01'],F2:['G02'],F3:['G03','G04'],F4:['G05'],
 F5:['G06'],F6:['G07','G08'],F7:['G02','G03','G04','G07'],
 F8:['G01','G02','G03','G04','G05','G06','G07','G08','G09'],F9:['G10']
};
const phaseStatus=new Set(['pending','active','blocked','done']);
const gateStatus=new Set(['unverified','fail','pass']);
const evidenceValid=e=>typeof e==='object'&&e!==null&&
  typeof e.kind==='string'&&['commit','test-run','browser-screenshot','real-device','asset-license','review','deployment','report'].includes(e.kind)&&
  typeof e.ref==='string'&&e.ref.length>=8&&e.ref.length<=1024;

export function audit(state) {
  const failures=[];
  const fail=(where,message)=>failures.push({where,message});
  if(!state||typeof state!=='object'||Array.isArray(state))return [{where:'$',message:'state must be an object'}];
  if(state.schemaVersion!==1)fail('schemaVersion','unexpected schema version');
  if(state.project!=='TempleHao/Diablo'||state.track!=='VORAGH 2D A-direction final')fail('project','wrong repository or project track');
  if(!['development','blocked','candidate-review','complete'].includes(state.state))fail('state','unrecognized overall state');
  if(!PHASES.includes(state.currentPhase))fail('currentPhase','unknown current phase');
  const phases=state.phases??{},gates=state.gates??{};
  if(Object.keys(phases).sort().join('|')!==[...PHASES].sort().join('|'))fail('phases','must contain exactly F0 to F9');
  if(Object.keys(gates).sort().join('|')!==[...GATES].sort().join('|'))fail('gates','must contain exactly G01 to G10');
  for(const id of GATES) {
    const g=gates[id];if(!g||!gateStatus.has(g.status)||!Array.isArray(g.evidence)){fail('gates.'+id,'invalid gate');continue;}
    for(const [i,e] of g.evidence.entries())if(!evidenceValid(e))fail('gates.'+id+'.evidence.'+i,'incomplete evidence (kind/ref)');
    if(g.status==='pass'&&!g.evidence.length)fail('gates.'+id,'pass must carry traceable evidence');
    if(g.status==='pass'&&g.evidence.some(e=>e.kind==='review'&&e.ref==='self-claimed'))fail('gates.'+id,'self-claim is not validation');
  }
  for(const id of PHASES){
    const p=phases[id];
    if(!p||!phaseStatus.has(p.status)||!Array.isArray(p.evidence)){fail('phases.'+id,'invalid phase');continue;}
    if(JSON.stringify(p.gateIds)!==JSON.stringify(PHASE_GATES[id]))fail('phases.'+id+'.gateIds','gate list differs from required phase matrix');
    for(const [i,e] of p.evidence.entries())if(!evidenceValid(e))fail('phases.'+id+'.evidence.'+i,'incomplete evidence (kind/ref)');
    if(p.status==='done'){
      if(!p.evidence.length)fail('phases.'+id,'done requires traceable work artifacts');
      for(const prior of DEPENDENCIES[id])if(phases[prior]?.status!=='done')fail('phases.'+id,'dependency '+prior+' is not done');
      for(const gate of PHASE_GATES[id])if(gates[gate]?.status!=='pass')fail('phases.'+id,'gate '+gate+' is not passed');
    }
  }
  if(state.autonomousRun?.owner!==null){
    const l=state.autonomousRun;
    if(typeof l?.owner!=='string'||!l.owner||typeof l.leaseExpiresAt!=='string'||!Date.parse(l.leaseExpiresAt)||typeof l.taskId!=='string')
      fail('autonomousRun','active lease lacks owner, expiry or task');
  }
  if(!Array.isArray(state.defects))fail('defects','not an array');
  else {
    const seen=new Set();
    for(const d of state.defects){
      if(!d||typeof d.id!=='string'||seen.has(d.id)||!['P0','P1','P2'].includes(d.severity)||!['open','fixed','waived'].includes(d.status)||typeof d.description!=='string')fail('defects','invalid or repeated defect');
      if(d?.id)seen.add(d.id);
    }
  }
  if(!Array.isArray(state.deltaTop3)||state.deltaTop3.length>3||state.deltaTop3.some(x=>typeof x!=='string'||x.length<4))fail('deltaTop3','0-3 concrete gaps required');
  if(typeof state.nextAction!=='string'||state.nextAction.length<12)fail('nextAction','must have concrete next implementation action');
  const candidate=state.candidate??{},release=state.release??{};
  if(!['none','building','candidate-review','accepted'].includes(candidate.status))fail('candidate.status','invalid');
  if(!['not-final','pending','published'].includes(release.status))fail('release.status','invalid');
  if(state.state==='candidate-review'){
    if(phases.F8?.status!=='done')fail('state','cannot ask for final review before F8');
    if(candidate.status!=='candidate-review')fail('candidate','candidate-review required');
  }
  if(state.state==='complete'||phases.F9?.status==='done'||release.status==='published'){
    if(PHASES.some(id=>phases[id]?.status!=='done'))fail('final','all phases must be done');
    if(GATES.some(id=>gates[id]?.status!=='pass'))fail('final','all gates must pass');
    if(state.defects?.some(d=>['P0','P1'].includes(d.severity)&&d.status==='open'))fail('final','P0/P1 defects are still open');
    if(candidate.userAccepted!==true||candidate.artDirectionAccepted!==true||candidate.status!=='accepted')
      fail('final','user and art direction acceptance must be explicit');
    if(release.status!=='published'||!/^[0-9a-f]{40}$/.test(release.commit??'')||
       !Number.isInteger(release.pagesRun)||release.pagesRun<=0)fail('final','verified GitHub Pages publish SHA/run required');
    if(state.state!=='complete')fail('final','published status must match complete state');
  }
  return failures;
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const here=path.dirname(fileURLToPath(import.meta.url));
  const filename=process.argv[2]||path.resolve(here,'../docs/2d-final/state.json');
  try{
    const data=JSON.parse(fs.readFileSync(filename,'utf8'));
    const failures=audit(data);
    if(failures.length){
      for(const e of failures)console.error('FAIL',e.where+':',e.message);
      process.exitCode=1;
    }else{
      console.log('PASS 2D final status is internally consistent.');
      console.log('This does NOT certify visual approval, gameplay, live deployment, or completion.');
      const done=PHASES.filter(id=>data.phases[id].status==='done');
      const verified=GATES.filter(id=>data.gates[id].status==='pass');
      console.log('Verified phases:',done.length+'/10; traceable gates:',verified.length+'/10; open P0/P1:',data.defects.filter(d=>['P0','P1'].includes(d.severity)&&d.status==='open').length);
    }
  }catch(err){
    console.error('FAIL unable to read state:',err.message);
    process.exitCode=1;
  }
}
