export default function ProgressPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto fade-in">
      <h1 className="text-3xl font-bold mb-2">Tiến trình 📈</h1>
      <p className="text-gray-400 mb-8">Theo dõi sự tiến bộ theo thời gian</p>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Performance Score chart placeholder */}
        <div className="glass p-6 rounded-2xl">
          <h2 className="font-semibold mb-4">Performance Score</h2>
          <div className="h-40 flex items-center justify-center bg-gray-800/40 rounded-xl">
            <p className="text-gray-500 text-sm">📊 TV3 sẽ implement biểu đồ theo tuần</p>
          </div>
        </div>

        {/* Error Heatmap placeholder */}
        <div className="glass p-6 rounded-2xl">
          <h2 className="font-semibold mb-4">Lỗi kỹ thuật phổ biến</h2>
          <div className="h-40 flex items-center justify-center bg-gray-800/40 rounded-xl">
            <p className="text-gray-500 text-sm">🔥 TV3 sẽ implement Error Heatmap</p>
          </div>
        </div>
      </div>

      {/* Weight tracker placeholder */}
      <div className="glass p-6 rounded-2xl">
        <h2 className="font-semibold mb-4">Theo dõi cân nặng</h2>
        <div className="h-32 flex items-center justify-center bg-gray-800/40 rounded-xl">
          <p className="text-gray-500 text-sm">⚖️ TV3 sẽ implement Weight + BMI chart</p>
        </div>
      </div>
    </div>
  );
}
