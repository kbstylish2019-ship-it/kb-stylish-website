# Welcome Modal - Visual Specifications

## 🎨 Design Breakdown

### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│  Backdrop (Black 60% opacity + blur)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Modal Container (White, rounded-2xl, shadow-2xl)     │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Close Button (X) - Top Right                   │  │  │
│  │  │  • White background with shadow                 │  │  │
│  │  │  • Hover: scales to 110%                        │  │  │
│  │  │  • Focus: blue ring                             │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                                                 │  │  │
│  │  │         KB Graphics Image                       │  │  │
│  │  │         (Franchise Investment Info)             │  │  │
│  │  │                                                 │  │  │
│  │  │  • Desktop: Full quality (95)                   │  │  │
│  │  │  • Mobile: Optimized (90)                       │  │  │
│  │  │  • Responsive width                             │  │  │
│  │  │                                                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  CTA Bar (Blue gradient: #1976D2 → #0d47a1)    │  │  │
│  │  │  ┌───────────────────┬─────────────────────┐   │  │  │
│  │  │  │ Contact Info      │ Explore Products    │   │  │  │
│  │  │  │ • Phone: 980...   │ Button (Yellow)     │   │  │  │
│  │  │  │ • Website link    │ • Hover: scale 105% │   │  │  │
│  │  │  └───────────────────┴─────────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📐 Dimensions

### Desktop (1024px+)
- **Modal Width**: Max 896px (max-w-4xl)
- **Modal Padding**: 16px all sides
- **Image**: Full width, auto height
- **CTA Bar**: Horizontal layout
- **Close Button**: 40x40px (with padding)

### Tablet (768px - 1023px)
- **Modal Width**: Max 896px with side padding
- **Image**: Full width, auto height
- **CTA Bar**: Horizontal layout
- **Close Button**: 40x40px

### Mobile (< 768px)
- **Modal Width**: Full width minus 32px padding
- **Image**: Optimized quality (90)
- **CTA Bar**: Vertical stack
- **Close Button**: 40x40px (touch-friendly)
- **Font sizes**: Reduced for readability

## 🎭 Animation Timeline

```
Time    Event
────────────────────────────────────────────────────
0ms     Page loads
800ms   Modal starts appearing
        • Backdrop: opacity 0 → 60%, blur 0 → sm
        • Modal: opacity 0 → 100%, scale 95% → 100%
1100ms  Modal fully visible (300ms transition)

On Close:
────────────────────────────────────────────────────
0ms     Close triggered (any method)
        • Backdrop: opacity 60% → 0%, blur sm → 0
        • Modal: opacity 100% → 0%, scale 100% → 95%
300ms   Modal removed from DOM
        • sessionStorage updated
```

## 🎨 Color Palette

### Primary Colors
```css
/* KB Blue (Primary Brand) */
--kb-primary: #1976D2

/* KB Blue Dark (Gradient end) */
--kb-primary-dark: #0d47a1

/* KB Yellow (Accent/CTA) */
--kb-accent: #FFD400

/* Yellow Hover */
--kb-accent-hover: #FFC107
```

### UI Colors
```css
/* Backdrop */
background: rgba(0, 0, 0, 0.6)
backdrop-filter: blur(4px)

/* Modal Container */
background: #FFFFFF
box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)

/* Close Button */
background: rgba(255, 255, 255, 0.9)
hover: rgba(255, 255, 255, 1.0)
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)

/* CTA Bar */
background: linear-gradient(to right, #1976D2, #0d47a1)

/* CTA Button */
background: #FFD400
color: #111827
hover: #FFC107
```

## 🔤 Typography

### CTA Bar Text
```css
/* Main heading */
font-size: 16px (mobile: 14px)
font-weight: 600 (semibold)
color: white

/* Subtext */
font-size: 14px (mobile: 12px)
font-weight: 400 (normal)
color: rgba(255, 255, 255, 0.8)

/* Phone/Website links */
font-weight: 700 (bold)
hover-color: #FFD400
```

### CTA Button
```css
font-size: 16px (mobile: 14px)
font-weight: 600 (semibold)
color: #111827
padding: 10px 24px
border-radius: 9999px (full)
```

## 🎯 Interactive States

### Close Button (X)
```css
/* Default */
background: rgba(255, 255, 255, 0.9)
opacity: 1
scale: 1

/* Hover */
background: rgba(255, 255, 255, 1.0)
scale: 1.1
transition: 200ms

/* Focus (keyboard) */
outline: 2px solid #1976D2
outline-offset: 2px
```

### CTA Button
```css
/* Default */
background: #FFD400
scale: 1

/* Hover */
background: #FFC107
scale: 1.05
transition: 200ms

/* Focus (keyboard) */
outline: 2px solid #FFC107
outline-offset: 2px
```

### Backdrop
```css
/* Default */
cursor: default

/* Hover */
cursor: pointer (indicates clickable)
```

## 📱 Responsive Breakpoints

```css
/* Mobile First */
< 640px (sm)
  - Stack CTA bar vertically
  - Reduce font sizes
  - Full-width buttons
  - Optimized image quality

640px - 767px (sm to md)
  - Stack CTA bar vertically
  - Standard font sizes
  - Full-width buttons

768px+ (md and up)
  - Horizontal CTA bar
  - Full font sizes
  - Inline buttons
  - Full image quality
```

## ♿ Accessibility Features

### Keyboard Navigation
```
Tab       → Focus close button
Enter     → Close modal
Escape    → Close modal
Tab       → Focus CTA button
Enter     → Close modal & navigate
```

### ARIA Labels
```html
role="dialog"
aria-modal="true"
aria-labelledby="welcome-modal-title"
aria-label="Close welcome modal" (on X button)
```

### Screen Reader
- Modal announces as "dialog"
- Close button announces as "Close welcome modal button"
- Image has descriptive alt text
- Links announce as "link" with destination

## 🎬 User Flow

```
User visits site
    ↓
Page loads (0-800ms)
    ↓
Modal fades in (800-1100ms)
    ↓
User sees franchise info
    ↓
User chooses action:
    ├─ Click X button → Close
    ├─ Click backdrop → Close
    ├─ Press ESC → Close
    └─ Click "Explore Products" → Close & continue
    ↓
Modal fades out (300ms)
    ↓
sessionStorage updated
    ↓
User continues browsing
    ↓
User refreshes page
    ↓
Modal does NOT appear (same session)
```

## 🔍 Z-Index Hierarchy

```
Layer               Z-Index     Purpose
─────────────────────────────────────────────
Page content        1           Normal flow
Header              50          Sticky header
Modal backdrop      9999        Cover everything
Modal container     9999        Same layer as backdrop
Close button        10          Above modal content
```

## 📊 Performance Metrics

### Target Metrics
- **First Paint**: < 100ms (lazy loaded)
- **Animation FPS**: 60fps (GPU accelerated)
- **Image Load**: < 500ms (Next.js optimized)
- **Total Bundle**: ~2KB (gzipped)
- **Lighthouse Score**: 100 (no impact)

### Optimization Techniques
- CSS transforms (GPU accelerated)
- Next.js Image optimization
- Lazy loading (ssr: false)
- requestAnimationFrame for smooth animations
- Minimal re-renders

## 🎨 Design Tokens

```typescript
// Spacing
const spacing = {
  modalPadding: '16px',
  ctaBarPadding: '24px 16px',
  buttonPadding: '10px 24px',
  closeButtonSize: '40px',
  gap: '12px',
}

// Border Radius
const radius = {
  modal: '16px',
  button: '9999px', // full
  closeButton: '9999px',
}

// Shadows
const shadows = {
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  closeButton: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
}

// Transitions
const transitions = {
  modal: '300ms ease-in-out',
  button: '200ms ease-in-out',
  backdrop: '300ms ease-in-out',
}
```

---

**Design System**: KB Stylish Brand Guidelines  
**Framework**: Tailwind CSS + Next.js  
**Accessibility**: WCAG 2.1 AA Compliant  
**Browser Support**: Modern browsers (last 2 versions)
