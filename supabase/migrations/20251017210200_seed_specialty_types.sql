-- =====================================================================
-- MIGRATION: Seed Standard Specialty Types
-- Purpose: Pre-populate specialty types for immediate use
-- Follows: Excellence Protocol Phase 8
-- Date: 2025-10-17 21:02:00 UTC
-- =====================================================================

BEGIN;

-- =====================================================================
-- SEED SPECIALTY TYPES
-- =====================================================================

-- Hair Specialties
INSERT INTO public.specialty_types (name, slug, category, description, icon, display_order) VALUES
('Hair Coloring Expert', 'hair-coloring-expert', 'hair', 'Specializes in all types of hair coloring, highlights, balayage, and color correction', 'Palette', 10),
('Hair Cutting & Styling', 'hair-cutting-styling', 'hair', 'Expert in precision haircuts, styling, and hair treatments', 'Scissors', 20),
('Hair Extensions Specialist', 'hair-extensions-specialist', 'hair', 'Specializes in various hair extension techniques and maintenance', 'Layers', 30),
('Keratin Treatment Expert', 'keratin-treatment-expert', 'hair', 'Specializes in keratin treatments, smoothing, and hair repair', 'Sparkles', 40),
('Men''s Grooming Specialist', 'mens-grooming-specialist', 'grooming', 'Expert in men''s haircuts, beard styling, and grooming services', 'User', 50);

-- Makeup Specialties
INSERT INTO public.specialty_types (name, slug, category, description, icon, display_order) VALUES
('Bridal Makeup Artist', 'bridal-makeup-artist', 'bridal', 'Specializes in bridal makeup, including engagement and wedding looks', 'Crown', 100),
('Party Makeup Artist', 'party-makeup-artist', 'makeup', 'Expert in glamorous party and event makeup', 'Star', 110),
('Airbrush Makeup Specialist', 'airbrush-makeup-specialist', 'makeup', 'Specializes in airbrush makeup techniques for flawless finish', 'Wind', 120),
('HD Makeup Artist', 'hd-makeup-artist', 'makeup', 'Expert in high-definition makeup for photography and videography', 'Camera', 130);

-- Nail Specialties
INSERT INTO public.specialty_types (name, slug, category, description, icon, display_order) VALUES
('Nail Art Specialist', 'nail-art-specialist', 'nails', 'Expert in creative nail art designs and techniques', 'Paintbrush', 200),
('Gel & Acrylic Expert', 'gel-acrylic-expert', 'nails', 'Specializes in gel and acrylic nail applications', 'Gem', 210);

-- Spa & Wellness Specialties
INSERT INTO public.specialty_types (name, slug, category, description, icon, display_order) VALUES
('Facial Treatment Specialist', 'facial-treatment-specialist', 'spa', 'Expert in various facial treatments and skin care', 'Heart', 300),
('Spa Therapist', 'spa-therapist', 'spa', 'Specializes in relaxation and therapeutic spa treatments', 'Waves', 310);

-- Bridal Specialties (Multi-Service)
INSERT INTO public.specialty_types (name, slug, category, description, icon, display_order) VALUES
('Bridal Specialist', 'bridal-specialist', 'bridal', 'Complete bridal services including hair, makeup, and styling', 'HeartHandshake', 400),
('Bridal Hair Specialist', 'bridal-hair-specialist', 'bridal', 'Specializes in bridal hairstyling and traditional looks', 'Flower', 410);

COMMIT;
