"""Import verified deployment label contracts; never import model Python code."""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
SPECS={'SQUAT':('squat','squat',14),'PUSHUP':('push_up','pushup',21),
       'JUMPING_JACK':('jump_jack','jumpjack',29),'REVERSE_CRUNCH':('situp','crunch',19)}

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--weights',type=Path,default=ROOT.parents[2]/'SmartGym-Model/smart_gym_test_rtmpose_v4/weights')
    args=parser.parse_args()
    mapping=json.loads((ROOT/'label_knowledge_map.json').read_text(encoding='utf-8'))
    output={'version':'smartgym-v4-label-catalog-1','semantics':'Model annotations are observations, not diagnoses or proof of correct form.','exercises':{}}
    target=ROOT/'model_contracts';target.mkdir(exist_ok=True)
    for code,(model_code,stem,count) in SPECS.items():
        path=args.weights/(stem+'_v4_contract.json')
        contract=json.loads(path.read_text(encoding='utf-8'))
        weights=args.weights/('best_stgcnpp_'+stem+'_v4_multihead.onnx')
        if len(contract['labels'])!=count or digest(weights)!=contract['onnx_sha256']:
            raise ValueError('Contract/weights mismatch: '+code)
        shutil.copyfile(path,target/path.name)
        labels=[]
        for original in contract['labels']:
            label={k:original[k] for k in ['key','raw_label','name_vi','kind','threshold','rep_supported','calibrated']}
            label.update(mapping.get(code,{}).get(label['key'],{}))
            label.setdefault('criterion_ids',[])
            label.setdefault('coverage','none' if label['kind']=='error' else 'metadata_only')
            label.setdefault('note_vi',{'error':'Nhãn lỗi do model dự đoán; không chứng minh nguyên nhân hoặc hậu quả.',
                'attribute':'Thuộc tính được dự đoán; không tự diễn giải thành lỗi hoặc kết luận đúng kỹ thuật.',
                'context':'Trạng thái của đoạn video; không tự diễn giải thành lỗi kỹ thuật.',
                'visibility':'Thông tin khả năng quan sát; ưu tiên kiểm tra khung hình trước khi góp ý.',
                'positive':'Nhận xét gốc của dữ liệu; không chứng minh toàn bộ động tác đúng.'}[label['kind']])
            if '_rom_' in label['key'] or label['key'].startswith('height_'):
                label['note_vi']='Mức biên độ/mức nâng theo thang chú thích gốc; chưa có căn cứ chuyển thành góc giải phẫu hoặc chuẩn đúng/sai.'
            labels.append(label)
        output['exercises'][code]={'model_exercise':model_code,'schema_version':contract['schema_version'],
            'model_sha256':contract['onnx_sha256'],'contract_sha256':digest(path),'contract_file':'model_contracts/'+path.name,
            'frames':contract['frames'],'context_size':contract['context_size'],'threshold_source':contract['threshold_source'],
            'labels':labels}
    (ROOT/'label_catalog_v4.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print({k:dict(Counter(x['kind'] for x in v['labels'])) for k,v in output['exercises'].items()})

if __name__=='__main__':main()
