
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
  MessageSquare,
  PanelLeftClose,
  Maximize,
  Minimize
} from 'lucide-react';
import { User, Order } from '../types';
import { SECTORS } from '../constants';
import { formatDate } from '../utils/formatters';
import { PWAInstallButton } from './PWAInstallButton';

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
  globalDateRange?: { start: string; end: string } | null;
  onGlobalDateRangeChange?: (range: { start: string; end: string } | null) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, setActiveView, onImportClick, alertCount, user, onLogout, orders, onViewDetails, globalSearchTerm, onGlobalSearch, globalDateRange, onGlobalDateRangeChange }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth > 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSectorsOpen, setIsSectorsOpen] = React.useState(false);
  const [isConfigOpen, setIsConfigOpen] = React.useState(false);
  const [isProductionOpen, setIsProductionOpen] = React.useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);

  // Controlo de visibilidade do menu móvel (auto-hide ao fazer scroll vertical para baixo, reaparece ao voltar ao topo)
  const [isMobileNavVisible, setIsMobileNavVisible] = React.useState(true);

  // Deteta se o dispositivo está em landscape com altura compacta (smartphone em landscape)
  const [isCompactLandscape, setIsCompactLandscape] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      (window.innerHeight <= 560 && window.innerWidth > window.innerHeight) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches)
    );
  });

  React.useEffect(() => {
    const handleOrientationOrResize = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const isShort = window.innerHeight <= 560;
      const mediaMatch = typeof window.matchMedia === 'function' 
        ? window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches 
        : false;
      const isLandscapeMobile = (isLandscape && isShort) || mediaMatch;
      setIsCompactLandscape(isLandscapeMobile);
      // Sempre que se altera orientação ou tamanho, assegura menu visível inicialmente
      setIsMobileNavVisible(true);
    };

    window.addEventListener('resize', handleOrientationOrResize);
    window.addEventListener('orientationchange', handleOrientationOrResize);
    return () => {
      window.removeEventListener('resize', handleOrientationOrResize);
      window.removeEventListener('orientationchange', handleOrientationOrResize);
    };
  }, []);

  const isAutoCollapseActive = React.useCallback(() => {
    // Modo móvel vertical (< 768px) ou smartphone em landscape (altura <= 560px)
    return (
      window.innerWidth < 768 ||
      window.innerHeight <= 560 ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches)
    );
  }, []);

  React.useEffect(() => {
    // Sempre visível ao mudar de ecrã/vista
    setIsMobileNavVisible(true);
  }, [activeView]);

  React.useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;

    const onScrollPosition = (currentScrollY: number) => {
      const delta = currentScrollY - lastScrollY;

      // Se estiver perto do topo (<= 25px), mostrar sempre o menu
      if (currentScrollY <= 25) {
        setIsMobileNavVisible(true);
      } else if (delta > 8 && currentScrollY > 40) {
        // A fazer scroll para baixo pelas encomendas -> ocultar o menu para utilizar toda a altura do ecrã
        setIsMobileNavVisible(false);
      } else if (delta < -8) {
        // A fazer scroll para cima / em direção ao topo -> mostrar o menu
        setIsMobileNavVisible(true);
      }

      lastScrollY = currentScrollY;
    };

    const handleNativeScroll = (e: Event) => {
      if (!isAutoCollapseActive()) return;
      const target = e.target as HTMLElement;
      let currentScrollY = 0;
      if (target && typeof target.scrollTop === 'number') {
        currentScrollY = target.scrollTop;
      } else if (typeof window.scrollY === 'number') {
        currentScrollY = window.scrollY;
      } else {
        return;
      }
      
      if (!ticking) {
        window.requestAnimationFrame(() => {
          onScrollPosition(currentScrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    const handleCustomScroll = (e: any) => {
      if (!isAutoCollapseActive()) return;
      const { scrollTop, isAtTop, isScrollingDown } = e.detail || {};
      if (typeof scrollTop === 'number') {
        if (isAtTop || scrollTop <= 25) {
          setIsMobileNavVisible(true);
        } else if (isScrollingDown && scrollTop > 40) {
          setIsMobileNavVisible(false);
        } else if (!isScrollingDown) {
          setIsMobileNavVisible(true);
        }
      }
    };

    document.addEventListener('scroll', handleNativeScroll, { capture: true, passive: true });
    window.addEventListener('app-scroll', handleCustomScroll);
    return () => {
      document.removeEventListener('scroll', handleNativeScroll, { capture: true });
      window.removeEventListener('app-scroll', handleCustomScroll);
    };
  }, [isAutoCollapseActive]);

  // Estados e lógica de Ecrã Inteiro (Fullscreen)
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = React.useState(true);

  React.useEffect(() => {
    const checkSupport = () => {
      const docEl = document.documentElement as any;
      const supported = !!(
        document.fullscreenEnabled ||
        docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.msRequestFullscreen
      );
      setIsFullscreenSupported(supported);
    };

    checkSupport();

    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        )
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
        const docEl = document.documentElement as any;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        const doc = document as any;
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle non-critical error:", err);
    }
  };

  const [localSearchTerm, setLocalSearchTerm] = React.useState(globalSearchTerm || '');

  React.useEffect(() => {
    setLocalSearchTerm(globalSearchTerm || '');
  }, [globalSearchTerm]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (onGlobalSearch) {
        onGlobalSearch(localSearchTerm);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearchTerm, onGlobalSearch]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        // Focus the visible search input (desktop or mobile)
        const inputs = document.querySelectorAll<HTMLInputElement>('input[placeholder="Pesquisar Encomenda ou Artigo..."]');
        for (const input of inputs) {
          if (input.offsetParent !== null) { // visible
            input.focus();
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <aside className={`hidden md:flex ${isSidebarOpen ? 'w-56' : 'w-16'} bg-slate-900 dark:bg-slate-900 text-white transition-all duration-300 ease-in-out flex-col z-50 shrink-0 ${
        isCompactLandscape && !isMobileNavVisible
          ? `-translate-x-full ${isSidebarOpen ? '-ml-56' : '-ml-16'} pointer-events-none`
          : 'translate-x-0 ml-0'
      }`}>
        <div className="py-3 px-3.5 flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="w-6 h-6 shrink-0 object-contain" />
          {isSidebarOpen && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
                <span className="font-bold text-sm tracking-tight overflow-hidden whitespace-nowrap">Prod. Lasa</span>
            </div>
          )}
        </div>

        <nav className={`flex-1 mt-2 scrollbar-hide ${isSidebarOpen ? 'overflow-y-auto' : 'overflow-visible z-50'}`}>
          <ul className="space-y-0.5 px-2">
            {menuItems.map((item) => (
              <li key={item.id} className="relative group">
                <button
                  onClick={() => setActiveView(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView === item.id || (item.id === 'orders' && activeView === 'order-details')
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/20 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={16} />
                  {isSidebarOpen && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                </button>
                {!isSidebarOpen && (
                  <div className="absolute left-full top-0 pl-2 z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity whitespace-nowrap">
                    <div className="px-2.5 py-1 bg-slate-800 text-white text-xs rounded-md shadow-xl border border-slate-700">
                      {item.label}
                    </div>
                  </div>
                )}
              </li>
            ))}

            {/* Sectores Dropdown */}
            <li className="relative group">
              <button
                onClick={() => setIsSectorsOpen(!isSectorsOpen)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                  activeView.startsWith('sector-')
                    ? 'text-white bg-slate-800 font-semibold' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers size={16} />
                  {isSidebarOpen && <span className="font-medium whitespace-nowrap">Sectores</span>}
                </div>
                {isSidebarOpen && (
                  isSectorsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                )}
              </button>

              {!isSidebarOpen && (
                <div className="absolute left-full top-0 pl-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                  <div className="w-44 bg-slate-800 rounded-md shadow-xl border border-slate-700 py-1.5">
                    <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Sectores</h3>
                    <ul>
                      {visibleSectors.map((sector) => {
                      const SectorIcon = sector.icon;
                      const isActive = activeView === `sector-${sector.id}`;
                      return (
                        <li key={sector.id} className="px-1.5">
                          <button
                            onClick={() => handleSectorClick(sector.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              isActive
                                ? 'text-blue-400 bg-slate-700 font-bold' 
                                : 'text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            <SectorIcon size={13} />
                            <span>{sector.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                 </div>
                </div>
              )}

              {/* Submenu Sectores */}
              {isSectorsOpen && isSidebarOpen && visibleSectors.length > 0 && (
                <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
                  {visibleSectors.map((sector) => {
                    const SectorIcon = sector.icon;
                    const isActive = activeView === `sector-${sector.id}`;
                    return (
                      <li key={sector.id}>
                        <button
                          onClick={() => handleSectorClick(sector.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                            isActive
                              ? 'text-blue-400 bg-slate-800/50 font-bold' 
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                          }`}
                        >
                          <SectorIcon size={13} />
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
              <li className="relative group">
                <button
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView === 'bottleneck' || activeView === 'production-capacity'
                      ? 'text-white bg-slate-800 font-semibold'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => setIsProductionOpen(!isProductionOpen)}
                >
                  <div className="flex items-center gap-2.5">
                    <Target size={16} />
                    {isSidebarOpen && <span className="font-medium whitespace-nowrap">Controlo Produção</span>}
                  </div>
                  {isSidebarOpen && (isProductionOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                </button>

                {!isSidebarOpen && (
                  <div className="absolute left-full top-0 pl-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                    <div className="w-48 bg-slate-800 rounded-md shadow-xl border border-slate-700 py-1.5">
                      <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Controlo Produção</h3>
                      <ul>
                        <li className="px-1.5">
                        <button
                          onClick={() => setActiveView('bottleneck')}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                            activeView === 'bottleneck'
                              ? 'text-blue-400 bg-slate-700 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          <Target size={13} />
                          <span>Análise de Gargalos</span>
                        </button>
                      </li>
                      <li className="px-1.5">
                        <button
                          onClick={() => setActiveView('production-capacity')}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                            activeView === 'production-capacity'
                              ? 'text-blue-400 bg-slate-700 font-bold'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          <Zap size={13} />
                          <span>Capacidades</span>
                        </button>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                {isProductionOpen && isSidebarOpen && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
                    <li>
                      <button
                        onClick={() => setActiveView('bottleneck')}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                          activeView === 'bottleneck'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                        }`}
                      >
                        <Target size={13} />
                        <span>Análise de Gargalos</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => setActiveView('production-capacity')}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                          activeView === 'production-capacity'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                        }`}
                      >
                        <Zap size={13} />
                        <span>Capacidades</span>
                      </button>
                    </li>
                  </ul>
                )}
              </li>
            )}

            {/* Configurações Dropdown */}
            {hasConfigAccess && (
              <li className="relative group">
                 <button
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView.startsWith('config') || activeView === 'stop-reasons'
                      ? 'text-white bg-slate-800 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Settings size={16} />
                    {isSidebarOpen && <span className="font-medium whitespace-nowrap">Configurações</span>}
                  </div>
                  {isSidebarOpen && (
                    isConfigOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                  )}
                </button>

                {!isSidebarOpen && (
                  <div className="absolute left-full top-0 pl-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                    <div className="w-48 bg-slate-800 rounded-md shadow-xl border border-slate-700 py-1.5">
                      <h3 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Configurações</h3>
                      <ul>
                        {user?.permissions?.config !== 'none' && (
                        <>
                          <li className="px-1.5">
                            <button
                              onClick={() => setActiveView('config')}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                                activeView === 'config' || activeView === 'config-general'
                                  ? 'text-blue-400 bg-slate-700 font-bold'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <Settings size={13} />
                              <span>Geral</span>
                            </button>
                          </li>
                          <li className="px-1.5">
                            <button
                              onClick={() => setActiveView('config-notifications')}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                                activeView === 'config-notifications'
                                  ? 'text-blue-400 bg-slate-700 font-bold'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <Bell size={13} />
                              <span>Notificações</span>
                            </button>
                          </li>
                          <li className="px-1.5">
                            <button
                              onClick={() => setActiveView('config-users')}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                                activeView === 'config-users'
                                  ? 'text-blue-400 bg-slate-700 font-bold'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <UserIcon size={13} />
                              <span>Utilizadores</span>
                            </button>
                          </li>
                          <li className="px-1.5">
                            <button
                              onClick={() => setActiveView('config-stop-reasons')}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                                activeView === 'config-stop-reasons'
                                  ? 'text-blue-400 bg-slate-700 font-bold'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <AlertTriangle size={13} />
                              <span>Motivos de Paragem</span>
                            </button>
                          </li>
                          <li className="px-1.5">
                            <button
                              onClick={() => setActiveView('config-export-columns')}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                                activeView === 'config-export-columns'
                                  ? 'text-blue-400 bg-slate-700 font-bold'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <Layers size={13} />
                              <span>Tabelas Editáveis</span>
                            </button>
                          </li>
                          <li className="px-1.5 pt-1 border-t border-slate-700/60 mt-1">
                            <PWAInstallButton variant="menu-item" />
                          </li>
                        </>
                      )}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Submenu Configurações */}
                {isConfigOpen && isSidebarOpen && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
                    {user?.permissions?.config !== 'none' && (
                      <>
                        <li>
                          <button
                            onClick={() => setActiveView('config')}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config' || activeView === 'config-general'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <Settings size={13} />
                            <span>Geral</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-notifications')}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-notifications'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <Bell size={13} />
                            <span>Notificações</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-users')}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-users'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <UserIcon size={13} />
                            <span>Utilizadores</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-stop-reasons')}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-stop-reasons'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <AlertTriangle size={13} />
                            <span>Motivos de Paragem</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setActiveView('config-export-columns')}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-export-columns'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <Layers size={13} />
                            <span>Tabelas Editáveis</span>
                          </button>
                        </li>
                        <li className="pt-1 border-t border-slate-700/60 mt-1">
                          <PWAInstallButton variant="menu-item" />
                        </li>
                      </>
                    )}
                  </ul>
                )}
              </li>
            )}
          </ul>
        </nav>

        {user?.role === 'admin' && (
        <div className="p-2.5 border-t border-slate-800 space-y-1.5">
           {/* Botão de Importar */}
          <button
            onClick={onImportClick}
            className={`w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-2xs text-xs font-semibold`}
          >
            <Upload size={14} />
            {isSidebarOpen && <span>Importar</span>}
          </button>
        </div>
        )}
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className={`h-10 md:h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 md:px-5 shrink-0 z-40 transition-all duration-300 ease-in-out ${
          !isMobileNavVisible 
            ? isCompactLandscape
              ? '-translate-y-full -mb-10 md:-mb-12 pointer-events-none'
              : '-translate-y-full md:translate-y-0 -mb-10 md:mb-0 pointer-events-none md:pointer-events-auto' 
            : 'translate-y-0'
        }`}>
          <div className="flex items-center gap-2">
            {/* Hamburger menu / Sidebar toggler */}
            <button 
              onClick={() => {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 md:hidden"
            >
              <Menu size={16} />
            </button>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 md:block transition-colors"
              title={isSidebarOpen ? "Recolher menu lateral" : "Expandir menu lateral"}
            >
              {isSidebarOpen ? <PanelLeftClose size={16} /> : <Menu size={16} />}
            </button>
            <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="md:hidden w-6 h-6 object-contain" />
            
            <div className="md:hidden flex items-center gap-1.5">
                <h1 className="font-bold text-slate-800 dark:text-slate-100 text-xs">Prod. Lasa</h1>
            </div>
          </div>

          {/* Global Search Bar & Global Date Filter*/}
          <div className="flex-1 max-w-xl mx-3 hidden md:flex items-center gap-3">
            <div className="relative flex-1 group">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                <input
                type="text"
                placeholder="Pesquisar Encomenda ou Artigo..."
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg py-1 pl-8 pr-8 text-xs focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-200 outline-none transition-shadow placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {localSearchTerm && (
                  <button
                    onClick={() => {
                      setLocalSearchTerm('');
                      if (onGlobalSearch) onGlobalSearch('');
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X size={13} />
                  </button>
                )}
            </div>
            {onGlobalDateRangeChange && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1 focus-within:ring-1 focus-within:ring-blue-500 transition-shadow">
                <Calendar size={13} className="text-slate-400 dark:text-slate-500" />
                <div className="flex items-center gap-1 text-[11px]">
                    <input
                        type="date"
                        value={globalDateRange?.start || ''}
                        onChange={(e) => {
                            const newStart = e.target.value;
                            if (!newStart && !globalDateRange?.end) {
                                onGlobalDateRangeChange(null);
                            } else {
                                onGlobalDateRangeChange({ start: newStart, end: globalDateRange?.end || '' });
                            }
                        }}
                        className="bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 w-24 text-[11px] cursor-pointer"
                        title="Data de Início"
                    />
                    <span className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">até</span>
                    <input
                        type="date"
                        value={globalDateRange?.end || ''}
                        onChange={(e) => {
                            const newEnd = e.target.value;
                            if (!newEnd && !globalDateRange?.start) {
                                onGlobalDateRangeChange(null);
                            } else {
                                onGlobalDateRangeChange({ start: globalDateRange?.start || '', end: newEnd });
                            }
                        }}
                        className="bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 w-24 text-[11px] cursor-pointer"
                        title="Data de Fim"
                    />
                    {globalDateRange && (
                        <button 
                            onClick={() => onGlobalDateRangeChange(null)}
                            className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-rose-500 transition-colors ml-0.5"
                            title="Limpar Datas"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2.5 relative">
            {isFullscreenSupported && (
              <button
                onClick={toggleFullscreen}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors"
                title={isFullscreen ? "Sair do Ecrã Inteiro" : "Entrar em Ecrã Inteiro"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            )}
            <button
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`relative p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors ${isNotificationsOpen ? 'bg-slate-100 dark:bg-slate-800 text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}
              title={`${alertCount} Notificações (Atrasos e Notas)`}
            >
              <Bell size={16} />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-1 bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border border-white dark:border-slate-900 leading-none shadow-xs">
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
            
            <div className="pl-1.5 md:pl-3 border-l border-slate-200 dark:border-slate-700">
              <button 
                onClick={onLogout}
                className="flex items-center gap-2 group hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded-lg transition-all outline-none focus:ring-1 focus:ring-blue-100 dark:focus:ring-blue-900"
                title="Sair (Logout)"
              >
                <div className="hidden md:block text-right">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{user?.name || 'Utilizador'}</p>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-medium group-hover:text-rose-400 dark:group-hover:text-rose-300 transition-colors">{user?.role === 'admin' ? 'Administrador' : 'Leitura'}</p>
                </div>
                <div className="w-7 h-7 md:w-8 md:h-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 group-hover:border-rose-200 dark:group-hover:border-rose-900 group-hover:bg-rose-50 dark:group-hover:bg-rose-900/20 group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors shadow-2xs">
                  <UserIcon size={14} />
                </div>
                <div className="text-slate-300 dark:text-slate-600 group-hover:text-rose-500 dark:group-hover:text-rose-400 transition-colors">
                    <LogOut size={14} />
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* ÁREA DE CONTEÚDO */}
        <main className={`flex-1 overflow-hidden relative transition-all duration-300 ${
          isCompactLandscape 
            ? 'pb-0' 
            : isMobileNavVisible 
            ? 'pb-14 md:pb-0' 
            : 'pb-0'
        }`}>
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation - Oculta ao fazer scroll para baixo e reaparece ao voltar ao topo */}
      <nav 
        className={`md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] transition-all duration-300 ease-in-out ${
          isMobileNavVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ height: 'calc(3.5rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] transition-colors py-1 ${
              activeView === item.id || (item.id === 'orders' && activeView === 'order-details') ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <item.icon size={18} strokeWidth={activeView === item.id ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
        {user?.role === 'admin' && (
        <button
          onClick={onImportClick}
          className="flex flex-col items-center justify-center gap-0.5 min-w-[56px] text-emerald-600 dark:text-emerald-500 py-1"
        >
          <div className="bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-full -mt-6 shadow-md border-2 border-white dark:border-slate-900">
            <Upload size={18} strokeWidth={2.5} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-tighter">Importar</span>
        </button>
        )}
      </nav>

      {/* Botão flutuante para reexibir o menu se estiver oculto no scroll */}
      {!isMobileNavVisible && (window.innerWidth < 768 || isCompactLandscape) && (
        <button
          onClick={() => setIsMobileNavVisible(true)}
          className="fixed bottom-3 right-3 z-40 bg-slate-900/90 dark:bg-slate-800/90 backdrop-blur-md text-white p-2 rounded-full shadow-lg border border-slate-700/50 flex items-center gap-1.5 px-3 animate-in fade-in zoom-in-95 text-[10px] font-bold active:scale-95 transition-transform"
          title="Mostrar Menu"
        >
          <Menu size={14} />
          <span>Menu</span>
        </button>
      )}

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
        <div className="p-3.5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}icons/icone.png`} alt="Prod. Lasa" className="w-6 h-6 object-contain" />
            <span className="font-bold text-sm tracking-tight">Prod. Lasa</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Global Search in Mobile Menu */}
        <div className="p-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center relative w-full">
            <Search size={14} className="absolute left-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar Encomenda ou Artigo..."
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border-none rounded-lg py-1.5 pl-8 pr-8 text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            {localSearchTerm && (
              <button
                onClick={() => {
                  setLocalSearchTerm('');
                  if (onGlobalSearch) onGlobalSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          <ul className="space-y-0.5">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setActiveView(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView === item.id || (item.id === 'orders' && activeView === 'order-details')
                      ? 'bg-blue-600 text-white shadow-sm font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={16} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}

            {/* Sectores Dropdown */}
            {visibleSectors.length > 0 && (
              <li>
                <button
                  onClick={() => setIsSectorsOpen(!isSectorsOpen)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView.startsWith('sector-')
                      ? 'text-white bg-slate-800 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers size={16} />
                    <span className="font-medium">Sectores</span>
                  </div>
                  {isSectorsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>

                {/* Submenu Sectores */}
                {isSectorsOpen && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
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
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              isActive
                                ? 'text-blue-400 bg-slate-800/50 font-bold' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <SectorIcon size={13} />
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
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView === 'bottleneck' || activeView === 'production-capacity'
                      ? 'text-white bg-slate-800 font-semibold'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  onClick={() => setIsProductionOpen(!isProductionOpen)}
                >
                  <div className="flex items-center gap-2.5">
                    <Target size={16} />
                    <span className="font-medium">Controlo Produção</span>
                  </div>
                  {isProductionOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {isProductionOpen && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
                    <li>
                      <button
                        onClick={() => {
                          setActiveView('bottleneck');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                          activeView === 'bottleneck'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                        }`}
                      >
                        <Target size={13} />
                        <span>Análise de Gargalos</span>
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => {
                          setActiveView('production-capacity');
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                          activeView === 'production-capacity'
                            ? 'text-blue-400 bg-slate-800/50 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                        }`}
                      >
                        <Zap size={13} />
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
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
                    activeView.startsWith('config') || activeView === 'stop-reasons'
                      ? 'text-white bg-slate-800 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Settings size={16} />
                    <span className="font-medium">Configurações</span>
                  </div>
                  {isConfigOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>

                {/* Submenu Configurações */}
                {isConfigOpen && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-slate-700/60 pl-1.5 animate-in slide-in-from-top-1 duration-150">
                    {user?.permissions?.config !== 'none' && (
                      <>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config' || activeView === 'config-general'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <Settings size={13} />
                            <span>Geral</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-users');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-users'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <UserIcon size={13} />
                            <span>Utilizadores</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-stop-reasons');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-stop-reasons'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <AlertTriangle size={13} />
                            <span>Motivos de Paragem</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => {
                              setActiveView('config-export-columns');
                              setIsMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition-colors text-[11px] ${
                              activeView === 'config-export-columns'
                                ? 'text-blue-400 bg-slate-800/50 font-bold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                            }`}
                          >
                            <Layers size={13} />
                            <span>Tabelas Editáveis</span>
                          </button>
                        </li>
                        <li className="pt-1 border-t border-slate-800 mt-1">
                          <PWAInstallButton variant="menu-item" />
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
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-100 truncate">{user?.name || 'Utilizador'}</p>
              <p className="text-[10px] text-slate-400 uppercase font-medium">{user?.role === 'admin' ? 'Administrador' : 'Leitura'}</p>
            </div>
            <button 
              onClick={() => {
                onLogout();
                setIsMobileMenuOpen(false);
              }}
              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
              title="Terminar Sessão"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Layout;
