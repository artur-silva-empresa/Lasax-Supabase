
import React from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import OrderTable, { ActiveFilterType } from './components/OrderTable';
import OrderTimeline from './components/OrderTimeline';
import OrderDetails from './components/OrderDetails';
import ImportModal from './components/ImportModal';
import Settings from './components/Settings';
import StopReasons from './components/StopReasons';
import Login from './components/Login';
import { Order, User } from './types';
import { generateMockOrders, loadOrdersFromDB, saveOrdersToDB, saveOrderToDB, clearOrdersFromDB, loadStopReasonsFromDB, saveStopReasonsToDB, loadUsersFromDB, initializeDefaultUsers, saveUserToDB, deleteUserFromDB, loadCapacitiesFromDB, saveCapacitiesToDB, hydrateOrder, processSyncQueue } from './services/dataService';
import { supabase } from './src/services/supabase';
import { WifiOff, CheckCircle2, X, Download, Loader2 } from 'lucide-react';
import { SECTORS, STOP_REASONS_HIERARCHY } from './constants';

import SectorOrderTable from './components/SectorOrderTable';
import ProductionCapacityPage from './components/ProductionCapacityPage';
import BottleneckAnalysis from './components/BottleneckAnalysis';
import { ProductionCapacity } from './types';

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
  };
  
  // Função para atualizar prioridade em lote (por Nr Doc)
  const handleUpdatePriority = (docNr: string, priority: number) => {
    const updated = orders.filter(o => o.docNr === docNr).map(o => ({ ...o, priority }));
    setOrders(prev => prev.map(o => o.docNr === docNr ? { ...o, priority } : o));
    updated.forEach(saveOrderToDB);
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

  // Função para atualizar motivo de paragem em lote (por Nr Doc)
  const handleUpdateStopReason = (docNr: string, sectorId: string, stopReason: string) => {
    const updated = orders.filter(o => o.docNr === docNr).map(o => ({
        ...o,
        sectorStopReasons: { ...(o.sectorStopReasons || {}), [sectorId]: stopReason }
    }));
    setOrders(prev => prev.map(o => o.docNr === docNr ? updated.find(u => u.id === o.id)! : o));
    updated.forEach(saveOrderToDB);
  };

  const handleSaveCapacities = (newCapacities: ProductionCapacity[]) => {
    setCapacities(newCapacities);
    saveCapacitiesToDB(newCapacities).catch(err => console.error('Erro ao guardar capacidades:', err));
    setNotification({ message: 'Capacidades de produção guardadas com sucesso.', type: 'success' });
  };

  const handleUpdateStopReasonsHierarchy = (newHierarchy: any[]) => {    setStopReasons(newHierarchy);
    saveStopReasonsToDB(newHierarchy).catch(err => console.error("Erro ao guardar motivos:", err));
  };

  const handleSaveUser = async (user: User) => {
    await saveUserToDB(user);
    const updatedUsers = await loadUsersFromDB();
    setUsers(updatedUsers);
    setNotification({ message: 'Utilizador guardado com sucesso.', type: 'success' });
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

    if (baseData && !newData) {
      finalOrders = baseData.orders;
      finalHeaders = baseData.headers;
      message = `Base de dados carregada com ${finalOrders.length} registos.`;
    } else if (newData && !baseData) {
      finalOrders = newData.orders;
      finalHeaders = newData.headers;
      message = `Dados importados com ${finalOrders.length} registos novos.`;
    } else if (baseData && newData) {
      const mergedMap = new Map<string, Order>();
      let addedCount = 0;
      let updatedCount = 0;

      const getCompositeKey = (o: Order) => `${o.docNr}-${o.itemNr}`;

      baseData.orders.forEach(o => {
        if (o.docNr) mergedMap.set(getCompositeKey(o), o);
      });
      
      newData.orders.forEach(newOrder => {
        if (!newOrder.docNr) return;
        const key = getCompositeKey(newOrder);
        const existing = mergedMap.get(key);
        
        if (existing) {
          updatedCount++;
          mergedMap.set(key, {
            ...newOrder,
            id: existing.id,
            priority: existing.priority, // Manter prioridade existente
            isManual: existing.isManual, // Manter flag manual existente
            sectorObservations: existing.sectorObservations || {},
            sectorPredictedDates: existing.sectorPredictedDates || {},
            sectorStopReasons: existing.sectorStopReasons || {}
          });
        } else {
          addedCount++;
          mergedMap.set(key, newOrder);
        }
      });
      
      finalOrders = Array.from(mergedMap.values());
      finalHeaders = { ...baseData.headers, ...newData.headers };
      message = `Importação concluída: ${addedCount} novas linhas adicionadas e ${updatedCount} atualizadas.`;
    }

    setOrders(finalOrders);
    setExcelHeaders(finalHeaders);
    setIsImportModalOpen(false);
    setNotification({ message, type: 'success' });
    setActiveView('orders');
    
    // Force immediate save after import
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
  }, [orders, globalDateRange]);

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
                        sector={sector!}
                        onViewDetails={handleViewDetails} 
                        onUpdateOrder={handleUpdateOrder}
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
        return <Dashboard orders={globalFilteredOrders} onNavigateToOrders={handleNavigateToOrders} />;
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
      case 'timeline':
        if (!currentUser?.permissions?.timeline || currentUser?.permissions?.timeline === 'none') {
            const fallback = getFirstAvailableView(currentUser);
            if (fallback !== 'timeline') { setActiveView(fallback); return null; }
        }
        return <OrderTimeline orders={globalFilteredOrders} onViewDetails={handleViewDetails} />;
      case 'config':
      case 'config-general':
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
        return <BottleneckAnalysis orders={globalFilteredOrders} capacities={capacities} />;
      case 'production-capacity':
        if (currentUser?.role !== 'admin') return null;
        return <ProductionCapacityPage capacities={capacities} onSave={handleSaveCapacities} />;
      case 'stop-reasons':
        return <StopReasons hierarchy={stopReasons} onUpdateHierarchy={handleUpdateStopReasonsHierarchy} />;
      case 'order-details':
        return selectedOrder ? (
          <OrderDetails
            order={selectedOrder}
            onClose={() => {
              setActiveView(previousView || 'orders');
              setSelectedOrderId(null);
            }}
            onUpdateOrder={handleUpdateOrder}
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
                    onClick={() => setCurrentUser(null)}
                    className="mt-6 text-blue-600 font-bold hover:underline"
                >
                    Voltar ao Login
                </button>
            </div>
        );
      // BUG 7 CORRIGIDO: o case 'default' omitia a prop onNavigateToOrders,
      // o que causaria erro em runtime se o Dashboard tentasse navegar para as encomendas.
      default:
        return <Dashboard orders={globalFilteredOrders} onNavigateToOrders={handleNavigateToOrders} />;
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

  // Estado para o aviso de base de dados existente no login
  const [pendingLoginUser, setPendingLoginUser] = React.useState<User | null>(null);

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
      <>
        <Login onLogin={async (user) => {
          // Se existirem dados carregados e for admin, pedir confirmação antes de continuar.
          if (orders.length > 0 && user.role === 'admin') {
            setPendingLoginUser(user);
          } else {
            doLogin(user);
          }
        }} />

        {/* Modal de aviso: existe base de dados carregada */}
        {pendingLoginUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-start gap-4 mb-5">
                <div className="bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                </div>
                <div>
                  <h3 className="font-black text-slate-800 dark:text-white text-base mb-1">Base de dados existente</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Existem <span className="font-bold text-slate-700 dark:text-slate-200">{orders.length} registos</span> carregados. Deseja apagar estes dados antes de continuar com o login?
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={async () => {
                    await clearOrdersFromDB();
                    setOrders([]);
                    setExcelHeaders({});
                    const u = pendingLoginUser;
                    setPendingLoginUser(null);
                    doLogin(u);
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  Apagar dados e entrar
                </button>
                <button
                  onClick={() => {
                    const u = pendingLoginUser;
                    setPendingLoginUser(null);
                    doLogin(u);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 rounded-xl transition-colors text-sm"
                >
                  Manter dados e entrar
                </button>
                <button
                  onClick={() => setPendingLoginUser(null)}
                  className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium py-2 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
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
        onLogout={() => setCurrentUser(null)}
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
