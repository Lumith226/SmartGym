"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

const FEATURES = [
  {
    icon: "🎯",
    title: "Precision Tracking",
    desc: "YOLOv8-Pose extracts 17 critical keypoints in real-time, ensuring millimeter accuracy for every rep you perform.",
  },
  {
    icon: "⚡",
    title: "Instant Feedback",
    desc: "Sub-10ms latency using ST-GCN++ means you get corrected mid-movement, preventing injuries before they happen.",
  },
  {
    icon: "🧠",
    title: "AI Knowledge Graph",
    desc: "Our Qwen2.5 powered AI Coach taps into a vast fitness ontology to explain the 'why' behind your faults.",
  },
  {
    icon: "📈",
    title: "Smart Analytics",
    desc: "Visualize your progress with DTW scoring, error heatmaps, and personalized progression plans.",
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden selection:bg-[#ff6b35] selection:text-white">
      {/* Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#1e3a8a] opacity-20 blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] rounded-full bg-[#ea580c] opacity-10 blur-[150px] pointer-events-none" />

      {/* Navigation */}
      <nav
        className={`fixed w-full z-50 transition-all duration-300 ${
          scrolled ? "bg-[#0a0c10]/90 backdrop-blur-md border-b border-[#222736] py-4" : "bg-transparent py-6"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Logo Icon */}
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[#ff8a00] to-[#ff6b35] flex items-center justify-center font-bold text-white text-xl">
              F
            </div>
            <span className="text-2xl font-bold tracking-tight">FitAI</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-300">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-white transition-colors">How It Works</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-semibold hover:text-white transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/register">
              <button className="btn-primary py-2.5 px-6 rounded-full text-sm">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 lg:pt-48 lg:pb-32">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left: Text Content */}
          <div className="z-10">
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Train Smarter.
              <br />
              <span className="relative inline-block mt-2">
                Move Better.
                {/* Accent Line */}
                <svg className="absolute w-full h-3 -bottom-2 left-0 text-[#ff6b35]" viewBox="0 0 100 10" preserveAspectRatio="none">
                   <path d="M0 5 Q 50 10 100 0" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round"/>
                </svg>
              </span>
            </h1>
            <p className="text-lg text-gray-400 mb-10 max-w-xl leading-relaxed">
              Unlock your potential with real-time AI guidance for personalized workouts, technique feedback, and performance tracking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register">
                <button className="btn-primary rounded-full px-8 py-4 w-full sm:w-auto flex items-center justify-center gap-2">
                  Get Started
                </button>
              </Link>
              <button className="btn-secondary rounded-full px-8 py-4 w-full sm:w-auto flex items-center justify-center gap-2 hover:bg-white/5">
                Watch Demo
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          {/* Right: Interactive UI Mockup */}
          <div className="relative z-10 animate-float">
             {/* Glow behind the card */}
             <div className="absolute inset-0 bg-[#00f0ff] opacity-10 blur-3xl rounded-3xl" />
             
             <div className="glass-panel p-2 pb-6 relative overflow-hidden bg-[#13161f]/80">
                {/* Main Video Area Mockup */}
                <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-gray-900 border border-gray-800">
                    <img src="https://images.unsplash.com/photo-1574680096145-d05b474e2155?q=80&w=1000&auto=format&fit=crop" alt="Workout" className="object-cover w-full h-full opacity-60" />
                    
                    {/* Skeleton Overlay Mockup */}
                    <svg className="absolute inset-0 w-full h-full" style={{ filter: 'drop-shadow(0 0 4px #00f0ff)' }}>
                       {/* Lines */}
                       <line x1="50%" y1="20%" x2="50%" y2="40%" stroke="#00f0ff" strokeWidth="3" />
                       <line x1="50%" y1="40%" x2="35%" y2="60%" stroke="#00f0ff" strokeWidth="3" />
                       <line x1="50%" y1="40%" x2="65%" y2="60%" stroke="#00f0ff" strokeWidth="3" />
                       {/* Dots */}
                       <circle cx="50%" cy="20%" r="5" fill="#ff6b35" />
                       <circle cx="50%" cy="40%" r="5" fill="#ff6b35" />
                       <circle cx="35%" cy="60%" r="5" fill="#ff6b35" />
                       <circle cx="65%" cy="60%" r="5" fill="#ff6b35" />
                    </svg>

                    {/* Status Badge */}
                    <div className="absolute top-4 left-4 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                       Correct Form
                    </div>

                    {/* Score Meter */}
                    <div className="absolute top-4 right-4 bg-[#1a1d27]/90 backdrop-blur rounded-xl p-3 border border-gray-700 shadow-xl flex flex-col items-center">
                        <div className="relative w-16 h-8 overflow-hidden mb-1">
                           <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-gray-700 border-t-[#22c55e] border-r-[#22c55e] transform rotate-45"></div>
                        </div>
                        <span className="text-xl font-bold">87%</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">AI Score</span>
                    </div>
                </div>

                {/* Bottom Metric Chips */}
                <div className="flex justify-center gap-3 mt-[-1rem] relative z-20 px-4">
                   <div className="bg-[#1a1d27] border border-[#2a2f42] rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
                      <span className="text-gray-400">Reps:</span>
                      <span className="font-bold">12</span>
                   </div>
                   <div className="bg-[#1a1d27] border border-[#2a2f42] rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
                      <span className="text-gray-400">Score:</span>
                      <span className="font-bold text-[#22c55e]">87%</span>
                   </div>
                   <div className="bg-[#1a1d27] border border-[#2a2f42] rounded-lg px-4 py-2 flex items-center gap-2 shadow-lg">
                      <span className="text-gray-400">Fault:</span>
                      <span className="font-bold">None</span>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-[#08090c] border-t border-[#1a1d27]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise-Grade AI, Built for You</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">Our technology stack leverages state-of-the-art computer vision and knowledge graphs to provide an unmatched training experience.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feat, idx) => (
              <div key={idx} className="feature-card">
                <div className="w-12 h-12 rounded-lg bg-[#1a1d27] border border-[#2a2f42] flex items-center justify-center text-2xl mb-6">
                  {feat.icon}
                </div>
                <h3 className="text-lg font-bold mb-3">{feat.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="border-t border-[#1a1d27] bg-[#050608] py-12">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded bg-gradient-to-br from-[#ff8a00] to-[#ff6b35] flex items-center justify-center font-bold text-white text-xs">F</div>
               <span className="font-bold text-white">FitAI</span>
               <span>© 2026 Smart Gym Project</span>
            </div>
            <div className="flex gap-6">
               <a href="#" className="hover:text-white transition-colors">Privacy</a>
               <a href="#" className="hover:text-white transition-colors">Terms</a>
               <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
         </div>
      </footer>
    </div>
  );
}
