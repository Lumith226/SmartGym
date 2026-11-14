const destinations = new Set(['/hoi-dap', '/app', '/app/ho-so', '/app/tap-ai', '/app/chuong-trinh', '/app/chuong-trinh/moi', '/app/lich', '/app/nhat-ky', '/app/nhat-ky/moi', '/app/tien-do', '/app/thong-bao', '/app/cai-dat/thong-bao', '/admin']);
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && (destinations.has(value) || /^\/app\/(?:tap-ai\/ket-qua|chuong-trinh|lich\/buoi|nhat-ky)\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) ? value : '/app';
}
