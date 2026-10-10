import {generateItinerary} from '@melloway/domain';
async function api(path,body){const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Provider unavailable');return response.json();}
const provider={
  venues:async prefs=>(await api('venues',{prefs})).venues,
  matrix:async (venues,prefs)=>(await api('matrix',{venues,prefs})).matrix,
};
export function generate(prefs,seed=0,onStage=()=>{},previous=null){
  return generateItinerary(prefs,{provider,seed,onStage,previous,createId:()=>crypto.randomUUID()});
}
