CREATE TABLE IF NOT EXISTS public.join_interest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  role text NOT NULL CHECK (role IN ('teacher', 'student')),
  email text,
  phone text,
  message text,
  source text NOT NULL DEFAULT 'landing_page',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'invited', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_interest_requests_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_join_interest_requests_created_at
  ON public.join_interest_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_join_interest_requests_status
  ON public.join_interest_requests (status);

ALTER TABLE public.join_interest_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY join_interest_requests_admin_select
ON public.join_interest_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active = true
  )
);

CREATE POLICY join_interest_requests_admin_update
ON public.join_interest_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.is_active = true
  )
);
