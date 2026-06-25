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
  onUpdateStopReason?: (docNr: string, sectorId: string, reason: string) => void;
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

  // Estado para controlar qual menu de prioridade está aberto
  const [openPriorityMenuId, setOpenPriorityMenuId] = React.useState<string | null>(null);
  const [orderToArchive, setOrderToArchive] = React.useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<string>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = React.useState(false);
  const [bulkUnarchiveConfirm, setBulkUnarchiveConfirm] = React.useState(false);
  const [showMobileFilters, setShowMobileFilters] = React.useState(true);
  const lastScrollTop = React.useRef(0);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 1280) return;
    const scrollTop = e.currentTarget.scrollTop;
    // Only auto-collapse if scrolling down from near the top (e.g., from under 40px)
    if (scrollTop > lastScrollTop.current && scrollTop > 80 && lastScrollTop.current < 40) {
      if (showMobileFilters) {
        setShowMobileFilters(false);
      }
    } else if (scrollTop === 0) {
      if (!showMobileFilters) {
        setShowMobileFilters(true);
      }
    }
    lastScrollTop.current = scrollTop;
  };
  
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

  const hasObservations = (order: Order) => {
    return order.sectorObservations && Object.values(order.sectorObservations).some(v => v && v.trim() !== '');
  };

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

      // Filtro de Semana (Dinâmico)
      let matchesWeek = true;
      if (filterDate) {
          const dateToCheck = o.requestedDate || o.armExpDate;
          matchesWeek = !!dateToCheck && dateToCheck >= weekStart && dateToCheck <= weekEnd;
      }

      const matchesObservations = !filterHasObservations || hasObservations(o);

      // Filtro arquivado
      let matchesArchived = true;
      if (filterArchived === 'active') matchesArchived = !o.isArchived;
      else if (filterArchived === 'archived') matchesArchived = !!o.isArchived;

      const search = deferredSearch.toLowerCase().trim();
      const matchesSearch = !search || 
                            (o.docNr || '').toLowerCase().includes(search) || 
                            (o.po || '').toLowerCase().includes(search) ||
                            (o.reference || '').toLowerCase().includes(search) ||
                            (o.comercial || '').toLowerCase().includes(search) ||
                            (o.clientName || '').toLowerCase().includes(search) ||
                            (o.family || '').toLowerCase().includes(search) ||
                            (o.sizeDesc || '').toLowerCase().includes(search);
                            
      const globalSearch = (globalSearchTerm || '').toLowerCase().trim();
      const matchesGlobalSearch = !globalSearch || 
                                  (o.docNr || '').toLowerCase().includes(globalSearch) ||
                                  (o.itemNr !== undefined && o.itemNr.toString().includes(globalSearch));
      
      return matchesDocSeries && matchesComercial && matchesReference && matchesStatus && matchesSearch && matchesGlobalSearch && matchesObservations && matchesWeek && matchesFlags && matchesArchived;
    });
  }, [orders, deferredSearch, globalSearchTerm, filterStatus, filterDocSeries, filterComercial, filterReference, filterHasObservations, filterDate, filterPriority, filterManual, activeFilter, filterArchived]);

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

  // Pagination Logic
  const totalPages = Math.ceil(finalFilteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return finalFilteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [finalFilteredOrders, currentPage]);

  const [focusedRowIndex, setFocusedRowIndex] = React.useState(-1);

  React.useEffect(() => {
    setFocusedRowIndex(-1);
  }, [paginatedOrders]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) return;

      if (e.key === 'ArrowDown') {
        setFocusedRowIndex(prev => {
          if (paginatedOrders.length === 0) return prev;
          e.preventDefault();
          const next = Math.min(prev === -1 ? 0 : prev + 1, paginatedOrders.length - 1);
          const tr = document.getElementById(`order-row-${paginatedOrders[next].id}`);
          const card = document.getElementById(`order-card-${paginatedOrders[next].id}`);
          if (window.innerWidth >= 768 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        setFocusedRowIndex(prev => {
          if (paginatedOrders.length === 0 || prev <= 0) return prev;
          e.preventDefault();
          const next = Math.max(prev - 1, 0);
          const tr = document.getElementById(`order-row-${paginatedOrders[next].id}`);
          const card = document.getElementById(`order-card-${paginatedOrders[next].id}`);
          if (window.innerWidth >= 768 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (focusedRowIndex >= 0 && focusedRowIndex < paginatedOrders.length) {
          e.preventDefault();
          onViewDetails(paginatedOrders[focusedRowIndex]);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedOrders, focusedRowIndex, onViewDetails]);

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

  // Bulk Selection and Update Helpers
  const allSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrderIds.has(o.id));
  
  const handleSelectAllToggle = () => {
    const newSelected = new Set(selectedOrderIds);
    if (allSelected) {
      paginatedOrders.forEach(o => newSelected.delete(o.id));
    } else {
      paginatedOrders.forEach(o => newSelected.add(o.id));
    }
    setSelectedOrderIds(newSelected);
  };

  const handleToggleSelectOrder = (e: React.MouseEvent | React.ChangeEvent, orderId: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
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
      selectedDocNrs.forEach(docNr => {
        onUpdateStopReason(docNr, 'planeamento', reason === 'none' ? '' : reason);
      });
      setSelectedOrderIds(new Set());
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

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
            <ListFilter size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white transition-colors">Listagem de Encomendas</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">{finalFilteredOrders.length} registos encontrados</p>
              {filterDate && (
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 animate-in fade-in">
                      Filtro: Semana {getISOWeek(filterDate)}
                  </span>
              )}
              {filterManual && (
                  <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 animate-in fade-in">
                      Filtro: Conf. Manual
                  </span>
              )}
              {filterArchived === 'archived' && (
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 animate-in fade-in flex items-center gap-1">
                      <Archive size={10} /> Arquivadas
                  </span>
              )}
              {filterArchived === 'all' && (
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 animate-in fade-in">
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
      <div className="xl:hidden flex justify-between items-center p-3.5 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Painel de Pesquisa</span>
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className={`p-1.5 rounded-xl border transition-all active:scale-95 flex items-center gap-1.5 ${
            showMobileFilters 
              ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600' 
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
          }`}
          title={showMobileFilters ? "Ocultar Pesquisa" : "Mostrar Pesquisa"}
        >
          <Filter size={14} className={showMobileFilters ? "fill-white/10" : "text-slate-500"} />
          <span className="text-xs font-bold">{showMobileFilters ? "Ocultar" : "Mostrar"}</span>
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

      <div className={`transition-all duration-300 ease-in-out xl:max-h-none xl:opacity-100 xl:overflow-visible xl:pointer-events-auto ${
        showMobileFilters 
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
              
              {/* Seletor de Semana Atualizado */}
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
                <div className="flex items-center bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-xl shadow-sm overflow-hidden grow md:grow-0">
                  <button onClick={handlePrevWeek} className="px-2 py-2 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="px-2 flex flex-col items-center justify-center min-w-[100px]">
                    <span className="text-[10px] font-black uppercase text-blue-500 dark:text-blue-400 leading-none">Semana {getISOWeek(filterDate)}</span>
                    <span className="text-[10px] font-medium text-blue-700 dark:text-blue-200 leading-none mt-0.5">
                       {(() => {
                         const {start, end} = getWeekRange(filterDate);
                         return `${start.getDate()} ${start.toLocaleString('pt-PT', {month: 'short'})} - ${end.getDate()} ${end.toLocaleString('pt-PT', {month: 'short'})}`;
                       })()}
                    </span>
                  </div>
                  <button onClick={handleNextWeek} className="px-2 py-2 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                  <div className="w-px h-6 bg-blue-200 dark:bg-blue-800 mx-1"></div>
                  <button onClick={() => setFilterDate(null)} className="px-2 py-2 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-blue-400 dark:text-blue-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}

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
      
      <div className="flex-1 overflow-y-auto w-full relative" onScroll={handleListScroll}>
        <div className="hidden md:block overflow-x-auto h-full min-h-[300px]">
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
                        onClick={() => setFilterHasObservations(!filterHasObservations)}
                        className={`flex items-center justify-center gap-1 mx-auto transition-all ${filterHasObservations ? 'text-blue-600 dark:text-blue-400 scale-110' : 'hover:text-slate-600 dark:hover:text-slate-300'}`}
                        title={filterHasObservations ? "Mostrar todas" : "Filtrar apenas com observações"}
                    >
                        Obs.
                        <Filter size={10} strokeWidth={3} className={filterHasObservations ? "fill-blue-100 dark:fill-blue-900" : ""} />
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
              {paginatedOrders.map((order, index) => (
                <tr 
                  key={order.id} 
                  id={`order-row-${order.id}`}
                  onClick={() => {
                    if (focusedRowIndex === index) {
                      onViewDetails(order);
                    } else {
                      setFocusedRowIndex(index);
                    }
                  }}
                  className={`hover:bg-blue-50 dark:hover:bg-slate-900 transition-colors group cursor-pointer scroll-mt-20 ${order.isArchived ? 'opacity-50 bg-slate-50 dark:bg-slate-900/50' : ''} ${selectedOrderIds.has(order.id) ? 'bg-blue-50/50 dark:bg-slate-900/40' : ''} ${focusedRowIndex === index ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}
                >
                  {user?.permissions?.orders === 'write' && (
                    <td className="px-4 py-4 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedOrderIds.has(order.id)} 
                        onChange={(e) => handleToggleSelectOrder(e, order.id)}
                        className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                        title="Selecionar encomenda"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4 align-top">
                    <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1.5 shrink-0 pt-0.5 items-center">
                            {/* Priority Flag */}
                            <div className="relative">
                                <button 
                                    onClick={(e) => user?.permissions?.orders === 'write' ? handlePriorityClick(e, order.id) : null}
                                    className={`transition-all ${user?.permissions?.orders === 'write' ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'}`}
                                    title={user?.permissions?.orders === 'write' ? "Alterar Prioridade" : "Prioridade"}
                                >
                                    <Flag size={16} className={getPriorityColor(order.priority || 0)} strokeWidth={2} />
                                </button>
                                
                                {/* Priority Menu */}
                                {openPriorityMenuId === order.id && (
                                    <div 
                                        ref={menuRef}
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute top-6 left-0 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl p-2 z-50 flex flex-col gap-1 min-w-[140px] animate-in fade-in zoom-in-95"
                                    >
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1">Definir Prioridade</p>
                                        <button onClick={() => handleSetPriority(order.docNr, 1)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-xs font-bold text-red-900 dark:text-red-400">
                                            <Flag size={12} className="fill-red-900 dark:fill-red-400"/> Alta
                                        </button>
                                        <button onClick={() => handleSetPriority(order.docNr, 2)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg text-xs font-bold text-orange-600 dark:text-orange-400">
                                            <Flag size={12} className="fill-orange-500 dark:fill-orange-400"/> Média
                                        </button>
                                        <button onClick={() => handleSetPriority(order.docNr, 3)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg text-xs font-bold text-yellow-500 dark:text-yellow-400">
                                            <Flag size={12} className="fill-yellow-400 dark:fill-yellow-400"/> Baixa
                                        </button>
                                        <div className="h-px bg-slate-100 dark:bg-slate-700 my-0.5"></div>
                                        <button onClick={() => handleSetPriority(order.docNr, 0)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400">
                                            <Flag size={12} className="text-slate-300 dark:text-slate-600"/> Remover
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Manual Confection 'M' Flag */}
                            <button
                                onClick={(e) => handleManualClick(e, order.docNr, !!order.isManual)}
                                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${user?.permissions?.orders === 'write' ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'} ${order.isManual ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-400 dark:hover:text-slate-500'}`}
                                title={user?.permissions?.orders === 'write' ? "Alternar Confeção Manual" : "Confeção Manual"}
                            >
                                M
                            </button>
                        </div>
                        
                        <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{order.docNr || '-'}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap block mt-0.5">PO: {order.po || '-'}</span>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-black text-slate-900 dark:text-white leading-tight block truncate max-w-[400px]" title={order.clientName}>
                            {order.clientName || <span className="text-slate-300 italic">Sem Cliente</span>}
                            {order.comercial && <span className="ml-2 text-[10px] text-blue-500 dark:text-blue-400 font-bold">({order.comercial})</span>}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] max-w-[400px] mt-1">
                            <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 whitespace-nowrap" title="Referência">
                                {order.reference || '-'}
                            </span>
                            {order.colorDesc && (
                                <span className="font-medium text-slate-500 dark:text-slate-400 truncate border-l border-slate-300 dark:border-slate-700 pl-2" title={`Cor: ${order.colorDesc}`}>
                                    {order.colorDesc}
                                </span>
                            )}
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate max-w-[100px]">
                      {order.sizeDesc || '-'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[100px] uppercase font-medium mt-0.5">
                      {order.family || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 align-top">
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 block">{order.qtyRequested.toLocaleString('pt-PT')} <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal">UN</span></span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5 mt-1">
                       <Calendar size={11} className="text-slate-400" /> {formatDate(order.requestedDate)}
                    </span>
                  </td>
                  <td className="px-2 py-4 align-middle text-center">
                    {hasObservations(order) && (
                        <div title="Tem observações">
                            <Eye size={16} className="text-slate-400 dark:text-slate-500 mx-auto group-hover:text-blue-500 dark:group-hover:text-blue-400" />
                        </div>
                    )}
                  </td>
                  <td className="px-2 py-4 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                    <StopReasonSelector 
                        currentReason={order.sectorStopReasons?.['planeamento']} 
                        onSelect={(reason) => onUpdateStopReason?.(order.docNr, 'planeamento', reason)}
                        disabled={user?.permissions?.orders !== 'write'}
                        hierarchy={stopReasonsHierarchy}
                    />
                  </td>
                  <td className="px-6 py-4 align-middle text-center">
                    {getStatusBadge(order)}
                  </td>
                  <td className="px-2 py-4 align-middle text-center w-[60px]" onClick={(e) => e.stopPropagation()}>
                    {user?.role === 'admin' && onArchiveOrder ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setOrderToArchive(order);
                        }}
                        className={`p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95 ${order.isArchived ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20' : 'text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                        title={order.isArchived ? `Desarquivar (arquivado por ${order.archivedBy})` : 'Arquivar encomenda'}
                      >
                        {order.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                      </button>
                    ) : (
                      <div className="w-[16px] h-[16px]"></div>
                    )}
                  </td>
                </tr>
              ))}
              {paginatedOrders.length === 0 && (
                <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                        Nenhum resultado encontrado.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Mobile Grid */}
        <div className="md:hidden grid grid-cols-1 gap-3 p-4">
          {paginatedOrders.map((order, index) => (
            <div 
              key={order.id}
              id={`order-card-${order.id}`}
              onClick={() => {
                if (focusedRowIndex === index) {
                  onViewDetails(order);
                } else {
                  setFocusedRowIndex(index);
                }
              }}
              className={`p-4 rounded-2xl border transition-colors space-y-4 scroll-mt-20 ${selectedOrderIds.has(order.id) ? 'border-blue-300 dark:border-blue-700 bg-blue-50/20 dark:bg-blue-900/10' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm active:bg-slate-50 dark:active:bg-slate-800'} ${focusedRowIndex === index ? 'ring-2 ring-inset ring-blue-500' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start gap-2">
                   {user?.permissions?.orders === 'write' && (
                     <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                       <input 
                         type="checkbox" 
                         checked={selectedOrderIds.has(order.id)} 
                         onChange={(e) => handleToggleSelectOrder(e, order.id)}
                         className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800 mr-1"
                       />
                     </div>
                   )}
                   {/* Mobile Flags Container */}
                    <div className="pt-0.5 flex flex-col gap-1 items-center relative">
                        <button 
                            onClick={(e) => user?.permissions?.orders === 'write' ? handlePriorityClick(e, order.id) : null}
                            className={`transition-all ${user?.permissions?.orders === 'write' ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                           <Flag size={16} className={getPriorityColor(order.priority || 0)} strokeWidth={2} />
                        </button>
                        
                        {/* Priority Menu Mobile */}
                        {openPriorityMenuId === order.id && (
                            <div 
                                ref={menuRef}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-6 left-0 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl p-2 z-50 flex flex-col gap-1 min-w-[140px] animate-in fade-in zoom-in-95"
                            >
                                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase px-2 mb-1">Definir Prioridade</p>
                                <button onClick={() => handleSetPriority(order.docNr, 1)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-xs font-bold text-red-900 dark:text-red-400">
                                    <Flag size={12} className="fill-red-900 dark:fill-red-400"/> Alta
                                </button>
                                <button onClick={() => handleSetPriority(order.docNr, 2)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg text-xs font-bold text-orange-600 dark:text-orange-400">
                                    <Flag size={12} className="fill-orange-500 dark:fill-orange-400"/> Média
                                </button>
                                <button onClick={() => handleSetPriority(order.docNr, 3)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg text-xs font-bold text-yellow-500 dark:text-yellow-400">
                                    <Flag size={12} className="fill-yellow-400 dark:fill-yellow-400"/> Baixa
                                </button>
                                <div className="h-px bg-slate-100 dark:bg-slate-700 my-0.5"></div>
                                <button onClick={() => handleSetPriority(order.docNr, 0)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400">
                                    <Flag size={12} className="text-slate-300 dark:text-slate-600"/> Remover
                                </button>
                            </div>
                        )}
                        {order.isManual ? (
                            <div className="w-3.5 h-3.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[8px] font-bold flex items-center justify-center border border-indigo-200 dark:border-indigo-800">M</div>
                        ) : null}
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 dark:text-white text-base leading-none">{order.docNr || '-'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">PO: {order.po || '-'}</p>
                            {hasObservations(order) && <Eye size={14} className="text-blue-500" />}
                        </div>
                    </div>
                </div>
                {getStatusBadge(order)}
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                <div className="col-span-2">
                   <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Cliente / Comercial</p>
                   <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                        {order.clientName || '-'}
                        {order.comercial && <span className="ml-1 text-[11px] text-blue-500 font-bold italic">({order.comercial})</span>}
                   </p>
                </div>
                <div className="col-span-2">
                   <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Ref / Cor</p>
                   <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{order.reference || '-'}</span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{order.colorDesc}</span>
                   </div>
                </div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Medida</p>
                   <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-tight truncate">{order.sizeDesc || '-'}</p>
                </div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Família</p>
                   <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-tight truncate">{order.family || '-'}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Qtd. Pedida</p>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-200">{order.qtyRequested.toLocaleString('pt-PT')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Entrega</p>
                  <div className="flex items-center gap-2 justify-end">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{formatDate(order.requestedDate)}</p>
                    {user?.role === 'admin' && onArchiveOrder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setOrderToArchive(order);
                        }}
                        title={order.isArchived ? `Desarquivar (arquivado por ${order.archivedBy})` : 'Arquivar encomenda'}
                        className={`p-1.5 rounded-lg transition-all active:scale-95 ${order.isArchived ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 bg-slate-50 dark:bg-slate-800'}`}
                      >
                        {order.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {paginatedOrders.length === 0 && (
             <div className="p-8 text-center text-slate-400 font-medium">Nenhum resultado encontrado.</div>
          )}
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 flex items-center justify-between shrink-0 safe-bottom transition-colors">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium pl-2">
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>
            <div className="flex gap-2">
                <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent text-slate-600 dark:text-slate-400"
                >
                    <ChevronLeft size={20} />
                </button>
                <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent text-slate-600 dark:text-slate-400"
                >
                    <ChevronRight size={20} />
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
    </div>
  );
});

export default OrderTable;