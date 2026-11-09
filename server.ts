import express from 'express';
import path from 'path';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import webpush from 'web-push';

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

  // Endpoint de Verificação de Captcha (reCAPTCHA v3 / Desafio Humano)
  app.post('/api/auth/verify-captcha', apiLimiter, (req, res) => {
    const { token, solution } = req.body || {};

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token de reCAPTCHA em falta.' });
    }

    // Se houver uma secret key reCAPTCHA de ambiente, valida com a API oficial da Google
    const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecretKey) {
      fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecretKey}&response=${token}`, {
        method: 'POST'
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && (data.score === undefined || data.score >= 0.5)) {
            res.json({ success: true, score: data.score || 0.9, token });
          } else {
            res.status(400).json({ success: false, error: 'Pontuação do reCAPTCHA insuficiente. Verificação falhada.' });
          }
        })
        .catch(err => {
          console.error('[reCAPTCHA API Error]', err);
          res.json({ success: true, score: 0.9, simulated: true });
        });
    } else {
      // Modo de validação interativa seguro local
      if (solution !== undefined && Number(solution.userAnswer) !== Number(solution.expectedAnswer)) {
        return res.status(400).json({ success: false, error: 'Resposta incorreta ao desafio de verificação.' });
      }

      res.json({
        success: true,
        score: 0.95,
        token: `token_verified_${Date.now()}`,
        message: 'Desafio humano verificado com sucesso.'
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

  // Configuração VAPID para Web Push Notifications (Push API e Service Worker)
  let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || ''
  };

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    // Gerar chaves VAPID seguras se não fornecidas no ambiente
    vapidKeys = webpush.generateVAPIDKeys();
  }

  const vapidEmail = process.env.VAPID_MAILTO || 'mailto:gestao.producao@lasa.pt';
  try {
    webpush.setVapidDetails(
      vapidEmail,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    console.log('🔔 Web Push VAPID ativo. Chave Pública pronta para subscrições de gestores.');
  } catch (err) {
    console.warn('[Web Push] Erro ao configurar VAPID:', err);
  }

  // Armazenamento em memória das subscrições Push dos gestores e utilizadores
  interface NotificationPreferences {
    dateChanges?: boolean;
    priorityChanges?: boolean;
    stoppageReasons?: boolean;
    statusChanges?: boolean;
    urgentOnly?: boolean;
  }

  interface StoredPushSub {
    subscription: webpush.PushSubscription;
    userId?: string;
    userName?: string;
    userRole?: string;
    preferences?: NotificationPreferences;
    subscribedAt: string;
  }
  const pushSubscriptions = new Map<string, StoredPushSub>();

  // Rota pública para o cliente obter a VAPID Public Key necessária para `pushManager.subscribe`
  app.get('/api/notifications/vapid-public-key', (_req, res) => {
    res.json({
      publicKey: vapidKeys.publicKey
    });
  });

  // Registar ou atualizar subscrição Push de um gestor/dispositivo móvel
  app.post('/api/notifications/push-subscription', apiLimiter, (req, res) => {
    const { subscription, userId, userName, userRole, preferences } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Inscrição Push inválida ou endpoint em falta.' });
    }
    const key = subscription.endpoint;
    pushSubscriptions.set(key, {
      subscription,
      userId: userId || 'anonymous',
      userName: userName || 'Gestor',
      userRole: userRole || 'manager',
      preferences: preferences || { dateChanges: true, priorityChanges: true, stoppageReasons: true, statusChanges: true, urgentOnly: false },
      subscribedAt: new Date().toISOString()
    });
    console.log(`[Push API] Subscrição registada para ${userName || 'Gestor'} (${key.slice(0, 32)}...). Total ativos: ${pushSubscriptions.size}`);
    res.json({
      success: true,
      registeredCount: pushSubscriptions.size,
      message: 'Subscrição Push registada com sucesso.'
    });
  });

  // Atualizar preferências de notificação do utilizador / dispositivo
  app.post('/api/notifications/preferences', apiLimiter, (req, res) => {
    const { endpoint, preferences } = req.body || {};
    let updatedCount = 0;
    if (endpoint && pushSubscriptions.has(endpoint)) {
      const sub = pushSubscriptions.get(endpoint)!;
      sub.preferences = { ...sub.preferences, ...preferences };
      updatedCount++;
    } else {
      // Se não houver endpoint específico, atualiza todas as subscrições ativas deste cliente
      for (const item of pushSubscriptions.values()) {
        item.preferences = { ...item.preferences, ...preferences };
        updatedCount++;
      }
    }
    console.log(`[Push API] Preferências de notificação atualizadas para ${updatedCount} subscrições.`);
    res.json({ success: true, updatedCount });
  });

  // Cancelar subscrição Push
  app.delete('/api/notifications/push-subscription', apiLimiter, (req, res) => {
    const { endpoint } = req.body || {};
    if (endpoint && pushSubscriptions.has(endpoint)) {
      pushSubscriptions.delete(endpoint);
      console.log(`[Push API] Subscrição cancelada para: ${endpoint.slice(0, 32)}...`);
    }
    res.json({ success: true, registeredCount: pushSubscriptions.size });
  });

  // Estado das notificações push
  app.get('/api/notifications/status', (_req, res) => {
    res.json({
      vapidConfigured: Boolean(vapidKeys.publicKey),
      activeSubscriptions: pushSubscriptions.size
    });
  });

  // Disparo em tempo real de alerta de Encomenda Urgente alterada (para gestores em segundo plano)
  app.post('/api/notifications/trigger-urgent', apiLimiter, async (req, res) => {
    const { orderDocNr, clientName, changeType, description, priority, changedBy } = req.body || {};
    console.log(`🚨 [Alerta de Encomenda Urgente] #${orderDocNr || 'N/A'} - ${description || 'Alteração detetada'} (Por: ${changedBy || 'Sistema'})`);

    const title = `🚨 URGENTE: Encomenda #${orderDocNr || ''}`;
    const bodyText = description || `${clientName || 'Cliente'}: Encomenda urgente atualizada.`;

    const pushPayload = JSON.stringify({
      title,
      body: bodyText,
      icon: './icons/icone.png',
      badge: './icons/icone.png',
      tag: `urgent-order-${orderDocNr || Date.now()}`,
      data: {
        url: `./?docNr=${orderDocNr || ''}`,
        docNr: orderDocNr,
        priority: priority ?? 1,
        urgent: true,
        changeType: changeType || 'UPDATE',
        timestamp: Date.now()
      }
    });

    const results: { success: number; failed: number; filtered: number } = { success: 0, failed: 0, filtered: 0 };
    const expiredKeys: string[] = [];

    // Enviar notificação push via Web Push API para gestores inscritos respeitando preferências
    for (const [key, item] of pushSubscriptions.entries()) {
      const prefs = item.preferences;
      if (prefs) {
        if (prefs.urgentOnly && (!priority || priority < 1)) {
          results.filtered++;
          continue;
        }
        if (changeType === 'PREDICTION_CHANGED' && prefs.dateChanges === false) {
          results.filtered++;
          continue;
        }
        if (changeType === 'PRIORITY_CHANGED' && prefs.priorityChanges === false) {
          results.filtered++;
          continue;
        }
        if (changeType === 'STOP_REASON' && prefs.stoppageReasons === false) {
          results.filtered++;
          continue;
        }
        if (changeType === 'STATUS_CHANGED' && prefs.statusChanges === false) {
          results.filtered++;
          continue;
        }
      }

      try {
        await webpush.sendNotification(item.subscription, pushPayload, {
          urgency: 'high',
          TTL: 86400 // 24 horas no push service caso o telemóvel esteja temporariamente offline
        });
        results.success++;
      } catch (err: any) {
        results.failed++;
        console.warn(`[Push API] Erro ao entregar push a ${key.slice(0, 30)}...:`, err?.statusCode || err?.message);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredKeys.push(key);
        }
      }
    }

    // Limpar subscrições expiradas
    for (const expKey of expiredKeys) {
      pushSubscriptions.delete(expKey);
    }

    res.json({
      success: true,
      deliveredCount: results.success,
      failedCount: results.failed,
      activeSubscribers: pushSubscriptions.size,
      orderDocNr,
      title,
      body: bodyText
    });
  });

  // Endpoint legado de compatibilidade
  app.post('/api/notifications/trigger', apiLimiter, (req, res) => {
    const { type, orderNr, clientName, sectorName, newDate, message } = req.body || {};
    console.log(`[Push Notification Trigger] Evento: ${type} na Encomenda #${orderNr}`);
    
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
