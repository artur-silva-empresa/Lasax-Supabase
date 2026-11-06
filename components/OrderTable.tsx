import React from 'react';
import { 
  Search, 
  ListFilter, 
  Calendar,
  AlertTriangle,
  FileText,
  Database,
  Loader2,
  Users,
  Tag,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  Eye,
  Filter,
  Flag,
  FileSpreadsheet,
  X,
  Archive,
  ArchiveRestore,
  Download,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Order, OrderState, SectorState, User } from '../types';
import { getOrderState, getSectorState, exportOrdersToSQLite, getDirectoryHandle, getWeekRange, exportOrdersToExcel, loadExportColumnsConfig, exportCustomColumns, DEFAULT_SELECTED_COLUMNS } from '../services/dataService';
import { formatDate } from '../utils/formatters';
import { SECTORS } from '../constants';
import StopReasonSelector from './StopReasonSelector';
import ConfirmModal from './ConfirmModal';
import HighlightText from './HighlightText';
import OrderChangeModal from './OrderChangeModal';

// Definição dos tipos de filtros ativos vindos do Dashboard
export type ActiveFilterType = 'LATE' | 'WEEK_DELIVERIES' | 'WEEK_COMPLETED' | null;

interface OrderTableProps {
  orders: Order[];
  onViewDetails: (order: Order) => void;
  excelHeaders: Record<string, string>;
  activeFilter?: ActiveFilterType;
  user: User | null;
  onUpdatePriority?: (docNr: string, priority: number) => void;
  onUpdateManual?: (docNr: string, isManual: boolean) => void;
  onUpdateStopReason?: (docNr: string, sectorId: string, reason: string, observation?: string, targetOrderIds?: string[], predictedDate?: Date | null) => void;
  stopReasonsHierarchy: any[];
  onArchiveOrder?: (docNr: string, archive: boolean) => void;
  globalSearchTerm?: string;
}

const ITEMS_PER_PAGE = 50;

// Helper para número da semana ISO
const getISOWeek = (d: Date) => {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
};

const OrderTable: React.FC<OrderTableProps> = React.memo(({ orders, onViewDetails, excelHeaders, activeFilter, user, onUpdatePriority, onUpdateManual, onUpdateStopReason, stopReasonsHierarchy, onArchiveOrder, globalSearchTerm }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchTerm);
  
  // Estados dos Filtros
  const [filterDocSeries, setFilterDocSeries] = React.useState('All');
  const [filterComercial, setFilterComercial] = React.useState('All');
  const [filterReference, setFilterReference] = React.useState('All');
  const [filterStatus, setFilterStatus] = React.useState('All');
  const [filterPriority, setFilterPriority] = React.useState('All'); 
  const [filterManual, setFilterManual] = React.useState(false); 
  const [filterHasObservations, setFilterHasObservations] = React.useState(false);
  const [filterArchived, setFilterArchived] = React.useState<'all' | 'active' | 'archived'>('active');
  
  // Alterado de boolean para Date | null para suportar navegação
  const [filterDate, setFilterDate] = React.useState<Date | null>(null);
  // Modo de filtro de semana: 'exact' (só a semana escolhida) ou 'cumulative' (todas as anteriores e até à semana escolhida)
  const [filterWeekMode, setFilterWeekMode] = React.useState<'exact' | 'cumulative'>('exact');

  // Estado para controlar qual menu de prioridade está aberto
  const [openPriorityMenuId, setOpenPriorityMenuId] = React.useState<string | null>(null);
  const [orderToArchive, setOrderToArchive] = React.useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<string>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = React.useState(false);
  const [bulkUnarchiveConfirm, setBulkUnarchiveConfirm] = React.useState(false);
  
  // Estado para validação de alterações em Classificação / Data (com obrigatoriedade de observação e escolha de itens)
  const [pendingChange, setPendingChange] = React.useState<{
    docNr: string;
    items: Order[];
    clientName?: string;
    sectorId: string;
    sectorName: string;
    currentReason?: string;
    newReason?: string;
    currentDate?: Date | null;
    newDate?: Date | null;
  } | null>(null);

  const handleOpenClassificationModal = (group: DocumentGroup, newReason: string) => {
    const current = group.mainOrder.sectorStopReasons?.['planeamento'] || '';
    if (newReason === current) return;
    const initialDate = group.mainOrder.sectorPredictedDates?.['planeamento'] || group.requestedDate || null;
    setPendingChange({
      docNr: group.docNr,
      items: group.items,
      clientName: group.clientName,
      sectorId: 'planeamento',
      sectorName: 'Planeamento',
      currentReason: current,
      newReason: newReason,
      currentDate: initialDate,
      newDate: initialDate
    });
  };

  const handleConfirmChange = (result: {
    observation: string;
    targetOrderIds: string[];
    applyToAll: boolean;
    predictedDate?: Date | null;
    isDateModified?: boolean;
  }) => {
    if (!pendingChange) return;

    const newPredictedDate = result.isDateModified ? result.predictedDate : undefined;

    if (onUpdateStopReason && (pendingChange.newReason !== undefined || newPredictedDate !== undefined)) {
      if (pendingChange.items.every(it => it.docNr === pendingChange.docNr)) {
        onUpdateStopReason(
          pendingChange.docNr,
          pendingChange.sectorId,
          pendingChange.newReason || '',
          result.observation,
          result.targetOrderIds,
          newPredictedDate
        );
      } else {
        const docs = Array.from(new Set(
          pendingChange.items
            .filter(it => result.targetOrderIds.includes(it.id))
            .map(it => it.docNr)
            .filter(Boolean)
        )) as string[];

        docs.forEach(d => {
          onUpdateStopReason(
            d,
            pendingChange.sectorId,
            pendingChange.newReason || '',
            result.observation,
            result.targetOrderIds,
            newPredictedDate
          );
        });
        setSelectedOrderIds(new Set());
      }
    }
    setPendingChange(null);
  };

  // Menu de filtros por predefinição colapsado
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  // Visibilidade do cabeçalho da tabela de encomendas no smartphone (ocultado ao fazer scroll)
  const [isHeaderVisible, setIsHeaderVisible] = React.useState(true);
  const lastScrollTop = React.useRef(0);

  // Deteta smartphone em posição normal (portrait < 768px) ou landscape (altura compacta <= 560px)
  const [isCompactDevice, setIsCompactDevice] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 768 ||
      (window.innerHeight <= 560 && window.innerWidth > window.innerHeight) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches)
    );
  });

  React.useEffect(() => {
    const handleDeviceCheck = () => {
      const isMobile = window.innerWidth < 768;
      const isLandscapeMobile = (window.innerHeight <= 560 && window.innerWidth > window.innerHeight) ||
        (typeof window.matchMedia === 'function' && window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches);
      setIsCompactDevice(isMobile || isLandscapeMobile);
    };

    window.addEventListener('resize', handleDeviceCheck);
    window.addEventListener('orientationchange', handleDeviceCheck);
    return () => {
      window.removeEventListener('resize', handleDeviceCheck);
      window.removeEventListener('orientationchange', handleDeviceCheck);
    };
  }, []);

  // Gestos de toque para permitir ocultar/mostrar o cabeçalho mesmo quando há apenas 1 ou 2 documentos em landscape
  const touchStartYRef = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartYRef.current - currentY; // Positivo = arrasto para cima (scroll para baixo)

    if (isCompactDevice) {
      if (deltaY > 12) {
        // Arrasto para cima: utilizador quer ver mais conteúdo e ocultar o cabeçalho
        setIsHeaderVisible(false);
        if (showMobileFilters) {
          setShowMobileFilters(false);
        }
        window.dispatchEvent(new CustomEvent('app-scroll', {
          detail: {
            scrollTop: 50,
            isScrollingDown: true,
            isAtTop: false
          }
        }));
      } else if (deltaY < -12) {
        // Arrasto para baixo: utilizador quer voltar ao topo / mostrar cabeçalho
        const scrollTop = e.currentTarget.scrollTop;
        if (scrollTop <= 25) {
          setIsHeaderVisible(true);
          window.dispatchEvent(new CustomEvent('app-scroll', {
            detail: {
              scrollTop: 0,
              isScrollingDown: false,
              isAtTop: true
            }
          }));
        }
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const isScrollingDown = scrollTop > lastScrollTop.current;
    const delta = scrollTop - lastScrollTop.current;

    // Em smartphone (posição normal ou landscape): auto-hide do cabeçalho ao fazer scroll
    if (isCompactDevice) {
      if (scrollTop <= 20) {
        setIsHeaderVisible(true);
      } else if (isScrollingDown && delta > 6 && scrollTop > 30) {
        setIsHeaderVisible(false);
        if (showMobileFilters) {
          setShowMobileFilters(false);
        }
      } else if (delta < -6) {
        setIsHeaderVisible(true);
      }
    }

    if (window.innerWidth < 1280) {
      if (isScrollingDown && scrollTop > 50) {
        if (showMobileFilters) {
          setShowMobileFilters(false);
        }
      }
    }

    // Notificar layout para auto-hide do menu fixo na versão móvel
    window.dispatchEvent(new CustomEvent('app-scroll', {
      detail: {
        scrollTop,
        isScrollingDown,
        isAtTop: scrollTop <= 20
      }
    }));

    lastScrollTop.current = scrollTop;
  };

  React.useEffect(() => {
    const handleAppScroll = (e: any) => {
      if (!isCompactDevice) return;
      const { scrollTop, isScrollingDown, isAtTop } = e.detail || {};
      if (typeof scrollTop === 'number') {
        if (isAtTop || scrollTop <= 20) {
          setIsHeaderVisible(true);
        } else if (isScrollingDown && scrollTop > 30) {
          setIsHeaderVisible(false);
          setShowMobileFilters(false);
        } else if (!isScrollingDown) {
          setIsHeaderVisible(true);
        }
      }
    };
    window.addEventListener('app-scroll', handleAppScroll);
    return () => window.removeEventListener('app-scroll', handleAppScroll);
  }, [isCompactDevice]);
  
  // Ref para fechar menu ao clicar fora
  const menuRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenPriorityMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Efeito para aplicar filtros quando activeFilter muda (Dashboard)
  React.useEffect(() => {
      if (activeFilter === 'LATE') {
          setFilterStatus('Atrasadas');
          setFilterDate(null);
      } else if (activeFilter === 'WEEK_DELIVERIES') {
          setFilterStatus('All'); 
          setFilterDate(new Date()); // Define semana atual
      } else if (activeFilter === 'WEEK_COMPLETED') {
          setFilterStatus('Concluídas'); 
          setFilterDate(new Date()); // Define semana atual
      }
  }, [activeFilter]);

  // Paginação
  const [currentPage, setCurrentPage] = React.useState(1);
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportSuccess, setExportSuccess] = React.useState(false);

  // Estados para exportação Excel
  const [isExportingExcel, setIsExportingExcel] = React.useState(false);
  const [excelExportSuccess, setExcelExportSuccess] = React.useState(false);

  // Estados para exportação Tabela Personalizada
  const [isExportingTable, setIsExportingTable] = React.useState(false);
  const [tableExportSuccess, setTableExportSuccess] = React.useState(false);

  const statusOptions = [
    { id: 'All', label: 'Todos os Estados' },
    { id: 'Atrasadas', label: 'Atrasadas' },
    { id: 'Em produção', label: 'Em produção' },
    { id: 'Concluídas', label: 'Concluídas' },
    { id: 'Em Aberto', label: 'Em Aberto' },
  ];

  const priorityOptions = [
    { id: 'All', label: 'Todas Prioridades' },
    { id: 'Any', label: 'Com Prioridade (Qualquer)' },
    { id: '1', label: 'Prioridade 1 (Alta)' },
    { id: '2', label: 'Prioridade 2 (Média)' },
    { id: '3', label: 'Prioridade 3 (Baixa)' },
    { id: '0', label: 'Sem Prioridade' },
  ];

  const getDocSeries = (docNr: string) => {
    if (!docNr) return null;
    const parts = docNr.split('-');
    if (parts.length > 1) {
        return parts.slice(0, -1).join('-');
    }
    return null;
  };

  const seriesOptions = React.useMemo(() => {
    const set = new Set(orders.map(o => getDocSeries(o.docNr)).filter((v): v is string => v !== null));
    return Array.from(set).sort();
  }, [orders]);

  const comercialOptions = React.useMemo(() => {
    let filtered = orders;
    if (filterDocSeries !== 'All') {
        filtered = filtered.filter(o => getDocSeries(o.docNr) === filterDocSeries);
    }
    const set = new Set(filtered.map(o => o.comercial).filter(Boolean));
    return Array.from(set).sort();
  }, [orders, filterDocSeries]);

  const referenceOptions = React.useMemo(() => {
    let filtered = orders;
    if (filterDocSeries !== 'All') {
        filtered = filtered.filter(o => getDocSeries(o.docNr) === filterDocSeries);
    }
    if (filterComercial !== 'All') {
        filtered = filtered.filter(o => o.comercial === filterComercial);
    }
    const set = new Set(filtered.map(o => o.reference).filter(Boolean));
    return Array.from(set).sort();
  }, [orders, filterDocSeries, filterComercial]);

  const hasObservations = React.useCallback((order: Order) => {
    // 1. Observações explícitas
    const hasSector = !!(order.sectorObservations && Object.values(order.sectorObservations).some(v => typeof v === 'string' && v.trim() !== ''));
    if (hasSector) return true;

    // 2. Classificações / Motivos de paragem (Considerados como "Observações")
    const hasStopReason = !!(order.sectorStopReasons && Object.values(order.sectorStopReasons).some(v => typeof v === 'string' && v.trim() !== ''));
    if (hasStopReason) return true;

    // 3. Alterações de Data de Saída / Previsões
    const hasPredictedDates = !!(order.sectorPredictedDates && Object.values(order.sectorPredictedDates).some(v => v !== null && v !== undefined));
    const hasPendingDates = !!(order.sectorPredictedDatesPending && Object.values(order.sectorPredictedDatesPending).some(Boolean));
    const hasDateHistory = !!(order.predictedDatesHistory && order.predictedDatesHistory.length > 0);
    if (hasPredictedDates || hasPendingDates || hasDateHistory) return true;

    // 4. Colunas brutas de observações do ficheiro
    if (order._raw) {
      for (const [key, val] of Object.entries(order._raw)) {
        if (/obs|nota|coment/i.test(key) && val && typeof val === 'string' && val.trim() !== '') {
          return true;
        }
      }
    }
    return false;
  }, []);

  // Conjunto de docNrs que possuem pelo menos uma linha com observações
  const docNrsWithObservations = React.useMemo(() => {
    const set = new Set<string>();
    for (const ord of orders) {
      if (hasObservations(ord) && ord.docNr) {
        set.add(ord.docNr.trim());
      }
    }
    return set;
  }, [orders, hasObservations]);

  // Funções de Navegação de Semana
  const handlePrevWeek = () => {
    if (filterDate) {
      const newDate = new Date(filterDate);
      newDate.setDate(newDate.getDate() - 7);
      setFilterDate(newDate);
    }
  };

  const handleNextWeek = () => {
    if (filterDate) {
      const newDate = new Date(filterDate);
      newDate.setDate(newDate.getDate() + 7);
      setFilterDate(newDate);
    }
  };

  const finalFilteredOrders = React.useMemo(() => {
    // Calcular range da semana selecionada, se houver
    let weekStart: Date, weekEnd: Date;
    if (filterDate) {
      const range = getWeekRange(filterDate);
      weekStart = range.start;
      weekEnd = range.end;
    }

    return orders.filter(o => {
      const matchesDocSeries = filterDocSeries === 'All' || getDocSeries(o.docNr) === filterDocSeries;
      const matchesComercial = filterComercial === 'All' || o.comercial === filterComercial;
      const matchesReference = filterReference === 'All' || o.reference === filterReference;

      let matchesStatus = true;
      if (filterStatus !== 'All') {
        const state = getOrderState(o);
        switch (filterStatus) {
          case 'Atrasadas': matchesStatus = state === OrderState.LATE; break;
          case 'Em produção': matchesStatus = state === OrderState.IN_PRODUCTION; break;
          case 'Concluídas': matchesStatus = state === OrderState.COMPLETED; break;
          case 'Em Aberto': matchesStatus = state === OrderState.OPEN; break;
        }
      }
      
      const hasPriorityFilter = filterPriority !== 'All';
      const hasManualFilter = filterManual;

      let matchesPriority = true;
      if (hasPriorityFilter) {
         const p = o.priority || 0;
         if (filterPriority === 'Any') {
             matchesPriority = p > 0;
         } else {
             matchesPriority = p.toString() === filterPriority;
         }
      }

      let matchesManual = true;
      if (hasManualFilter) {
          matchesManual = !!o.isManual;
      }

      let matchesFlags = true;
      if (hasPriorityFilter && hasManualFilter) {
          matchesFlags = matchesPriority || matchesManual;
      } else {
          matchesFlags = matchesPriority && matchesManual;
      }
      
      if (activeFilter === 'WEEK_COMPLETED') {
         const state = getOrderState(o);
         const isCompletedOrShipped = state === OrderState.COMPLETED || getSectorState(o, 'expedicao') === SectorState.COMPLETED || getSectorState(o, 'expedicao') === SectorState.IN_PROGRESS;
         if (!isCompletedOrShipped) matchesStatus = false;
      }

      // Filtro de Semana (Dinâmico: só da semana ou todas as anteriores e até à semana selecionada)
      let matchesWeek = true;
      if (filterDate) {
          const dateToCheck = o.requestedDate || o.armExpDate;
          if (!dateToCheck) {
              matchesWeek = false;
          } else {
              if (filterWeekMode === 'cumulative') {
                  matchesWeek = dateToCheck <= weekEnd;
              } else {
                  matchesWeek = dateToCheck >= weekStart && dateToCheck <= weekEnd;
              }
          }
      }

      const matchesObservations = !filterHasObservations || 
        hasObservations(o) || 
        (!!o.docNr && docNrsWithObservations.has(o.docNr.trim()));

      // Filtro arquivado
      let matchesArchived = true;
      if (filterArchived === 'active') matchesArchived = !o.isArchived;
      else if (filterArchived === 'archived') matchesArchived = !!o.isArchived;

      const globalSearch = (globalSearchTerm || '').toLowerCase().trim();
      if (globalSearch) {
          const requestedDateStr = formatDate(o.requestedDate);
          const predictedDateStr = Object.values(o.sectorPredictedDates || {}).filter(Boolean).map(d => formatDate(d as Date)).join(' ');
          const classStr = Object.values(o.sectorStopReasons || {}).filter(Boolean).join(' ');
          const obsStr = Object.values(o.sectorObservations || {}).filter(Boolean).join(' ');

          return (o.docNr || '').toLowerCase().includes(globalSearch) ||
                 (o.itemNr !== undefined && o.itemNr.toString().includes(globalSearch)) ||
                 (o.po || '').toLowerCase().includes(globalSearch) ||
                 (o.reference || '').toLowerCase().includes(globalSearch) ||
                 (o.comercial || '').toLowerCase().includes(globalSearch) ||
                 (o.clientName || '').toLowerCase().includes(globalSearch) ||
                 (o.family || '').toLowerCase().includes(globalSearch) ||
                 (o.sizeDesc || '').toLowerCase().includes(globalSearch) ||
                 requestedDateStr.includes(globalSearch) ||
                 predictedDateStr.includes(globalSearch) ||
                 classStr.toLowerCase().includes(globalSearch) ||
                 obsStr.toLowerCase().includes(globalSearch);
      }

      const search = deferredSearch.toLowerCase().trim();
      const matchesSearch = !search || 
                            (o.docNr || '').toLowerCase().includes(search) || 
                            (o.po || '').toLowerCase().includes(search) ||
                            (o.reference || '').toLowerCase().includes(search) ||
                            (o.comercial || '').toLowerCase().includes(search) ||
                            (o.clientName || '').toLowerCase().includes(search) ||
                            (o.family || '').toLowerCase().includes(search) ||
                            (o.sizeDesc || '').toLowerCase().includes(search);
      
      return matchesDocSeries && matchesComercial && matchesReference && matchesStatus && matchesSearch && matchesObservations && matchesWeek && matchesFlags && matchesArchived;
    });
  }, [orders, deferredSearch, globalSearchTerm, filterStatus, filterDocSeries, filterComercial, filterReference, filterHasObservations, docNrsWithObservations, hasObservations, filterDate, filterWeekMode, filterPriority, filterManual, activeFilter, filterArchived]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterDocSeries, filterComercial, filterReference, filterStatus, filterHasObservations, filterDate, filterPriority, filterManual, filterArchived]);

  React.useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [deferredSearch, filterDocSeries, filterComercial, filterReference, filterStatus, filterHasObservations, filterDate, filterPriority, filterManual, filterArchived]);

  React.useEffect(() => {
    setFilterComercial('All');
    setFilterReference('All');
  }, [filterDocSeries]);

  React.useEffect(() => {
    setFilterReference('All');
  }, [filterComercial]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterDocSeries('All');
    setFilterComercial('All');
    setFilterReference('All');
    setFilterStatus('All');
    setFilterPriority('All');
    setFilterManual(false);
    setFilterHasObservations(false);
    setFilterDate(null);
    setFilterWeekMode('exact');
    setFilterArchived('active');
  };

  const toggleHeaderPriorityFilter = () => {
      if (filterPriority === 'All') {
          setFilterPriority('Any');
      } else {
          setFilterPriority('All');
      }
  };

  const hasActiveFilters = searchTerm !== '' || filterDocSeries !== 'All' || filterComercial !== 'All' || filterReference !== 'All' || filterStatus !== 'All' || filterPriority !== 'All' || filterHasObservations || filterDate !== null || filterManual || filterArchived !== 'active';

  const handleExport = async () => {
    if (finalFilteredOrders.length === 0) return;
    setIsExporting(true);
    setExportSuccess(false);
    try {
      const exportHandle = await getDirectoryHandle('export');
      await new Promise(resolve => setTimeout(resolve, 100));

      const isFullList = orders.length === finalFilteredOrders.length;
      const prefix = isFullList ? "Listagem completa" : "Listagem parcial";
      
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = `${day}-${month}-${year}`;
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      
      const fileName = `${prefix} ${dateStr} ${timeStr}.sqlite`;

      await exportOrdersToSQLite(finalFilteredOrders, excelHeaders, exportHandle, fileName);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Erro ao exportar: " + (error instanceof Error ? error.message : "Erro desconhecido"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelExport = async () => {
    if (finalFilteredOrders.length === 0) return;
    setIsExportingExcel(true);
    setExcelExportSuccess(false);
    try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const isFullList = orders.length === finalFilteredOrders.length;
        const prefix = isFullList ? "Listagem completa" : "Listagem parcial";
        
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}-${month}-${year}`;
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

        const fileName = `${prefix} ${dateStr} ${timeStr}.xlsx`;

        exportOrdersToExcel(finalFilteredOrders, excelHeaders, fileName);
        setExcelExportSuccess(true);
        setTimeout(() => setExcelExportSuccess(false), 3000);
    } catch (error) {
        console.error(error);
        alert("Erro ao exportar Excel.");
    } finally {
        setIsExportingExcel(false);
    }
  };

  const handleTableExport = async () => {
    if (finalFilteredOrders.length === 0) return;
    setIsExportingTable(true);
    setTableExportSuccess(false);
    try {
        const savedConfig = await loadExportColumnsConfig();
        const selectedKeys = savedConfig && savedConfig.length > 0 ? savedConfig : DEFAULT_SELECTED_COLUMNS;

        await new Promise(resolve => setTimeout(resolve, 100));

        const isFullList = orders.length === finalFilteredOrders.length;
        const prefix = isFullList ? "Tabela completa" : "Tabela parcial";

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}-${month}-${year}`;
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

        const fileName = `${prefix} ${dateStr} ${timeStr}.xlsx`;

        exportCustomColumns(finalFilteredOrders, selectedKeys, fileName);
        setTableExportSuccess(true);
        setTimeout(() => setTableExportSuccess(false), 3000);
    } catch (error) {
        console.error(error);
        alert("Erro ao exportar Tabela.");
    } finally {
        setIsExportingTable(false);
    }
  };

  const getStatusBadge = (order: Order) => {
    const badges = [];
    const state = getOrderState(order);

    switch (state) {
      case OrderState.COMPLETED: 
        badges.push(<span key="status" className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-1 w-full"><CheckCircle2 size={10} /> Concluída</span>);
        break;
      case OrderState.LATE: 
        badges.push(<span key="status" className="px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider border border-rose-200 dark:border-rose-800 flex items-center justify-center gap-1 w-full"><AlertTriangle size={10} /> Atrasada</span>);
        break;
      case OrderState.IN_PRODUCTION: 
        badges.push(<span key="status" className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-1 w-full"><Clock size={10} /> No Prazo</span>);
        break;
      default: 
        badges.push(<span key="status" className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-wider border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 w-full">Em Aberto</span>);
    }

    if (order.priority === 1) {
       badges.push(<span key="priority" className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-black uppercase tracking-wider border border-red-200 dark:border-red-800 flex items-center justify-center gap-1 w-full"><Flag size={10} /> Alta Prioridade</span>);
    } else if (order.priority === 2) {
       badges.push(<span key="priority" className="px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-[10px] font-black uppercase tracking-wider border border-orange-200 dark:border-orange-800 flex items-center justify-center gap-1 w-full"><Flag size={10} /> Prioridade Média</span>);
    }

    return (
        <div className="flex flex-col items-center gap-1.5 w-full">
            {badges}
        </div>
    );
  };

  const getPriorityColor = (p: number) => {
      switch(p) {
          case 1: return "text-red-900 dark:text-red-400 fill-red-900 dark:fill-red-400";
          case 2: return "text-orange-500 dark:text-orange-400 fill-orange-500 dark:fill-orange-400";
          case 3: return "text-yellow-400 dark:text-yellow-400 fill-yellow-400 dark:fill-yellow-400";
          default: return "text-slate-200 dark:text-slate-700 fill-slate-200 dark:fill-slate-700";
      }
  };

  // Definição do grupo por Documento
  interface DocumentGroup {
    docNr: string;
    mainOrder: Order;
    clientName: string;
    comercial: string;
    po: string;
    priority: number;
    isManual: boolean;
    isArchived: boolean;
    archivedBy?: string;
    hasObservations: boolean;
    requestedDate: Date | null;
    status: OrderState;
    totalQtyRequested: number;
    totalQtyOpen: number;
    distinctReferencesCount: number;
    referenceSummary: string;
    items: Order[];
  }

  // Agrupamento de encomendas por Documento (1 cartão/linha por docNr)
  const documentGroups = React.useMemo<DocumentGroup[]>(() => {
    const map = new Map<string, DocumentGroup>();

    for (const order of finalFilteredOrders) {
      const key = order.docNr && order.docNr.trim() !== '' ? order.docNr.trim() : `item-${order.id}`;
      const existing = map.get(key);
      const orderState = getOrderState(order);
      const hasObs = hasObservations(order);

      if (!existing) {
        map.set(key, {
          docNr: order.docNr || '-',
          mainOrder: order,
          clientName: order.clientName || '',
          comercial: order.comercial || '',
          po: order.po || '',
          priority: order.priority || 0,
          isManual: !!order.isManual,
          isArchived: !!order.isArchived,
          archivedBy: order.archivedBy,
          hasObservations: hasObs,
          requestedDate: order.requestedDate,
          status: orderState,
          totalQtyRequested: order.qtyRequested || 0,
          totalQtyOpen: order.qtyOpen !== undefined ? order.qtyOpen : (order.qtyRequested || 0),
          distinctReferencesCount: 1,
          referenceSummary: '',
          items: [order],
        });
      } else {
        existing.items.push(order);
        existing.totalQtyRequested += (order.qtyRequested || 0);
        existing.totalQtyOpen += (order.qtyOpen !== undefined ? order.qtyOpen : (order.qtyRequested || 0));
        if (hasObs) existing.hasObservations = true;
        if ((order.priority || 0) > existing.priority) {
          existing.priority = order.priority || 0;
        }
        if (order.isManual) existing.isManual = true;
        if (orderState === OrderState.LATE) {
          existing.status = OrderState.LATE;
        } else if (orderState === OrderState.IN_PRODUCTION && existing.status !== OrderState.LATE) {
          existing.status = OrderState.IN_PRODUCTION;
        }
        if (!existing.po && order.po) existing.po = order.po;
        if (!existing.clientName && order.clientName) existing.clientName = order.clientName;
        if (!existing.comercial && order.comercial) existing.comercial = order.comercial;
        if (!existing.requestedDate && order.requestedDate) existing.requestedDate = order.requestedDate;
      }
    }

    for (const group of map.values()) {
      const refs = Array.from(new Set(group.items.map(it => it.reference).filter(Boolean)));
      group.distinctReferencesCount = refs.length;
      if (refs.length > 1) {
        group.referenceSummary = `${refs.length} referências`;
      } else if (refs.length === 1) {
        const first = group.items[0];
        const extra = first.colorDesc || first.family || first.sizeDesc || '';
        group.referenceSummary = `Ref. ${refs[0]}${extra ? ` - ${extra}` : ''}`;
      } else {
        group.referenceSummary = '-';
      }
    }

    return Array.from(map.values());
  }, [finalFilteredOrders]);

  // Pagination Logic baseada nos grupos de Documentos
  const totalPages = Math.max(1, Math.ceil(documentGroups.length / ITEMS_PER_PAGE));
  const paginatedGroups = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return documentGroups.slice(start, start + ITEMS_PER_PAGE);
  }, [documentGroups, currentPage]);

  // Estado dos docNrs que estão expandidos (por padrão, colapsados)
  const [expandedDocNrs, setExpandedDocNrs] = React.useState<Set<string>>(new Set());
  const lastTapRef = React.useRef<{ [key: string]: number }>({});
  const lastToggleTimeRef = React.useRef<{ [key: string]: number }>({});
  const lastTouchTimeRef = React.useRef<number>(0);

  const toggleExpandDocNr = React.useCallback((docNr: string) => {
    const now = Date.now();
    const lastToggle = lastToggleTimeRef.current[docNr] || 0;
    // Evitar que cliques duplos rápidos ou toques com eventos duplicados fechem imediatamente a linha (debounce 280ms)
    if (now - lastToggle < 280) {
      return;
    }
    lastToggleTimeRef.current[docNr] = now;

    setExpandedDocNrs(prev => {
      const next = new Set(prev);
      if (next.has(docNr)) {
        next.delete(docNr);
      } else {
        next.add(docNr);
      }
      return next;
    });
  }, []);

  const handleDocNrTouchEnd = React.useCallback((docNr: string, e: React.TouchEvent) => {
    const now = Date.now();
    const lastTap = lastTapRef.current[docNr] || 0;
    if (now - lastTap < 380) {
      e.preventDefault();
      e.stopPropagation();
      lastTouchTimeRef.current = now;
      toggleExpandDocNr(docNr);
      lastTapRef.current[docNr] = 0;
    } else {
      lastTapRef.current[docNr] = now;
    }
  }, [toggleExpandDocNr]);

  const [focusedRowIndex, setFocusedRowIndex] = React.useState(-1);

  React.useEffect(() => {
    setFocusedRowIndex(-1);
  }, [paginatedGroups]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;

      if (e.key === 'ArrowDown') {
        setFocusedRowIndex(prev => {
          if (paginatedGroups.length === 0) return prev;
          e.preventDefault();
          const next = Math.min(prev === -1 ? 0 : prev + 1, paginatedGroups.length - 1);
          const tr = document.getElementById(`order-row-${paginatedGroups[next].docNr}`);
          const card = document.getElementById(`order-card-${paginatedGroups[next].docNr}`);
          if (window.innerWidth >= 768 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        setFocusedRowIndex(prev => {
          if (paginatedGroups.length === 0 || prev <= 0) return prev;
          e.preventDefault();
          const next = Math.max(prev - 1, 0);
          const tr = document.getElementById(`order-row-${paginatedGroups[next].docNr}`);
          const card = document.getElementById(`order-card-${paginatedGroups[next].docNr}`);
          if (window.innerWidth >= 768 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (focusedRowIndex >= 0 && focusedRowIndex < paginatedGroups.length) {
          e.preventDefault();
          toggleExpandDocNr(paginatedGroups[focusedRowIndex].docNr);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedGroups, focusedRowIndex, toggleExpandDocNr]);

  const handlePriorityClick = (e: React.MouseEvent, orderId: string) => {
      e.stopPropagation();
      setOpenPriorityMenuId(openPriorityMenuId === orderId ? null : orderId);
  };

  const handleSetPriority = (docNr: string, level: number) => {
      if (onUpdatePriority) {
          onUpdatePriority(docNr, level);
          setOpenPriorityMenuId(null);
      }
  };

  const handleManualClick = (e: React.MouseEvent, docNr: string, currentStatus: boolean) => {
      e.stopPropagation();
      if (onUpdateManual && user?.permissions?.orders === 'write') {
          onUpdateManual(docNr, !currentStatus);
      }
  };

  // Verificação e seleção de documentos
  const isDocGroupSelected = (group: DocumentGroup) => {
    return group.items.length > 0 && group.items.every(it => selectedOrderIds.has(it.id));
  };

  const isDocGroupPartiallySelected = (group: DocumentGroup) => {
    const selectedCount = group.items.filter(it => selectedOrderIds.has(it.id)).length;
    return selectedCount > 0 && selectedCount < group.items.length;
  };

  // Bulk Selection and Update Helpers
  const allSelected = paginatedGroups.length > 0 && paginatedGroups.every(isDocGroupSelected);
  
  const handleSelectAllToggle = () => {
    const newSelected = new Set(selectedOrderIds);
    if (allSelected) {
      paginatedGroups.forEach(g => g.items.forEach(it => newSelected.delete(it.id)));
    } else {
      paginatedGroups.forEach(g => g.items.forEach(it => newSelected.add(it.id)));
    }
    setSelectedOrderIds(newSelected);
  };

  const handleToggleDocSelect = (group: DocumentGroup, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedOrderIds);
    const fullySelected = isDocGroupSelected(group);
    if (fullySelected) {
      group.items.forEach(it => newSelected.delete(it.id));
    } else {
      group.items.forEach(it => newSelected.add(it.id));
    }
    setSelectedOrderIds(newSelected);
  };

  // List of distinct docNr's of selected orders (cross-page selection via full orders list)
  const selectedDocNrs = React.useMemo(() => {
    const list = orders.filter(o => selectedOrderIds.has(o.id));
    return Array.from(new Set(list.map(o => o.docNr).filter(Boolean))) as string[];
  }, [selectedOrderIds, orders]);

  // Flattened distinct stop reasons from the hierarchy for the bulk select classification dropdown
  const allReasonOptions = React.useMemo(() => {
    const list: string[] = [];
    stopReasonsHierarchy?.forEach((cat: any) => {
      cat.reasons?.forEach((r: any) => {
        if (r && typeof r === 'string') {
          list.push(r);
        } else if (r && typeof r === 'object' && r.name) {
          list.push(r.name);
        }
      });
    });
    return Array.from(new Set(list)).sort();
  }, [stopReasonsHierarchy]);

  const handleBulkPriority = (priority: number) => {
    if (onUpdatePriority && selectedDocNrs.length > 0) {
      selectedDocNrs.forEach(docNr => {
        onUpdatePriority(docNr, priority);
      });
      setSelectedOrderIds(new Set());
    }
  };

  const handleBulkStopReason = (reason: string) => {
    if (onUpdateStopReason && selectedDocNrs.length > 0) {
      const selectedItems = orders.filter(o => selectedOrderIds.has(o.id));
      setPendingChange({
        docNr: selectedDocNrs.length === 1 ? selectedDocNrs[0] : `${selectedDocNrs.length} documentos selecionados`,
        items: selectedItems,
        sectorId: 'planeamento',
        sectorName: 'Planeamento',
        currentReason: '',
        newReason: reason === 'none' ? '' : reason
      });
    }
  };

  const handleBulkManual = (isManual: boolean) => {
    if (onUpdateManual && selectedDocNrs.length > 0) {
      selectedDocNrs.forEach(docNr => {
        onUpdateManual(docNr, isManual);
      });
      setSelectedOrderIds(new Set());
    }
  };

  const executeBulkArchive = () => {
    if (onArchiveOrder && selectedDocNrs.length > 0) {
      selectedDocNrs.forEach(docNr => {
        onArchiveOrder(docNr, true);
      });
      setSelectedOrderIds(new Set());
    }
    setBulkArchiveConfirm(false);
  };

  const executeBulkUnarchive = () => {
    if (onArchiveOrder && selectedDocNrs.length > 0) {
      selectedDocNrs.forEach(docNr => {
        onArchiveOrder(docNr, false);
      });
      setSelectedOrderIds(new Set());
    }
    setBulkUnarchiveConfirm(false);
  };

  const highlights = [
    globalSearchTerm,
    deferredSearch,
    filterDocSeries !== 'All' ? filterDocSeries : undefined,
    filterComercial !== 'All' ? filterComercial : undefined,
    filterReference !== 'All' ? filterReference : undefined
  ];

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
      {/* Barra de Topo do Cabeçalho com Auto-Hide no Smartphone (Normal e Landscape) */}
      <div 
        className={`transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isCompactDevice && !isHeaderVisible
            ? 'max-h-0 opacity-0 pointer-events-none -translate-y-2'
            : 'max-h-[500px] opacity-100 translate-y-0'
        }`}
      >
        <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
              <ListFilter size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white transition-colors truncate">Listagem de Encomendas</h2>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">{documentGroups.length} documentos ({finalFilteredOrders.length} linhas)</p>
                {filterDate && (
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 animate-in fade-in">
                        {filterWeekMode === 'cumulative' ? `Filtro: ≤ Até Semana ${getISOWeek(filterDate)}` : `Filtro: Só Semana ${getISOWeek(filterDate)}`}
                    </span>
                )}
                {filterHasObservations && (
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 animate-in fade-in flex items-center gap-1">
                        <Eye size={11} className="text-blue-600 dark:text-blue-400" />
                        <span>Com Observações</span>
                        <button
                          onClick={() => setFilterHasObservations(false)}
                          className="ml-0.5 hover:text-blue-900 dark:hover:text-white cursor-pointer"
                          title="Remover filtro de observações"
                        >
                          <X size={10} />
                        </button>
                    </span>
                )}
                {filterManual && (
                    <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 animate-in fade-in">
                        Filtro: Conf. Manual
                    </span>
                )}
                {filterArchived === 'archived' && (
                    <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 animate-in fade-in flex items-center gap-1">
                        <Archive size={10} /> Arquivadas
                    </span>
                )}
                {filterArchived === 'all' && (
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 animate-in fade-in">
                        A mostrar tudo
                    </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="hidden xl:flex items-center gap-2">
              {/* Botão Exportar Tabela (Personalizada) */}
              <button
                onClick={handleTableExport}
                disabled={isExportingTable}
                className={`px-4 py-2 text-white rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 min-w-[150px] justify-center ${
                  tableExportSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                }`}
                title="Exportar Tabela (Colunas Personalizadas)"
              >
                 {isExportingTable ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs font-bold uppercase">A Gerar...</span>
                    </>
                 ) : tableExportSuccess ? (
                    <>
                        <Check size={16} />
                        <span className="text-xs font-bold uppercase">Sucesso</span>
                    </>
                 ) : (
                    <>
                        <Download size={16} />
                        <span className="text-xs font-bold uppercase">Exportar Tabela Editável</span>
                    </>
                 )}
              </button>

              {/* Botão Exportar Excel */}
              <button 
                onClick={handleExcelExport}
                disabled={isExportingExcel}
                className={`px-4 py-2 text-white rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 min-w-[150px] justify-center ${
                  excelExportSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                }`}
                title="Exportar Lista para Excel"
              >
                 {isExportingExcel ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs font-bold uppercase">A Gerar...</span>
                    </>
                 ) : excelExportSuccess ? (
                    <>
                        <Check size={16} />
                        <span className="text-xs font-bold uppercase">Sucesso</span>
                    </>
                 ) : (
                    <>
                        <FileSpreadsheet size={16} />
                        <span className="text-xs font-bold uppercase">Exportar Excel</span>
                    </>
                 )}
              </button>

              {/* Botão Exportar BD */}
              {user?.permissions?.config === 'write' && (
              <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className={`px-4 py-2 text-white rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-2 min-w-[140px] justify-center ${
                      exportSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                  }`}
                  title="Exportar Base de Dados (SQLite)"
                  >
                  {isExporting ? (
                      <>
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-xs font-bold uppercase">A Gerar...</span>
                      </>
                  ) : exportSuccess ? (
                      <>
                          <Check size={16} />
                          <span className="text-xs font-bold uppercase">Guardado</span>
                      </>
                  ) : (
                      <>
                          <Database size={16} />
                          <span className="text-xs font-bold uppercase">Exportar BD</span>
                      </>
                  )}
              </button>
              )}
          </div>
        </div>

        {/* Mobile/Tablet Header Row */}
        <div className="xl:hidden flex justify-between items-center py-2 px-3 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Filtros & Pesquisa</span>
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`py-1 px-2.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 text-xs ${
              showMobileFilters 
                ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
            title={showMobileFilters ? "Ocultar Pesquisa" : "Mostrar Pesquisa"}
          >
            <Filter size={13} className={showMobileFilters ? "fill-white/10" : "text-slate-500"} />
            <span className="font-bold">{showMobileFilters ? "Ocultar" : "Filtrar"}</span>
            {(() => {
              let count = 0;
              if (searchTerm) count++;
              if (filterDate) count++;
              if (filterPriority !== 'All') count++;
              if (filterDocSeries !== 'All') count++;
              if (filterComercial !== 'All') count++;
              if (filterReference !== 'All') count++;
              if (filterStatus !== 'All') count++;
              if (filterArchived !== 'active') count++;
              if (filterManual) count++;
              if (filterHasObservations) count++;
              if (count > 0) {
                return (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    showMobileFilters ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                  }`}>
                    {count}
                  </span>
                );
              }
              return null;
            })()}
          </button>
        </div>
      </div>

      <div className={`transition-all duration-300 ease-in-out xl:max-h-none xl:opacity-100 xl:overflow-visible xl:pointer-events-auto ${
        showMobileFilters && (!isCompactDevice || isHeaderVisible)
          ? 'max-h-[1400px] opacity-100' 
          : 'max-h-0 opacity-0 overflow-hidden pointer-events-none'
      }`}>
        {/* Header / Toolbar */}
        <div className="flex-shrink-0 p-4 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Pesquisar texto..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm transition-all h-full dark:text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl p-2 shadow-sm transition-colors active:scale-95 flex items-center justify-center"
                  title="Limpar todos os filtros e pesquisa"
                >
                  <RotateCcw size={16} />
                </button>
              )}
              
              {/* Seletor de Semana com modo Só Semana vs Até à Semana */}
              {!filterDate ? (
                <button 
                  onClick={() => setFilterDate(new Date())}
                  className="flex items-center gap-2 border rounded-xl px-3 py-2 shadow-sm grow md:grow-0 transition-colors bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  title="Filtrar por Semana"
                >
                   <Calendar size={14} className="text-slate-400" />
                   <span className="text-xs font-bold">Filtrar Semana</span>
                </button>
              ) : (
                <div className="flex flex-wrap sm:flex-nowrap items-center bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-xl shadow-sm overflow-hidden grow md:grow-0">
                  <button onClick={handlePrevWeek} className="px-2 py-2 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" title="Semana anterior">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="px-2 flex flex-col items-center justify-center min-w-[95px]">
                    <span className="text-[10px] font-black uppercase text-blue-500 dark:text-blue-400 leading-none">
                      Semana {getISOWeek(filterDate)}
                    </span>
                    <span className="text-[10px] font-medium text-blue-700 dark:text-blue-200 leading-none mt-0.5">
                       {(() => {
                         const {start, end} = getWeekRange(filterDate);
                         return `${start.getDate()} ${start.toLocaleString('pt-PT', {month: 'short'})} - ${end.getDate()} ${end.toLocaleString('pt-PT', {month: 'short'})}`;
                       })()}
                    </span>
                  </div>
                  <button onClick={handleNextWeek} className="px-2 py-2 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" title="Semana seguinte">
                    <ChevronRight size={16} />
                  </button>
                  
                  {/* Seletor de Modo: Só Semana vs Até à Semana */}
                  <div className="flex items-center border-l border-blue-200 dark:border-blue-800 px-1 py-1 gap-1 bg-white/60 dark:bg-slate-900/60">
                    <button
                      type="button"
                      onClick={() => setFilterWeekMode('exact')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        filterWeekMode === 'exact'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                      }`}
                      title="Apenas encomendas com entrega na semana selecionada"
                    >
                      Só Semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterWeekMode('cumulative')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        filterWeekMode === 'cumulative'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                      }`}
                      title="Todas as encomendas anteriores e até à semana selecionada"
                    >
                      ≤ Até à Semana
                    </button>
                  </div>

                  <div className="w-px h-6 bg-blue-200 dark:bg-blue-800 mx-0.5"></div>
                  <button onClick={() => setFilterDate(null)} className="px-2 py-2 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-blue-400 dark:text-blue-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors" title="Remover filtro de semana">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Botão Filtro de Observações */}
              <button
                type="button"
                onClick={() => setFilterHasObservations(!filterHasObservations)}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 shadow-sm grow md:grow-0 transition-all text-xs font-bold active:scale-95 cursor-pointer select-none ${
                  filterHasObservations
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-400/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title={filterHasObservations ? "A mostrar apenas encomendas com observações (clique para mostrar todas)" : "Filtrar encomendas onde o campo com observações esteja preenchido"}
              >
                <Eye size={14} className={filterHasObservations ? "text-white" : "text-blue-500"} />
                <span>Com Observações</span>
                {filterHasObservations && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />
                )}
              </button>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <Flag size={14} className="text-slate-400" />
                <select 
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[110px] w-full md:w-auto"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                >
                  {priorityOptions.map(opt => <option key={opt.id} value={opt.id} className="dark:bg-slate-900">{opt.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <FileText size={14} className="text-slate-400" />
                <select 
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[80px] w-full md:w-auto"
                  value={filterDocSeries}
                  onChange={(e) => setFilterDocSeries(e.target.value)}
                >
                  <option value="All" className="dark:bg-slate-900">Todas as Séries</option>
                  {seriesOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <Users size={14} className="text-slate-400" />
                <select 
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[120px] max-w-[200px] w-full md:w-auto truncate"
                  value={filterComercial}
                  onChange={(e) => setFilterComercial(e.target.value)}
                  disabled={comercialOptions.length === 0 && filterDocSeries === 'All'}
                >
                  <option value="All" className="dark:bg-slate-900">Todos os Comerciais</option>
                  {comercialOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <Tag size={14} className="text-slate-400" />
                <select 
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[120px] max-w-[200px] w-full md:w-auto truncate"
                  value={filterReference}
                  onChange={(e) => setFilterReference(e.target.value)}
                  disabled={referenceOptions.length === 0}
                >
                  <option value="All" className="dark:bg-slate-900">Todas as Referências</option>
                  {referenceOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <ListFilter size={14} className="text-slate-400" />
                <select 
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[110px] w-full md:w-auto"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  {statusOptions.map(opt => <option key={opt.id} value={opt.id} className="dark:bg-slate-900">{opt.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-sm grow md:grow-0">
                <Archive size={14} className="text-slate-400 shrink-0" />
                <select
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[110px] w-full md:w-auto"
                  value={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.value as 'all' | 'active' | 'archived')}
                >
                  <option value="active" className="dark:bg-slate-900">Ativas</option>
                  <option value="archived" className="dark:bg-slate-900">Arquivadas</option>
                  <option value="all" className="dark:bg-slate-900">Todas</option>
                </select>
              </div>

              {/* Botões Mobile */}
              <div className="md:hidden flex gap-2">
                <button
                  onClick={handleTableExport}
                  disabled={isExportingTable}
                  className="p-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-green-400 transition-all shadow-sm active:scale-95"
                  title="Exportar Tabela Editável"
                >
                  {isExportingTable ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>

                <button 
                  onClick={handleExcelExport}
                  disabled={isExportingExcel}
                  className="p-2 bg-slate-600 text-white rounded-xl hover:bg-slate-700 disabled:bg-slate-400 transition-all shadow-sm active:scale-95"
                 title="Exportar Excel"
                >
                  {isExportingExcel ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
                </button>

                {user?.permissions?.config === 'write' && (
                    <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-400 transition-all shadow-sm active:scale-95"
                    >
                    {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                    </button>
                )}
              </div>
            </div>
            
            {/* Collapse button at the bottom of the filters inside mobile/tablet */}
            {showMobileFilters && (
              <div className="xl:hidden flex justify-center mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-850/50">
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold rounded-lg text-[11px] transition-colors shadow-xs"
                >
                  <ChevronLeft size={12} className="rotate-90 text-slate-400" />
                  <span>▲ Ocultar Filtros</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto w-full relative" 
        onScroll={handleListScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`compact-desktop-only overflow-x-auto h-full ${
          paginatedGroups.length <= 3 ? 'min-h-[calc(100vh+80px)] pb-56' : 'min-h-[300px]'
        }`}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-10 shadow-sm transition-colors">
              <tr>
                {user?.permissions?.orders === 'write' && (
                  <th className="px-4 py-4 w-[40px] text-center align-middle">
                    <input 
                      type="checkbox" 
                      checked={allSelected} 
                      onChange={handleSelectAllToggle}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                      onClick={(e) => e.stopPropagation()}
                      title="Selecionar / Desmarcar todos na página"
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap w-[15%]">
                    <div className="flex items-center gap-2">
                        Documento / PO
                        <div className="flex gap-1">
                            <button 
                                onClick={toggleHeaderPriorityFilter}
                                className={`transition-all hover:scale-110 active:scale-95 ${filterPriority !== 'All' ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}
                                title={filterPriority === 'All' ? "Filtrar por Prioridade" : "Limpar filtro de Prioridade"}
                            >
                                <Flag 
                                    size={14} 
                                    className={filterPriority === 'Any' || (filterPriority !== 'All' && filterPriority !== '0') ? 'fill-blue-500 text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'} 
                                    strokeWidth={2.5}
                                />
                            </button>
                            {/* Header M Filter */}
                            <button
                                onClick={() => setFilterManual(!filterManual)}
                                className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-bold transition-all hover:scale-110 active:scale-95 ${filterManual ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-300 dark:bg-slate-700 text-white dark:text-slate-300 opacity-50 hover:opacity-100'}`}
                                title="Filtrar por Confeção Manual"
                            >
                                M
                            </button>
                        </div>
                    </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap w-[35%]">Cliente (Comercial) / Ref + Cor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap w-[10%]">Medida / Família</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap w-[15%]">Qtd. Pedida / Entrega</th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center w-[5%]">
                    <button 
                        type="button"
                        onClick={() => setFilterHasObservations(!filterHasObservations)}
                        className={`flex items-center justify-center gap-1 mx-auto px-1.5 py-1 rounded-lg transition-all cursor-pointer ${
                          filterHasObservations 
                            ? 'bg-blue-600 text-white font-black shadow-xs ring-2 ring-blue-400/40' 
                            : 'hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800'
                        }`}
                        title={filterHasObservations ? "A mostrar apenas com observações (clique para mostrar todas)" : "Filtrar apenas encomendas com observações"}
                    >
                        <span>Obs.</span>
                        <Eye size={10} className={filterHasObservations ? "text-white" : "text-blue-500"} />
                    </button>
                </th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center w-[10%]">Classificação</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center w-[10%]">Estado</th>
                <th className="px-2 py-4 w-[60px] text-center sticky right-0 bg-slate-100 dark:bg-slate-900 z-10">
                  <div className="flex items-center justify-center gap-1.5 animate-fade-in">
                    {user?.role === 'admin' && onArchiveOrder && (
                      <span className="hidden xl:inline text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase transition-colors">Ações</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setShowMobileFilters(!showMobileFilters);
                      }}
                      className="xl:hidden p-1 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs transition-transform active:scale-90"
                      title={showMobileFilters ? "Ocultar Filtros" : "Mostrar Filtros"}
                    >
                      <Filter size={11} className={showMobileFilters ? "fill-blue-500 text-blue-500" : "text-slate-400"} />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950 transition-colors">
              {paginatedGroups.map((group, index) => {
                const isExpanded = expandedDocNrs.has(group.docNr);
                const isAllGroupSelected = isDocGroupSelected(group);
                const isPartialGroupSelected = isDocGroupPartiallySelected(group);
                const isFocused = focusedRowIndex === index;

                return (
                  <React.Fragment key={group.docNr}>
                    <tr 
                      id={`order-row-${group.docNr}`}
                      onClick={() => {
                        if (group.items.length === 1) {
                          onViewDetails(group.mainOrder);
                        } else {
                          toggleExpandDocNr(group.docNr);
                        }
                        setFocusedRowIndex(index);
                      }}
                      className={`hover:bg-blue-50/70 dark:hover:bg-slate-900/80 transition-colors group cursor-pointer scroll-mt-20 border-b border-slate-100 dark:border-slate-800/80 ${
                        group.isArchived ? 'opacity-50 bg-slate-50 dark:bg-slate-900/50' : ''
                      } ${
                        isAllGroupSelected || isPartialGroupSelected ? 'bg-blue-50/40 dark:bg-slate-900/40' : ''
                      } ${
                        isFocused ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''
                      } ${
                        isExpanded ? 'bg-blue-50/20 dark:bg-slate-900/40 font-medium' : ''
                      }`}
                    >
                      {user?.permissions?.orders === 'write' && (
                        <td className="px-4 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isAllGroupSelected} 
                            ref={el => { if (el) el.indeterminate = isPartialGroupSelected; }}
                            onChange={(e) => handleToggleDocSelect(group, e)}
                            className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                            title="Selecionar todas as linhas deste documento"
                          />
                        </td>
                      )}
                      <td className="px-6 py-3.5 align-top">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (group.items.length === 1) {
                                onViewDetails(group.mainOrder);
                              } else {
                                toggleExpandDocNr(group.docNr);
                              }
                            }}
                            className="p-1 -ml-1 text-slate-400 hover:text-blue-600 transition-colors shrink-0 mt-0.5 cursor-pointer"
                            title={group.items.length === 1 ? "Ver detalhes da encomenda" : isExpanded ? "Ocultar linhas" : "Ver linhas"}
                          >
                            <ChevronRight size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                          </button>

                          <div className="flex flex-col gap-1 shrink-0 pt-0.5 items-center">
                            {/* Priority Flag */}
                            <div className="relative">
                              <button 
                                onClick={(e) => user?.permissions?.orders === 'write' ? handlePriorityClick(e, group.mainOrder.id) : null}
                                className={`transition-all ${user?.permissions?.orders === 'write' ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'}`}
                                title={user?.permissions?.orders === 'write' ? "Alterar Prioridade" : "Prioridade"}
                              >
                                <Flag size={15} className={getPriorityColor(group.priority || 0)} strokeWidth={2} />
                              </button>
                              
                              {/* Priority Menu */}
                              {openPriorityMenuId === group.mainOrder.id && (
                                <div 
                                  ref={menuRef}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-6 left-0 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl p-2 z-50 flex flex-col gap-1 min-w-[140px] animate-in fade-in zoom-in-95"
                                >
                                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1">Definir Prioridade</p>
                                  <button onClick={() => handleSetPriority(group.docNr, 1)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-xs font-bold text-red-900 dark:text-red-400">
                                    <Flag size={12} className="fill-red-900 dark:fill-red-400"/> Alta
                                  </button>
                                  <button onClick={() => handleSetPriority(group.docNr, 2)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg text-xs font-bold text-orange-600 dark:text-orange-400">
                                    <Flag size={12} className="fill-orange-500 dark:fill-orange-400"/> Média
                                  </button>
                                  <button onClick={() => handleSetPriority(group.docNr, 3)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg text-xs font-bold text-yellow-500 dark:text-yellow-400">
                                    <Flag size={12} className="fill-yellow-400 dark:fill-yellow-400"/> Baixa
                                  </button>
                                  <div className="h-px bg-slate-100 dark:bg-slate-700 my-0.5"></div>
                                  <button onClick={() => handleSetPriority(group.docNr, 0)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400">
                                    <Flag size={12} className="text-slate-300 dark:text-slate-600"/> Remover
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Manual Confection 'M' Flag */}
                            <button
                              onClick={(e) => handleManualClick(e, group.docNr, group.isManual)}
                              className={`w-3.5 h-3.5 rounded text-[8px] font-bold flex items-center justify-center border transition-all ${user?.permissions?.orders === 'write' ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'} ${group.isManual ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-400 dark:hover:text-slate-500'}`}
                              title={user?.permissions?.orders === 'write' ? "Alternar Confeção Manual" : "Confeção Manual"}
                            >
                              M
                            </button>
                          </div>
                          
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 block text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {group.docNr ? <HighlightText text={group.docNr} highlight={highlights} /> : '-'}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap block mt-0.5">
                              PO: {group.po ? <HighlightText text={group.po} highlight={highlights} /> : '-'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-black text-slate-900 dark:text-white leading-tight block truncate max-w-[420px]" title={group.clientName}>
                            {group.clientName ? <HighlightText text={group.clientName.toUpperCase()} highlight={highlights} /> : <span className="text-slate-300 italic">Sem Cliente</span>}
                            {group.comercial && (
                              <span className="ml-2 text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                                ({<HighlightText text={group.comercial.toUpperCase()} highlight={highlights} />})
                              </span>
                            )}
                          </span>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                            <HighlightText text={group.referenceSummary} highlight={highlights} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                        <span className="text-sm font-black text-slate-800 dark:text-slate-200 block">
                          {group.items.length} {group.items.length === 1 ? 'linha' : 'linhas'}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {group.items.length === 1 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onViewDetails(group.mainOrder);
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer text-left flex items-center gap-0.5"
                              title="Ver detalhes da encomenda"
                            >
                              <span>Ver Detalhes</span>
                              <span className="text-[10px]">→</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleExpandDocNr(group.docNr);
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer text-left"
                                title={isExpanded ? "Ocultar linhas" : "Ver todas as linhas"}
                              >
                                {isExpanded ? '▲ Ocultar linhas' : '▼ Ver linhas'}
                              </button>
                              <span className="text-slate-300 dark:text-slate-600 text-xs">•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  onViewDetails(group.mainOrder);
                                }}
                                className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-semibold hover:underline cursor-pointer text-left"
                                title="Ver detalhes da encomenda"
                              >
                                Detalhes →
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 align-top">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 block">
                          {group.totalQtyRequested.toLocaleString('pt-PT')} <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">UN</span>
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
                          Em aberto: {group.totalQtyOpen.toLocaleString('pt-PT')}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
                          <Calendar size={11} className="text-slate-400" /> {formatDate(group.requestedDate)}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 align-middle text-center">
                        {group.hasObservations && (
                          <div title="Tem observações no documento">
                            <Eye size={16} className="text-slate-400 dark:text-slate-500 mx-auto group-hover:text-blue-500 dark:group-hover:text-blue-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        <StopReasonSelector 
                          currentReason={group.mainOrder.sectorStopReasons?.['planeamento']} 
                          onSelect={(reason) => handleOpenClassificationModal(group, reason)}
                          disabled={user?.permissions?.orders !== 'write'}
                          hierarchy={stopReasonsHierarchy}
                        />
                      </td>
                      <td className="px-6 py-3.5 align-middle text-center">
                        {getStatusBadge(group.mainOrder)}
                      </td>
                      <td className="px-2 py-3.5 align-middle text-center w-[60px]" onClick={(e) => e.stopPropagation()}>
                        {user?.role === 'admin' && onArchiveOrder ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setOrderToArchive(group.mainOrder);
                            }}
                            className={`p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95 ${group.isArchived ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                            title={group.isArchived ? `Desarquivar (arquivado por ${group.archivedBy})` : 'Arquivar encomenda'}
                          >
                            {group.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          </button>
                        ) : (
                          <div className="w-[16px] h-[16px]"></div>
                        )}
                      </td>
                    </tr>

                    {/* Subtabela de itens expandidos ao clicar no documento */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-blue-200 dark:border-blue-900/40">
                        <td colSpan={user?.permissions?.orders === 'write' ? 10 : 9} className="p-0">
                          <div className="p-3.5 pl-9 bg-gradient-to-r from-blue-50/50 via-slate-50/50 to-transparent dark:from-slate-900/60 dark:via-slate-900/40 dark:to-transparent border-l-4 border-l-blue-500 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <Layers size={13} className="text-blue-500" />
                                Itens da Encomenda {group.docNr} ({group.items.length} {group.items.length === 1 ? 'item' : 'itens'})
                              </span>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                Clique numa linha para ver detalhes completos e setores
                              </span>
                            </div>

                            <table className="w-full text-left text-xs bg-white dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xs">
                              <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="px-3 py-2 w-[45px] text-center">Item</th>
                                  <th className="px-4 py-2">Referência & Descrição</th>
                                  <th className="px-3 py-2">Cor</th>
                                  <th className="px-3 py-2">Medida</th>
                                  <th className="px-3 py-2">Família</th>
                                  <th className="px-3 py-2 text-right">Qtd. Pedida</th>
                                  <th className="px-3 py-2 text-right">Em Aberto</th>
                                  <th className="px-3 py-2 text-center">Entrega</th>
                                  <th className="px-2 py-2 text-center w-[40px]">Obs.</th>
                                  <th className="px-3 py-2 text-center">Estado</th>
                                  <th className="px-3 py-2 text-center w-[100px]">Ação</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                {group.items.map((item, idx) => (
                                  <tr
                                    key={item.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewDetails(item);
                                    }}
                                    className="hover:bg-blue-50/70 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                                  >
                                    <td className="px-3 py-2 text-center font-bold text-slate-400 text-[11px]">
                                      #{item.itemNr || idx + 1}
                                    </td>
                                    <td className="px-4 py-2 font-bold text-slate-900 dark:text-slate-100">
                                      {item.reference ? <HighlightText text={item.reference} highlight={highlights} /> : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                      {item.colorDesc ? <HighlightText text={item.colorDesc} highlight={highlights} /> : '-'}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                                      {item.sizeDesc || item.size || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 uppercase text-[11px]">
                                      {item.family || '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-slate-100">
                                      {item.qtyRequested?.toLocaleString('pt-PT')} <span className="text-[9px] text-slate-400 font-normal">UN</span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">
                                      {item.qtyOpen !== undefined ? item.qtyOpen.toLocaleString('pt-PT') : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-medium text-slate-600 dark:text-slate-400">
                                      {formatDate(item.requestedDate)}
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                      {hasObservations(item) && (
                                        <Eye size={13} className="text-blue-500 mx-auto" title="Tem observações" />
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {getStatusBadge(item)}
                                    </td>
                                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          onViewDetails(item);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[10px] font-bold transition-colors shadow-2xs cursor-pointer"
                                      >
                                        Ver Detalhes
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {paginatedGroups.length === 0 && (
                <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                        Nenhum resultado encontrado.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Mobile Grid - 1 Cartão por Documento com expansão ao clicar (Vertical e Landscape sem scroll lateral) */}
        <div className={`compact-mobile-only grid grid-cols-1 gap-1.5 p-1.5 sm:p-2 w-full max-w-full overflow-x-hidden ${
          paginatedGroups.length <= 3 ? 'min-h-[calc(100vh+80px)] pb-60' : 'pb-24'
        }`}>
          {paginatedGroups.map((group, index) => {
            const isExpanded = expandedDocNrs.has(group.docNr);
            const isGroupSelected = isDocGroupSelected(group);
            const isGroupPartial = isDocGroupPartiallySelected(group);
            const isSingleItem = group.items.length === 1;

            return (
              <div 
                key={group.docNr}
                id={`order-card-${group.docNr}`}
                onClick={() => {
                  const now = Date.now();
                  if (now - lastTouchTimeRef.current < 450) return;
                  if (isSingleItem) {
                    onViewDetails(group.mainOrder);
                  } else {
                    toggleExpandDocNr(group.docNr);
                  }
                }}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isExpanded 
                    ? 'border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-blue-500/20' 
                    : isGroupSelected || isGroupPartial
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/20 dark:bg-blue-900/10'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Linha 1: DocNr + Flags + Status */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {user?.permissions?.orders === 'write' && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={isGroupSelected} 
                          ref={el => { if (el) el.indeterminate = isGroupPartial; }}
                          onChange={(e) => handleToggleDocSelect(group, e)}
                          className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5 bg-white dark:bg-slate-800"
                        />
                      </div>
                    )}

                    {/* Bandeira Prioridade & Manual */}
                    <div className="flex items-center gap-1 shrink-0 relative" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={(e) => user?.permissions?.orders === 'write' ? handlePriorityClick(e, group.mainOrder.id) : null}
                        className={`transition-all ${user?.permissions?.orders === 'write' ? 'cursor-pointer' : 'cursor-default'}`}
                        title="Prioridade"
                      >
                        <Flag size={13} className={getPriorityColor(group.priority || 0)} strokeWidth={2} />
                      </button>

                      {openPriorityMenuId === group.mainOrder.id && (
                        <div 
                          ref={menuRef}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute top-5 left-0 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 z-50 flex flex-col gap-0.5 min-w-[130px] animate-in fade-in zoom-in-95 text-xs"
                        >
                          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-0.5">Prioridade</p>
                          <button onClick={() => handleSetPriority(group.docNr, 1)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-[11px] font-bold text-red-700 dark:text-red-400">
                            <Flag size={11} className="fill-red-700 dark:fill-red-400"/> Alta
                          </button>
                          <button onClick={() => handleSetPriority(group.docNr, 2)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded text-[11px] font-bold text-orange-600 dark:text-orange-400">
                            <Flag size={11} className="fill-orange-500 dark:fill-orange-400"/> Média
                          </button>
                          <button onClick={() => handleSetPriority(group.docNr, 3)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded text-[11px] font-bold text-yellow-600 dark:text-yellow-400">
                            <Flag size={11} className="fill-yellow-400 dark:fill-yellow-400"/> Baixa
                          </button>
                          <div className="h-px bg-slate-100 dark:bg-slate-700 my-0.5"></div>
                          <button onClick={() => handleSetPriority(group.docNr, 0)} className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 rounded text-[11px] font-medium text-slate-500">
                            <Flag size={11} className="text-slate-300"/> Remover
                          </button>
                        </div>
                      )}

                      {group.isManual && (
                        <div className="w-3 h-3 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[7px] font-black flex items-center justify-center border border-indigo-200 dark:border-indigo-800" title="Confeção Manual">M</div>
                      )}
                    </div>

                    {/* docNr e botão para expandir ou abrir detalhes */}
                    <div 
                      onTouchEnd={(e) => handleDocNrTouchEnd(group.docNr, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSingleItem) {
                          onViewDetails(group.mainOrder);
                        } else {
                          toggleExpandDocNr(group.docNr);
                        }
                      }}
                      className="select-none flex items-center gap-1 min-w-0 group/doc cursor-pointer"
                    >
                      <h3 className="font-black text-slate-800 dark:text-white text-xs leading-none tracking-tight group-hover/doc:text-blue-600 transition-colors">
                        {group.docNr ? <HighlightText text={group.docNr} highlight={highlights} /> : '-'}
                      </h3>
                      
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.2 rounded-md border flex items-center gap-0.5 transition-colors ${
                          isExpanded 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span>{group.items.length} {group.items.length === 1 ? 'linha' : 'linhas'}</span>
                        {!isSingleItem && (
                          <ChevronDown size={10} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        )}
                      </span>
                    </div>

                    {group.hasObservations && (
                      <Eye size={12} className="text-blue-500 shrink-0" title="Tem observações" />
                    )}
                  </div>

                  {/* Estado Badge + Arquivar */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="scale-90 origin-right">
                      {getStatusBadge(group.mainOrder)}
                    </div>
                    {user?.role === 'admin' && onArchiveOrder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setOrderToArchive(group.mainOrder);
                        }}
                        title={group.isArchived ? `Desarquivar (${group.archivedBy})` : 'Arquivar'}
                        className={`p-1 rounded transition-all active:scale-95 ${group.isArchived ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 hover:text-amber-500'}`}
                      >
                        {group.isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Linha 2: Cliente + Comercial + Totais */}
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                      {group.clientName ? <HighlightText text={group.clientName.toUpperCase()} highlight={highlights} /> : '-'}
                      {group.comercial && <span className="ml-1 text-[10px] text-blue-500 font-semibold italic">({<HighlightText text={group.comercial.toUpperCase()} highlight={highlights} />})</span>}
                    </p>
                    {group.po && (
                      <p className="text-[9px] text-slate-400 font-medium truncate">
                        PO: {<HighlightText text={group.po} highlight={highlights} />}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                      {group.totalQtyRequested.toLocaleString('pt-PT')} <span className="text-[8px] font-normal text-slate-400">UN</span>
                    </span>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex items-center justify-end gap-1 leading-none mt-0.5">
                      <Calendar size={10} className="text-slate-400" />
                      {formatDate(group.requestedDate)}
                    </p>
                  </div>
                </div>

                {/* Linha 3: Resumo quando Colapsado */}
                {!isExpanded && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                      <Layers size={11} className="text-blue-500 shrink-0" />
                      <span className="truncate">{group.referenceSummary}</span>
                    </span>

                    {isSingleItem ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onViewDetails(group.mainOrder);
                        }}
                        className="text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:underline shrink-0 flex items-center gap-0.5 cursor-pointer"
                        title="Ver detalhes da encomenda"
                      >
                        <span>Ver Detalhes</span>
                        <span>→</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleExpandDocNr(group.docNr);
                        }}
                        className="text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:underline shrink-0 cursor-pointer"
                        title="Ver todas as linhas deste documento"
                      >
                        Ver linhas ({group.items.length}) ▼
                      </button>
                    )}
                  </div>
                )}

                {/* ITENS EXPANDIDOS (Aparecem após Clicar no cartão) */}
                {isExpanded && (
                  <div 
                    className="mt-2 pt-2 border-t border-blue-100 dark:border-slate-800 space-y-1.5 animate-in fade-in duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Linhas do Documento ({group.items.length})
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleExpandDocNr(group.docNr);
                        }}
                        className="text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                      >
                        ▲ Ocultar linhas
                      </button>
                    </div>

                    <div className="space-y-1">
                      {group.items.map((item, itemIdx) => (
                        <div 
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onViewDetails(item);
                          }}
                          className="p-2 bg-slate-50 dark:bg-slate-850/60 hover:bg-blue-50/50 dark:hover:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 transition-colors cursor-pointer flex flex-col gap-1 active:scale-99"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[9px] font-black text-slate-400 bg-white dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                                #{item.itemNr || itemIdx + 1}
                              </span>
                              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                                {item.reference ? <HighlightText text={item.reference} highlight={highlights} /> : '-'}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {item.colorDesc ? <HighlightText text={item.colorDesc} highlight={highlights} /> : ''}
                              </span>
                            </div>
                            <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 shrink-0">
                              {item.qtyRequested.toLocaleString('pt-PT')} UN
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="truncate">
                              {item.sizeDesc || item.size || '-'} {item.family ? `• ${item.family}` : ''}
                            </span>
                            <div 
                              className="flex items-center gap-1.5 shrink-0" 
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onViewDetails(item);
                              }}
                            >
                              {hasObservations(item) && <Eye size={12} className="text-blue-500" title="Tem observações" />}
                              <button
                                type="button"
                                className="text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                Detalhes →
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {paginatedGroups.length === 0 && (
             <div className="p-8 text-center text-slate-400 font-medium text-xs">Nenhum resultado encontrado.</div>
          )}
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 flex items-center justify-between shrink-0 safe-bottom transition-colors">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium pl-2">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>
            <div className="flex gap-1.5">
                <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent text-slate-600 dark:text-slate-400"
                >
                    <ChevronLeft size={18} />
                </button>
                <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent text-slate-600 dark:text-slate-400"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
      )}
      
      {orderToArchive && (
        <ConfirmModal 
          title={orderToArchive.isArchived ? "Desarquivar Encomenda" : "Arquivar Encomenda"}
          message={`Tem a certeza que deseja ${orderToArchive.isArchived ? 'desarquivar' : 'arquivar'} a encomenda ${orderToArchive.docNr}?`}
          confirmText={orderToArchive.isArchived ? 'Desarquivar' : 'Arquivar'}
          isDestructive={!orderToArchive.isArchived}
          onConfirm={() => {
            if (onArchiveOrder) {
               onArchiveOrder(orderToArchive.docNr, !orderToArchive.isArchived);
            }
            setOrderToArchive(null);
          }}
          onCancel={() => setOrderToArchive(null)}
        />
      )}

      {/* Floating Bulk Actions Bar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[45] w-[92%] md:w-auto max-w-4xl bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl flex flex-col md:flex-row items-center gap-4 py-3.5 pb-4 md:pb-3.5 px-5 text-white animate-in slide-in-from-bottom-5 duration-300 transition-all font-sans text-xs">
          {/* Left item: Selection Info */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <div className="h-5 px-2 bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg flex items-center justify-center font-black">
                {selectedOrderIds.size}
              </div>
              <span className="font-bold text-slate-200">Selecionadas</span>
              <span className="text-slate-500 hidden md:inline">|</span>
              <span className="text-slate-400 text-[10px] uppercase font-bold">({selectedDocNrs.length} Docs)</span>
            </div>
            
            <button 
              onClick={() => setSelectedOrderIds(new Set())}
              className="px-2.5 py-1 bg-slate-850 hover:bg-slate-800 hover:text-white transition-colors text-slate-400 font-bold rounded-lg flex items-center gap-1 border border-slate-800"
              title="Limpar seleção"
            >
              <X size={12} />
              <span className="hidden md:inline">Limpar</span>
            </button>
          </div>

          <div className="w-full md:w-px h-px md:h-6 bg-slate-800 my-1 md:my-0"></div>

          {/* Core Bulk Action Options */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-center">
            {/* Priority Select */}
            {onUpdatePriority && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                <Flag size={14} className="text-slate-400" />
                <select
                  className="bg-transparent outline-none text-xs font-bold text-slate-200 cursor-pointer"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      handleBulkPriority(Number(e.target.value));
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">Prioridade...</option>
                  <option value="1" className="bg-slate-900 text-red-400 font-bold">Alta</option>
                  <option value="2" className="bg-slate-900 text-orange-400 font-bold">Média</option>
                  <option value="3" className="bg-slate-900 text-yellow-500 font-bold">Baixa</option>
                  <option value="0" className="bg-slate-900 text-slate-300">Sem Prioridade</option>
                </select>
              </div>
            )}

            {/* Classification Option */}
            {onUpdateStopReason && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                <Tag size={14} className="text-slate-400" />
                <select
                  className="bg-transparent outline-none text-xs font-bold text-slate-200 cursor-pointer max-w-[140px]"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      handleBulkStopReason(e.target.value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">Classificação...</option>
                  <option value="none" className="bg-slate-900 text-rose-400 font-bold">Limpar Classificação</option>
                  {allReasonOptions.map(reason => (
                    <option key={reason} value={reason} className="bg-slate-900 text-slate-200">{reason}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Manual Confection M Toggle */}
            {onUpdateManual && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                <span className="text-xs font-black text-indigo-400">M</span>
                <select
                  className="bg-transparent outline-none text-xs font-bold text-slate-200 cursor-pointer"
                  value=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      handleBulkManual(e.target.value === "true");
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled className="bg-slate-900 text-slate-400">Confeção Manual...</option>
                  <option value="true" className="bg-slate-900 text-slate-200">Sim (Manual)</option>
                  <option value="false" className="bg-slate-900 text-slate-200">Não (Auto)</option>
                </select>
              </div>
            )}

            {/* Admin Archive Actions */}
            {user?.role === 'admin' && onArchiveOrder && (
              <div className="flex items-center gap-2 border-l border-slate-800 md:pl-2">
                <button
                  onClick={() => setBulkArchiveConfirm(true)}
                  className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600 border border-amber-500/30 hover:border-amber-500 text-amber-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="Arquivar encomendas selecionadas"
                >
                  <Archive size={14} />
                  <span>Arquivar</span>
                </button>
                <button
                  onClick={() => setBulkUnarchiveConfirm(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="Desarquivar encomendas selecionadas"
                >
                  <ArchiveRestore size={14} />
                  <span>Desarquivar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modals for Bulk Actions */}
      {bulkArchiveConfirm && (
        <ConfirmModal 
          title="Arquivar Encomendas em Lote"
          message={`Tem a certeza que deseja arquivar as ${selectedOrderIds.size} encomendas selecionadas (${selectedDocNrs.length} documentos únicos)?`}
          confirmText="Sim, Arquivar"
          isDestructive={true}
          onConfirm={executeBulkArchive}
          onCancel={() => setBulkArchiveConfirm(false)}
        />
      )}

      {bulkUnarchiveConfirm && (
        <ConfirmModal 
          title="Desarquivar Encomendas em Lote"
          message={`Tem a certeza que deseja desarquivar as ${selectedOrderIds.size} encomendas selecionadas (${selectedDocNrs.length} documentos únicos)?`}
          confirmText="Sim, Desarquivar"
          isDestructive={false}
          onConfirm={executeBulkUnarchive}
          onCancel={() => setBulkUnarchiveConfirm(false)}
        />
      )}

      {/* Modal de Validação Obrigatória de Observações e Seleção de Âmbito de Itens */}
      {pendingChange && (
        <OrderChangeModal
          isOpen={true}
          onClose={() => setPendingChange(null)}
          docNr={pendingChange.docNr}
          items={pendingChange.items}
          clientName={pendingChange.clientName}
          sectorName={pendingChange.sectorName}
          currentReason={pendingChange.currentReason}
          newReason={pendingChange.newReason}
          currentDate={pendingChange.currentDate}
          newDate={pendingChange.newDate}
          onConfirm={handleConfirmChange}
        />
      )}
    </div>
  );
});

export default OrderTable;