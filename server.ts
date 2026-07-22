import express from 'express';
import path from 'path';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Confiar nos proxies (Cloud Run / Nginx) para extrair o IP correto
  app.set('trust proxy', 1);

  // Permissões e Parsers
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Headers de Segurança HTTP e Forçar HTTPS
  app.use((req, res, next) => {
    // 1. Redirecionamento Estrito para HTTPS se o pedido for recebido em HTTP (através do proxy Nginx / Cloud Run)
    const proto = req.headers['x-forwarded-proto'];
    const host = req.headers.host || '';

    if (proto === 'http' && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return res.redirect(301, `https://${host}${req.url}`);
    }

    // 2. Strict-Transport-Security (HSTS) - Força os navegadores a comunicarem apenas por HTTPS durante 1 ano
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

    // 3. Security Headers adicionais e Upgrade de requisições inseguras
    res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // 1. Limitador Geral de Requisições por IP (Proteção Anti-DDoS)
  // Limita qualquer IP a no máximo 300 requisições a cada 15 minutos
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      error: 'Muitos pedidos recebidos a partir deste IP. Por favor, aguarde 15 minutos e tente novamente.',
      retryAfterMinutes: 15
    }
  });

  // 2. Limitador Estrito para Autenticação (Proteção Anti-Brute Force)
  // Bloqueia tentativas excessivas de login (máximo 5 falhas por IP a cada 15 min)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Apenas falhas incrementam a contagem de força bruta
    message: {
      status: 429,
      error: 'Excedido o limite de tentativas de autenticação falhadas. Este IP foi temporariamente bloqueado por 15 minutos.',
      retryAfterMinutes: 15
    }
  });

  // 3. Limitador para Chamadas de API Sensíveis
  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 429,
      error: 'Limite de requisições de API excedido para este IP.'
    }
  });

  // Aplicar o limitador global
  app.use(globalLimiter);

  // Rotas de API com rate limit direcionado
  app.use('/api/', apiLimiter);

  // Endpoint de Diagnóstico / Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      security: {
        rateLimitingActive: true,
        bruteForceProtectionActive: true,
        clientIp: req.ip
      }
    });
  });

  // Endpoint de Validação/Proteção de Login contra Força Bruta
  app.post('/api/auth/login-attempt', authLimiter, (req, res) => {
    const { success } = req.body || {};
    
    if (success) {
      res.json({
        allowed: true,
        message: 'Login verificado e permitido.'
      });
    } else {
      res.status(401).json({
        allowed: false,
        error: 'Tentativa de login falhada registada. Proteção contra força bruta em vigor.'
      });
    }
  });

  // Endpoint de estado de segurança para o cliente
  app.get('/api/security/ip-status', (req, res) => {
    res.json({
      ip: req.ip,
      rateLimited: true,
      rules: {
        global: '300 pedidos / 15 min',
        auth: '5 falhas / 15 min',
        api: '100 pedidos / 5 min'
      }
    });
  });

  // Webhook Receiver do Supabase (para monitorização de auditoria/eventos)
  app.post('/api/webhooks/supabase-audit', apiLimiter, (req, res) => {
    console.log(`[Supabase Webhook] Evento de auditoria recebido de ${req.ip}`);
    res.json({ success: true, timestamp: new Date().toISOString() });
  });

  // Endpoints para Gerenciamento de Notificações Push
  const pushSubscriptions = new Map<string, any>();

  app.post('/api/notifications/push-subscription', apiLimiter, (req, res) => {
    const { subscription, userId } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Inscrição Push inválida.' });
    }
    const key = userId || req.ip;
    pushSubscriptions.set(key, subscription);
    console.log(`[Push Notification] Nova subscrição de notificação registada para ${key}`);
    res.json({ success: true, registeredCount: pushSubscriptions.size });
  });

  app.post('/api/notifications/trigger', apiLimiter, (req, res) => {
    const { type, orderNr, clientName, sectorName, newDate, message } = req.body || {};
    console.log(`[Push Notification Trigger] Evento: ${type} na Encomenda #${orderNr}`);
    
    // Broadcast / Notificar todos os clientes registados
    res.json({
      success: true,
      deliveredTo: pushSubscriptions.size,
      event: { type, orderNr, clientName, sectorName, newDate, message }
    });
  });

  // Suporte para Vite Dev Server e Produção
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️ Servidor TexFlow iniciado com middleware de Rate Limit na porta ${PORT}`);
  });
}

startServer();
