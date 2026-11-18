"""Reuse vectors only for byte-identical chunk text and the same model."""
from pathlib import Path
import json,sys,argparse
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from kb_service.config import Settings
from kb_service.providers import OllamaEmbedder
from kb_service.ingest import write_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--previous',required=True);a=p.parse_args()
    s=Settings.from_env();snap=json.loads((s.index_dir/'snapshot.json').read_text(encoding='utf-8'))
    old=Path(a.previous);old_snap=json.loads((old/'snapshot.json').read_text(encoding='utf-8'))
    prev=json.loads((old/'embeddings.json').read_text(encoding='utf-8'))
    if prev['kb_version']!=old_snap['version'] or prev['model']!=s.embed_model:raise ValueError('Previous vector provenance mismatch')
    texts={c['chunk_id']:c['text'] for c in old_snap['chunks']};vectors={};pending=[]
    for c in snap['chunks']:
        cid=c['chunk_id']
        if texts.get(cid)==c['text'] and cid in prev['vectors']:vectors[cid]=prev['vectors'][cid]
        else:pending.append(c)
    reused=len(vectors)
    for start in range(0,len(pending),8):
        batch=pending[start:start+8];embedded=OllamaEmbedder(s).embed([c['text'] for c in batch])
        vectors.update({c['chunk_id']:v for c,v in zip(batch,embedded)})
    write_json(s.index_dir/'embeddings.json',{'kb_version':snap['version'],'model':s.embed_model,'dimension':len(next(iter(vectors.values()))),'vectors':vectors})
    print(json.dumps({'version':snap['version'],'reused_identical_chunks':reused,'newly_embedded':len(pending),'total':len(vectors)}))
if __name__=='__main__':main()
