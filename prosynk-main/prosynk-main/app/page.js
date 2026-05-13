"use client";

import { useRef, useState } from "react";
import { CheckCircle, Zap, Users, Brain, FileText, Clock, ArrowRight, Menu, X, Star } from "lucide-react";
import html2pdf from 'html2pdf.js';

export default function Home() {
  const sliderRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    {
      title: "Project & Task Management",
      description: "Easily create, assign, and track tasks with priorities and deadlines.",
      icon: CheckCircle,
      color: "from-blue-500 to-cyan-500"
    },
    {
      title: "Kanban Board",
      description: "Drag-and-drop task updates for intuitive progress tracking.",
      icon: Zap,
      color: "from-purple-500 to-pink-500"
    },
    {
      title: "Real-Time Chat",
      description: "Collaborate instantly with your team using real-time messaging.",
      icon: Users,
      color: "from-green-500 to-emerald-500"
    },
    {
      title: "AI-Powered Insights",
      description: "Automated summaries, reminders, and task risk predictions.",
      icon: Brain,
      color: "from-orange-500 to-red-500"
    },
    {
      title: "File & Document Uploads",
      description: "Attach files to tasks for reporting and accountability.",
      icon: FileText,
      color: "from-indigo-500 to-blue-500"
    },
    {
      title: "Audit Trail",
      description: "Keep track of all project updates and changes.",
      icon: Clock,
      color: "from-yellow-500 to-orange-500"
    },
  ];

  const stats = [
    { value: "10K+", label: "Active Users" },
    { value: "50K+", label: "Projects Managed" },
    { value: "99.9%", label: "Uptime" },
    { value: "4.9/5", label: "User Rating" }
  ];

  const handleMouseMove = (e) => {
    const slider = sliderRef.current;
    if (!slider) return;
    const { left, width } = slider.getBoundingClientRect();
    const mouseX = e.clientX - left;
    const percentage = mouseX / width;
    const maxScroll = slider.scrollWidth - slider.clientWidth;
    slider.scrollLeft = maxScroll * percentage;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#163853] via-[#1e4a63] to-[#163853] font-sans text-white overflow-x-hidden">

      {/* NAVBAR */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#163853]/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-white to-slate-300 rounded-lg flex items-center justify-center shadow-lg">
              <span className="text-xl font-bold text-[#163853]">P</span>
            </div>
            <h1 className="text-2xl font-bold text-white">ProSynk</h1>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-200 hover:text-white transition">Features</a>
            <a href="#benefits" className="text-slate-200 hover:text-white transition">Benefits</a>
            <a href="#testimonials" className="text-slate-200 hover:text-white transition">Testimonials</a>
            <a
              href="/login"
              className="px-6 py-2 rounded-lg font-semibold bg-white text-[#163853] hover:bg-slate-100 transition duration-300 shadow-lg"
            >
              Get Started
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#1a4259] border-t border-white/10">
            <div className="flex flex-col gap-4 px-6 py-4">
              <a href="#features" className="text-slate-200 hover:text-white transition">Features</a>
              <a href="#benefits" className="text-slate-200 hover:text-white transition">Benefits</a>
              <a href="#testimonials" className="text-slate-200 hover:text-white transition">Testimonials</a>
              <a
                href="/login"
                className="px-6 py-2 rounded-lg font-semibold bg-white text-[#163853] hover:bg-slate-100 transition text-center"
              >
                Get Started
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>

        <div className="max-w-6xl mx-auto text-center relative z-10">
          
          <h2 className="text-6xl md:text-8xl font-black mb-6 leading-tight">
            <span className="bg-gradient-to-r from-white via-slate-200 to-white bg-clip-text text-transparent">
              Project Management
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
              Reimagined
            </span>
          </h2>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            A smart, AI-powered project management system with real-time collaboration 
            that helps teams achieve more, together.
          </p>

          

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-slate-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Powerful Features
              </span>
            </h3>
            <p className="text-xl text-slate-300">Everything you need to manage projects efficiently</p>
          </div>

          <div
            ref={sliderRef}
            onMouseMove={handleMouseMove}
            className="flex gap-6 overflow-x-auto scroll-smooth px-4 pb-6 scrollbar-hide cursor-pointer"
          >
            {[...features, ...features].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="flex-shrink-0 w-80 p-8 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 hover:bg-white/15 hover:scale-105 transition-all duration-300 group"
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h4 className="text-2xl font-bold mb-3 text-white">{feature.title}</h4>
                  <p className="text-slate-300 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
          
          <p className="text-center text-slate-400 mt-8 text-sm">
            💡 Hover and move your mouse to scroll through features
          </p>
        </div>
      </section>

      {/* BENEFITS SECTION */}
      <section id="benefits" className="py-24 px-6 bg-white/5 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h3 className="text-5xl font-bold mb-4 text-white">Why Choose ProSynk?</h3>
            <p className="text-xl text-slate-300">Join thousands of teams already boosting their productivity</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Smart Automation",
                description: "AI handles reminders, summaries, and risk detection automatically",
                stat: "50% less manual work"
              },
              {
                title: "Boost Collaboration",
                description: "Real-time updates keep everyone on the same page",
                stat: "3x efficient engagement"
              },
              {
                title: "Smarter Decisions",
                description: "AI highlights risks and predicts delays before they happen",
                stat: "90% better visibility"
              }
            ].map((benefit, index) => (
              <div key={index} className="text-center p-8 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 hover:bg-white/15 transition">
                <div className="text-4xl font-bold text-white mb-2">{benefit.stat}</div>
                <h4 className="text-2xl font-bold mb-3 text-white">{benefit.title}</h4>
                <p className="text-slate-300">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-5xl font-bold text-center mb-16 text-white">Loved by Teams Worldwide</h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "ProSynk transformed how our team collaborates. We're 40% more productive!",
                author: "Zaid Ahmed Khan",
                role: "Project Manager, Disrupt"
              },
              {
                quote: "The AI insights are game-changing. It's like having a project assistant 24/7.",
                author: "Areeb Jafri",
                role: "Team Lead, Systems Limited"
              },
              {
                quote: "Great project management tool. Simple, powerful, and beautiful.",
                author: "Naveed Raza",
                role: "Project Manager, Bank Islami"
              }
            ].map((testimonial, index) => (
              <div key={index} className="p-6 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-200 mb-6 italic">"{testimonial.quote}"</p>
                <div>
                  <div className="font-semibold text-white">{testimonial.author}</div>
                  <div className="text-sm text-slate-400">{testimonial.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-xl rounded-3xl border border-white/20 p-12">
          <h3 className="text-5xl font-bold mb-6 text-white">Ready to Transform Your Workflow?</h3>
          <p className="text-xl text-slate-300 mb-8">
            Join 10,000+ teams already using ProSynk. Start your free trial today.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl font-bold bg-white text-[#163853] hover:bg-slate-100 transition duration-300 shadow-2xl text-lg"
          >
            Get Started Free
            <ArrowRight className="w-6 h-6" />
          </a>
          <p className="text-sm text-slate-400 mt-4">No credit card required • Free 14-day trial</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0f2838] border-t border-white/10 text-white py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-lg font-bold text-[#163853]">P</span>
                </div>
                <h4 className="text-xl font-bold">ProSynk</h4>
              </div>
              <p className="text-slate-400 text-sm">
                Smart project management for modern teams.
              </p>
            </div>
            
            <div>
              <h5 className="font-semibold mb-4">Product</h5>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">Features</a></li>
                <li><a href="#" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition">Security</a></li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-semibold mb-4">Company</h5>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-semibold mb-4">Support</h5>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
                <li><a href="#" className="hover:text-white transition">Status</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 pt-8 text-center text-slate-400 text-sm">
            <p>&copy; {new Date().getFullYear()} ProSynk. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}