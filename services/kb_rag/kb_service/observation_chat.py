"""Report validated model metadata without inventing scientific explanations."""
import re
from .providers import ProviderError

def require_source_instruction_only(text):
    """Predictions and their uncertainty are rendered from validated metadata."""
    if re.search(r'\b(?:nhãn|mô hình|dự đoán|labels?|model|predictions?)\b',text.casefold()):
        raise ProviderError('The application already displays prediction labels and their limits. This source-backed technique point must not discuss a label/model/prediction or whether it is correct. State only the technique instruction in the quotation, without repeating the label name.')

def describe_observations(compact):
    errors=list(dict.fromkeys(label for row in compact if row['observation_status']=='sufficient' for label in row['model_error_predictions']))
    description=('Theo kết quả mô hình, các nhãn lỗi được dự đoán là: '+', '.join(errors)+'.') if errors else 'Kết quả mô hình chưa có nhãn lỗi vượt ngưỡng; điều này chưa xác nhận toàn bộ động tác đúng.'
    if any(row.get('simulated') for row in compact):
        description='Có dữ liệu giả lập trong ví dụ này; không xem đó là kết quả buổi tập thật.\n'+description
    return description

def observation_scope(session):
    labels=[label for row in session if row['observation_status']=='sufficient' for label in row.get('label_meanings',[])]
    errors=[label for label in labels if label['kind']=='error']
    direct=[label for label in errors if label.get('coverage')=='direct' and label.get('criterion_ids')]
    if direct:return {'mode':'direct','focus':direct[0],'errors':errors}
    if errors:
        parts=[]
        for label in errors:
            coverage='mới liên kết được một phần' if label.get('coverage')=='partial' else 'chưa có liên kết đủ căn cứ'
            parts.append(f'Với nhãn “{label["name_vi"]}”, KB {coverage}: {label.get("note_vi", "Chưa đủ căn cứ giải thích nhãn này.")}')
        return {'mode':'limited','errors':errors,'reply':'\n'.join(parts)+'\nVì vậy, tôi chưa thể giải thích chắc nguyên nhân hoặc ngưỡng khiến mô hình gắn nhãn đó cho đoạn này.'}
    attributes=list(dict.fromkeys(label['name_vi'] for label in labels if label['kind']!='error'))
    details=('Các thuộc tính được dự đoán là: '+', '.join(attributes)+'. ') if attributes else ''
    return {'mode':'attributes','errors':[], 'reply':details+'Các nhãn thuộc tính/mức biên độ không tự xác nhận đúng hoặc sai kỹ thuật và chưa phải số đo góc giải phẫu đã được kiểm chứng. Tôi chưa có căn cứ giải thích rằng video đạt một góc cụ thể.'}

def video_instruction(context):
    state=(context or {}).get('state')
    if state=='analyzed':return 'Video đã được phân tích nhưng kết quả chưa được thêm vào ngữ cảnh chat. Bạn bấm “Thêm kết quả video hiện tại”, rồi hỏi lại để tôi nhận xét đúng đoạn đó nhé.'
    if state=='selected':return 'Bạn mới chọn video, chat chưa có kết quả để nhận xét. Hãy bấm “Phân tích video”, chờ hoàn tất rồi bấm “Thêm kết quả video hiện tại”.'
    if state=='analyzing':return 'Video đang được phân tích. Bạn chờ xử lý xong rồi bấm “Thêm kết quả video hiện tại” để dùng kết quả trong chat nhé.'
    if state=='attached':return 'Kết quả video chưa có trong dữ liệu cuộc trò chuyện này. Bạn thử thêm lại kết quả video hiện tại rồi hỏi lại nhé.'
    return None
