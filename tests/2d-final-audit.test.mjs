import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {audit,PHASES,GATES} from '../scripts/audit-2d-final.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fresh=()=>structuredClone(JSON.parse(fs.readFileSync(path.join(root,'docs/2d-final/state.json'),'utf8')));
const neutral=()=>{
  // Adversarial tests must not depend on the project's real milestone progress.
  const s=fresh();
  for(const id of PHASES)if(id!=='F0'){s.phases[id].status='pending';s.phases[id].evidence=[];}
  for(const id of GATES){s.gates[id].status='unverified';s.gates[id].evidence=[];}
  s.currentPhase='F1';s.state='development';
  return s;
};
const ev=(kind='test-run')=>({kind,ref:'https://github.com/TempleHao/Diablo/actions/runs/123456'});
test('baseline unverified state is truthful and structurally valid',()=>assert.deepEqual(audit(fresh()),[]));
test('cannot complete a phase with no tests or uncompleted dependencies',()=>{
 const s=neutral();s.phases.F1.status='done';assert.ok(audit(s).some(x=>x.where==='phases.F1'));
});
test('gate can only pass with traceable evidence',()=>{
 const s=neutral();s.gates.G01.status='pass';assert.ok(audit(s).some(x=>x.where==='gates.G01'));
 s.gates.G01.evidence=[ev()];assert.deepEqual(audit(s),[]);
});
test('phase done needs dependency and matched gate',()=>{
 const s=neutral();
 s.phases.F0.status='done';s.phases.F0.evidence=[ev('commit')];
 s.phases.F1.status='done';s.phases.F1.evidence=[ev('test-run')];
 assert.ok(audit(s).some(x=>x.where==='phases.F1'&&x.message.includes('G01')));
 s.gates.G01={status:'pass',evidence:[ev('test-run')]};
 assert.deepEqual(audit(s),[]);
});
test('final publish is blocked by open severe defects or missing final user acceptance',()=>{
 const s=neutral();s.state='complete';s.release.status='published';
 const issues=audit(s);assert.ok(issues.some(x=>x.where==='final'&&x.message.includes('P0/P1')));
 assert.ok(issues.some(x=>x.where==='final'&&x.message.includes('user')));
 assert.ok(issues.some(x=>x.where==='final'&&x.message.includes('SHA')));
});
test('cannot request final candidate approval before F8',()=>{
 const s=neutral();s.state='candidate-review';s.candidate.status='candidate-review';
 assert.ok(audit(s).some(x=>x.where==='state'));
});
test('duplicate defect IDs rejected',()=>{
 const s=neutral();s.defects.push({...s.defects[0]});
 assert.ok(audit(s).some(x=>x.where==='defects'));
});
test('all milestone gates named uniquely and require exactly F0-F9',()=>{
 assert.equal(new Set(PHASES).size,10);assert.equal(new Set(GATES).size,10);
 const s=neutral();delete s.phases.F9;assert.ok(audit(s).some(x=>x.where==='phases'));
});
test('lease status cannot be forged without expiry and task ID',()=>{
 const s=neutral();s.autonomousRun.owner='run-1';assert.ok(audit(s).some(x=>x.where==='autonomousRun'));
});
