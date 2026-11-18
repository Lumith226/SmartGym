"""Download one official candidate model for a controlled local comparison."""
from pathlib import Path
from datetime import datetime,timezone
import httpx,json,argparse
parser=argparse.ArgumentParser();parser.add_argument('--model',choices=['qwen3.5:4b','qwen3.5:9b'],default='qwen3.5:4b');args=parser.parse_args()
MODEL=args.model
ROOT=Path(__file__).resolve().parents[1]
events=[];previous=None
with httpx.Client(timeout=httpx.Timeout(1800,connect=10)) as client:
 with client.stream('POST','http://127.0.0.1:11434/api/pull',json={'model':MODEL,'stream':True}) as response:
  response.raise_for_status()
  for line in response.iter_lines():
   if not line:continue
   event=json.loads(line)
   if event.get('error'):raise RuntimeError(event['error'])
   percent=int(100*event.get('completed',0)/event['total']) if event.get('total') else None
   step=(event.get('status'),percent//10 if percent is not None else None)
   if step!=previous:
    events.append(event);print(event.get('status','')+(f' {percent}%' if percent is not None else ''),flush=True);previous=step
 models=client.get('http://127.0.0.1:11434/api/tags').json()['models']
 model=next(m for m in models if m['name']==MODEL)
out=ROOT/'artifacts/six_exercises_20261117'/('candidate_llm_download_'+MODEL.replace(':','_')+'.json')
out.write_text(json.dumps({'model':model,'at':datetime.now(timezone.utc).isoformat(),'official_library':'https://ollama.com/library/'+MODEL,'events':events},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'downloaded':MODEL,'size':model['size'],'digest':model['digest']}),flush=True)
