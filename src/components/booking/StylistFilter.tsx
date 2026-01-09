"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface SpecialtyType {
  id: string;
  name: string;
  slug: string;
  category: string;
}

interface StylistFilterProps {
  categories: string[];
  specialtyTypes: SpecialtyType[];
  value: string;
  onChange: (value: string) => void;
}

export default function StylistFilter({ categories, specialtyTypes, value, onChange }: StylistFilterProps) {
  const [isSpecialtyOpen, setIsSpecialtyOpen] = React.useState(false);

  // Get display name for selected value
  const getDisplayName = () => {
    if (value === "All") return "All Stylists";
    
    // Check if it's a category
    if (categories.includes(value)) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    
    // Check if it's a specialty
    const specialty = specialtyTypes.find(st => st.id === value);
    return specialty ? specialty.name : value;
  };

  return (
    <div className="flex items-center gap-3">
      {/* Category Pills (compact) */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap -mx-1 px-1 pb-1">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onChange(category)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0",
              value === category
                ? "bg-[#1976D2] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            )}
          >
            {category === "All" ? "All" : category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}
      </div>

      {/* Specialty Dropdown (clean) */}
      {specialtyTypes.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setIsSpecialtyOpen(!isSpecialtyOpen)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              specialtyTypes.some(st => st.id === value)
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            <span>
              {specialtyTypes.some(st => st.id === value) 
                ? getDisplayName() 
                : "Filter by Specialty"}
            </span>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isSpecialtyOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown Menu */}
          {isSpecialtyOpen && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setIsSpecialtyOpen(false)}
              />
              
              {/* Menu */}
              <div className="absolute right-0 z-20 mt-2 w-64 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
                <div className="p-2">
                  {/* Clear filter */}
                  {specialtyTypes.some(st => st.id === value) && (
                    <button
                      onClick={() => {
                        onChange("All");
                        setIsSpecialtyOpen(false);
                      }}
                      className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
                    >
                      Clear specialty filter
                    </button>
                  )}
                  
                  {/* Group by category */}
                  {["hair", "makeup", "nails", "spa", "bridal", "grooming"].map(cat => {
                    const categorySpecialties = specialtyTypes.filter(st => st.category === cat);
                    if (categorySpecialties.length === 0) return null;
                    
                    return (
                      <div key={cat} className="mt-2">
                        <p className="px-3 py-1 text-xs font-semibold uppercase text-gray-400">
                          {cat}
                        </p>
                        {categorySpecialties.map((specialty) => (
                          <button
                            key={specialty.id}
                            onClick={() => {
                              onChange(specialty.id);
                              setIsSpecialtyOpen(false);
                            }}
                            className={cn(
                              "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                              value === specialty.id
                                ? "bg-emerald-50 text-emerald-700 font-medium"
                                : "text-gray-700 hover:bg-gray-50"
                            )}
                          >
                            {specialty.name}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
