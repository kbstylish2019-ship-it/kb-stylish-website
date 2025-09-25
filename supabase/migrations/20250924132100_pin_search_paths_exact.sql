-- Pin search_path for exact flagged functions
ALTER FUNCTION public.cancel_booking(p_booking_id uuid, p_cancelled_by uuid, p_reason text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.check_slot_availability(p_stylist_id uuid, p_start_time timestamptz, p_end_time timestamptz)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_reservations()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.create_booking(p_customer_id uuid, p_stylist_id uuid, p_service_id uuid, p_start_time timestamptz, p_customer_name text, p_customer_phone text, p_customer_email text, p_customer_notes text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stylist_bookings(p_stylist_id uuid, p_start_date timestamptz, p_end_date timestamptz)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stylist_schedule(p_stylist_id uuid, p_start_date date, p_end_date date)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_booking_reservation(p_reservation_id uuid, p_customer_id uuid, p_service_id uuid, p_start_time timestamptz)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_service_duration(p_stylist_id uuid, p_service_id uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_service_price(p_stylist_id uuid, p_service_id uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_product_change()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.hmac(data text, key text, algorithm text)
  SET search_path = public, extensions, pg_temp;
