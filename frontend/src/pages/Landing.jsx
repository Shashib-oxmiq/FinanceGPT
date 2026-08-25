import { Link } from "react-router-dom";
import { ShieldCheck, ChatCircleText, Package, HandHeart, ChartLineUp, FileText, ArrowRight } from "@phosphor-icons/react";

const HERO = "https://images.unsplash.com/photo-1590859808308-3d2d9c515b1a?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";

const FEATURES = [
  { icon: ChatCircleText, title: "Life Advisor Chat", desc: "Ask anything — insurance, health, ROI, credit, big decisions. Claude & Gemini answer and quietly organize your details." },
  { icon: ChartLineUp, title: "Money Insights", desc: "Upload a bank or credit-card statement and get a spending breakdown, recurring subscriptions and clear expense advice." },
  { icon: ShieldCheck, title: "Insurance Intelligence", desc: "Track life & health policies with nominees, riders and claim contacts. AI flags gaps and corner cases." },
  { icon: FileText, title: "Every Document, One Place", desc: "Financial, medical, property, vehicle, legal, education — securely stored, searchable and ready when you need them." },
  { icon: Package, title: "Smart Bundles & Forms", desc: "Auto-fill any form from your profile, and assemble the right documents into one download for any purpose." },
  { icon: HandHeart, title: "Next-of-Kin Handover", desc: "Your spouse can retrieve the full picture — insurance, bank, documents — so benefits pass on correctly." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 md:px-12 h-16 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck size={26} weight="duotone" className="text-primary" />
          <span className="font-heading font-black text-lg tracking-tight">EVERKIN</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" data-testid="nav-login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
          <Link to="/register" data-testid="nav-register" className="text-sm bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity">Get started</Link>
        </div>
      </header>

      <section className="grid lg:grid-cols-2 gap-12 items-center px-6 md:px-12 py-16 md:py-24 max-w-7xl mx-auto">
        <div className="animate-fade-up">
          <p className="text-xs tracking-[0.3em] uppercase text-primary mb-4">The assistant that matters most</p>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-none">
            Every important thing in your life, in one secure place.
          </h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            Everkin is your personal AI assistant for the things that matter — insurance, health, money,
            property and documents. It reviews your statements, answers your questions, keeps everything
            safe, and makes sure your loved ones are covered if you're ever unavailable.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register" data-testid="hero-cta" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-semibold hover:-translate-y-0.5 transition-transform">
              Start your vault <ArrowRight size={18} weight="bold" />
            </Link>
            <Link to="/login" className="inline-flex items-center px-6 py-3 rounded-md border border-border font-semibold hover:bg-secondary transition-colors">
              I have an account
            </Link>
          </div>
        </div>
        <div className="relative animate-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <img src={HERO} alt="Secure network" className="relative rounded-lg border border-border w-full object-cover h-[420px]" />
        </div>
      </section>

      <section className="px-6 md:px-12 pb-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
          {FEATURES.map((f, i) => (
            <div key={i} className="grid-panel p-8 hover:bg-secondary/40 transition-colors animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <f.icon size={30} weight="duotone" className="text-primary mb-4" />
              <h3 className="font-heading text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 md:px-12 py-8 text-xs text-muted-foreground">
        Everkin — AI financial advisor & secure document vault. Not a substitute for licensed legal or tax advice.
      </footer>
    </div>
  );
}
