export const supportNames = { 'muscle-group': 'Nhóm cơ', equipment: 'Dụng cụ', media: 'Media' } as const;
export type SupportType = keyof typeof supportNames;
export const supportType = (value: string): value is SupportType => Object.hasOwn(supportNames, value);
export const supportPage = (type: SupportType) => '/admin/noi-dung/' + type;
export const supportApi = (type: SupportType, id?: string) => '/content/' + type + (id ? '/' + encodeURIComponent(id) : '');
