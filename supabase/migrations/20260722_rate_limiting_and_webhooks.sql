-- Migration: Configuração de Limitação de Requisições por IP e Database Webhooks
-- Cria a tabela de registo de requisições por IP e função de verificação de Rate Limit

CREATE TABLE IF NOT EXISTS public.request_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índice por IP e data para buscas ultra-rápidas
CREATE INDEX IF NOT EXISTS idx_request_logs_ip_created ON public.request_logs (ip_address, created_at);

-- Função de validação de Rate Limit no Supabase PostgreSQL
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_ip_address TEXT,
    p_endpoint TEXT DEFAULT 'global',
    p_max_requests INT DEFAULT 100,
    p_window_minutes INT DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Elimina registos antigos fora da janela de tempo
    DELETE FROM public.request_logs
    WHERE created_at < (now() - (p_window_minutes || ' minutes')::INTERVAL);

    -- Conta requisições efetuadas pelo mesmo IP no intervalo
    SELECT COUNT(*)
    INTO v_count
    FROM public.request_logs
    WHERE ip_address = p_ip_address
      AND endpoint = p_endpoint
      AND created_at >= (now() - (p_window_minutes || ' minutes')::INTERVAL);

    IF v_count >= p_max_requests THEN
        RETURN FALSE; -- Bloqueado por Excesso de Requisições
    END IF;

    -- Regista esta nova requisição
    INSERT INTO public.request_logs (ip_address, endpoint)
    VALUES (p_ip_address, p_endpoint);

    RETURN TRUE; -- Autorizado
END;
$$;

-- Permissões
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) TO anon, authenticated, service_role;
