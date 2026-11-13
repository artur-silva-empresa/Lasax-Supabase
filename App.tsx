
import React from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import OrderTable, { ActiveFilterType } from './components/OrderTable';
import OrderTimeline from './components/OrderTimeline';
import OrderDetails from './components/OrderDetails';
import OrderPosition from './components/OrderPosition';
import ImportModal from './components/ImportModal';
import Settings from './components/Settings';
import StopReasons from './components/StopReasons';
import Login from './components/Login';
import { Order, User } from './types';
import { generateMockOrders, loadOrdersFromDB, saveOrdersToDB, saveOrderToDB, clearOrdersFromDB, loadStopReasonsFromDB, saveStopReasonsToDB, loadUsersFromDB, initializeDefaultUsers, saveUserToDB, deleteUserFromDB, loadCapacitiesFromDB, saveCapacitiesToDB, hydrateOrder, processSyncQueue, getISOWeek } from './services/dataService';
import { notificationService } from './services/notificationService';
import { supabase } from './src/services/supabase';
import { WifiOff, CheckCircle2, X, Download, Loader2 } from 'lucide-react';
import { SECTORS, STOP_REASONS_HIERARCHY } from './constants';

import SectorOrderTable from './components/SectorOrderTable';
import ProductionCapacityPage from './components/ProductionCapacityPage';
import BottleneckAnalysis from './components/BottleneckAnalysis';
import { ProductionCapacity } from './types';
import { checkAndRunAutoPing } from './src/services/supabaseKeepAlive';

const App: React.FC = () => {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [stopReasons, setStopReasons] = React.useState<any[]>(STOP_REASONS_HIERARCHY);
  const [users, setUsers] = React.useState<User[]>([]);
  const [capacities, setCapacities] = React.useState<ProductionCapacity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeView, setActiveView] = React.useState('dashboard');
  const [previousView, setPreviousView] = React.useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [excelHeaders, setExcelHeaders] = React.useState<Record<string, string>>({});
  
  // Auth State
  const [currentUser, setCurrentUser] = React.useState<User | null>(null);
  
  // Theme State
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  // Estado para controlo de filtros vindos do dashboard
  const [activeDashboardFilter, setActiveDashboardFilter] = React.useState<ActiveFilterType>(null);
  
  // Global search state
  const [globalSearchTerm, setGlobalSearchTerm] = React.useState('');
  // Global filter date range for all views
  const [globalDateRange, setGlobalDateRange] = React.useState<{ start: string; end: string } | null>(null);
  
  // PWA Installation support
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = React.useState(false);

  // Estado para notificações do sistema
  const [notification, setNotification] = React.useState<{message: string, type: 'success' | 'info'} | null>(null);

  // Estado de Bloqueio Temporário do Login (Persistido no sessionStorage)
  const [loginLockoutUntil, setLoginLockoutUntil] = React.useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem('login_lockout_until');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  // Função Centralizada para Logout (Limpa estado, tokens e sessão Supabase)
  const handleLogout = React.useCallback(async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Erro ao encerrar sessão no Supabase:", err);
    }
    setCurrentUser(null);
    try {
      sessionStorage.removeItem('texflow_current_user');
      localStorage.removeItem('texflow_current_user');
    } catch {}
  }, []);

  // Temporizador Global de Inatividade (30 Minutos) para terminais partilhados no chão de fábrica
  React.useEffect(() => {
    if (!currentUser) return;

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos sem interação
    let timer: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleLogout();
        setNotification({
          message: 'Sessão encerrada por inatividade (30 min sem interação). Por segurança, efetue o login novamente.',
          type: 'info'
        });
      }, INACTIVITY_TIMEOUT_MS);
    };

    // Eventos Globais de Interação do Utilizador
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'wheel'];

    let lastActivityTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle de 1 segundo para otimização de performance
      if (now - lastActivityTime > 1000) {
        lastActivityTime = now;
        resetInactivityTimer();
      }
    };

    // Iniciar temporizador
    resetInactivityTimer();

    // Registar ouvintes de eventos
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    return () => {
      clearTimeout(timer);
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [currentUser, handleLogout]);

  // Keyboard Shortcuts state
  const [shortcuts, setShortcuts] = React.useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('texflow-shortcuts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao carregar atalhos de teclado", e);
      }
    }
    // Default shortcuts mapping key -> viewId
    return {
      'd': 'dashboard',
      'o': 'orders',
      't': 'timeline',
      'g': 'bottleneck',
      'c': 'production-capacity',
      's': 'config'
    };
  });

  const handleUpdateShortcuts = (newShortcuts: Record<string, string>) => {
    setShortcuts(newShortcuts);
    localStorage.setItem('texflow-shortcuts', JSON.stringify(newShortcuts));
    setNotification({ message: 'Atalhos de teclado atualizados com sucesso.', type: 'success' });
  };

  // Keyboard shortcut listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in form controls
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        const isContentEditable = activeEl.hasAttribute('contenteditable') || activeEl.getAttribute('contenteditable') === 'true';
        if (isInput || isContentEditable) {
          return;
        }
      }

      // Avoid overriding standard browser shortcuts (ctrl, cmd, alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();
      const targetView = shortcuts[key];
      if (targetView) {
        // Verify user permissions before navigating!
        if (currentUser) {
          const perms = currentUser.permissions || {};
          let hasAccess = false;
          
          if (targetView === 'dashboard' && perms.dashboard !== 'none') hasAccess = true;
          else if (targetView === 'orders' && perms.orders !== 'none') hasAccess = true;
          else if (targetView === 'timeline' && perms.timeline !== 'none') hasAccess = true;
          else if (targetView === 'bottleneck' && currentUser.role === 'admin') hasAccess = true;
          else if (targetView === 'production-capacity' && currentUser.role === 'admin') hasAccess = true;
          else if (targetView.startsWith('config') && (perms.config !== 'none' || perms.stopReasons !== 'none')) hasAccess = true;
          else if (targetView.startsWith('sector-')) {
            const sectorId = targetView.replace('sector-', '');
            if (perms.sectors && perms.sectors[sectorId] && perms.sectors[sectorId] !== 'none') {
              hasAccess = true;
            }
          }

          if (hasAccess) {
            e.preventDefault();
            setActiveView(targetView);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, currentUser]);

  React.useEffect(() => {
    // Theme Initialization
    const savedTheme = localStorage.getItem('texflow-theme') as 'light' | 'dark';
    if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
        // Default to Light mode if no preference saved
        setTheme('light');
        document.documentElement.classList.remove('dark');
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Monitor network status
    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue().then(() => {
        // Automatically reload data from DB just in case sync affected anything locally or to fetch new stuff
      }).catch(console.error);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and queue processing
    if (navigator.onLine) {
      processSyncQueue().catch(console.error);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleTheme = () => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
      localStorage.setItem('texflow-theme', newTheme);
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('Utilizador aceitou a instalação');
    }
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  // Auto-dismiss notification
  React.useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Supabase Keep-Alive automatic routine (runs once on mount, pings if bi-weekly interval elapsed)
  React.useEffect(() => {
    if (isOnline) {
      checkAndRunAutoPing().catch(err => {
        console.warn('Supabase automatic keep-alive check failed:', err);
      });
    }
  }, [isOnline]);

  // Initialize from IndexedDB
  React.useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const [savedData, savedStopReasons, initialUsers, savedCapacities] = await Promise.all([
          loadOrdersFromDB(),
          loadStopReasonsFromDB(),
          initializeDefaultUsers(),
          loadCapacitiesFromDB()
        ]);

        if (savedData && savedData.orders.length > 0) {
          setOrders(savedData.orders);
          setExcelHeaders(savedData.headers);
        } else {
          // Iniciar vazio se não houver dados
          setOrders([]);
        }

        if (savedStopReasons) {
          setStopReasons(savedStopReasons);
        }

        if (initialUsers) {
          setUsers(initialUsers);
        }

        if (savedCapacities && savedCapacities.length > 0) {
          setCapacities(savedCapacities);
        }
      } catch (e) {
        console.error("Erro ao carregar dados:", e);
        setOrders([]);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  // Supabase Real-Time Subscriptions
  React.useEffect(() => {
    const ordersSubscription = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const newOrder = hydrateOrder(payload.new);
              setOrders(prev => {
                  const existing = prev.find(o => o.id === newOrder.id);
                  // Disparar Notificação Push em tempo real
                  notificationService.handleRealtimeOrderChange(existing, newOrder);

                  if (existing) {
                      return prev.map(o => o.id === newOrder.id ? newOrder : o);
                  } else {
                      return [...prev, newOrder];
                  }
              });
          } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setOrders(prev => prev.filter(o => o.id !== deletedId));
          }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersSubscription);
    };
  }, []);

  const handleUpdateOrder = (updatedOrder: Order) => {
    const oldOrder = orders.find(o => o.id === updatedOrder.id);
    if (!oldOrder) return;

    let finalOrder = { ...updatedOrder };
    
    // Check for predicted date changes
    const oldDates = oldOrder.sectorPredictedDates || {};
    const newDates = updatedOrder.sectorPredictedDates || {};

    // Find which sector changed
    const changedSectorId = Object.keys(newDates).find(id => {
        const oldDate = oldDates[id];
        const newDate = newDates[id];
        if (!oldDate && !newDate) return false;
        if (!oldDate || !newDate) return true;
        return new Date(oldDate).getTime() !== new Date(newDate).getTime();
    });

    if (changedSectorId) {
        const sectorIndex = SECTORS.findIndex(s => s.id === changedSectorId);
        if (sectorIndex !== -1) {
            const oldDate = oldDates[changedSectorId];
            const newDate = newDates[changedSectorId];

            // If it was pending, clear it because the user just validated/changed it
            const pending = { ...(finalOrder.sectorPredictedDatesPending || {}) };
            delete pending[changedSectorId];
            finalOrder.sectorPredictedDatesPending = pending;

            if (newDate) {
                // Calculate delay relative to the previous predicted date or base date
                let baseDate: Date | null = null;
                switch (changedSectorId) {
                    case 'tecelagem': baseDate = oldOrder.dataTec; break;
                    case 'felpo_cru': baseDate = oldOrder.felpoCruDate; break;
                    case 'tinturaria': baseDate = oldOrder.tinturariaDate; break;
                    case 'confeccao': baseDate = oldOrder.confDate; break;
                    case 'embalagem': baseDate = oldOrder.armExpDate; break;
                    case 'expedicao': baseDate = oldOrder.armExpDate; break;
                }

                const referenceDate = oldDate || baseDate;
                if (referenceDate) {
                    const diffTime = new Date(newDate).getTime() - new Date(referenceDate).getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays !== 0) {
                        // Propagate to subsequent sectors
                        const updatedPredictedDates = { ...newDates };
                        const updatedPending = { ...(finalOrder.sectorPredictedDatesPending || {}) };

                        for (let i = sectorIndex + 1; i < SECTORS.length; i++) {
                            const s = SECTORS[i];
                            let sBaseDate: Date | null = null;
                            switch (s.id) {
                                case 'tecelagem': sBaseDate = oldOrder.dataTec; break;
                                case 'felpo_cru': sBaseDate = oldOrder.felpoCruDate; break;
                                case 'tinturaria': sBaseDate = oldOrder.tinturariaDate; break;
                                case 'confeccao': sBaseDate = oldOrder.confDate; break;
                                case 'embalagem': sBaseDate = oldOrder.armExpDate; break;
                                case 'expedicao': sBaseDate = oldOrder.armExpDate; break;
                            }

                            const currentPredDate = updatedPredictedDates[s.id] || sBaseDate;

                            if (currentPredDate) {
                                const nextDate = new Date(currentPredDate);
                                nextDate.setDate(nextDate.getDate() + diffDays);
                                updatedPredictedDates[s.id] = nextDate;
                                updatedPending[s.id] = true; // Mark as pending
                            }
                        }
                        finalOrder.sectorPredictedDates = updatedPredictedDates;
                        finalOrder.sectorPredictedDatesPending = updatedPending;
                    }
                }
            }
        }
        
        // Record Audit History for all changed sectors
        if (currentUser) {
            const finalDates = finalOrder.sectorPredictedDates || {};
            const historyArray = [...(finalOrder.predictedDatesHistory || [])];
            let hasChanges = false;
            
            // Collect changes from final order vs old order
            SECTORS.forEach(s => {
                const oDate = oldDates[s.id] ? new Date(oldDates[s.id]).getTime() : null;
                const fDate = finalDates[s.id] ? new Date(finalDates[s.id]).getTime() : null;
                
                if (oDate !== fDate) {
                    historyArray.push({
                        sectorId: s.id,
                        oldDate: oldDates[s.id] || null,
                        newDate: finalDates[s.id] || null,
                        changedBy: currentUser.username,
                        changedAt: new Date()
                    });
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                finalOrder.predictedDatesHistory = historyArray;
            }
        }
    }

    setOrders(prev => prev.map(o => o.id === finalOrder.id ? finalOrder : o));
    saveOrderToDB(finalOrder);

    // Se for encomenda urgente e houve alteração relevante, despacha push alert para os gestores
    if (finalOrder.priority && finalOrder.priority > 0 && changedSectorId) {
      const changedSector = SECTORS.find(s => s.id === changedSectorId);
      const newD = finalOrder.sectorPredictedDates?.[changedSectorId];
      if (newD) {
        notificationService.notifyUrgentOrderChange({
          orderDocNr: finalOrder.docNr,
          clientName: finalOrder.clientName,
          changeType: 'PREDICTION_CHANGED',
          description: `Setor ${changedSector?.name || changedSectorId}: Nova previsão ${new Date(newD).toLocaleDateString('pt-PT')}`,
          priority: finalOrder.priority,
          changedBy: currentUser?.name || currentUser?.username
        });
      }
    }
  };
  
  // Função para atualizar prioridade em lote (por Nr Doc)
  const handleUpdatePriority = (docNr: string, priority: number) => {
    const updated = orders.filter(o => o.docNr === docNr).map(o => ({ ...o, priority }));
    setOrders(prev => prev.map(o => o.docNr === docNr ? { ...o, priority } : o));
    updated.forEach(saveOrderToDB);

    // Se passou a ser urgente ou mudou prioridade de urgente, envia push notification aos gestores
    if (priority > 0) {
      const sample = orders.find(o => o.docNr === docNr);
      const labels: Record<number, string> = { 1: 'Alta (Vermelho)', 2: 'Média (Laranja)', 3: 'Baixa (Amarelo)' };
      notificationService.notifyUrgentOrderChange({
        orderDocNr: docNr,
        clientName: sample?.clientName || 'Cliente',
        changeType: 'PRIORITY_CHANGED',
        description: `Prioridade alterada para ${labels[priority] || priority} — Encomenda Urgente`,
        priority,
        changedBy: currentUser?.name || currentUser?.username
      });
    }
  };

  // Função para atualizar flag manual em lote (por Nr Doc)
  const handleUpdateManual = (docNr: string, isManual: boolean) => {
    const updated = orders.filter(o => o.docNr === docNr).map(o => ({ ...o, isManual }));
    setOrders(prev => prev.map(o => o.docNr === docNr ? { ...o, isManual } : o));
    updated.forEach(saveOrderToDB);
  };

  // Função para arquivar/desarquivar encomenda (por Nr Doc, apenas admin)
  const handleArchiveOrder = (docNr: string, archive: boolean) => {
    const now = new Date();
    const updated = orders.filter(o => o.docNr === docNr).map(o => ({
        ...o,
        isArchived: archive,
        archivedAt: archive ? now : null,
        archivedBy: archive ? (currentUser?.name || 'Admin') : undefined
    }));
    
    setOrders(prev => prev.map(o => {
      if (o.docNr === docNr) {
        return {
          ...o,
          isArchived: archive,
          archivedAt: archive ? now : null,
          archivedBy: archive ? (currentUser?.name || 'Admin') : undefined
        };
      }
      return o;
    }));

    updated.forEach(saveOrderToDB);
  };

  // Função para atualizar várias encomendas em lote
  const handleUpdateMultipleOrders = (updatedOrders: Order[]) => {
    if (!updatedOrders || updatedOrders.length === 0) return;
    const idMap = new Map(updatedOrders.map(u => [u.id, u]));
    setOrders(prev => prev.map(o => idMap.get(o.id) || o));
    updatedOrders.forEach(saveOrderToDB);
  };

  // Função para atualizar motivo de paragem, data prevista e observações (com suporte a escopo/itens específicos)
  const handleUpdateStopReason = (
    docNr: string, 
    sectorId: string, 
    stopReason: string, 
    observation?: string, 
    targetOrderIds?: string[],
    predictedDate?: Date | null
  ) => {
    const isTargeted = targetOrderIds && targetOrderIds.length > 0;
    const targetSet = isTargeted ? new Set(targetOrderIds) : null;

    const updated = orders
      .filter(o => targetSet ? targetSet.has(o.id) : o.docNr === docNr)
      .map(o => {
        const nextSectorObservations = { ...(o.sectorObservations || {}) };
        if (observation !== undefined) {
          if (observation.trim() !== '') {
            nextSectorObservations[sectorId] = observation.trim();
          } else {
            delete nextSectorObservations[sectorId];
          }
        }

        const nextStopReasons = { ...(o.sectorStopReasons || {}) };
        if (stopReason && stopReason.trim() !== '') {
          nextStopReasons[sectorId] = stopReason.trim();
        } else {
          delete nextStopReasons[sectorId];
        }

        const nextSectorPredictedDates = { ...(o.sectorPredictedDates || {}) };
        const nextPending = { ...(o.sectorPredictedDatesPending || {}) };

        if (predictedDate !== undefined) {
          if (predictedDate === null) {
            delete nextSectorPredictedDates[sectorId];
          } else {
            nextSectorPredictedDates[sectorId] = predictedDate;
          }
          delete nextPending[sectorId];
        }

        let nextRequestedDate = o.requestedDate;
        let nextDeliveryWeek = o.deliveryWeek;
        let nextGeneralClassification = o.generalClassification;
        let nextGeneralPredictedDate = o.generalPredictedDate;
        let nextGeneralObservation = o.generalObservation;
        const nextOriginalRequestedDate = o.originalRequestedDate || o._raw?.['Data Pedida'] || o._raw?.['requestedDate'] || o.requestedDate;

        if (sectorId === 'planeamento') {
          // Classificação Geral
          if (stopReason !== undefined) {
            nextGeneralClassification = stopReason.trim() ? stopReason.trim() : undefined;
          }
          // Observação Geral
          if (observation !== undefined) {
            nextGeneralObservation = observation.trim() ? observation.trim() : undefined;
          }
          // Data Prevista Geral & Sobreposição à Data de Entrega Prevista
          if (predictedDate !== undefined) {
            if (predictedDate === null) {
              nextGeneralPredictedDate = null;
              // Repor data original de entrega pedida
              nextRequestedDate = nextOriginalRequestedDate;
              nextDeliveryWeek = nextRequestedDate ? getISOWeek(nextRequestedDate) : null;
            } else {
              nextGeneralPredictedDate = predictedDate;
              // A nova data sobrepõe-se à data de entrega prevista
              nextRequestedDate = predictedDate;
              nextDeliveryWeek = getISOWeek(predictedDate);
            }
          }
        }

        return {
          ...o,
          sectorStopReasons: nextStopReasons,
          sectorObservations: nextSectorObservations,
          sectorPredictedDates: nextSectorPredictedDates,
          sectorPredictedDatesPending: nextPending,
          requestedDate: nextRequestedDate,
          deliveryWeek: nextDeliveryWeek,
          generalClassification: nextGeneralClassification,
          generalPredictedDate: nextGeneralPredictedDate,
          generalObservation: nextGeneralObservation,
          originalRequestedDate: nextOriginalRequestedDate
        };
      });

    const updatedIdMap = new Map(updated.map(u => [u.id, u]));
    setOrders(prev => prev.map(o => updatedIdMap.get(o.id) || o));
    updated.forEach(saveOrderToDB);

    // Se a encomenda for urgente e foi adicionado um motivo de paragem, alerta os gestores
    const targetOrder = orders.find(o => o.docNr === docNr);
    if (targetOrder?.priority && targetOrder.priority > 0 && stopReason) {
      const s = SECTORS.find(sec => sec.id === sectorId);
      notificationService.notifyUrgentOrderChange({
        orderDocNr: docNr,
        clientName: targetOrder.clientName,
        changeType: 'STOP_REASON',
        description: `Paragem no Setor ${s?.name || sectorId}: "${stopReason}"${observation ? ` - Obs: ${observation}` : ''}`,
        priority: targetOrder.priority,
        changedBy: currentUser?.name || currentUser?.username
      });
    }
  };

  const handleSaveCapacities = async (newCapacities: ProductionCapacity[]) => {
    setCapacities(newCapacities);
    try {
      await saveCapacitiesToDB(newCapacities);
      setNotification({ message: 'Capacidades de produção guardadas persistentemente.', type: 'success' });
    } catch (err) {
      console.error('Erro ao guardar capacidades:', err);
      setNotification({ message: 'Capacidades guardadas localmente.', type: 'info' });
    }
  };

  const handleUpdateStopReasonsHierarchy = (newHierarchy: any[]) => {    setStopReasons(newHierarchy);
    saveStopReasonsToDB(newHierarchy).catch(err => console.error("Erro ao guardar motivos:", err));
  };

  const handleSaveUser = async (user: User) => {
    await saveUserToDB(user);
    const updatedUsers = await loadUsersFromDB();
    setUsers(updatedUsers);
    if (currentUser && currentUser.id === user.id) {
      setCurrentUser(user);
    }
    setNotification({ message: 'Utilizador e preferências guardadas com sucesso.', type: 'success' });
  };

  const handleDeleteUser = async (userId: string) => {
    await deleteUserFromDB(userId);
    const updatedUsers = await loadUsersFromDB();
    setUsers(updatedUsers);
    setNotification({ message: 'Utilizador removido com sucesso.', type: 'success' });
  };

  const handleImport = (
    baseData: { orders: Order[], headers: Record<string, string> } | null, 
    newData: { orders: Order[], headers: Record<string, string> } | null
  ) => {
    let finalOrders: Order[] = [];
    let finalHeaders: Record<string, string> = {};
    let message = "";

    // 1. Catalogar todo o histórico de arquivamento existente
    // Mapear por docNr (documento completo), por chave composta docNr-itemNr e por id
    const archivedItemMap = new Map<string, { isArchived: boolean; archivedAt: Date | null; archivedBy?: string }>();
    const archivedDocMap = new Map<string, { isArchived: boolean; archivedAt: Date | null; archivedBy?: string }>();

    const recordArchived = (orderList: Order[]) => {
      orderList.forEach(o => {
        if (o.isArchived) {
          const info = {
            isArchived: true,
            archivedAt: o.archivedAt ? new Date(o.archivedAt) : new Date(),
            archivedBy: o.archivedBy || currentUser?.name || 'Admin'
          };
          const docKey = String(o.docNr || '').trim();
          if (docKey) {
            archivedDocMap.set(docKey, info);
            if (o.itemNr !== undefined && o.itemNr !== null) {
              archivedItemMap.set(`${docKey}-${o.itemNr}`, info);
            }
          }
          if (o.id) {
            archivedItemMap.set(String(o.id).trim(), info);
          }
        }
      });
    };

    // Registar arquivo das encomendas atuais em memória, do ficheiro base e dos novos dados
    recordArchived(orders);
    if (baseData?.orders) recordArchived(baseData.orders);
    if (newData?.orders) recordArchived(newData.orders);

    const getCompositeKey = (o: Order) => `${String(o.docNr || '').trim()}-${o.itemNr}`;

    // Função de fusão que preserva estritamente o estado de arquivo e alterações manuais do utilizador
    const mergeWithExisting = (newOrder: Order, existing?: Order): Order => {
      const docKey = String(newOrder.docNr || '').trim();
      const itemKey = getCompositeKey(newOrder);
      const idKey = String(newOrder.id || '').trim();

      const existingItemArchive = existing?.isArchived ? {
        isArchived: true,
        archivedAt: existing.archivedAt,
        archivedBy: existing.archivedBy
      } : (archivedItemMap.get(itemKey) || (idKey ? archivedItemMap.get(idKey) : undefined));

      const existingDocArchive = archivedDocMap.get(docKey);

      const isArchived = Boolean(
        newOrder.isArchived ||
        existing?.isArchived ||
        existingItemArchive?.isArchived ||
        existingDocArchive?.isArchived
      );

      const archivedAt = newOrder.archivedAt ||
        existing?.archivedAt ||
        existingItemArchive?.archivedAt ||
        existingDocArchive?.archivedAt ||
        (isArchived ? (existing?.archivedAt || new Date()) : null);

      const archivedBy = newOrder.archivedBy ||
        existing?.archivedBy ||
        existingItemArchive?.archivedBy ||
        existingDocArchive?.archivedBy ||
        (isArchived ? (existing?.archivedBy || currentUser?.name || 'Admin') : undefined);

      if (!existing) {
        return {
          ...newOrder,
          isArchived,
          archivedAt,
          archivedBy
        };
      }

      const mergedSectorObs = { ...(existing.sectorObservations || {}), ...(newOrder.sectorObservations || {}) };
      const mergedSectorDates = { ...(existing.sectorPredictedDates || {}), ...(newOrder.sectorPredictedDates || {}) };
      const mergedSectorPending = { ...(existing.sectorPredictedDatesPending || {}), ...(newOrder.sectorPredictedDatesPending || {}) };
      const mergedSectorReasons = { ...(existing.sectorStopReasons || {}), ...(newOrder.sectorStopReasons || {}) };

      const genClass = existing.generalClassification || newOrder.generalClassification;
      const genPredDate = existing.generalPredictedDate || newOrder.generalPredictedDate;
      const genObs = existing.generalObservation || newOrder.generalObservation;
      const origReqDate = existing.originalRequestedDate || newOrder.originalRequestedDate || newOrder.requestedDate;

      // Se houver nova data de planeamento, sobrepõe-se à data prevista
      const effectiveReqDate = genPredDate || newOrder.requestedDate;

      return {
        ...newOrder,
        id: existing.id || newOrder.id,
        priority: existing.priority !== undefined ? existing.priority : newOrder.priority,
        isManual: existing.isManual !== undefined ? existing.isManual : newOrder.isManual,
        sectorObservations: mergedSectorObs,
        sectorPredictedDates: mergedSectorDates,
        sectorPredictedDatesPending: mergedSectorPending,
        sectorStopReasons: mergedSectorReasons,
        generalClassification: genClass,
        generalPredictedDate: genPredDate,
        generalObservation: genObs,
        originalRequestedDate: origReqDate,
        requestedDate: effectiveReqDate,
        deliveryWeek: effectiveReqDate ? getISOWeek(effectiveReqDate) : newOrder.deliveryWeek,
        isArchived,
        archivedAt,
        archivedBy
      };
    };

    if (baseData && newData) {
      // 1. Fusão de SQLite Base com Novos Dados Excel
      const mergedMap = new Map<string, Order>();
      let addedCount = 0;
      let updatedCount = 0;

      baseData.orders.forEach(o => {
        if (o.docNr) mergedMap.set(getCompositeKey(o), mergeWithExisting(o));
      });

      newData.orders.forEach(newOrder => {
        if (!newOrder.docNr) return;
        const key = getCompositeKey(newOrder);
        const existing = mergedMap.get(key);
        if (existing) {
          updatedCount++;
          mergedMap.set(key, mergeWithExisting(newOrder, existing));
        } else {
          addedCount++;
          mergedMap.set(key, mergeWithExisting(newOrder));
        }
      });

      // Preservar encomendas arquivadas do estado da app que não constem no baseData nem no newData
      orders.forEach(o => {
        if (o.isArchived && o.docNr) {
          const key = getCompositeKey(o);
          if (!mergedMap.has(key)) {
            mergedMap.set(key, o);
          }
        }
      });

      finalOrders = Array.from(mergedMap.values());
      finalHeaders = { ...baseData.headers, ...newData.headers };
      const archivedCount = finalOrders.filter(o => o.isArchived).length;
      message = `Importação concluída: ${addedCount} novas linhas adicionadas, ${updatedCount} atualizadas (${archivedCount} arquivadas preservadas).`;

    } else if (newData && !baseData) {
      // 2. Upload de novos dados (Excel ou SQLite)
      if (orders.length > 0) {
        const mergedMap = new Map<string, Order>();
        let addedCount = 0;
        let updatedCount = 0;

        orders.forEach(o => {
          if (o.docNr) mergedMap.set(getCompositeKey(o), o);
        });

        newData.orders.forEach(newOrder => {
          if (!newOrder.docNr) return;
          const key = getCompositeKey(newOrder);
          const existing = mergedMap.get(key);
          if (existing) {
            updatedCount++;
            mergedMap.set(key, mergeWithExisting(newOrder, existing));
          } else {
            addedCount++;
            mergedMap.set(key, mergeWithExisting(newOrder));
          }
        });

        // Garantir que encomendas arquivadas pré-existentes na app nunca desaparecem
        orders.forEach(o => {
          if (o.isArchived && o.docNr) {
            const key = getCompositeKey(o);
            if (!mergedMap.has(key)) {
              mergedMap.set(key, o);
            }
          }
        });

        finalOrders = Array.from(mergedMap.values());
        finalHeaders = { ...excelHeaders, ...newData.headers };
        const archivedCount = finalOrders.filter(o => o.isArchived).length;
        message = `Dados atualizados com sucesso: ${updatedCount} linhas atualizadas, ${addedCount} novas (${archivedCount} arquivadas preservadas).`;
      } else {
        finalOrders = newData.orders.map(o => mergeWithExisting(o));
        finalHeaders = newData.headers;
        const archivedCount = finalOrders.filter(o => o.isArchived).length;
        message = `Dados importados com ${finalOrders.length} registos (${archivedCount} arquivadas).`;
      }

    } else if (baseData && !newData) {
      // 3. Upload de ficheiro SQLite Base
      const mergedMap = new Map<string, Order>();
      baseData.orders.forEach(o => {
        if (o.docNr) mergedMap.set(getCompositeKey(o), mergeWithExisting(o));
      });

      // Preservar encomendas arquivadas da sessão atual caso não estejam no SQLite
      orders.forEach(o => {
        if (o.isArchived && o.docNr) {
          const key = getCompositeKey(o);
          if (!mergedMap.has(key)) {
            mergedMap.set(key, o);
          }
        }
      });

      finalOrders = Array.from(mergedMap.values());
      finalHeaders = baseData.headers;
      const archivedCount = finalOrders.filter(o => o.isArchived).length;
      message = `Base de dados carregada com ${finalOrders.length} registos (${archivedCount} arquivadas preservadas).`;
    }

    // Validação e garantia final de integridade de estado arquivado
    finalOrders = finalOrders.map(order => {
      const docKey = String(order.docNr || '').trim();
      const itemKey = getCompositeKey(order);
      const idKey = String(order.id || '').trim();

      const docArchive = archivedDocMap.get(docKey);
      const itemArchive = archivedItemMap.get(itemKey) || (idKey ? archivedItemMap.get(idKey) : undefined);

      if (order.isArchived || docArchive?.isArchived || itemArchive?.isArchived) {
        return {
          ...order,
          isArchived: true,
          archivedAt: order.archivedAt || docArchive?.archivedAt || itemArchive?.archivedAt || new Date(),
          archivedBy: order.archivedBy || docArchive?.archivedBy || itemArchive?.archivedBy || currentUser?.name || 'Admin'
        };
      }
      return order;
    });

    setOrders(finalOrders);
    setExcelHeaders(finalHeaders);
    setIsImportModalOpen(false);
    setNotification({ message, type: 'success' });
    setActiveView('orders');
    
    // Guardar imediatamente no banco de dados local / Supabase
    saveOrdersToDB(finalOrders, finalHeaders);
  };
  
  const handleResetData = async () => {
    if (window.confirm("ATENÇÃO: Tem a certeza que deseja apagar todos os dados?\n\nEsta ação irá limpar a base de dados local e remover todas as encomendas importadas.")) {
        setIsLoading(true);
        try {
            await clearOrdersFromDB();
            setOrders([]); 
            setExcelHeaders({});
            setNotification({ message: 'Dados da aplicação limpos com sucesso.', type: 'success' });
        } catch (error) {
            console.error(error);
            setNotification({ message: 'Erro ao limpar dados.', type: 'info' });
        } finally {
            setIsLoading(false);
        }
    }
  };

  const selectedOrder = React.useMemo(() => 
    orders.find(o => o.id === selectedOrderId) || null
  , [orders, selectedOrderId]);

  const handleViewDetails = React.useCallback((order: Order) => {
    setPreviousView(activeView);
    setSelectedOrderId(order.id);
    setActiveView('order-details');
  }, [activeView]);

  // Abertura e foco automático em encomendas quando o utilizador clica numa Notificação Push
  React.useEffect(() => {
    const handlePushMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'PUSH_NOTIFICATION_CLICK') {
        const docNr = e.data.data?.docNr;
        if (docNr) {
          const match = orders.find(o => o.docNr === docNr);
          if (match) {
            handleViewDetails(match);
          }
        }
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', handlePushMessage);
    }

    // Se a aplicação abriu a partir de um link da notificação push (?docNr=...)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlDocNr = params.get('docNr');
      if (urlDocNr && orders.length > 0) {
        const match = orders.find(o => o.docNr === urlDocNr);
        if (match) {
          handleViewDetails(match);
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        }
      }
    } catch (err) {
      console.warn('Erro ao ler docNr da URL:', err);
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', handlePushMessage);
      }
    };
  }, [orders, handleViewDetails]);
  
  // Função chamada pelo Dashboard ao clicar num cartão
  const handleNavigateToOrders = (filter: ActiveFilterType) => {
      setActiveDashboardFilter(filter);
      setActiveView('orders');
  };
  
  const getFirstAvailableView = (user: User | null): string => {
    if (!user || !user.permissions) return 'login';

    const perms = user.permissions;
    if (perms.dashboard && perms.dashboard !== 'none') return 'dashboard';
    if (perms.orders && perms.orders !== 'none') return 'orders';
    if (perms.timeline && perms.timeline !== 'none') return 'timeline';

    const sectors = perms.sectors || {};
    const firstSector = SECTORS.find(s => sectors[s.id] && sectors[s.id] !== 'none');
    if (firstSector) return `sector-${firstSector.id}`;

    if ((perms.config && perms.config !== 'none') || (perms.stopReasons && perms.stopReasons !== 'none')) return 'config';

    return 'none';
  };

  // Reset do filtro ao mudar de vista manualmente
  const handleSetActiveView = (view: string) => {
      if (view !== 'orders') setActiveDashboardFilter(null);
      if (view !== 'order-details') setSelectedOrderId(null);
      setActiveView(view);
  };

  const globalFilteredOrders = React.useMemo(() => {
     if (globalSearchTerm && globalSearchTerm.trim().length > 0) return orders;
     if (!globalDateRange?.start || !globalDateRange?.end) return orders;
     
     const start = new Date(globalDateRange.start);
     start.setHours(0, 0, 0, 0);
     const end = new Date(globalDateRange.end);
     end.setHours(23, 59, 59, 999);

     return orders.filter(o => {
         const dateToCheck = o.requestedDate || o.dataEnt || o.issueDate;
         if (!dateToCheck) return false;
         const d = new Date(dateToCheck);
         return d >= start && d <= end;
     });
  }, [orders, globalDateRange, globalSearchTerm]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 dark:text-slate-500">
          <Loader2 size={40} className="animate-spin text-blue-500" />
          <p className="text-sm font-medium">A carregar a sua produção...</p>
        </div>
      );
    }

    if (activeView.startsWith('sector-')) {
        const sectorId = activeView.replace('sector-', '');
        const sector = SECTORS.find(s => s.id === sectorId);

        // Permission Check
        const sectors = currentUser?.permissions?.sectors || {};
        const permission = sectors[sectorId] || 'none';
        if (permission === 'none') {
            const nextView = getFirstAvailableView(currentUser);
            if (nextView !== activeView) {
                setActiveView(nextView);
            }
            return null;
        }

        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-hidden">
                    <SectorOrderTable 
                        key={sector.id}
                        orders={globalFilteredOrders} 
                        allOrders={orders}
                        sector={sector!}
                        onViewDetails={handleViewDetails} 
                        onUpdateOrder={handleUpdateOrder}
                        onUpdateMultipleOrders={handleUpdateMultipleOrders}
                        stopReasonsHierarchy={stopReasons}
                        user={currentUser}
                        capacities={capacities}
                        globalSearchTerm={globalSearchTerm}
                    />
                </div>
            </div>
        );
    }

    switch (activeView) {
      case 'dashboard':
        if (!currentUser?.permissions?.dashboard || currentUser?.permissions?.dashboard === 'none') {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'dashboard') { setActiveView(fallback); return null; }
        }
        return <Dashboard orders={globalFilteredOrders} onNavigateToOrders={handleNavigateToOrders} onViewDetails={handleViewDetails} />;
      case 'orders':
        if (!currentUser?.permissions?.orders || currentUser?.permissions?.orders === 'none') {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'orders') { setActiveView(fallback); return null; }
        }
        return <OrderTable 
          orders={globalFilteredOrders} 
          onViewDetails={handleViewDetails} 
          excelHeaders={excelHeaders} 
          activeFilter={activeDashboardFilter}
          user={currentUser} 
          onUpdatePriority={handleUpdatePriority}
          onUpdateManual={handleUpdateManual}
          onUpdateStopReason={handleUpdateStopReason}
          stopReasonsHierarchy={stopReasons}
          onArchiveOrder={handleArchiveOrder}
          globalSearchTerm={globalSearchTerm}
        />;
      case 'order-position':
        if (!currentUser?.permissions?.orders || currentUser?.permissions?.orders === 'none') {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'order-position') { setActiveView(fallback); return null; }
        }
        return (
          <OrderPosition 
            orders={globalFilteredOrders} 
            onViewDetails={handleViewDetails} 
            globalSearchTerm={globalSearchTerm}
            user={currentUser}
          />
        );
      case 'timeline':
        if (!currentUser?.permissions?.timeline || currentUser?.permissions?.timeline === 'none') {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'timeline') { setActiveView(fallback); return null; }
        }
        return <OrderTimeline orders={globalFilteredOrders} onViewDetails={handleViewDetails} globalSearchTerm={globalSearchTerm} />;
      case 'config':
      case 'config-general':
      case 'config-notifications':
      case 'config-users':
      case 'config-stop-reasons':
      case 'config-export-columns':
        const resolvedTabConfig = activeView === 'config' ? 'general' : activeView.replace('config-', '');
        const hasConfigPerm = currentUser?.permissions?.config && currentUser?.permissions?.config !== 'none';
        const hasStopPerm = currentUser?.permissions?.stopReasons && currentUser?.permissions?.stopReasons !== 'none';
        if (!hasConfigPerm && !hasStopPerm) {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'config') { setActiveView(fallback); return null; }
        }
        return (
          <Settings
            currentUser={currentUser}
            currentTheme={theme}
            onToggleTheme={toggleTheme}
            onResetData={handleResetData}
            users={users}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            stopReasonsHierarchy={stopReasons}
            onUpdateStopReasonsHierarchy={handleUpdateStopReasonsHierarchy}
            orders={globalFilteredOrders}
            activeTab={resolvedTabConfig as any}
            onTabChange={(t) => setActiveView(`config-${t}`)}
            shortcuts={shortcuts}
            onUpdateShortcuts={handleUpdateShortcuts}
          />
        );
      case 'bottleneck':
        if (currentUser?.role !== 'admin') return null;
        return (
          <BottleneckAnalysis
            orders={globalFilteredOrders}
            capacities={capacities}
            onNavigateToCapacities={() => setActiveView('production-capacity')}
          />
        );
      case 'production-capacity':
        if (currentUser?.role !== 'admin') return null;
        return (
          <ProductionCapacityPage
            capacities={capacities}
            orders={orders}
            onSave={handleSaveCapacities}
            onNavigateToBottleneck={() => setActiveView('bottleneck')}
          />
        );
      case 'stop-reasons':
        return <StopReasons hierarchy={stopReasons} onUpdateHierarchy={handleUpdateStopReasonsHierarchy} />;
      case 'order-details':
        return selectedOrder ? (
          <OrderDetails
            order={selectedOrder}
            allOrders={orders}
            onClose={() => {
              setActiveView(previousView || 'orders');
              setSelectedOrderId(null);
            }}
            onUpdateOrder={handleUpdateOrder}
            onUpdateMultipleOrders={handleUpdateMultipleOrders}
            user={currentUser}
            stopReasonsHierarchy={stopReasons}
          />
        ) : null;
      case 'none':
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4">
                    <X size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Acesso Restrito</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs">Não tem permissões para visualizar nenhuma página do sistema. Contacte o administrador.</p>
                <button
                    onClick={handleLogout}
                    className="mt-6 text-blue-600 font-bold hover:underline"
                >
                    Voltar ao Login
                </button>
            </div>
        );
      // BUG 7 CORRIGIDO: o case 'default' omitia a prop onNavigateToOrders,
      // o que causaria erro em runtime se o Dashboard tentasse navegar para as encomendas.
      default:
        return <Dashboard orders={globalFilteredOrders} onNavigateToOrders={handleNavigateToOrders} onViewDetails={handleViewDetails} />;
    }
  };

  const alertCount = React.useMemo(() => {
    let currentSectorId: string | null = null;
    if (activeView.startsWith('sector-')) {
        currentSectorId = activeView.replace('sector-', '');
    }

    const alertOrders = orders.filter(o => {
        const hasObs = o.sectorObservations && Object.values(o.sectorObservations).some(v => typeof v === 'string' && v.trim() !== '');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let dateToCheck = o.requestedDate;
        if (currentSectorId) {
            switch (currentSectorId) {
              case 'tecelagem': dateToCheck = o.dataTec; break;
              case 'felpo_cru': dateToCheck = o.felpoCruDate; break;
              case 'tinturaria': dateToCheck = o.tinturariaDate; break;
              case 'confeccao': dateToCheck = o.confDate; break;
              case 'embalagem': dateToCheck = o.armExpDate; break;
              case 'expedicao': dateToCheck = o.armExpDate; break;
            }
        }
        
        const isLate = dateToCheck && dateToCheck < today && o.qtyOpen > 0;
        
        return hasObs || isLate;
    });
    
    const uniqueDocs = new Set(alertOrders.map(o => o.docNr));
    return uniqueDocs.size;
  }, [orders, activeView]);

  // Se não estiver logado, mostra apenas o Login
  const handleGlobalSearch = (term: string) => {
    setGlobalSearchTerm(term);
    if (term) {
      if (activeView !== 'orders' && !activeView.startsWith('sector-')) {
        handleSetActiveView('orders');
      }
    }
  };

  if (!currentUser) {
    const doLogin = (user: User) => {
      // Determinar vista inicial baseada em permissões
      let initialView = user.role === 'admin' ? 'dashboard' : 'orders';
      const perms: any = user.permissions;
      if (perms[initialView] === 'none') {
        initialView = getFirstAvailableView(user);
      }
      setCurrentUser(user);
      setActiveView(initialView);
    };

    return (
      <Login 
        lockoutUntil={loginLockoutUntil}
        onSetLockoutUntil={setLoginLockoutUntil}
        onLogin={async (user) => {
          doLogin(user);
        }} 
      />
    );
  }

  return (
    <>
      {!isOnline && (
        <div className="fixed bottom-6 right-6 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center justify-center gap-2 z-[120] animate-in slide-in-from-bottom duration-300 shadow-2xl border border-amber-400">
          <WifiOff size={12} />
          Modo Offline
        </div>
      )}

      {showInstallBanner && (
        <div className="fixed bottom-6 right-6 md:w-80 z-[110] animate-in slide-in-from-bottom duration-500">
          <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-2xl shadow-2xl border border-blue-500 dark:border-blue-600 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg"><Download size={20} /></div>
              <div>
                <h4 className="font-bold text-xs uppercase tracking-tight">Instalar Prod. Lasa</h4>
                <p className="text-[10px] opacity-80 leading-tight">Aceda mais rápido.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleInstallClick} className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-transform active:scale-95">Instalar</button>
              <button onClick={() => setShowInstallBanner(false)} className="p-1 hover:bg-white/10 rounded-full"><X size={16}/></button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-6 right-6 z-[115] animate-in slide-in-from-bottom duration-300 max-w-md">
            <div className="bg-slate-800 dark:bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-start gap-4 border border-slate-700 dark:border-slate-800">
                <div className="bg-emerald-500 rounded-full p-1 mt-0.5 shrink-0 text-slate-900">
                    <CheckCircle2 size={16} strokeWidth={3} />
                </div>
                <div>
                    <h4 className="font-bold text-sm mb-1">Sucesso</h4>
                    <p className="text-sm text-slate-300 font-medium leading-snug">{notification.message}</p>
                </div>
                <button 
                    onClick={() => setNotification(null)}
                    className="ml-2 text-slate-400 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
      )}

      <Layout 
        activeView={activeView} 
        setActiveView={handleSetActiveView} 
        onImportClick={() => setIsImportModalOpen(true)}
        alertCount={alertCount}
        user={currentUser}
        onLogout={handleLogout}
        orders={globalFilteredOrders}
        onViewDetails={handleViewDetails}
        globalSearchTerm={globalSearchTerm}
        onGlobalSearch={handleGlobalSearch}
        globalDateRange={globalDateRange}
        onGlobalDateRangeChange={setGlobalDateRange}
      >
        {renderContent()}
      </Layout>

      {isImportModalOpen && (
        <ImportModal 
          onClose={() => setIsImportModalOpen(false)} 
          onImport={handleImport} 
        />
      )}
    </>
  );
};

export default App;
