"""One binary message = little-endian JSON length + UTF-8 metadata + JPEG."""
import json
import math
import struct

MAX_FRAME_BYTES = 2 * 1024 * 1024
MAX_META_BYTES = 4096
HEADER = struct.Struct('<I')


def decode_packet(packet):
    if not isinstance(packet, bytes) or not HEADER.size < len(packet) <= MAX_FRAME_BYTES:
        raise ValueError('Gói hình không hợp lệ hoặc vượt quá 2 MB.')
    length, = HEADER.unpack_from(packet)
    if not 0 < length <= MAX_META_BYTES or HEADER.size + length >= len(packet):
        raise ValueError('Thiếu thông tin hoặc dữ liệu ảnh.')
    meta = json.loads(packet[HEADER.size:HEADER.size + length].decode('utf-8'))
    if not isinstance(meta, dict):
        raise ValueError('Thông tin khung hình phải là đối tượng JSON.')
    frame_id, timestamp = meta.get('frame_id'), meta.get('timestamp')
    if isinstance(frame_id, bool) or not isinstance(frame_id, int) or not 0 <= frame_id < 2**53:
        raise ValueError('Mã khung hình không hợp lệ.')
    if isinstance(timestamp, bool) or not isinstance(timestamp, (float, int)) or not math.isfinite(timestamp) or timestamp < 0:
        raise ValueError('Thời điểm khung hình không hợp lệ.')
    return meta, packet[HEADER.size + length:]


def encode_packet(meta, jpeg):
    payload = json.dumps(meta).encode('utf-8')
    return HEADER.pack(len(payload)) + payload + jpeg
