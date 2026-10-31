import { Order, User } from '../types';
import { SECTORS } from '../constants';

export interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, any>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class NotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private currentSubscription: PushSubscription | null = null;

  constructor() {
    this.initServiceWorker();
  }

  private async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined') return null;

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        this.swRegistration = reg;
        if ('pushManager' in reg) {
          this.currentSubscription = await reg.pushManager.getSubscription();
        }
        return reg;
      } catch (err) {
        console.warn('[NotificationService] Service Worker não está pronto:', err);
      }
    }
    return null;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  }

  public isPushApiSupported(): boolean {
    return this.isSupported() && 'PushManager' in window;
  }

  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public async getPushSubscription(): Promise<PushSubscription | null> {
    if (!this.swRegistration) {
      await this.initServiceWorker();
    }
    if (this.swRegistration && 'pushManager' in this.swRegistration) {
      try {
        this.currentSubscription = await this.swRegistration.pushManager.getSubscription();
        return this.currentSubscription;
      } catch (err) {
        console.warn('[NotificationService] Erro ao obter PushSubscription:', err);
      }
    }
    return null;
  }

  public async subscribeToPushNotifications(user?: User | null): Promise<boolean> {
    if (!this.isPushApiSupported()) {
      console.warn('[NotificationService] Push API não é suportada por este navegador.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[NotificationService] Permissão de notificação negada pelo utilizador.');
        return false;
      }

      const reg = this.swRegistration || (await this.initServiceWorker());
      if (!reg || !reg.pushManager) {
        console.error('[NotificationService] Service Worker / PushManager indisponível.');
        return false;
      }

      // 1. Obter VAPID Public Key do backend Express
      const res = await fetch('/api/notifications/vapid-public-key');
      if (!res.ok) {
        throw new Error('Falha ao obter chave VAPID pública do servidor.');
      }
      const { publicKey } = await res.json();
      if (!publicKey) {
        throw new Error('Chave VAPID pública vazia.');
      }

      // 2. Criar subscrição Push junto do fornecedor do browser (FCM / APNs)
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      this.currentSubscription = subscription;

      // 3. Registar subscrição no servidor backend Express
      const subRes = await fetch('/api/notifications/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId: user?.id || 'gestor',
          userName: user?.name || user?.username || 'Gestor',
          userRole: user?.role || 'manager'
        })
      });

      if (!subRes.ok) {
        console.warn('[NotificationService] Falha ao sincronizar subscrição com o servidor.');
      }

      // Notificação local de boas-vindas
      this.sendNotification({
        title: '🔔 Alertas Push para Gestores Ativos',
        body: 'O seu telemóvel receberá alertas em tempo real quando encomendas urgentes forem alteradas, mesmo com a app fechada.',
        tag: 'push-manager-enabled'
      });

      return true;
    } catch (err) {
      console.error('[NotificationService] Erro ao subscrever Push API:', err);
      return false;
    }
  }

  public async unsubscribeFromPushNotifications(): Promise<boolean> {
    try {
      const sub = await this.getPushSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        this.currentSubscription = null;

        await fetch('/api/notifications/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        }).catch(() => {});
        return true;
      }
    } catch (err) {
      console.error('[NotificationService] Erro ao desmarcar subscrição:', err);
    }
    return false;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Tenta também subscrever à Push API
        await this.subscribeToPushNotifications();
        return true;
      }
    } catch (err) {
      console.error('[NotificationService] Erro ao pedir permissão de notificações:', err);
    }
    return false;
  }

  public async sendNotification(payload: NotificationPayload) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return;
    }

    try {
      // 1. Tenta usar o Service Worker para garantir apresentação
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: payload.title,
          body: payload.body,
          tag: payload.tag || 'order-update',
          data: payload.data || { url: './' }
        });
        return;
      }

      // 2. Fallback via ServiceWorkerRegistration.showNotification
      if (this.swRegistration) {
        await (this.swRegistration.showNotification as any)(payload.title, {
          body: payload.body,
          icon: './icons/icone.png',
          badge: './icons/icone.png',
          tag: payload.tag || 'order-update',
          renotify: true,
          data: payload.data || { url: './' }
        });
        return;
      }

      // 3. Fallback Web Notification nativa
      new Notification(payload.title, {
        body: payload.body,
        icon: './icons/icone.png',
        tag: payload.tag || 'order-update',
        data: payload.data || { url: './' }
      });
    } catch (err) {
      console.error('[NotificationService] Falha ao disparar notificação:', err);
    }
  }

  /**
   * Notifica todos os gestores inscritos através da Push API (Web Push backend)
   * quando uma encomenda urgente é alterada, garantindo entrega mesmo com a app em segundo plano.
   */
  public async notifyUrgentOrderChange(params: {
    orderDocNr: string;
    clientName: string;
    changeType: 'PRIORITY_CHANGED' | 'PREDICTION_CHANGED' | 'STOP_REASON' | 'STATUS_CHANGED' | 'QTY_CHANGED' | 'OBSERVATION';
    description: string;
    priority?: number;
    changedBy?: string;
  }) {
    const isUrgent = (params.priority !== undefined && params.priority > 0) || params.changeType === 'PRIORITY_CHANGED';
    if (!isUrgent) return;

    try {
      // 1. Disparo de Push Notification ao servidor para entrega a gestores em background
      fetch('/api/notifications/trigger-urgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderDocNr: params.orderDocNr,
          clientName: params.clientName,
          changeType: params.changeType,
          description: params.description,
          priority: params.priority ?? 1,
          changedBy: params.changedBy || 'Gestor'
        })
      }).catch(err => {
        console.warn('[NotificationService] Não foi possível contactar endpoint de Push urgente:', err);
      });

      // 2. Disparo imediato local via Service Worker (se a app estiver ativa na máquina local)
      this.sendNotification({
        title: `🚨 URGENTE: Encomenda #${params.orderDocNr}`,
        body: `${params.clientName}: ${params.description}`,
        tag: `urgent-${params.orderDocNr}-${Date.now()}`,
        data: {
          url: `./?docNr=${params.orderDocNr}`,
          docNr: params.orderDocNr,
          urgent: true
        }
      });
    } catch (err) {
      console.error('[NotificationService] Erro ao despachar alerta urgente:', err);
    }
  }

  /**
   * Compara o estado antigo e novo da encomenda recebida via Supabase Real-Time
   * e dispara uma notificação Push quando deteta mudança de estado, nova previsão ou alteração em encomenda urgente.
   */
  public handleRealtimeOrderChange(oldOrder: Order | undefined, newOrder: Order, currentUsername?: string) {
    const isUrgentOrder = (newOrder.priority && newOrder.priority > 0) || (oldOrder?.priority && oldOrder.priority > 0);

    if (!oldOrder) {
      // Nova Encomenda Inserida no Sistema
      const isUrgent = newOrder.priority && newOrder.priority > 0;
      if (isUrgent) {
        this.notifyUrgentOrderChange({
          orderDocNr: newOrder.docNr,
          clientName: newOrder.clientName || 'Cliente',
          changeType: 'PRIORITY_CHANGED',
          description: `Nova encomenda URGENTE inserida (${newOrder.qtyRequested} un.)`,
          priority: newOrder.priority,
          changedBy: currentUsername
        });
      } else {
        this.sendNotification({
          title: `📦 Nova Encomenda Registada #${newOrder.docNr}`,
          body: `Cliente: ${newOrder.clientName || 'Geral'} | Qtd: ${newOrder.qtyRequested} un.`,
          tag: `new-order-${newOrder.id}`,
          data: { orderId: newOrder.id, docNr: newOrder.docNr, type: 'NEW_ORDER' }
        });
      }
      return;
    }

    // A: Mudança de Prioridade (especialmente se passou a urgente ou mudou prioridade)
    if (oldOrder.priority !== newOrder.priority) {
      if (newOrder.priority && newOrder.priority > 0) {
        const priorityLabels: Record<number, string> = { 1: 'Alta (Vermelho)', 2: 'Média (Laranja)', 3: 'Baixa (Amarelo)' };
        this.notifyUrgentOrderChange({
          orderDocNr: newOrder.docNr,
          clientName: newOrder.clientName || 'Cliente',
          changeType: 'PRIORITY_CHANGED',
          description: `Definida como URGENTE — Prioridade ${priorityLabels[newOrder.priority] || newOrder.priority}`,
          priority: newOrder.priority,
          changedBy: currentUsername
        });
      }
    }

    // B: Alteração de Previsão de Data em Encomenda Urgente
    const oldPredictedDates = oldOrder.sectorPredictedDates || {};
    const newPredictedDates = newOrder.sectorPredictedDates || {};

    SECTORS.forEach(sector => {
      const oldDateVal = oldPredictedDates[sector.id];
      const newDateVal = newPredictedDates[sector.id];

      const oldDateStr = oldDateVal ? new Date(oldDateVal).toISOString().split('T')[0] : '';
      const newDateStr = newDateVal ? new Date(newDateVal).toISOString().split('T')[0] : '';

      if (newDateStr && oldDateStr !== newDateStr) {
        const formattedDate = new Date(newDateVal!).toLocaleDateString('pt-PT');
        if (isUrgentOrder) {
          this.notifyUrgentOrderChange({
            orderDocNr: newOrder.docNr,
            clientName: newOrder.clientName || 'Cliente',
            changeType: 'PREDICTION_CHANGED',
            description: `Nova previsão Setor ${sector.name}: ${formattedDate}`,
            priority: newOrder.priority || 1,
            changedBy: currentUsername
          });
        } else {
          this.sendNotification({
            title: `📅 Nova Previsão de Data — Setor ${sector.name}`,
            body: `Encomenda #${newOrder.docNr} (${newOrder.clientName}): Nova previsão para ${formattedDate}.`,
            tag: `predicted-date-${newOrder.id}-${sector.id}`,
            data: { orderId: newOrder.id, docNr: newOrder.docNr, sectorId: sector.id, type: 'PREDICTED_DATE' }
          });
        }
      }
    });

    // C: Motivo de Paragem inserido ou alterado em Encomenda Urgente
    const oldStopReasons = oldOrder.sectorStopReasons || {};
    const newStopReasons = newOrder.sectorStopReasons || {};

    SECTORS.forEach(sector => {
      const oldReason = oldStopReasons[sector.id] || '';
      const newReason = newStopReasons[sector.id] || '';

      if (newReason && oldReason !== newReason && isUrgentOrder) {
        this.notifyUrgentOrderChange({
          orderDocNr: newOrder.docNr,
          clientName: newOrder.clientName || 'Cliente',
          changeType: 'STOP_REASON',
          description: `Paragem no Setor ${sector.name}: "${newReason}"`,
          priority: newOrder.priority || 1,
          changedBy: currentUsername
        });
      }
    });

    // D: Conclusão / Arquivo de Encomenda Urgente
    const oldQtyOpen = oldOrder.qtyOpen ?? 0;
    const newQtyOpen = newOrder.qtyOpen ?? 0;
    const oldQtyBilled = oldOrder.qtyBilled ?? 0;
    const newQtyBilled = newOrder.qtyBilled ?? 0;

    if (oldQtyOpen > 0 && newQtyOpen === 0 && newQtyBilled > oldQtyBilled) {
      if (isUrgentOrder) {
        this.notifyUrgentOrderChange({
          orderDocNr: newOrder.docNr,
          clientName: newOrder.clientName || 'Cliente',
          changeType: 'STATUS_CHANGED',
          description: 'Encomenda urgente CONCLUÍDA e faturada.',
          priority: newOrder.priority || 1,
          changedBy: currentUsername
        });
      } else {
        this.sendNotification({
          title: `✅ Encomenda Concluída / Faturada #${newOrder.docNr}`,
          body: `A encomenda de ${newOrder.clientName || 'Cliente'} foi totalmente concluída e faturada.`,
          tag: `status-completed-${newOrder.id}`,
          data: { orderId: newOrder.id, docNr: newOrder.docNr, type: 'STATUS_CHANGE' }
        });
      }
    }
  }
}

export const notificationService = new NotificationService();
