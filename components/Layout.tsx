
import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Clock, 
  Settings, 
  Upload, 
  Bell, 
  User as UserIcon, 
  Menu, 
  X,
  LogOut,
  Layers,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Target,
  Zap,
  Search,
  MessageSquare
} from 'lucide-react';
import { User, Order } from '../types';
import { SECTORS } from '../constants';
import { formatDate } from '../utils/formatters';

interface LayoutProps {
  children: React.ReactNode;
  activeView: string;
  setActiveView: (view: string) => void;
  onImportClick: () => void;
  alertCount: number;
  user: User | null;
  onLogout: () => void;
  orders: Order[];
  onViewDetails: (order: Order) => void;
  globalSearchTerm?: string;
  onGlobalSearch?: (term: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, setActiveView, onImportClick, alertCount, user, onLogout, orders, onViewDetails, globalSearchTerm, onGlobalSearch }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth > 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSectorsOpen, setIsSectorsOpen] = React.useState(false);
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
  const [isProductionOpen, setIsProductionOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);

  // Itens dinâmicos baseados em permissões
  const menuItems = React.useMemo(() => {
    const items = [];
    if (user?.permissions?.dashboard !== 'none') {
        items.push({ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });
    }
    if (user?.permissions?.orders !== 'none') {
        items.push({ id: 'orders', label: 'Encomendas', icon: Package });
    }
    if (user?.permissions?.timeline !== 'none') {
        items.push({ id: 'timeline', label: 'Timeline', icon: Clock });
    }
    return items;
  }, [user]);

  const visibleSectors = React.useMemo(() => {
    const sectors = user?.permissions?.sectors || {};
    return SECTORS.filter(s => sectors[s.id] && sectors[s.id] !== 'none');
  }, [user]);

  const hasConfigAccess = user?.permissions?.config !== 'none' || user?.permissions?.stopReasons !== 'none';

  const handleSectorClick = (sectorId: string) => {
    setActiveView(`sector-${sectorId}`);
  };

  return (
    <div className="flex h-screen h-[100dvh] bg-slate-50 dark:bg-slate-950 overflow-hidden flex-col md:flex-row w-full transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex ${isSidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 dark:bg-slate-900 text-white transition-all duration-300 ease-in-out flex-col z-50 shrink-0`}>
        <div className="p-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="w-8 h-8 shrink-0 object-contain" />
          {isSidebarOpen && (
            <div className="flex items-center gap-3 animate-in fade-in duration-300">
                <span className="font-bold text-xl tracking-tight overflow-hidden whitespace-nowrap">Prod. Lasa</span>
            </div>
          )}
        </div>

        <nav className="flex-1 mt-6 overflow-y-auto scrollbar-hide">
          <ul className="space-y-1 px-3">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    activeView === item.id || (item.id === 'orders' && activeView === 'order-details')
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={20} />
                  {isSidebarOpen && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                </button>
              </li>
            ))}

            {/* Sectores Dropdown */}
            <li>
              <button
                onClick={() => setIsSectorsOpen(!isSectorsOpen)}
                className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                  activeView.startsWith('sector-')
                    ? 'text-white bg-slate-800' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers size={20} />
                  {isSidebarOpen && <span className="font-medium whitespace-nowrap">Sectores</span>}
                </div>
                {isSidebarOpen && (
                  isSectorsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                )}
              </button>

              {/* Submenu Sectores */}
              {isSectorsOpen && isSidebarOpen && visibleSectors.length > 0 && (
                <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-2 duration-200">
                  {visibleSectors.map((sector) => {
                    const SectorIcon = sector.icon;
                    const isActive = activeView === `sector-${sector.id}`;
                    return (
                      <li key={sector.id}>
                        <button
                          onClick={() => handleSectorClick(sector.id)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                            isActive
                              ? 'text-blue-400 bg-slate-800/50 font-bold' 
                              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                          }`}
                        >
                          <SectorIcon size={16} />
                          <span>{sector.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>

            {/* Controlo de Produção - Admin only */}
            {user?.role === 'admin' && (
              <li>
                <button
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    activeView === 'bottleneck' || activeView === 'production-capacity'
                      ? 'text-white bg-slate-800'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => setIsProductionOpen(!isProductionOpen)}
                >
                  <div className="flex items-center gap-3">
                    <Target size={20} />
                    {isSidebarOpen && <span className="font-medium whitespace-nowrap">Controlo Produção</span>}
                  </div>
                  {isSidebarOpen && (isProductionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>
                {isProductionOpen && isSidebarOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-2 duration-200">
                    <li>
                      <button
                        onClick={() => setActiveView('bottleneck')}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                          activeView === 'bottleneck'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                      >
                        <Target size={16} />
                        <span>Análise de Gargalos</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => setActiveView('production-capacity')}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                          activeView === 'production-capacity'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                      >
                        <Zap size={16} />
                        <span>Capacidades</span>
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Configurações Dropdown */}
            {hasConfigAccess && (
              <li>                <button
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                    activeView.startsWith('config') || activeView === 'stop-reasons'
                      ? 'text-white bg-slate-800' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings size={20} />
                    {isSidebarOpen && <span className="font-medium whitespace-nowrap">Configurações</span>}
                  </div>
                  {isSidebarOpen && (
                    isConfigOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                  )}
                </button>

                {/* Submenu Configurações */}
                {isConfigOpen && isSidebarOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-2 duration-200">
                    {user?.permissions?.config !== 'none' && (
                      <>
                        <li>
                          <button
                            onClick={() => setActiveView('config')}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                              activeView === 'config' || activeView === 'config-general'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <Settings size={16} />
                            <span>Geral</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-users')}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                              activeView === 'config-users'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <UserIcon size={16} />
                            <span>Utilizadores</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-stop-reasons')}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                              activeView === 'config-stop-reasons'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <AlertTriangle size={16} />
                            <span>Motivos de Paragem</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-export-columns')}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-sm ${
                              activeView === 'config-export-columns'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <Layers size={16} />
                            <span>Tabelas Editáveis</span>
                          </button>
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
           {/* Botão de Importar */}
          <button
            onClick={onImportClick}
            className={`w-full flex items-center justify-center gap-3 p-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-900/20`}
          >
            <Upload size={20} />
            {isSidebarOpen && <span className="font-medium">Importar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="h-14 md:h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:px-8 shrink-0 z-40 transition-colors duration-300">
          <div className="flex items-center gap-3">
            {/* Hamburger menu / Sidebar toggler */}
            <button 
              onClick={() => {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 md:hidden"
            >
              <Menu size={20} />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 md:block"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="md:hidden w-8 h-8 object-contain" />
            
            <div className="md:hidden flex items-center gap-2">
                <h1 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Prod. Lasa</h1>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="flex-1 max-w-md mx-4 hidden md:flex items-center relative">
            <Search size={18} className="absolute left-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar Encomenda ou Artigo..."
              value={globalSearchTerm || ''}
              onChange={(e) => onGlobalSearch && onGlobalSearch(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-200 outline-none transition-shadow"
            />
          </div>

          <div className="flex items-center gap-2 md:gap-4 relative">
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`relative p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors ${isNotificationsOpen ? 'bg-slate-100 dark:bg-slate-800 text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}
              title={`${alertCount} Notificações (Atrasos e Notas)`}
            >
              <Bell size={20} />
              {alertCount > 0 && (
                <span className="absolute -top-1.5 -right-3 min-w-[20px] h-[20px] px-2 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 leading-none shadow-sm">
                  {alertCount}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {isNotificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsNotificationsOpen(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-80 md:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Notificações</h3>
                    <span className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {alertCount} alertas
                    </span>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto overflow-x-hidden py-2">
                    {Object.values(orders.filter(o => {
                      let currentSectorId: string | null = null;
                      if (activeView && activeView.startsWith('sector-')) {
                          currentSectorId = activeView.replace('sector-', '');
                      }

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
                    }).reduce((acc, order) => {
                      if (!acc[order.docNr]) {
                        acc[order.docNr] = {
                          mainOrder: order,
                          count: 0,
                          isLate: false,
                          obsSectors: new Set<string>()
                        };
                      }
                      
                      acc[order.docNr].count++;
                      
                      let currentSectorId: string | null = null;
                      if (activeView && activeView.startsWith('sector-')) {
                          currentSectorId = activeView.replace('sector-', '');
                      }

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);

                      let dateToCheck = order.requestedDate;
                      if (currentSectorId) {
                          switch (currentSectorId) {
                            case 'tecelagem': dateToCheck = order.dataTec; break;
                            case 'felpo_cru': dateToCheck = order.felpoCruDate; break;
                            case 'tinturaria': dateToCheck = order.tinturariaDate; break;
                            case 'confeccao': dateToCheck = order.confDate; break;
                            case 'embalagem': dateToCheck = order.armExpDate; break;
                            case 'expedicao': dateToCheck = order.armExpDate; break;
                          }
                      }

                      if (dateToCheck && dateToCheck < today && order.qtyOpen > 0) {
                        acc[order.docNr].isLate = true;
                      }

                      Object.entries(order.sectorObservations || {}).forEach(([id, v]) => {
                        if (typeof v === 'string' && v.trim() !== '') {
                          acc[order.docNr].obsSectors.add(SECTORS.find(s => s.id === id)?.name || id);
                        }
                      });

                      return acc;
                    }, {} as Record<string, {mainOrder: Order, count: number, isLate: boolean, obsSectors: Set<string>}>)).map(({mainOrder, count, isLate, obsSectors}) => {
                      const obsEntries = Array.from(obsSectors);

                      return (
                        <button
                          key={mainOrder.docNr}
                          onClick={() => {
                            if (onGlobalSearch) {
                              onGlobalSearch(mainOrder.docNr);
                              if (activeView !== 'dashboard') {
                                setActiveView('orders');
                              }
                            } else {
                              onViewDetails(mainOrder);
                            }
                            setIsNotificationsOpen(false);
                          }}
                          className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 group"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {mainOrder.clientName} {count > 1 && <span className="text-xs font-normal text-slate-400 ml-1">({count} linhas)</span>}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">Doc: {mainOrder.docNr}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 truncate">
                            {count > 1 ? 'Várias referências / cores' : `${mainOrder.reference} • ${mainOrder.colorDesc}`}
                          </p>

                          <div className="flex flex-col gap-1.5 mt-2">
                            {isLate && (
                              <div className="flex w-fit items-center gap-1.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded-md">
                                <AlertTriangle size={12} />
                                <span className="text-[10px] font-black uppercase tracking-tighter">Data Pedida Ultrapassada</span>
                              </div>
                            )}
                            {obsEntries.length > 0 && (
                              <div className="flex w-fit items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                                <MessageSquare size={12} />
                                <span className="text-[10px] font-black uppercase tracking-tighter">Notas: {obsEntries.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {alertCount === 0 && (
                      <div className="p-8 text-center">
                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                          <Bell size={20} />
                        </div>
                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Sem notificações pendentes.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            
            <div className="pl-2 md:pl-4 border-l border-slate-200 dark:border-slate-700">
              <button 
                onClick={onLogout}
                className="flex items-center gap-3 group hover:bg-slate-50 dark:hover:bg-slate-800 p-1.5 rounded-xl transition-all outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                title="Sair (Logout)"
              >
                <div className="hidden md:block text-right">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{user?.name || 'Utilizador'}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium group-hover:text-rose-400 dark:group-hover:text-rose-300 transition-colors">{user?.role === 'admin' ? 'Administrador' : 'Leitura'}</p>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 group-hover:border-rose-200 dark:group-hover:border-rose-900 group-hover:bg-rose-50 dark:group-hover:bg-rose-900/20 group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors shadow-sm">
                  <UserIcon size={18} />
                </div>
                <div className="text-slate-300 dark:text-slate-600 group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors">
                    <LogOut size={16} />
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* ÁREA DE CONTEÚDO */}
        <main className="flex-1 overflow-hidden relative pb-24 md:pb-0">
          <div className="max-w-[1600px] mx-auto h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation - Fixa na base */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
        style={{ height: 'calc(4rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center justify-center gap-1 min-w-[64px] transition-colors ${
              activeView === item.id || (item.id === 'orders' && activeView === 'order-details') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <item.icon size={20} strokeWidth={activeView === item.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
        <button
          onClick={onImportClick}
          className="flex flex-col items-center justify-center gap-1 min-w-[64px] text-emerald-600 dark:text-emerald-500"
        >
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full -mt-8 shadow-md border-2 border-white dark:border-slate-900">
            <Upload size={20} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Importar</span>
        </button>
      </nav>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-[60] md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Mobile Menu Slide-out (Drawer) */}
      <aside 
        className={`fixed top-0 bottom-0 left-0 w-72 bg-slate-900 dark:bg-slate-950 text-white z-[70] transition-transform duration-300 ease-in-out md:hidden flex flex-col shadow-2xl border-r border-slate-800 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl tracking-tight">Prod. Lasa</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Global Search in Mobile Menu */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center relative w-full">
            <Search size={16} className="absolute left-3 text-slate-505" />
            <input
              type="text"
              placeholder="Pesquisar Encomenda ou Artigo..."
              value={globalSearchTerm || ''}
              onChange={(e) => {
                onGlobalSearch && onGlobalSearch(e.target.value);
              }}
              className="w-full bg-slate-800 border-none rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          <ul className="space-y-1">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setActiveView(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-sm ${
                    activeView === item.id || (item.id === 'orders' && activeView === 'order-details')
                      ? 'bg-blue-600 text-white shadow-lg' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={18} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}

            {/* Sectores Dropdown */}
            {visibleSectors.length > 0 && (
              <li>
                <button
                  onClick={() => setIsSectorsOpen(!isSectorsOpen)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-sm ${
                    activeView.startsWith('sector-')
                      ? 'text-white bg-slate-800 font-bold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Layers size={18} />
                    <span className="font-medium">Sectores</span>
                  </div>
                  {isSectorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {/* Submenu Sectores */}
                {isSectorsOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-1 duration-200">
                    {visibleSectors.map((sector) => {
                      const SectorIcon = sector.icon;
                      const isActive = activeView === `sector-${sector.id}`;
                      return (
                        <li key={sector.id}>
                          <button
                            onClick={() => {
                              handleSectorClick(sector.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                              isActive
                                ? 'text-blue-400 bg-slate-800/50 font-black' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <SectorIcon size={14} />
                            <span>{sector.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            )}

            {/* Controlo de Produção - Admin only */}
            {user?.role === 'admin' && (
              <li>
                <button
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-sm ${
                    activeView === 'bottleneck' || activeView === 'production-capacity font-bold'
                      ? 'text-white bg-slate-800'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => setIsProductionOpen(!isProductionOpen)}
                >
                  <div className="flex items-center gap-3">
                    <Target size={18} />
                    <span className="font-medium">Controlo Produção</span>
                  </div>
                  {isProductionOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isProductionOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-1 duration-200">
                    <li>
                      <button
                        onClick={() => {
                          setActiveView('bottleneck');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                          activeView === 'bottleneck'
                            ? 'text-blue-400 bg-slate-800/50 font-black'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                      >
                        <Target size={14} />
                        <span>Análise de Gargalos</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setActiveView('production-capacity');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                          activeView === 'production-capacity'
                            ? 'text-blue-400 bg-slate-800/50 font-black'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                      >
                        <Zap size={14} />
                        <span>Capacidades</span>
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Configurações Dropdown */}
            {hasConfigAccess && (
              <li>
                <button
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors text-sm ${
                    activeView.startsWith('config') || activeView === 'stop-reasons'
                      ? 'text-white bg-slate-800 font-bold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings size={18} />
                    <span className="font-medium">Configurações</span>
                  </div>
                  {isConfigOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {/* Submenu Configurações */}
                {isConfigOpen && (
                  <ul className="mt-1 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-in slide-in-from-top-1 duration-200">
                    {user?.permissions?.config !== 'none' && (
                      <>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                              activeView === 'config' || activeView === 'config-general'
                                ? 'text-blue-400 bg-slate-800/50 font-black'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <Settings size={14} />
                            <span>Geral</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-users');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                              activeView === 'config-users'
                                ? 'text-blue-400 bg-slate-800/50 font-black'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <UserIcon size={14} />
                            <span>Utilizadores</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-stop-reasons');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                              activeView === 'config-stop-reasons'
                                ? 'text-blue-400 bg-slate-800/50 font-black'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <AlertTriangle size={14} />
                            <span>Motivos de Paragem</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-export-columns');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-xs ${
                              activeView === 'config-export-columns'
                                ? 'text-blue-400 bg-slate-800/50 font-black'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                            }`}
                          >
                            <Layers size={14} />
                            <span>Tabelas Editáveis</span>
                          </button>
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>

        {/* User profile & logout in mobile drawer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-1">
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-100 truncate">{user?.name || 'Utilizador'}</p>
              <p className="text-[10px] text-slate-400 uppercase font-black">{user?.role === 'admin' ? 'Administrador' : 'Leitura'}</p>
            </div>
            <button 
              onClick={() => {
                onLogout();
                setIsMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
              title="Terminar Sessão"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Layout;
