-- ============================================================================
-- SUPPORT SYSTEM MIGRATION
-- Creates comprehensive support ticket system with email integration
-- Following KB Stylish patterns: RLS, audit logging, role-based access
-- ============================================================================

-- Support Categories for ticket classification
CREATE TABLE IF NOT EXISTS public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#6B7280',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Tickets - Core entity
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.support_categories(id),
  subject text NOT NULL CHECK (length(subject) >= 5 AND length(subject) <= 200),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_to uuid REFERENCES public.user_profiles(id),
  customer_email text NOT NULL,
  customer_name text,
  order_reference text, -- Optional order ID for order-related issues
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

-- Support Messages - Conversation thread
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id), -- NULL for system messages
  message_text text NOT NULL CHECK (length(message_text) >= 1 AND length(message_text) <= 5000),
  is_internal boolean DEFAULT false, -- Internal notes only visible to staff
  is_system boolean DEFAULT false, -- System-generated messages
  email_message_id text, -- Reference to email system
  created_at timestamptz DEFAULT now()
);

-- Support Attachments
CREATE TABLE IF NOT EXISTS public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- 10MB limit
  file_type text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Customer ticket access
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id_created 
ON public.support_tickets(user_id, created_at DESC);

-- Admin/Support queue views
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority_created 
ON public.support_tickets(status, priority, created_at DESC);

-- Assignment queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to 
ON public.support_tickets(assigned_to) WHERE assigned_to IS NOT NULL;

-- Message thread queries
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created 
ON public.support_messages(ticket_id, created_at);

-- Category queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_category 
ON public.support_tickets(category_id) WHERE category_id IS NOT NULL;

-- Full-text search on messages (for admin search)
CREATE INDEX IF NOT EXISTS idx_support_messages_text_search 
ON public.support_messages USING gin(to_tsvector('english', message_text));

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

-- Support Categories - Public read, admin write
CREATE POLICY "support_categories_public_read" ON public.support_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "support_categories_admin_all" ON public.support_categories
  FOR ALL USING (public.user_has_role(auth.uid(), 'admin'));

-- Support Tickets - Users see own, admin/support see all
CREATE POLICY "support_tickets_user_own" ON public.support_tickets
  FOR ALL USING (
    user_id = auth.uid() OR 
    public.user_has_role(auth.uid(), 'admin') OR 
    public.user_has_role(auth.uid(), 'support')
  );

-- Support Messages - Same as tickets
CREATE POLICY "support_messages_access" ON public.support_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st 
      WHERE st.id = ticket_id 
      AND (
        st.user_id = auth.uid() OR 
        public.user_has_role(auth.uid(), 'admin') OR 
        public.user_has_role(auth.uid(), 'support')
      )
    )
  );

-- Support Attachments - Same as messages
CREATE POLICY "support_attachments_access" ON public.support_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st 
      WHERE st.id = ticket_id 
      AND (
        st.user_id = auth.uid() OR 
        public.user_has_role(auth.uid(), 'admin') OR 
        public.user_has_role(auth.uid(), 'support')
      )
    )
  );

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Update ticket updated_at on message insert
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.support_tickets 
  SET updated_at = now() 
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_messages_update_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Auto-update resolved_at and closed_at timestamps
CREATE OR REPLACE FUNCTION update_ticket_status_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Set resolved_at when status changes to resolved
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at = now();
  END IF;
  
  -- Set closed_at when status changes to closed
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = now();
  END IF;
  
  -- Clear timestamps if status changes back
  IF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
    NEW.resolved_at = NULL;
  END IF;
  
  IF NEW.status != 'closed' AND OLD.status = 'closed' THEN
    NEW.closed_at = NULL;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_tickets_status_timestamps
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_status_timestamps();

-- ============================================================================
-- DEFAULT SUPPORT CATEGORIES
-- ============================================================================

INSERT INTO public.support_categories (name, description, color, sort_order) VALUES
  ('General Inquiry', 'General questions about KB Stylish platform', '#6B7280', 1),
  ('Order Issue', 'Problems with orders, shipping, or delivery', '#EF4444', 2),
  ('Payment Issue', 'Payment, refund, or billing related problems', '#F59E0B', 3),
  ('Account Issue', 'Login, profile, or account access problems', '#3B82F6', 4),
  ('Product Issue', 'Product quality, description, or vendor issues', '#8B5CF6', 5),
  ('Technical Issue', 'Website bugs, app problems, or technical difficulties', '#10B981', 6),
  ('Vendor Support', 'Questions about becoming or managing vendor account', '#F97316', 7),
  ('Stylist Support', 'Questions about stylist services or bookings', '#EC4899', 8)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.support_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_attachments TO authenticated;

-- Grant sequence usage
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.support_categories IS 'Categories for organizing support tickets';
COMMENT ON TABLE public.support_tickets IS 'Customer support tickets with status tracking';
COMMENT ON TABLE public.support_messages IS 'Messages within support ticket conversations';
COMMENT ON TABLE public.support_attachments IS 'File attachments for support tickets';

COMMENT ON COLUMN public.support_tickets.priority IS 'Ticket priority: low, medium, high, urgent';
COMMENT ON COLUMN public.support_tickets.status IS 'Ticket status: open, in_progress, waiting_customer, resolved, closed';
COMMENT ON COLUMN public.support_messages.is_internal IS 'Internal staff notes, not visible to customers';
COMMENT ON COLUMN public.support_messages.is_system IS 'System-generated messages (status changes, etc.)';
