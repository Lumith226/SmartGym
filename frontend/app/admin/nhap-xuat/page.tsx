import { CatalogTransfers } from './transfers';

export default function TransferPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-xs font-semibold uppercase tracking-wider text-primary">Knowledge Base</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Nhập và xuất KB
        </h1>
        <p className="text-sm text-muted-foreground">
          Đồng bộ và phân phối các gói tri thức bài tập chuẩn hóa cho thư viện và AI RAG.
        </p>
      </div>

      <CatalogTransfers />
    </section>
  );
}
