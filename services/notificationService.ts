import { Order } from '../types';
import { SECTORS } from '../constants';

export interface NotificationPayload {
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, any>;
}

class NotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.initServiceWorker();
  }

  private async initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        this.swRegistration = reg;
      } catch (err) {
        console.warn('[NotificationService] Service Worker não está pronto:', err);
      }
    }
  }

  public isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Enviar notificação de teste ou boas-vindas
        this.sendNotification({
          title: 'Notificações Push Ativadas! 🔔',
          body: 'Receberá alertas em tempo real quando as encomendas mudarem de estado ou surgirem novas previsões.',
          tag: 'welcome-push-notification'
        });
        return true;
      }
    } catch (err) {
      console.error('[NotificationService] Erro ao pedir permissão de notificações:', err);
    }
    return false;
  }

  public async sendNotification(payload: NotificationPayload) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      console.warn('[NotificationService] Permissão não concedida para enviar notificação.');
      return;
    }

    try {
      // 1. Tenta usar o Service Worker para garantir notificação mesmo em background
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title: payload.title,
          body: payload.body,
          tag: payload.tag || 'order-update',
          data: payload.data || { url: '/' }
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
          data: payload.data || { url: '/' }
        });
        return;
      }

      // 3. Fallback Web Notification nativa
      new Notification(payload.title, {
        body: payload.body,
        icon: './icons/icone.png',
        tag: payload.tag || 'order-update',
        data: payload.data || { url: '/' }
      });
    } catch (err) {
      console.error('[NotificationService] Falha ao disparar notificação:', err);
    }
  }

  /**
   * Compara o estado antigo e novo da encomenda recebida via Supabase Real-Time
   * e dispara uma notificação Push quando deteta mudança de estado ou nova previsão.
   */
  public handleRealtimeOrderChange(oldOrder: Order | undefined, newOrder: Order, currentUsername?: string) {
    if (!oldOrder) {
      // Nova Encomenda Inserida no Sistema por outro utilizador
      this.sendNotification({
        title: `📦 Nova Encomenda Registada #${newOrder.docNr}`,
        body: `Cliente: ${newOrder.clientName || 'Geral'} | Qtd: ${newOrder.qtyRequested} un.`,
        tag: `new-order-${newOrder.id}`,
        data: { orderId: newOrder.id, docNr: newOrder.docNr, type: 'NEW_ORDER' }
      });
      return;
    }

    // 1. Verificar Alteração no Estado da Encomenda (Qtds / Faturação / Arquivo)
    const oldQtyOpen = oldOrder.qtyOpen ?? 0;
    const newQtyOpen = newOrder.qtyOpen ?? 0;
    const oldQtyBilled = oldOrder.qtyBilled ?? 0;
    const newQtyBilled = newOrder.qtyBilled ?? 0;

    if (oldQtyOpen > 0 && newQtyOpen === 0 && newQtyBilled > oldQtyBilled) {
      this.sendNotification({
        title: `✅ Encomenda Concluída / Faturada #${newOrder.docNr}`,
        body: `A encomenda de ${newOrder.clientName || 'Cliente'} foi totalmente concluída e faturada.`,
        tag: `status-completed-${newOrder.id}`,
        data: { orderId: newOrder.id, docNr: newOrder.docNr, type: 'STATUS_CHANGE' }
      });
    } else if (oldOrder.isArchived !== newOrder.isArchived && newOrder.isArchived) {
      this.sendNotification({
        title: `🗄️ Encomenda Arquivada #${newOrder.docNr}`,
        body: `A encomenda #${newOrder.docNr} foi arquivada no sistema.`,
        tag: `archived-${newOrder.id}`,
        data: { orderId: newOrder.id, docNr: newOrder.docNr, type: 'ARCHIVED' }
      });
    }

    // 2. Verificar Alteração / Inserção de Nova Previsão de Data por outro Utilizador
    const oldPredictedDates = oldOrder.sectorPredictedDates || {};
    const newPredictedDates = newOrder.sectorPredictedDates || {};

    SECTORS.forEach(sector => {
      const oldDateVal = oldPredictedDates[sector.id];
      const newDateVal = newPredictedDates[sector.id];

      const oldDateStr = oldDateVal ? new Date(oldDateVal).toISOString().split('T')[0] : '';
      const newDateStr = newDateVal ? new Date(newDateVal).toISOString().split('T')[0] : '';

      if (newDateStr && oldDateStr !== newDateStr) {
        const formattedDate = new Date(newDateVal!).toLocaleDateString('pt-PT');
        this.sendNotification({
          title: `📅 Nova Previsão de Data — Setor ${sector.name}`,
          body: `Encomenda #${newOrder.docNr} (${newOrder.clientName}): Nova previsão para ${formattedDate}.`,
          tag: `predicted-date-${newOrder.id}-${sector.id}`,
          data: { orderId: newOrder.id, docNr: newOrder.docNr, sectorId: sector.id, type: 'PREDICTED_DATE' }
        });
      }
    });

    // 3. Verificar Previsões de Data Pendentes de Validação
    const oldPending = oldOrder.sectorPredictedDatesPending || {};
    const newPending = newOrder.sectorPredictedDatesPending || {};

    SECTORS.forEach(sector => {
      if (!oldPending[sector.id] && newPending[sector.id]) {
        this.sendNotification({
          title: `⏳ Previsão de Data Pendente de Aprovação`,
          body: `Setor ${sector.name} propôs uma nova data para a Encomenda #${newOrder.docNr}. Requer validação.`,
          tag: `pending-date-${newOrder.id}-${sector.id}`,
          data: { orderId: newOrder.id, docNr: newOrder.docNr, sectorId: sector.id, type: 'PENDING_DATE' }
        });
      }
    });
  }
}

export const notificationService = new NotificationService();
