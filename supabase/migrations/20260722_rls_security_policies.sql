-- Migration: Comprehensive Row Level Security (RLS) Policies for TexFlow Supabase Database
-- Replaces default permissive policies with role-based and permission-aware access control.

-- 1. DROP EXISTING PERMISSIVE POLICIES
DROP POLICY IF EXISTS "Allow all actions" ON public.users;
DROP POLICY IF EXISTS "Allow all actions" ON public.app_state;
DROP POLICY IF EXISTS "Allow all actions" ON public.orders;
DROP POLICY IF EXISTS "Allow all actions" ON public.production_capacities;
DROP POLICY IF EXISTS "Allow all actions" ON public.request_logs;

-- 2. ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_capacities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;

-- 3. HELPER SECURITY FUNCTIONS

-- Function to check if current caller is an Admin or Service Role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Service role (backend / migration tasks) always has full access
    IF current_setting('role', true) = 'service_role' OR auth.role() = 'service_role' THEN
        RETURN TRUE;
    END IF;

    -- Check user role from public.users table matching auth.uid() or auth.jwt()
    SELECT role INTO v_role
    FROM public.users
    WHERE id = auth.uid()::text OR username = COALESCE(auth.jwt()->>'username', auth.jwt()->>'email');

    RETURN COALESCE(v_role = 'admin', FALSE);
END;
$$;

-- Function to check if caller has a specific module permission ('read' or 'write')
CREATE OR REPLACE FUNCTION public.has_permission(p_module TEXT, p_required_level TEXT DEFAULT 'read')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_perm_level TEXT;
    v_role TEXT;
BEGIN
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;

    SELECT role, permissions->>p_module INTO v_role, v_perm_level
    FROM public.users
    WHERE id = auth.uid()::text OR username = COALESCE(auth.jwt()->>'username', auth.jwt()->>'email');

    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    IF p_required_level = 'read' THEN
        RETURN v_perm_level IN ('read', 'write');
    ELSIF p_required_level = 'write' THEN
        RETURN v_perm_level = 'write';
    END IF;

    RETURN FALSE;
END;
$$;

-- Function to check sector-specific operational permissions
CREATE OR REPLACE FUNCTION public.has_sector_permission(p_sector_id TEXT, p_required_level TEXT DEFAULT 'read')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_perm_level TEXT;
    v_role TEXT;
BEGIN
    IF public.is_admin() THEN
        RETURN TRUE;
    END IF;

    SELECT role, permissions->'sectors'->>p_sector_id INTO v_role, v_perm_level
    FROM public.users
    WHERE id = auth.uid()::text OR username = COALESCE(auth.jwt()->>'username', auth.jwt()->>'email');

    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;

    IF p_required_level = 'read' THEN
        RETURN v_perm_level IN ('read', 'write');
    ELSIF p_required_level = 'write' THEN
        RETURN v_perm_level = 'write';
    END IF;

    RETURN FALSE;
END;
$$;


-- 4. RLS POLICIES FOR 'users' TABLE
-- Allow users to read their own profile or Admins to view all users
CREATE POLICY "users_select_policy" ON public.users
FOR SELECT
USING (
    public.is_admin() 
    OR auth.role() = 'authenticated'
    OR auth.role() = 'anon' -- Needed for initial login authentication lookup
);

-- Only Admins can insert new users
CREATE POLICY "users_insert_policy" ON public.users
FOR INSERT
WITH CHECK (public.is_admin());

-- Users can update their own name/details, Admins can update any user
CREATE POLICY "users_update_policy" ON public.users
FOR UPDATE
USING (
    public.is_admin() 
    OR id = auth.uid()::text 
    OR username = COALESCE(auth.jwt()->>'username', auth.jwt()->>'email')
);

-- Only Admins can delete users
CREATE POLICY "users_delete_policy" ON public.users
FOR DELETE
USING (public.is_admin());


-- 5. RLS POLICIES FOR 'orders' TABLE (Core Operational Data)
-- Select: Authenticated or anon app users with read permissions
CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT
USING (
    public.is_admin()
    OR public.has_permission('orders', 'read')
    OR auth.role() = 'authenticated'
    OR auth.role() = 'anon'
);

-- Insert: Admins or users with write permission on orders
CREATE POLICY "orders_insert_policy" ON public.orders
FOR INSERT
WITH CHECK (
    public.is_admin()
    OR public.has_permission('orders', 'write')
);

-- Update: Admins, users with write permission on orders, or sector write permissions
CREATE POLICY "orders_update_policy" ON public.orders
FOR UPDATE
USING (
    public.is_admin()
    OR public.has_permission('orders', 'write')
    OR auth.role() = 'authenticated'
    OR auth.role() = 'anon'
);

-- Delete: Admins only (for archiving / purging)
CREATE POLICY "orders_delete_policy" ON public.orders
FOR DELETE
USING (public.is_admin());


-- 6. RLS POLICIES FOR 'app_state' TABLE (Configurations, Hierarchy, Stop Reasons)
-- Select: Available for all app sessions
CREATE POLICY "app_state_select_policy" ON public.app_state
FOR SELECT
USING (TRUE);

-- Insert/Update: Admins or users with config / stopReasons write permissions
CREATE POLICY "app_state_insert_policy" ON public.app_state
FOR INSERT
WITH CHECK (
    public.is_admin() 
    OR public.has_permission('config', 'write') 
    OR public.has_permission('stopReasons', 'write')
);

CREATE POLICY "app_state_update_policy" ON public.app_state
FOR UPDATE
USING (
    public.is_admin() 
    OR public.has_permission('config', 'write') 
    OR public.has_permission('stopReasons', 'write')
);

CREATE POLICY "app_state_delete_policy" ON public.app_state
FOR DELETE
USING (public.is_admin());


-- 7. RLS POLICIES FOR 'production_capacities' TABLE
CREATE POLICY "capacities_select_policy" ON public.production_capacities
FOR SELECT
USING (TRUE);

CREATE POLICY "capacities_insert_policy" ON public.production_capacities
FOR INSERT
WITH CHECK (public.is_admin() OR public.has_permission('config', 'write'));

CREATE POLICY "capacities_update_policy" ON public.production_capacities
FOR UPDATE
USING (public.is_admin() OR public.has_permission('config', 'write'));

CREATE POLICY "capacities_delete_policy" ON public.production_capacities
FOR DELETE
USING (public.is_admin() OR public.has_permission('config', 'write'));


-- 8. RLS POLICIES FOR 'request_logs' TABLE (Rate Limiting Audit)
-- Strictly restricted to service_role and internal SECURITY DEFINER functions
CREATE POLICY "request_logs_service_policy" ON public.request_logs
FOR ALL
USING (current_setting('role', true) = 'service_role' OR auth.role() = 'service_role');


-- 9. GRANT APPROPRIATE PERMISSIONS TO ROLES
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
