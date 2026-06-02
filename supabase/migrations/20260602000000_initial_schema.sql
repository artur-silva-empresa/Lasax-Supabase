-- Initial Supabase Schema for TexFlow

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- STOP REASONS TABLE (Stores the hierarchy as JSON, or we can use rows. For simplicity matching IndexedDB, a single json record)
CREATE TABLE IF NOT EXISTS public.app_state (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  doc_series TEXT,
  doc_nr TEXT NOT NULL,
  client_code TEXT,
  client_name TEXT,
  comercial TEXT,
  issue_date TIMESTAMPTZ,
  requested_date TIMESTAMPTZ,
  item_nr INTEGER,
  po TEXT,
  article_code TEXT,
  reference TEXT,
  color_code TEXT,
  color_desc TEXT,
  size TEXT,
  family TEXT,
  size_desc TEXT,
  ean TEXT,
  qty_requested NUMERIC DEFAULT 0,
  data_tec TIMESTAMPTZ,
  
  felpo_cru_qty NUMERIC DEFAULT 0,
  felpo_cru_date TIMESTAMPTZ,
  tinturaria_qty NUMERIC DEFAULT 0,
  tinturaria_date TIMESTAMPTZ,
  conf_roupoes_qty NUMERIC DEFAULT 0,
  conf_felpos_qty NUMERIC DEFAULT 0,
  conf_date TIMESTAMPTZ,
  emb_acab_qty NUMERIC DEFAULT 0,
  arm_exp_date TIMESTAMPTZ,
  stock_cx_qty NUMERIC DEFAULT 0,
  data_ent TIMESTAMPTZ,
  
  data_especial TIMESTAMPTZ,
  data_printer TIMESTAMPTZ,
  data_debuxo TIMESTAMPTZ,
  data_amostras TIMESTAMPTZ,
  data_bordados TIMESTAMPTZ,
  
  qty_billed NUMERIC DEFAULT 0,
  qty_open NUMERIC DEFAULT 0,
  
  priority INTEGER DEFAULT 0,
  is_manual BOOLEAN DEFAULT FALSE,
  
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by TEXT,
  
  sector_stop_reasons JSONB DEFAULT '{}'::jsonb,
  sector_observations JSONB DEFAULT '{}'::jsonb,
  sector_predicted_dates JSONB DEFAULT '{}'::jsonb,
  sector_predicted_dates_pending JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCTION CAPACITIES TABLE
CREATE TABLE IF NOT EXISTS public.production_capacities (
  id TEXT PRIMARY KEY,
  sector_id TEXT NOT NULL,
  label TEXT,
  article_code TEXT,
  family TEXT,
  reference TEXT,
  color_code TEXT,
  size TEXT,
  pieces_per_hour NUMERIC DEFAULT 0,
  hours_per_day NUMERIC DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (Row Level Security) Configuration
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_capacities ENABLE ROW LEVEL SECURITY;

-- Create default permissive policies for now (assuming client-side app manages its own role logic for now, similar to indexedDB)
CREATE POLICY "Allow all actions" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow all actions" ON public.app_state FOR ALL USING (true);
CREATE POLICY "Allow all actions" ON public.orders FOR ALL USING (true);
CREATE POLICY "Allow all actions" ON public.production_capacities FOR ALL USING (true);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_orders_modtime BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_capacities_modtime BEFORE UPDATE ON public.production_capacities FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Enable Realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
