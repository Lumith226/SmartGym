"use client";
import { useState, useEffect } from "react";
import { profileApi } from "@/lib/api";

type Profile = {
  user_id: string; full_name: string | null; height_cm: number | null;
  weight_kg: number | null; age: number | null; gender: string | null;
  goal: string | null; fitness_level: string | null; bmi: number | null;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: "", height_cm: "", weight_kg: "", age: "", gender: "", goal: "", fitness_level: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newWeight, setNewWeight] = useState("");

  useEffect(() => {
    profileApi.get().then((p) => {
      const pr = p as Profile;
      setProfile(pr);
      setForm({
        full_name: pr.full_name || "",
        height_cm: pr.height_cm?.toString() || "",
        weight_kg: pr.weight_kg?.toString() || "",
        age: pr.age?.toString() || "",
        gender: pr.gender || "",
        goal: pr.goal || "",
        fitness_level: pr.fitness_level || "",
      });
    }).catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await profileApi.update({
        ...form,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        age: form.age ? Number(form.age) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  };

  const handleLogWeight = async () => {
    if (!newWeight) return;
    await profileApi.logWeight(Number(newWeight));
    setNewWeight("");
    profileApi.get().then((p) => setProfile(p as Profile)).catch(console.error);
  };

  const bmiBadge = (bmi: number) => {
    if (bmi < 18.5) return { text: "Thiếu cân", cls: "badge-warning" };
    if (bmi < 25)   return { text: "Bình thường", cls: "badge-ok" };
    if (bmi < 30)   return { text: "Thừa cân", cls: "badge-warning" };
    return { text: "Béo phì", cls: "badge-critical" };
  };

  return (
    <div className="p-8 max-w-3xl mx-auto fade-in">
      <h1 className="text-3xl font-bold mb-2">Hồ sơ cá nhân 👤</h1>
      <p className="text-gray-400 mb-8">Cập nhật thông tin để AI cá nhân hóa phản hồi tốt hơn</p>

      {/* BMI Card */}
      {profile?.bmi && (
        <div className="glass p-5 rounded-2xl mb-6 flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400">{profile.bmi}</div>
            <div className="text-xs text-gray-400 mt-1">BMI</div>
          </div>
          <div>
            <span className={`badge ${bmiBadge(profile.bmi).cls}`}>{bmiBadge(profile.bmi).text}</span>
            <p className="text-xs text-gray-500 mt-2">
              {profile.height_cm}cm · {profile.weight_kg}kg
            </p>
          </div>
        </div>
      )}

      {/* Profile form */}
      <form onSubmit={handleSave} className="glass p-6 rounded-2xl space-y-4 mb-6">
        <h2 className="font-semibold mb-2">Thông tin cơ bản</h2>
        {[
          { key: "full_name", label: "Họ và tên", type: "text", placeholder: "Nguyễn Văn A" },
          { key: "age", label: "Tuổi", type: "number", placeholder: "22" },
          { key: "height_cm", label: "Chiều cao (cm)", type: "number", placeholder: "170" },
          { key: "weight_kg", label: "Cân nặng (kg)", type: "number", placeholder: "65" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm text-gray-400 mb-1">{label}</label>
            <input
              type={type}
              className="input"
              placeholder={placeholder}
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </div>
        ))}

        <div>
          <label className="block text-sm text-gray-400 mb-1">Giới tính</label>
          <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Chọn</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Mục tiêu</label>
          <select className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
            <option value="">Chọn</option>
            <option value="muscle_gain">Tăng cơ</option>
            <option value="fat_loss">Giảm mỡ</option>
            <option value="maintain">Duy trì</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Trình độ</label>
          <select className="input" value={form.fitness_level} onChange={(e) => setForm({ ...form, fitness_level: e.target.value })}>
            <option value="">Chọn</option>
            <option value="beginner">Mới bắt đầu</option>
            <option value="intermediate">Trung cấp</option>
            <option value="advanced">Nâng cao</option>
          </select>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? "Đang lưu..." : saved ? "✅ Đã lưu!" : "Lưu thay đổi"}
        </button>
      </form>

      {/* Weight logger */}
      <div className="glass p-6 rounded-2xl">
        <h2 className="font-semibold mb-4">Ghi cân nặng hôm nay</h2>
        <div className="flex gap-3">
          <input
            type="number"
            className="input"
            placeholder="65.5"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
          />
          <button onClick={handleLogWeight} className="btn-primary whitespace-nowrap">
            Ghi lại
          </button>
        </div>
      </div>
    </div>
  );
}
