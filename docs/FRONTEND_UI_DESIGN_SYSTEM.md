# KB Stylish - UI Design System

## Frontend Design Documentation

---

## 1. Design Philosophy

### 1.1 Core Principles

| Principle | Description |
|-----------|-------------|
| **Elegance** | Premium, sophisticated aesthetic befitting a fashion platform |
| **Clarity** | Clear visual hierarchy and intuitive navigation |
| **Consistency** | Unified design language across all pages |
| **Accessibility** | Inclusive design for all users |
| **Performance** | Optimized visuals that don't compromise speed |

### 1.2 Brand Identity

KB Stylish represents Nepal's premier fashion and style marketplace. The design reflects:
- **Sophistication**: Dark theme with gold accents
- **Trust**: Clean, professional layouts
- **Modernity**: Contemporary UI patterns
- **Locality**: Tailored for Nepali market

---

## 2. Color System

### 2.1 Primary Colors

```css
:root {
  /* Primary Brand - Purple */
  --kb-primary-brand: #8B5CF6;
  --kb-primary-brand-hover: #7C3AED;
  --kb-primary-brand-light: rgba(139, 92, 246, 0.1);
  --kb-primary-brand-dark: #6D28D9;
  
  /* Accent Gold */
  --kb-accent-gold: #F59E0B;
  --kb-accent-gold-light: rgba(245, 158, 11, 0.1);
  
  /* Accent Red */
  --kb-accent-red: #EF4444;
  --kb-accent-red-light: rgba(239, 68, 68, 0.1);
}
```

### 2.2 Neutral Colors

```css
:root {
  /* Background */
  --background: #0A0A0A;
  --background-secondary: #111111;
  --background-tertiary: #1A1A1A;
  
  /* Foreground */
  --foreground: #FAFAFA;
  --foreground-secondary: rgba(250, 250, 250, 0.7);
  --foreground-tertiary: rgba(250, 250, 250, 0.5);
  
  /* Surface */
  --kb-surface-dark: #1A1A1A;
  --kb-surface-light: rgba(255, 255, 255, 0.05);
}
```

### 2.3 Semantic Colors

```css
:root {
  /* Status Colors */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;
  
  /* Status Backgrounds */
  --color-success-bg: rgba(16, 185, 129, 0.1);
  --color-warning-bg: rgba(245, 158, 11, 0.1);
  --color-error-bg: rgba(239, 68, 68, 0.1);
  --color-info-bg: rgba(59, 130, 246, 0.1);
}
```

### 2.4 Color Usage Guidelines

| Color | Usage |
|-------|-------|
| Primary Purple | CTAs, active states, links |
| Accent Gold | Highlights, badges, premium indicators |
| Accent Red | Errors, alerts, destructive actions |
| Success Green | Confirmations, positive status |
| Warning Amber | Warnings, pending states |
| Info Blue | Information, help text |

---

## 3. Typography

### 3.1 Font Family

```css
:root {
  --font-inter: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

body {
  font-family: var(--font-inter);
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}
```

### 3.2 Type Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Display | 48px / 3rem | 800 | 1.1 | Hero headings |
| H1 | 36px / 2.25rem | 700 | 1.2 | Page titles |
| H2 | 30px / 1.875rem | 700 | 1.25 | Section headings |
| H3 | 24px / 1.5rem | 600 | 1.3 | Card titles |
| H4 | 20px / 1.25rem | 600 | 1.4 | Subsection titles |
| Body Large | 18px / 1.125rem | 400 | 1.6 | Lead paragraphs |
| Body | 16px / 1rem | 400 | 1.5 | Default text |
| Body Small | 14px / 0.875rem | 400 | 1.5 | Secondary text |
| Caption | 12px / 0.75rem | 500 | 1.4 | Labels, captions |
| Overline | 12px / 0.75rem | 600 | 1.4 | Category labels |

### 3.3 Typography Classes

```css
/* Headings */
.text-display { @apply text-5xl font-extrabold tracking-tight; }
.text-h1 { @apply text-4xl font-bold tracking-tight; }
.text-h2 { @apply text-3xl font-bold tracking-tight; }
.text-h3 { @apply text-2xl font-semibold; }
.text-h4 { @apply text-xl font-semibold; }

/* Body */
.text-body-lg { @apply text-lg leading-relaxed; }
.text-body { @apply text-base leading-normal; }
.text-body-sm { @apply text-sm leading-normal; }

/* Utility */
.text-caption { @apply text-xs font-medium; }
.text-overline { @apply text-xs font-semibold uppercase tracking-wider; }
```

---

## 4. Spacing System

### 4.1 Base Scale

```css
/* 4px base unit */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
--space-20: 5rem;    /* 80px */
```

### 4.2 Component Spacing

| Component | Padding | Gap |
|-----------|---------|-----|
| Card | 24px (p-6) | - |
| Button | 8px 16px | - |
| Input | 8px 12px | - |
| Section | 64px 0 | - |
| Grid | - | 16px-24px |
| Stack | - | 16px |

---

## 5. Component Design

### 5.1 Buttons

**Primary Button**
```tsx
<button className="
  inline-flex items-center justify-center
  rounded-full px-6 py-3
  text-sm font-semibold text-white
  bg-gradient-to-r from-[color-mix(in_oklab,var(--kb-primary-brand)_75%,black)] 
  to-[var(--kb-primary-brand)]
  hover:from-[var(--kb-primary-brand)] hover:to-[var(--kb-primary-brand)]
  ring-1 ring-white/10
  transition-all duration-200
  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kb-accent-gold)]
">
  Button Text
</button>
```

**Secondary Button**
```tsx
<button className="
  inline-flex items-center justify-center
  rounded-full px-6 py-3
  text-sm font-semibold text-foreground
  bg-white/5
  ring-1 ring-white/10
  hover:bg-white/10
  transition-all duration-200
">
  Button Text
</button>
```

**Ghost Button**
```tsx
<button className="
  inline-flex items-center justify-center
  rounded-lg px-4 py-2
  text-sm font-medium text-foreground/70
  hover:text-foreground hover:bg-white/5
  transition-colors
">
  Button Text
</button>
```

### 5.2 Cards

**Standard Card**
```tsx
<div className="
  rounded-2xl 
  border border-white/10 
  bg-white/5 
  p-6 
  ring-1 ring-white/10
  hover:border-[var(--kb-primary-brand)]/50 
  hover:bg-white/[0.07]
  transition-all duration-200
">
  {/* Card content */}
</div>
```

**Gradient Card**
```tsx
<div className="
  rounded-2xl 
  border border-white/10 
  bg-gradient-to-br from-white/[0.07] to-white/[0.02] 
  p-6 
  backdrop-blur-sm
">
  {/* Card content */}
</div>
```

### 5.3 Inputs

**Text Input**
```tsx
<input className="
  w-full 
  rounded-xl 
  border border-white/10 
  bg-white/5 
  px-4 py-3 
  text-sm 
  ring-1 ring-white/10 
  placeholder:text-foreground/50 
  focus:outline-none 
  focus:ring-2 focus:ring-[var(--kb-accent-gold)]
  transition-all
" />
```

**Select**
```tsx
<select className="
  w-full 
  rounded-xl 
  border border-white/10 
  bg-white/5 
  px-4 py-3 
  text-sm 
  ring-1 ring-white/10 
  focus:outline-none 
  focus:ring-2 focus:ring-[var(--kb-accent-gold)]
  [&>option]:bg-[var(--kb-surface-dark)] 
  [&>option]:text-foreground
">
  <option>Option 1</option>
</select>
```

### 5.4 Badges

**Status Badges**
```tsx
// Success
<span className="px-3 py-1 rounded-full text-xs font-medium 
  bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
  Delivered
</span>

// Warning
<span className="px-3 py-1 rounded-full text-xs font-medium 
  bg-amber-500/10 text-amber-300 border border-amber-500/20">
  Pending
</span>

// Error
<span className="px-3 py-1 rounded-full text-xs font-medium 
  bg-red-500/10 text-red-300 border border-red-500/20">
  Cancelled
</span>

// Info
<span className="px-3 py-1 rounded-full text-xs font-medium 
  bg-blue-500/10 text-blue-300 border border-blue-500/20">
  Processing
</span>
```

**Feature Badge**
```tsx
<span className="
  inline-flex items-center gap-2 
  rounded-full 
  bg-white/5 
  px-3 py-1 
  text-xs font-medium 
  ring-1 ring-white/10
">
  <span className="h-1.5 w-1.5 rounded-full bg-[var(--kb-accent-gold)]" />
  Premium
</span>
```

### 5.5 Modals

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/70" />
  
  {/* Modal */}
  <div className="
    relative z-10 
    w-full max-w-2xl 
    overflow-hidden 
    rounded-2xl 
    border border-white/10 
    bg-background 
    shadow-2xl 
    ring-1 ring-white/10
  ">
    {/* Header */}
    <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
      <h2 className="text-lg font-semibold">Modal Title</h2>
      <button className="rounded-md p-1 hover:bg-white/5">
        <X className="h-5 w-5" />
      </button>
    </div>
    
    {/* Content */}
    <div className="p-5">
      {/* Modal content */}
    </div>
    
    {/* Footer */}
    <div className="flex justify-end gap-3 border-t border-white/10 px-5 py-4">
      <button>Cancel</button>
      <button>Confirm</button>
    </div>
  </div>
</div>
```

---

## 6. Layout Patterns

### 6.1 Page Container

```tsx
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  {/* Page content */}
</div>
```

### 6.2 Section Layout

```tsx
<section className="mx-auto max-w-7xl px-4 py-16">
  <div className="mb-8">
    <h2 className="text-2xl font-bold tracking-tight">Section Title</h2>
    <p className="text-sm text-foreground/70 mt-1">Section description</p>
  </div>
  {/* Section content */}
</section>
```

### 6.3 Grid Layouts

**Product Grid**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {products.map(product => (
    <ProductCard key={product.id} product={product} />
  ))}
</div>
```

**Dashboard Grid**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard title="Total Orders" value={100} />
  <StatCard title="Revenue" value="$10,000" />
  <StatCard title="Customers" value={500} />
  <StatCard title="Products" value={50} />
</div>
```

### 6.4 Two-Column Layout

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">
    {/* Main content */}
  </div>
  <div className="lg:col-span-1">
    {/* Sidebar */}
  </div>
</div>
```

---

## 7. Animation & Transitions

### 7.1 Standard Transitions

```css
/* Default transition */
.transition-default {
  transition: all 200ms ease-in-out;
}

/* Color transition */
.transition-colors {
  transition: color, background-color, border-color 150ms ease;
}

/* Transform transition */
.transition-transform {
  transition: transform 200ms ease-out;
}
```

### 7.2 Hover Effects

```tsx
// Card hover
<div className="
  transition-all duration-200
  hover:border-[var(--kb-primary-brand)]/50 
  hover:bg-white/[0.07]
  hover:ring-2 hover:ring-white/20
">

// Button hover
<button className="
  transition-all duration-200
  hover:from-[var(--kb-primary-brand)] 
  hover:to-[var(--kb-primary-brand)]
">

// Link hover
<a className="
  text-foreground/80 
  hover:text-foreground 
  transition-colors
">
```

### 7.3 Loading States

```tsx
// Skeleton loading
<div className="h-64 animate-pulse bg-white/5 rounded-xl" />

// Spinner
<div className="animate-spin h-6 w-6 border-2 border-white/20 border-t-white rounded-full" />

// Button loading
<button disabled className="opacity-50 cursor-not-allowed">
  <Loader2 className="h-4 w-4 animate-spin mr-2" />
  Loading...
</button>
```

---

## 8. Responsive Design

### 8.1 Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| sm | 640px | Small tablets |
| md | 768px | Tablets |
| lg | 1024px | Laptops |
| xl | 1280px | Desktops |
| 2xl | 1536px | Large screens |

### 8.2 Responsive Patterns

**Typography**
```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
  Responsive Heading
</h1>
```

**Grid**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Items */}
</div>
```

**Spacing**
```tsx
<section className="py-8 sm:py-12 lg:py-16">
  {/* Content */}
</section>
```

**Visibility**
```tsx
{/* Hide on mobile */}
<nav className="hidden md:flex">
  {/* Desktop nav */}
</nav>

{/* Show on mobile */}
<button className="md:hidden">
  Menu
</button>
```

---

## 9. Icons

### 9.1 Icon Library

The project uses **Lucide React** for icons.

```tsx
import { 
  ShoppingCart, 
  User, 
  Search, 
  Menu, 
  X, 
  ChevronDown,
  Calendar,
  Clock,
  Star,
  Heart,
  Package,
  Truck,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
```

### 9.2 Icon Sizes

| Size | Class | Usage |
|------|-------|-------|
| Small | h-4 w-4 | Inline, buttons |
| Medium | h-5 w-5 | Default |
| Large | h-6 w-6 | Headers, emphasis |
| XL | h-8 w-8 | Feature icons |

### 9.3 Icon Usage

```tsx
// In button
<button className="inline-flex items-center gap-2">
  <ShoppingCart className="h-4 w-4" />
  Add to Cart
</button>

// Standalone
<div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--kb-accent-gold)]/10">
  <Star className="h-6 w-6 text-[var(--kb-accent-gold)]" />
</div>
```

---

## 10. Dark Theme Implementation

### 10.1 Theme Setup

```tsx
// src/app/layout.tsx
<html lang="en" className="dark">
  <body className={`${inter.variable} antialiased`}>
    {children}
  </body>
</html>
```

### 10.2 Color Application

```css
/* Background layers */
.bg-background { background-color: #0A0A0A; }
.bg-surface { background-color: rgba(255, 255, 255, 0.05); }
.bg-surface-hover { background-color: rgba(255, 255, 255, 0.07); }

/* Text colors */
.text-foreground { color: #FAFAFA; }
.text-foreground-secondary { color: rgba(250, 250, 250, 0.7); }
.text-foreground-muted { color: rgba(250, 250, 250, 0.5); }

/* Borders */
.border-default { border-color: rgba(255, 255, 255, 0.1); }
.border-hover { border-color: rgba(255, 255, 255, 0.2); }
```

---

## 11. Accessibility Guidelines

### 11.1 Color Contrast

- Text on background: Minimum 4.5:1 ratio
- Large text: Minimum 3:1 ratio
- Interactive elements: Clear focus states

### 11.2 Focus States

```tsx
<button className="
  focus:outline-none 
  focus-visible:ring-2 
  focus-visible:ring-[var(--kb-accent-gold)]
  focus-visible:ring-offset-2
  focus-visible:ring-offset-background
">
```

### 11.3 Screen Reader Support

```tsx
// Hidden text for screen readers
<span className="sr-only">Close menu</span>

// ARIA labels
<button aria-label="Add to cart">
  <ShoppingCart />
</button>

// Live regions
<div aria-live="polite" aria-atomic="true">
  {notification}
</div>
```

---

## 12. Design Tokens Summary

```css
:root {
  /* Colors */
  --kb-primary-brand: #8B5CF6;
  --kb-accent-gold: #F59E0B;
  --kb-accent-red: #EF4444;
  --background: #0A0A0A;
  --foreground: #FAFAFA;
  
  /* Typography */
  --font-inter: 'Inter', sans-serif;
  
  /* Spacing */
  --space-unit: 4px;
  
  /* Border Radius */
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-default: 200ms ease;
  --transition-slow: 300ms ease;
}
```

---

*UI Design System Document - December 2025*
