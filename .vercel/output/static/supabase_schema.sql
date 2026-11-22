-- ============================================================
-- TimeSeries Database Schema (Supabase PostgreSQL)
-- Project ID: hyzbssegcgplgkmssdgj
-- Schema: public
-- Table: datasets
-- ============================================================

-- Step 1: Create the persistent datasets table in the public schema
CREATE TABLE IF NOT EXISTS public.datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    metric_name TEXT DEFAULT 'value',
    total_records INTEGER DEFAULT 0,
    start_time TEXT,
    end_time TEXT,
    raw_data JSONB DEFAULT '[]'::jsonb,
    aggregated_data JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Step 2: Enable Row Level Security (RLS) for multi-tenant data isolation
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

-- Step 3: Policy — Authenticated users can view ONLY their own uploaded datasets
CREATE POLICY "users_select_own" 
ON public.datasets 
FOR SELECT 
USING (auth.uid() = user_id);

-- Step 4: Policy — Authenticated users can insert records linked to their auth ID
CREATE POLICY "users_insert_own" 
ON public.datasets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Step 5: Policy — Authenticated users can delete their own uploaded datasets
CREATE POLICY "users_delete_own" 
ON public.datasets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Step 6: Create performance indexes for user queries and timestamp sorting
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON public.datasets(user_id);
CREATE INDEX IF NOT EXISTS idx_datasets_created_at ON public.datasets(created_at DESC);

-- ============================================================
-- VERIFICATION QUERY:
-- Run this in Supabase SQL Editor to see stored records:
-- SELECT id, user_id, file_name, metric_name, total_records, created_at FROM public.datasets;
-- ============================================================
