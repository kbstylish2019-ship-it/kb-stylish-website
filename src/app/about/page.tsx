import dynamic from "next/dynamic";
import AboutHero from "@/components/about/AboutHero";

const AboutMission = dynamic(() => import("@/components/about/AboutMission"), {
  loading: () => <div className="h-48 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-8" />,
});

const AboutValues = dynamic(() => import("@/components/about/AboutValues"), {
  loading: () => <div className="h-64 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-8" />,
});

const AboutStats = dynamic(() => import("@/components/about/AboutStats"), {
  loading: () => <div className="h-32 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-8" />,
});

const TopStylistsShowcase = dynamic(() => import("@/components/about/TopStylistsShowcase"), {
  loading: () => <div className="h-96 animate-pulse bg-white/5 rounded-xl mx-auto max-w-7xl px-4 my-8" />,
});

export const metadata = {
  title: "About • KB Stylish",
  description:
    "KB Stylish blends curated commerce with trusted stylist services to create Nepal's premier destination for style.",
};

export default function AboutPage() {
  return (
    <main>
      <AboutHero />
      <div className="space-y-12 py-8">
        <AboutStats />
        <AboutMission />
        <AboutValues />
        <TopStylistsShowcase />
      </div>
    </main>
  );
}
