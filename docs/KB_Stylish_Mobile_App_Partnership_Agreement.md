> **The Divine Tech Innovation Pvt.Ltd.**

*Your Dedicated Digital Growth Partner*

> **Partnership Agreement for the KB Stylish Mobile Application Ecosystem**
>
> **Prepared For:**\
> Mr. Buddi Raj Bhattarai

**KB Stylish**

> **Prepared By:**\
> Mr. Rabindra Parsad Sah

**The Divine Tech Innovation**

**Date: _____________ 2025**

---

**First Party**

The undersigned, having its main office located at **Ward No. 1, Ka. Ma. Pa., Kathmandu District**, registered at the **Office of the Company Registrar, Ministry of Industry, Government of Nepal**, on **2074/07/12**, and bearing registration no. **177017/074/075**, **KB Stylish Pvt. Ltd.**, represented by the authorized person **Mr. Buddi Raj Bhattarai** *(hereinafter referred to as the "First Party")*

**Second Party**

The undersigned, having its main office located at **Ward No. 23, Mahalaxmi Municipality, Lalitpur District**, registered at the **Office of the Company Registrar, Ministry of Industry, Government of Nepal**, on **2082/06/26**, and bearing registration no. **376440/82/83**, **The Divine Tech Innovation Pvt. Ltd.**, represented by the authorized person **Mr. Rabindra Parsad Sah** *(hereinafter referred to as the "Second Party")*

---

**Preamble**

As requested by the First Party, and in accordance with the **Nepal Contract Act 2056**, both parties hereby enter into this Agreement for the **design, development, deployment, and operation of native mobile applications (Android & iOS)** for the KB Stylish digital ecosystem.

This Agreement is **separate and independent** from the Web Platform Agreement dated 18 August 2025. The mobile applications represent a **distinct product line** with unique technical requirements, deployment processes, and ongoing maintenance needs.

With mutual understanding, consent, and satisfaction, both parties agree to the following terms and conditions and have signed this Agreement, each retaining one official copy.

---

## 1. Introduction & Partnership Philosophy

The First Party desires native mobile applications that provide customers, vendors, and stylists with a seamless mobile experience. Mobile applications require specialized development expertise including:

1. **Platform-Specific Development** — Native compilation for Android (Google Play) and iOS (Apple App Store)
2. **Mobile-Specific Security** — Device authentication, biometric login, secure local storage, certificate pinning
3. **Offline Capabilities** — Local data caching, offline-first architecture, sync conflict resolution
4. **Push Notification Infrastructure** — Firebase Cloud Messaging (FCM), Apple Push Notification Service (APNs)
5. **App Store Compliance** — Meeting Google Play and Apple App Store guidelines, review processes, and policies
6. **Device Optimization** — Performance tuning across diverse Android devices and iOS versions

---

## 2. Scope of Work

The Second Party shall design and develop **two (2) native mobile applications** — one for Android and one for iOS — consisting of the following modules:

### 2.1 Customer Mobile Application

| Feature | Description |
|---------|-------------|
| User Authentication | Biometric login (fingerprint/Face ID), secure session management, JWT-based authentication |
| Product Browsing | Category navigation, search with filters, product details with image galleries |
| Shopping Cart | Persistent cart, variant selection, quantity management |
| Checkout & Payments | eSewa/NPX integration with mobile SDKs, order placement |
| Booking System | Stylist discovery, availability calendar, appointment booking |
| Order Tracking | Real-time order status, delivery tracking |
| Push Notifications | Order updates, booking reminders, promotional alerts |
| Profile Management | order history, Profile Details |
| Reviews & Ratings | Submit reviews, view ratings, helpful votes |

### 2.2 Vendor Mobile Application

| Feature | Description |
|---------|-------------|
| Vendor Dashboard | Sales overview, order management, analytics |
| Product Management | Add/edit products, inventory updates, pricing |
| Order Fulfillment | Order acceptance, status updates, delivery coordination |
| Payout Tracking | Settlement history, earnings reports |
| Push Notifications | New order alerts, low stock warnings |

### 2.3 Stylist Mobile Application

| Feature | Description |
|---------|-------------|
| Booking Management | View appointments, accept/decline bookings |
| Schedule Management | Set availability, manage time slots |
| Customer History | View past appointments, customer preferences |
| Push Notifications | New booking alerts, schedule reminders |

---

## 3. Technical Architecture & Complexity

### 3.1 Mobile-Specific Development Requirements

| Component | Technology | Complexity Factor |
|-----------|------------|-------------------|
| Framework | React Native | Cross-platform with native modules |
| State Management | Redux/Zustand | Complex state synchronization |
| Navigation | React Navigation | Deep linking, authentication flows |
| Local Storage | AsyncStorage + SQLite | Offline data persistence |
| Push Notifications | FCM + APNs | Platform-specific implementation |
| Biometric Auth | Native modules | iOS Face ID, Android Fingerprint |
| Payment SDKs | eSewa/NPX Mobile SDKs | Native integration required |
| Image Handling | Native image picker, compression | Performance optimization |

### 3.2 Platform-Specific Requirements

**Android Development:**
- Minimum SDK 24 (Android 7.0) support
- Material Design 3 compliance
- Google Play Store deployment
- Android-specific permissions handling
- Background service optimization for battery efficiency

**iOS Development:**
- Minimum iOS 14 support
- Human Interface Guidelines compliance
- Apple App Store deployment
- App Store Review Guidelines compliance
- iOS-specific privacy requirements (App Tracking Transparency)

### 3.3 API Integration Layer

The mobile applications require a **dedicated API integration layer** that includes:

- **Mobile-optimized API endpoints** — Reduced payload sizes, pagination
- **Request/Response caching** — Intelligent cache invalidation
- **Retry logic & error handling** — Network resilience
- **Authentication token management** — Secure refresh token flows
- **Real-time synchronization** — WebSocket connections for live updates

### 3.4 Security Implementation

| Security Feature | Implementation |
|------------------|----------------|
| Certificate Pinning | Prevent man-in-the-middle attacks |
| Secure Storage | Encrypted local storage for sensitive data |
| Biometric Authentication | Device-level security integration |
| Session Management | Secure token storage, automatic logout |
| Code Obfuscation | ProGuard (Android), bitcode (iOS) |
| API Security | Request signing, rate limiting |

---

## 4. App Store Deployment & Compliance

### 4.1 Google Play Store (Android)

| Requirement | Responsibility |
|-------------|----------------|
| Developer Account | First Party (one-time $25 fee) |
| App Signing | Second Party handles initial setup |
| Store Listing | Second Party provides assets, First Party approves |
| Privacy Policy | First Party provides, Second Party integrates |
| Review Process | Second Party handles submission and review responses |

### 4.2 Apple App Store (iOS)

| Requirement | Responsibility |
|-------------|----------------|
| Developer Account | First Party (annual $99 fee) |
| App Signing & Certificates | Second Party handles setup |
| Store Listing | Second Party provides assets, First Party approves |
| App Review Guidelines | Second Party ensures compliance |
| Privacy Nutrition Labels | Second Party prepares, First Party approves |

### 4.3 Ongoing Store Compliance

App stores frequently update their policies. The Second Party will:
- Monitor policy changes during warranty period
- Advise on required updates
- **Policy compliance updates beyond warranty are billable separately**

---

## 5. Project Investment & Payment Structure

### 5.1 Total Project Investment

| Component | Amount (NPR) |
|-----------|--------------|
| Android Application Development | Rs 40,000 |
| iOS Application Development | Rs 35,000 |
| **Total Project Cost** | **Rs 75,000** |

### 5.2 Payment Schedule

| Phase | Milestone | Payment | Amount |
|-------|-----------|---------|--------|
| Phase 1 | Agreement Signing & Design Approval | 30% | Rs 22,500 |
| Phase 2 | Core Features Development Complete | 30% | Rs 22,500 |
| Phase 3 | App Store Submission Ready | 20% | Rs 15,000 |
| Phase 4 | Post-Launch Warranty Completion | 20% | Rs 15,000 |

### 5.3 Investment Justification

The mobile application investment reflects:

1. **Dual Platform Development** — Separate optimization for Android and iOS ecosystems
2. **App Store Compliance** — Meeting stringent Google and Apple guidelines
3. **Mobile Security Standards** — Biometric auth, certificate pinning, secure storage
4. **Push Notification Infrastructure** — FCM and APNs integration
5. **Offline-First Architecture** — Local caching, sync conflict resolution
6. **Performance Optimization** — Device-specific tuning across diverse hardware
7. **Native SDK Integrations** — Payment gateways, maps, camera, biometrics

---

## 6. Project Timeline & Milestones

### Phase 1: Design & Architecture (Weeks 1-2)
- UI/UX design for mobile screens
- Technical architecture finalization
- API integration planning
- **Deliverable:** Design mockups, technical specification
- **Payment:** 30% (Rs 22,500)

### Phase 2: Core Development (Weeks 3-7)
- Authentication & user management
- Product browsing & cart functionality
- Booking system integration
- Payment gateway integration
- **Deliverable:** Functional beta applications
- **Payment:** 30% (Rs 22,500)

### Phase 3: Testing & Store Submission (Weeks 7-8)
- Cross-device testing
- Performance optimization
- App store asset preparation
- Submission to Google Play & App Store
- **Deliverable:** Published applications
- **Payment:** 20% (Rs 15,000)

### Phase 4: Warranty Period (1 Month)
- Bug fixes within agreed scope
- App store review response handling
- Minor adjustments
- **Payment:** Final 20% (Rs 15,000) after warranty completion

---

## 7. Warranty Terms (1 Month)

### 7.1 Warranty Covers:
- Functional bugs within agreed scope
- App crashes and critical errors
- App store rejection fixes (first submission only)
- Minor UI adjustments

### 7.2 Warranty Does NOT Cover:
- New features or redesigns
- OS version updates (new Android/iOS releases)
- Third-party SDK breaking changes
- Performance issues due to device limitations
- App store policy changes requiring significant rework
- Backend/API changes requested by First Party
- Content-related issues

**Warranty becomes void if unauthorized modifications are made to the application code.**

---

## 8. Hosting, Infrastructure & Third-Party Services

### 8.1 First Party Responsibilities (Direct Payment Required)

| Service | Estimated Cost | Frequency |
|---------|----------------|-----------|
| Google Play Developer Account | $25 | One-time |
| Apple Developer Account | $99 | Annual |
| Firebase (Push Notifications) | Free tier / Usage-based | Monthly |
| App Store fees (if applicable) | 15-30% of in-app purchases | Per transaction |

### 8.2 Third-Party Dependencies

The Second Party is **not responsible** for issues arising from:
- Google Play or App Store policy changes
- Firebase service disruptions
- eSewa/NPX SDK updates or breaking changes
- Device manufacturer software updates
- Operating system deprecations

---

## 9. Annual Maintenance Contract (AMC)

### 9.1 AMC Fee: **Rs 22,500 per year**

### 9.2 AMC Includes:
- Bug fixes and minor adjustments
- Security patches
- OS compatibility updates (minor versions)
- App store compliance monitoring
- Up to **8 hours of support per month**

### 9.3 AMC Does NOT Include:
- New features or modules
- Major OS version migrations
- UI/UX redesigns
- Backend API changes
- Third-party SDK major version upgrades
- App store policy overhaul compliance

### 9.4 AMC is Recommended But Optional
Unlike the web platform, mobile AMC is optional. However, **without AMC**:
- Apps may become incompatible with new OS versions
- Security vulnerabilities may remain unpatched
- App store compliance issues may cause removal

---

## 10. Change Requests

Any item not explicitly listed in the Scope of Work is **out of scope**. Change requests require:

1. Written request by the First Party
2. Quotation by the Second Party
3. Written approval before work begins

**Common change request examples:**
- Additional user roles
- New payment gateway integration
- Advanced analytics features
- Social media integrations
- Multi-language support

---

## 11. Liability & Indemnification

### 11.1 Limited Liability
The Second Party's total liability is limited to the **total amount paid (Rs 75,000)**.

### 11.2 No Consequential Liability
The Second Party is not liable for:
- Lost revenue or sales
- App store rejection or removal
- Customer or vendor disputes
- Payment gateway issues
- Data uploaded by First Party, vendors, or customers
- Device-specific issues beyond reasonable testing scope

### 11.3 Indemnification
The First Party shall indemnify the Second Party from any claim, dispute, or legal action arising from the use of the mobile applications.

---

## 12. Intellectual Property Rights

- The Second Party retains ownership of the system's core architecture, reusable components, and frameworks.
- The First Party receives a **lifetime usage license** for the delivered applications.
- The First Party may not resell, replicate, or distribute the applications.
- The Second Party may reuse non-client-specific components in future projects.
- **Source code** will be provided to the First Party upon final payment completion.

---

## 13. Support & Communication

| Aspect | Details |
|--------|---------|
| Support Hours | 10:00 AM – 6:00 PM (Sun–Fri) |
| Response Time | Within 24 business hours |
| Communication Channels | Official email or designated channels only |
| Emergency Support | Best-effort basis, not guaranteed |

---

## 14. Acceptance & Handover

Upon completion, the Second Party will hand over:
- Application source code
- Build configurations
- App store credentials (transferred to First Party accounts)
- Documentation

Each development phase requires written approval before proceeding.

---

## 15. Termination

### 15.1 Termination by First Party
- Payments already made are non-refundable
- 20% of remaining project value applies as termination fee
- Partial deliverables handed over within 7 days

### 15.2 Termination by Second Party
- Refund for undelivered work only
- Structured professional handover provided

---

## 16. Confidentiality

Both parties agree to maintain confidentiality of shared business, technical, and operational information.

---

## 17. Dispute Resolution

Disputes shall follow this sequence:
1. Internal discussion
2. Mediation
3. **Arbitration in Kathmandu** (binding)
4. Governing law: **Nepal Contract Act & Laws of Nepal**

---

## 18. Relationship to Web Platform Agreement

This Agreement is **independent** of the Web Platform Agreement dated 18 August 2025. 

- The mobile applications are a **separate product** requiring distinct development effort
- Backend infrastructure sharing does not reduce mobile development complexity
- Each agreement stands on its own terms and conditions
- Termination of one agreement does not affect the other

---

## 19. Signatures & Agreement

Both parties affirm that they understand and agree to the terms of this Agreement.

---

**First Party**

| | |
|---|---|
| Authorized Representative | Mr. Buddi Raj Bhattarai |
| Designation | |
| Signature | |
| Date | |
| Company Stamp | |

---

**Second Party**

| | |
|---|---|
| Authorized Representative | Mr. Rabindra Parsad Sah |
| Designation | |
| Signature | |
| Date | |
| Company Stamp | |

---

*This Agreement is executed in two (2) original copies, one retained by each party.*
