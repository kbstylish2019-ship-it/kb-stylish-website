import AboutHero from "@/components/about/AboutHero";
import AboutMission from "@/components/about/AboutMission";
import AboutStats from "@/components/about/AboutStats";
import AboutValues from "@/components/about/AboutValues";
import TopStylistsShowcase from "@/components/about/TopStylistsShowcase";

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
