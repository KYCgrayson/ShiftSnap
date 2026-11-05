-- Account deletion is requested by the authenticated user and fulfilled by an
-- operator after reviewing shared groups, merge history, and owned storage.
-- user_id intentionally has no FK: the queue receipt must survive auth.users
-- deletion. It stores no email, message, or OAuth credentials.
CREATE TABLE public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'action_required', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX account_deletion_requests_queue
  ON public.account_deletion_requests (status, requested_at);

CREATE UNIQUE INDEX account_deletion_requests_one_open_per_user
  ON public.account_deletion_requests (user_id)
  WHERE status IN ('pending', 'in_progress', 'action_required');

CREATE TRIGGER update_account_deletion_requests_updated_at
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_requests TO service_role;
GRANT UPDATE (status) ON public.account_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = '28000';
  END IF;

  -- Serialize duplicate taps and retries for the same authenticated account.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 6281));

  SELECT * INTO v_request
  FROM public.account_deletion_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'in_progress', 'action_required')
  ORDER BY requested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.account_deletion_requests (user_id)
    VALUES (v_user_id)
    RETURNING * INTO v_request;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'requested_at', v_request.requested_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_account_deletion_request()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_request
  FROM public.account_deletion_requests
  WHERE user_id = v_user_id
  ORDER BY requested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'status', v_request.status,
    'requested_at', v_request.requested_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_account_deletion_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_account_deletion_request() TO authenticated;

COMMENT ON TABLE public.account_deletion_requests IS
  'Authenticated account deletion requests for manual review and fulfillment; user_id is retained without an auth FK so the request receipt survives account removal.';
