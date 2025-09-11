import type { Stylist } from "@/lib/types";

export type StylistService = {
  name: string;
  durationMins: number;
  price: number; // NPR
};

export type StylistProfile = Stylist & {
  location?: string;
  services: StylistService[];
};

export const STYLISTS: StylistProfile[] = [
  {
    id: "s1",
    name: "Anisha Gurung",
    specialty: "Bridal Styling",
    rating: 4.8,
    imageUrl:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1200&auto=format&fit=crop",
    location: "Durbar Marg, Kathmandu",
    services: [
      { name: "Bridal Consultation", durationMins: 45, price: 1500 },
      { name: "Bridal Makeup Trial", durationMins: 90, price: 4500 },
      { name: "Wedding Day Styling", durationMins: 120, price: 9000 },
    ],
  },
  {
    id: "s2",
    name: "Rohit Shrestha",
    specialty: "Men's Grooming",
    rating: 4.6,
    imageUrl:
      "https://images.unsplash.com/photo-1553514029-1318c9127859?q=80&w=1200&auto=format&fit=crop",
    location: "Jhamsikhel, Lalitpur",
    services: [
      { name: "Signature Haircut", durationMins: 45, price: 1200 },
      { name: "Beard Styling", durationMins: 30, price: 700 },
      { name: "Cut + Beard Combo", durationMins: 60, price: 1700 },
    ],
  },
  {
    id: "s3",
    name: "Sujata Lama",
    specialty: "Makeup Artist",
    rating: 4.9,
    imageUrl:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=1200&auto=format&fit=crop",
    location: "New Baneshwor, Kathmandu",
    services: [
      { name: "Glam Makeup", durationMins: 75, price: 3500 },
      { name: "Natural Day Look", durationMins: 60, price: 2200 },
      { name: "Event-Ready Package", durationMins: 90, price: 5000 },
    ],
  },
  {
    id: "s4",
    name: "Kritika Shahi",
    specialty: "Hair Coloring",
    rating: 4.7,
    imageUrl:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=1200&auto=format&fit=crop",
    location: "Maharajgunj, Kathmandu",
    services: [
      { name: "Root Touch-up", durationMins: 60, price: 2500 },
      { name: "Full Color", durationMins: 120, price: 6000 },
      { name: "Highlights/Lowlights", durationMins: 120, price: 6800 },
    ],
  },
  {
    id: "s5",
    name: "Nirmal Karki",
    specialty: "Men's Grooming",
    rating: 4.5,
    imageUrl:
      "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?q=80&w=1200&auto=format&fit=crop",
    location: "Thamel, Kathmandu",
    services: [
      { name: "Classic Haircut", durationMins: 40, price: 900 },
      { name: "Fade/Texture Cut", durationMins: 45, price: 1300 },
      { name: "Hot Towel Shave", durationMins: 30, price: 800 },
    ],
  },
  {
    id: "s6",
    name: "Prerana Adhikari",
    specialty: "Bridal Styling",
    rating: 4.8,
    imageUrl:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=1200&auto=format&fit=crop",
    location: "Pulchowk, Lalitpur",
    services: [
      { name: "Bridal Sari Draping", durationMins: 60, price: 1800 },
      { name: "Engagement Look", durationMins: 90, price: 5500 },
      { name: "Reception Glam", durationMins: 120, price: 8000 },
    ],
  },
];

export function listSpecialties(stylists: Stylist[]): string[] {
  const set = new Set<string>(stylists.map((s) => s.specialty));
  return ["All", ...Array.from(set).sort()];
}
