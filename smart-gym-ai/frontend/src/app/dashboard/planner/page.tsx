export default function PlannerPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto fade-in">
      <h1 className="text-3xl font-bold mb-2">Kế hoạch Tập luyện 📅</h1>
      <p className="text-gray-400 mb-8">Lập kế hoạch tập luyện và dinh dưỡng</p>

      <div className="grid md:grid-cols-7 gap-2 mb-6">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <div key={day} className="glass p-4 rounded-xl text-center">
            <div className="text-xs text-gray-500 mb-2">{day}</div>
            <div className="h-20 flex items-center justify-center bg-gray-800/40 rounded-lg text-xs text-gray-600">
              + Thêm
            </div>
          </div>
        ))}
      </div>

      <div className="glass p-6 rounded-2xl text-center">
        <div className="text-4xl mb-3">🤖</div>
        <h2 className="font-semibold mb-2">AI Smart Planner</h2>
        <p className="text-gray-400 text-sm mb-4">TV3 + TV2 sẽ implement: nhập mục tiêu → AI tạo lịch tập tự động</p>
        <button className="btn-primary opacity-50 cursor-not-allowed" disabled>
          Tạo kế hoạch với AI (Coming Soon)
        </button>
      </div>
    </div>
  );
}
