-- Create KB Stylish branches system for stylist location management
-- This is separate from vendor inventory_locations - these are KB Stylish's own salon branches

BEGIN;

-- Create KB Stylish branches table
CREATE TABLE public.kb_branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    address text,
    phone varchar(20),
    email varchar(100),
    manager_name varchar(100),
    operating_hours jsonb DEFAULT '{}', -- Store opening/closing times per day
    is_active boolean NOT NULL DEFAULT true,
    display_order integer DEFAULT 0, -- For ordering in UI
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Constraints
    CONSTRAINT kb_branches_name_unique UNIQUE (name),
    CONSTRAINT kb_branches_display_order_check CHECK (display_order >= 0)
);

-- Add RLS policies
ALTER TABLE public.kb_branches ENABLE ROW LEVEL SECURITY;

-- Public can read active branches (for booking page)
CREATE POLICY "kb_branches_public_read" ON public.kb_branches
    FOR SELECT USING (is_active = true);

-- Only admins can manage branches
CREATE POLICY "kb_branches_admin_all" ON public.kb_branches
    FOR ALL USING (public.user_has_role(auth.uid(), 'admin'));

-- Add indexes for performance
CREATE INDEX idx_kb_branches_active ON public.kb_branches (is_active, display_order) WHERE is_active = true;
CREATE INDEX idx_kb_branches_name ON public.kb_branches (name) WHERE is_active = true;

-- Add branch_id to stylist_profiles
ALTER TABLE public.stylist_profiles 
ADD COLUMN branch_id uuid REFERENCES public.kb_branches(id);

-- Add index for stylist-branch lookups
CREATE INDEX idx_stylist_profiles_branch_id ON public.stylist_profiles(branch_id);

-- Add comment for documentation
COMMENT ON TABLE public.kb_branches IS 'KB Stylish salon branches where stylists work. Separate from vendor inventory locations.';
COMMENT ON COLUMN public.stylist_profiles.branch_id IS 'References the KB Stylish branch where this stylist works.';

-- Insert default branches for Kathmandu (as mentioned by client)
INSERT INTO public.kb_branches (name, address, display_order, operating_hours) VALUES
('KB Stylish Pulchowk', 'Pulchowk, Lalitpur, Nepal', 1, '{"monday": {"open": "09:00", "close": "19:00"}, "tuesday": {"open": "09:00", "close": "19:00"}, "wednesday": {"open": "09:00", "close": "19:00"}, "thursday": {"open": "09:00", "close": "19:00"}, "friday": {"open": "09:00", "close": "19:00"}, "saturday": {"open": "09:00", "close": "19:00"}, "sunday": {"open": "10:00", "close": "18:00"}}'),
('KB Stylish Thamel', 'Thamel, Kathmandu, Nepal', 2, '{"monday": {"open": "09:00", "close": "19:00"}, "tuesday": {"open": "09:00", "close": "19:00"}, "wednesday": {"open": "09:00", "close": "19:00"}, "thursday": {"open": "09:00", "close": "19:00"}, "friday": {"open": "09:00", "close": "19:00"}, "saturday": {"open": "09:00", "close": "19:00"}, "sunday": {"open": "10:00", "close": "18:00"}}'),
('KB Stylish New Road', 'New Road, Kathmandu, Nepal', 3, '{"monday": {"open": "09:00", "close": "19:00"}, "tuesday": {"open": "09:00", "close": "19:00"}, "wednesday": {"open": "09:00", "close": "19:00"}, "thursday": {"open": "09:00", "close": "19:00"}, "friday": {"open": "09:00", "close": "19:00"}, "saturday": {"open": "09:00", "close": "19:00"}, "sunday": {"open": "10:00", "close": "18:00"}}');

COMMIT;

-- Rollback plan (for emergency use):
-- ALTER TABLE public.stylist_profiles DROP COLUMN branch_id;
-- DROP TABLE public.kb_branches CASCADE;
