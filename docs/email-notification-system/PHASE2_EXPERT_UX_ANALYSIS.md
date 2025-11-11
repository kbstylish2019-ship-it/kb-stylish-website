# 🎨 PHASE 2D: UX ENGINEER ANALYSIS

**Expert**: UX Engineer  
**Focus**: Email template design, mobile responsiveness, accessibility

---

## EMAIL TEMPLATE FRAMEWORK: REACT EMAIL

### Why React Email?
```
✅ Component-based (reusable)
✅ TypeScript support
✅ Preview in browser during development
✅ Native Resend integration
✅ Mobile-responsive by default
✅ Tested across 40+ email clients
```

### Installation
```bash
npm install react-email @react-email/components
```

---

## TEMPLATE STRUCTURE (UNIVERSAL)

```tsx
// src/emails/BaseEmailTemplate.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Button,
  Hr,
  Section,
  Row,
  Column,
  Img,
} from '@react-email/components';

export function BaseEmailTemplate({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Img
              src="https://kbstylish.com.np/logo.png"
              width="120"
              height="40"
              alt="KB Stylish"
            />
          </Section>
          
          {/* Content */}
          <Section style={styles.content}>
            {children}
          </Section>
          
          {/* Footer */}
          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              © 2025 KB Stylish. All rights reserved.
            </Text>
            <Text style={styles.footerText}>
              Kathmandu, Nepal
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  container: {
    margin: '0 auto',
    padding: '20px',
    maxWidth: '600px',
  },
  header: {
    padding: '20px 0',
    textAlign: 'center' as const,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    padding: '32px',
  },
  footer: {
    marginTop: '32px',
    padding: '20px',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.5',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '24px 0',
  },
};
```

---

## EXAMPLE: ORDER CONFIRMATION EMAIL

```tsx
// src/emails/OrderConfirmation.tsx
import { BaseEmailTemplate } from './BaseEmailTemplate';
import { Heading, Text, Button, Section } from '@react-email/components';

interface OrderConfirmationProps {
  customerName: string;
  orderNumber: string;
  orderDate: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  shippingAddress: string;
  trackingUrl?: string;
}

export function OrderConfirmation(props: OrderConfirmationProps) {
  return (
    <BaseEmailTemplate>
      <Heading style={styles.heading}>
        Order Confirmed! 🎉
      </Heading>
      
      <Text style={styles.text}>
        Hi {props.customerName},
      </Text>
      
      <Text style={styles.text}>
        Thank you for your order! We're preparing your items for shipment.
      </Text>
      
      {/* Order Details */}
      <Section style={styles.detailsBox}>
        <Text style={styles.label}>Order Number</Text>
        <Text style={styles.value}>{props.orderNumber}</Text>
        
        <Text style={styles.label}>Order Date</Text>
        <Text style={styles.value}>{props.orderDate}</Text>
      </Section>
      
      {/* Items */}
      <Section style={styles.itemsSection}>
        <Heading as="h2" style={styles.subheading}>
          Order Items
        </Heading>
        {props.items.map((item, index) => (
          <Section key={index} style={styles.item}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemDetails}>
              Qty: {item.quantity} × NPR {item.price}
            </Text>
          </Section>
        ))}
      </Section>
      
      {/* Total */}
      <Section style={styles.totalSection}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>NPR {props.total}</Text>
      </Section>
      
      {/* Shipping Address */}
      <Section style={styles.addressSection}>
        <Text style={styles.label}>Shipping Address</Text>
        <Text style={styles.addressText}>{props.shippingAddress}</Text>
      </Section>
      
      {/* CTA Button */}
      <Section style={styles.buttonSection}>
        <Button
          href={props.trackingUrl || `https://kbstylish.com.np/orders/${props.orderNumber}`}
          style={styles.button}
        >
          Track Your Order
        </Button>
      </Section>
      
      <Text style={styles.helpText}>
        Need help? Reply to this email or contact our support team.
      </Text>
    </BaseEmailTemplate>
  );
}

const styles = {
  heading: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#111',
    marginBottom: '16px',
  },
  subheading: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#111',
    marginBottom: '12px',
  },
  text: {
    fontSize: '16px',
    color: '#333',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  detailsBox: {
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    padding: '16px',
    marginTop: '24px',
  },
  label: {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase' as const,
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  value: {
    fontSize: '16px',
    color: '#111',
    marginBottom: '12px',
  },
  itemsSection: {
    marginTop: '24px',
  },
  item: {
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '12px',
    marginBottom: '12px',
  },
  itemName: {
    fontSize: '16px',
    color: '#111',
    fontWeight: '500',
  },
  itemDetails: {
    fontSize: '14px',
    color: '#666',
  },
  totalSection: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '2px solid #111',
  },
  totalLabel: {
    fontSize: '14px',
    color: '#666',
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: '24px',
    color: '#111',
    fontWeight: 'bold',
  },
  addressSection: {
    marginTop: '24px',
  },
  addressText: {
    fontSize: '14px',
    color: '#333',
    lineHeight: '1.5',
  },
  buttonSection: {
    marginTop: '32px',
    textAlign: 'center' as const,
  },
  button: {
    backgroundColor: '#D4AF37',  // Gold brand color
    color: '#000',
    padding: '12px 32px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  helpText: {
    marginTop: '32px',
    fontSize: '14px',
    color: '#666',
    textAlign: 'center' as const,
  },
};
```

---

## MOBILE RESPONSIVENESS

### React Email Automatically Handles:
```
✅ Fluid layout (max-width: 600px)
✅ Touch-friendly buttons (min 44px height)
✅ Readable font sizes (min 16px)
✅ Optimized images
✅ Single-column layout
✅ Tested on iOS Mail, Gmail app, Outlook
```

### Manual Optimizations:
```tsx
// Stack columns on mobile
<Row>
  <Column style={{ width: '50%' }}>Left</Column>
  <Column style={{ width: '50%' }}>Right</Column>
</Row>
// Automatically stacks on mobile

// Responsive images
<Img
  src="product.jpg"
  width="200"
  height="200"
  alt="Product"
  style={{ maxWidth: '100%', height: 'auto' }}
/>
```

---

## ACCESSIBILITY STANDARDS

```tsx
// ✅ Alt text for images
<Img src="logo.png" alt="KB Stylish Logo" />

// ✅ Semantic headings
<Heading as="h1">Order Confirmed</Heading>
<Heading as="h2">Order Details</Heading>

// ✅ High contrast (WCAG AA)
color: '#111' on '#fff' → Contrast ratio 19:1 ✅
color: '#D4AF37' on '#000' → Contrast ratio 10:1 ✅

// ✅ Readable font size (min 16px)
fontSize: '16px'

// ✅ Descriptive link text
<Button>Track Your Order</Button>  // ✅ Descriptive
<Button>Click Here</Button>         // ❌ Generic
```

---

## EMAIL CLIENT COMPATIBILITY

React Email automatically handles compatibility for:
```
✅ Gmail (Web, iOS, Android)
✅ Apple Mail (macOS, iOS)
✅ Outlook (Windows, macOS, Web)
✅ Yahoo Mail
✅ ProtonMail
✅ Thunderbird
```

**Testing**: Resend provides preview tool to test across clients.

---

## RECOMMENDED TEMPLATES TO CREATE

| Priority | Template | Usage |
|----------|----------|-------|
| P0 | Order Confirmation | After successful payment |
| P0 | Vendor Approved | After admin approves |
| P0 | Vendor Rejected | After admin rejects |
| P0 | Order Shipped | Vendor marks as shipped |
| P0 | Booking Confirmation | After booking payment |
| P1 | Booking Reminder | 24hrs before appointment |
| P1 | Vendor New Order | New order for vendor |
| P2 | Welcome Email | After signup |
| P2 | Review Request | After order delivered |

---

## RECOMMENDATIONS

| Priority | Item | Time |
|----------|------|------|
| P0 | Install React Email | 10 min |
| P0 | Create BaseEmailTemplate | 1 hr |
| P0 | Create 5 critical templates | 5 hrs |
| P1 | Preview & test templates | 2 hrs |
| P1 | Mobile responsiveness check | 1 hr |
| P1 | Accessibility audit | 1 hr |
