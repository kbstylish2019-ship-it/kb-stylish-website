# Requirements Document: Combo Products

## Introduction

This document defines the requirements for a Combo Products feature that allows the KB Stylish vendor to create product bundles (combos) with discounted pricing. Combos are treated as special products that, when added to cart, add all constituent products with the combo discount applied. This is a simplified implementation focused on launch readiness with minimal system changes.

## Glossary

- **Combo**: A bundled product offering containing multiple existing products sold together at a discounted price
- **Combo_Product**: A product record with `is_combo = true` that represents the bundle
- **Combo_Item**: A link between a Combo_Product and its constituent products with quantity
- **KB_Stylish_Vendor**: The specific vendor (user_id: `365bd0ab-e135-45c5-bd24-a907de036287`) authorized to create combos
- **Combo_Discount**: The percentage or fixed amount discount applied when purchasing products as a combo
- **Cart_System**: The existing cart management system that handles product additions
- **Vendor_Portal**: The vendor dashboard where products are managed

## Requirements

### Requirement 1: Combo Creation Authorization

**User Story:** As the KB Stylish vendor, I want to be the only vendor able to create combo products, so that combo offerings are controlled and curated.

#### Acceptance Criteria

1. WHEN a vendor attempts to create a combo product, THE System SHALL verify the vendor_id matches the KB Stylish vendor ID
2. IF a non-KB-Stylish vendor attempts to create a combo, THEN THE System SHALL reject the request with an authorization error
3. THE System SHALL store the KB Stylish vendor ID as a configuration constant for easy future modification

### Requirement 2: Combo Product Structure

**User Story:** As the KB Stylish vendor, I want to create a combo by selecting existing products and setting a combo price, so that I can offer bundled deals to customers.

#### Acceptance Criteria

1. THE Combo_Product SHALL have all standard product fields (name, description, images, slug, category)
2. THE Combo_Product SHALL have an `is_combo` boolean flag set to true
3. THE Combo_Product SHALL have a `combo_price_cents` field representing the total bundle price
4. THE Combo_Product SHALL have a `combo_savings_cents` field showing the discount amount
5. WHEN creating a combo, THE System SHALL require at least 2 constituent products
6. THE Combo_Item table SHALL store product_id, quantity, and display_order for each constituent
7. THE System SHALL calculate combo_savings_cents as (sum of constituent prices x quantities) - combo_price_cents

### Requirement 3: Combo Inventory Management

**User Story:** As the KB Stylish vendor, I want combo availability to reflect the availability of all constituent products, so that customers cannot purchase unavailable combos.

#### Acceptance Criteria

1. WHEN displaying combo availability, THE System SHALL check inventory of all constituent products
2. THE Combo_Product SHALL be shown as out of stock IF any constituent product has insufficient inventory
3. THE System SHALL NOT maintain separate inventory for combo products
4. WHEN a combo is purchased, THE System SHALL decrement inventory from each constituent product

### Requirement 4: Combo Display on Homepage and Shop

**User Story:** As a customer, I want to see combo products displayed attractively with savings highlighted, so that I can identify good deals.

#### Acceptance Criteria

1. THE System SHALL display combo products in product grids alongside regular products
2. WHEN displaying a combo, THE System SHALL show the combo price and original total price crossed out
3. THE System SHALL display a COMBO or BUNDLE badge on combo product cards
4. THE System SHALL show the savings amount or percentage on combo cards
5. WHEN a customer views a combo detail page, THE System SHALL list all constituent products with their individual prices

### Requirement 5: Combo Add to Cart

**User Story:** As a customer, I want to add a combo to my cart and have all constituent products added with the discounted pricing, so that I receive the bundle deal.

#### Acceptance Criteria

1. WHEN a customer adds a combo to cart, THE System SHALL add all constituent products to the cart
2. THE System SHALL apply a proportional discount to each constituent product price
3. THE Cart_System SHALL display the combo as a grouped item showing all constituent products
4. THE System SHALL store a combo_id reference on cart items that are part of a combo
5. IF a customer removes one item from a combo group, THEN THE System SHALL remove all items in that combo group
6. THE System SHALL validate inventory for all constituent products before adding to cart

### Requirement 6: Combo Checkout and Order Processing

**User Story:** As a customer, I want my combo purchase to be processed correctly with the discounted prices, so that I pay the advertised combo price.

#### Acceptance Criteria

1. WHEN processing a combo order, THE System SHALL create order_items for each constituent product
2. THE order_items SHALL reflect the discounted unit prices proportionally distributed
3. THE System SHALL store the combo_id on order_items for tracking and analytics
4. THE System SHALL decrement inventory for each constituent product upon successful payment
5. WHEN displaying order history, THE System SHALL group combo items together with the combo name

### Requirement 7: Vendor Combo Management

**User Story:** As the KB Stylish vendor, I want to manage my combos create edit activate deactivate, so that I can control my bundle offerings.

#### Acceptance Criteria

1. THE Vendor_Portal SHALL provide a Combos section for combo management
2. WHEN creating a combo, THE System SHALL allow selecting products from the vendor own product catalog
3. THE System SHALL allow setting combo name, description, images, and price
4. THE System SHALL allow activating or deactivating combos without deleting them
5. WHEN editing a combo, THE System SHALL allow modifying constituent products and pricing
6. THE System SHALL prevent editing combos that have pending orders

### Requirement 8: Combo Analytics

**User Story:** As the KB Stylish vendor, I want to see combo performance metrics, so that I can optimize my bundle offerings.

#### Acceptance Criteria

1. THE Vendor_Portal SHALL display combo specific metrics views add to cart purchases
2. THE System SHALL track which combos are most popular
3. THE System SHALL show revenue generated from combo sales vs individual product sales
