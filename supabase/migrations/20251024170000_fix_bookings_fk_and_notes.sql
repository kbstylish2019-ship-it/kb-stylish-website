-- Add missing FK constraint and fix notes field
BEGIN;

-- Add FK constraint
ALTER TABLE public.bookings 
  ADD CONSTRAINT bookings_customer_user_id_fkey 
  FOREIGN KEY (customer_user_id) 
  REFERENCES public.user_profiles(id) 
  ON DELETE RESTRICT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_bookings_customer_user_id 
  ON public.bookings(customer_user_id);

COMMIT;
