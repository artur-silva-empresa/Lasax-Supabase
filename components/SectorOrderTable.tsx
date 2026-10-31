import React from 'react';
import { 
  Search, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Layers,
  Calendar,
  Save,
  Edit2,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Zap,
  Filter,
  ListFilter,
  Flag,
  FileText,
  Users,
  Tag,
  Archive,
  Trash2,
  Download,
  Loader2
} from 'lucide-react';
import { Order, Sector, User, ProductionCapacity, OrderState } from '../types';
import { getOrderState, getWeekRange, exportCustomColumns, loadExportColumnsConfig, DEFAULT_SELECTED_COLUMNS } from '../services/dataService';
import { formatDate } from '../utils/formatters';
import StopReasonSelector from './StopReasonSelector';
import { calcOrderCapacityInfo } from '../utils/capacityUtils';
import { SECTORS } from '../constants';
import HighlightText from './HighlightText';

interface SectorOrderTableProps {
  orders: Order[];
  sector: Sector;
  onViewDetails: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  stopReasonsHierarchy: any[];
  user: User | null;
  capacities?: ProductionCapacity[];
  globalSearchTerm?: string;
  globalFilterDate?: Date | null;
  onGlobalFilterDateChange?: (date: Date | null) => void;
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

const ResizableHeader = ({ 
  colId, 
  title, 
  width, 
  onResize, 
  className = '' 
}: { 
  colId: string, 
  title: React.ReactNode, 
  width?: number, 
  onResize: (id: string, e: React.MouseEvent | React.TouchEvent) => void,
  className?: string 
}) => {
  return (
    <th 
      className={`relative px-4 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest group ${className}`}
      style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : {}}
    >
      <div className="truncate w-full">{title}</div>
      <div 
        onMouseDown={(e) => onResize(colId, e)}
        onTouchStart={(e) => onResize(colId, e)}
        className="absolute right-0 top-0 h-full w-4 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 z-10"
        style={{ transform: 'translateX(50%)' }}
      />
    </th>
  );
};

const SectorOrderTable: React.FC<SectorOrderTableProps> = ({ orders, sector, onViewDetails, onUpdateOrder, stopReasonsHierarchy, user, capacities = [], globalSearchTerm, globalFilterDate, onGlobalFilterDateChange }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchTerm);
  const [currentPage, setCurrentPage] = React.useState(1);
  // Filtros fechados por predefinição em smartphone
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  const lastScrollTop = React.useRef(0);

  // Estados para exportação Tabela Personalizada
  const [isExportingTable, setIsExportingTable] = React.useState(false);
  const [tableExportSuccess, setTableExportSuccess] = React.useState(false);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const isScrollingDown = scrollTop > lastScrollTop.current;

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
  
  // State for column widths
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('sector_table_col_widths');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleColResize = React.useCallback((colId: string, e: React.MouseEvent | React.TouchEvent) => {
    // e.preventDefault();
    const th = (e.target as HTMLElement).closest('th');
    if (!th) return;
    
    // Determine start coordinate
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const startX = clientX;
    const startWidth = th.offsetWidth;
    let finalWidth = startWidth;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : (moveEvent as MouseEvent).clientX;
      finalWidth = Math.max(60, startWidth + (currentX - startX));
      setColumnWidths(prev => ({ ...prev, [colId]: finalWidth }));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      
      setColumnWidths(prev => {
        const next = { ...prev, [colId]: finalWidth };
        localStorage.setItem('sector_table_col_widths', JSON.stringify(next));
        return next;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // State for inline editing
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editObs, setEditObs] = React.useState('');
  const [editDate, setEditDate] = React.useState<string>('');

  // Helper to get sector specific data
  const getSectorProducedQty = (order: Order): number => {
    switch (sector.id) {
      case 'tecelagem': return order.felpoCruQty;
      case 'felpo_cru': return order.felpoCruQty;
      case 'tinturaria': return order.tinturariaQty;
      case 'confeccao': return order.confRoupoesQty + order.confFelposQty;
      case 'embalagem': return order.embAcabQty;
      case 'expedicao': return order.stockCxQty;
      default: return 0;
    }
  };

  const getSectorDate = (order: Order): Date | null => {
    switch (sector.id) {
      case 'tecelagem': return order.dataTec;
      case 'felpo_cru': return order.felpoCruDate;
      case 'tinturaria': return order.tinturariaDate;
      case 'confeccao': return order.confDate;
      case 'embalagem': return order.armExpDate;
      case 'expedicao': return order.armExpDate;
      default: return null;
    }
  };

  // Filtros
  const [filterDocSeries, setFilterDocSeries] = React.useState('All');
  const [filterComercial, setFilterComercial] = React.useState('All');
  const [filterReference, setFilterReference] = React.useState('All');
  const [filterStatus, setFilterStatus] = React.useState('All');
  const [filterPriority, setFilterPriority] = React.useState('All'); 
  const [filterArchived, setFilterArchived] = React.useState<'all' | 'active' | 'archived'>('active');
  const [internalFilterDate, setInternalFilterDate] = React.useState<Date | null>(null);

  const filterDate = globalFilterDate !== undefined ? globalFilterDate : internalFilterDate;
  const setFilterDate = onGlobalFilterDateChange || setInternalFilterDate;

  const statusOptions = [
    { id: 'All', label: 'Todos os Estados' },
    { id: 'Atrasadas', label: 'Atrasadas' },
    { id: 'Em produção', label: 'Em produção' },
    { id: 'Concluídas', label: 'Concluídas' },
    { id: 'Em Aberto', label: 'Em Aberto' },
  ];

  const priorityOptions = [
    { id: 'All', label: 'Todas Prioridades' },
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

  const hasActiveFilters = filterDocSeries !== 'All' || 
                           filterComercial !== 'All' || 
                           filterReference !== 'All' || 
                           filterStatus !== 'All' || 
                           filterPriority !== 'All' || 
                           filterDate !== null || 
                           filterArchived !== 'active' ||
                           !!searchTerm;

  const handleResetFilters = () => {
      setFilterDocSeries('All');
      setFilterComercial('All');
      setFilterReference('All');
      setFilterStatus('All');
      setFilterPriority('All');
      setFilterDate(null);
      setFilterArchived('active');
      setSearchTerm('');
  };

  const filteredOrders = React.useMemo(() => {
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

      let matchesPriority = true;
      if (hasPriorityFilter) {
         const p = o.priority || 0;
         matchesPriority = p.toString() === filterPriority;
      }

      let matchesDate = true;
      if (filterDate && weekStart! && weekEnd!) {
        const sectorDate = getSectorDate(o);
        matchesDate = !!(sectorDate && sectorDate >= weekStart && sectorDate <= weekEnd);
      }

      let matchesArchived = true;
      if (filterArchived !== 'all') {
         if (filterArchived === 'active') matchesArchived = !o.isArchived;
         if (filterArchived === 'archived') matchesArchived = !!o.isArchived;
      }

      const globalSearch = (globalSearchTerm || '').toLowerCase().trim();
      if (globalSearch) {
          const exitDateStr = formatDate(getSectorDate(o));
          const predictedDateStr = formatDate(o.sectorPredictedDates?.[sector.id]);
          const classStr = o.sectorStopReasons?.[sector.id] || '';
          const obsStr = o.sectorObservations?.[sector.id] || '';

          return (o.docNr || '').toLowerCase().includes(globalSearch) ||
                 (o.itemNr !== undefined && o.itemNr.toString().includes(globalSearch)) ||
                 (o.clientName || '').toLowerCase().includes(globalSearch) ||
                 (o.reference || '').toLowerCase().includes(globalSearch) ||
                 (o.colorDesc || '').toLowerCase().includes(globalSearch) ||
                 exitDateStr.includes(globalSearch) ||
                 predictedDateStr.includes(globalSearch) ||
                 classStr.toLowerCase().includes(globalSearch) ||
                 obsStr.toLowerCase().includes(globalSearch);
      }

      const search = deferredSearch.toLowerCase().trim();
      const matchesSearch = !search || 
        (o.docNr || '').toLowerCase().includes(search) || 
        (o.clientName || '').toLowerCase().includes(search) ||
        (o.reference || '').toLowerCase().includes(search) ||
        (o.colorDesc || '').toLowerCase().includes(search);

      return matchesDocSeries && 
             matchesComercial && 
             matchesReference && 
             matchesStatus && 
             matchesPriority && 
             matchesDate &&
             matchesArchived &&
             matchesSearch;
    });
  }, [orders, filterDocSeries, filterComercial, filterReference, filterStatus, filterPriority, filterDate, filterArchived, deferredSearch, globalSearchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  // Agrupamento para a versão Smartphone: colapsa todos os itens da mesma encomenda (docNr)
  const mobileOrderGroups = React.useMemo(() => {
    const map = new Map<string, {
      docNr: string;
      mainOrder: Order;
      clientName: string;
      totalQtyRequested: number;
      totalProducedQty: number;
      exitDate: Date | null;
      predictedDate: Date | null;
      items: Order[];
    }>();

    for (const order of filteredOrders) {
      const key = order.docNr && order.docNr.trim() !== '' ? order.docNr.trim() : `item-${order.id}`;
      const existing = map.get(key);
      const prodQty = getSectorProducedQty(order);
      const eDate = getSectorDate(order);
      const pDate = order.sectorPredictedDates?.[sector.id] || null;

      if (!existing) {
        map.set(key, {
          docNr: order.docNr || '-',
          mainOrder: order,
          clientName: order.clientName || 'Sem Cliente',
          totalQtyRequested: order.qtyRequested || 0,
          totalProducedQty: prodQty,
          exitDate: eDate,
          predictedDate: pDate,
          items: [order],
        });
      } else {
        existing.items.push(order);
        existing.totalQtyRequested += (order.qtyRequested || 0);
        existing.totalProducedQty += prodQty;
        if (!existing.predictedDate && pDate) existing.predictedDate = pDate;
        if (!existing.exitDate && eDate) existing.exitDate = eDate;
      }
    }
    return Array.from(map.values());
  }, [filteredOrders, sector.id]);

  const mobileTotalPages = Math.ceil(mobileOrderGroups.length / ITEMS_PER_PAGE);

  const mobilePaginatedGroups = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return mobileOrderGroups.slice(start, start + ITEMS_PER_PAGE);
  }, [mobileOrderGroups, currentPage]);

  // Estado dos docNrs expandidos no telemóvel (por padrão, colapsados)
  const [expandedDocNrs, setExpandedDocNrs] = React.useState<Set<string>>(new Set());
  const lastTapRef = React.useRef<{ [key: string]: number }>({});

  const toggleExpandDocNr = React.useCallback((docNr: string) => {
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
    if (now - lastTap < 350) {
      e.preventDefault();
      e.stopPropagation();
      toggleExpandDocNr(docNr);
      lastTapRef.current[docNr] = 0;
    } else {
      lastTapRef.current[docNr] = now;
    }
  }, [toggleExpandDocNr]);

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
          const tr = document.getElementById(`sector-order-row-${paginatedOrders[next].id}`);
          const card = document.getElementById(`sector-order-card-${paginatedOrders[next].id}`);
          if (window.innerWidth >= 1280 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        setFocusedRowIndex(prev => {
          if (paginatedOrders.length === 0 || prev <= 0) return prev;
          e.preventDefault();
          const next = Math.max(prev - 1, 0);
          const tr = document.getElementById(`sector-order-row-${paginatedOrders[next].id}`);
          const card = document.getElementById(`sector-order-card-${paginatedOrders[next].id}`);
          if (window.innerWidth >= 1280 && tr) tr.scrollIntoView({ block: 'nearest' });
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

  const canEdit = user?.permissions?.sectors?.[sector.id] === 'write';

  const handleEditClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setEditingId(order.id);
    setEditObs(order.sectorObservations?.[sector.id] || '');
    
    const predictedDate = order.sectorPredictedDates?.[sector.id];
    setEditDate(predictedDate ? new Date(predictedDate).toISOString().split('T')[0] : '');
  };

  const handleSaveClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const updatedObservations = {
        ...(order.sectorObservations || {}),
        [sector.id]: editObs
    };

    const updatedPredictedDates = {
        ...(order.sectorPredictedDates || {}),
        [sector.id]: editDate ? new Date(editDate) : null
    };

    const updatedPending = {
        ...(order.sectorPredictedDatesPending || {})
    };
    delete updatedPending[sector.id];

    const currentPredictedDate = order.sectorPredictedDates?.[sector.id] 
        ? new Date(order.sectorPredictedDates[sector.id]!).toISOString().split('T')[0] 
        : '';
    const dateChanged = editDate !== currentPredictedDate;

    if (dateChanged) {
        const sectorIdx = SECTORS.findIndex(s => s.id === sector.id);
        if (sectorIdx !== -1) {
            for (let i = sectorIdx + 1; i < SECTORS.length; i++) {
                const nextSectorId = SECTORS[i].id;
                if (updatedPredictedDates[nextSectorId]) {
                    if (updatedPending[nextSectorId]) {
                        updatedPredictedDates[nextSectorId] = null;
                        delete updatedPending[nextSectorId];
                    } else {
                        updatedPending[nextSectorId] = true;
                    }
                }
            }
        }
    }

    onUpdateOrder({
        ...order,
        sectorObservations: updatedObservations,
        sectorPredictedDates: updatedPredictedDates,
        sectorPredictedDatesPending: updatedPending
    });

    setEditingId(null);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleQuickValidate = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedPending = {
        ...(order.sectorPredictedDatesPending || {})
    };
    delete updatedPending[sector.id];

    onUpdateOrder({
        ...order,
        sectorPredictedDatesPending: updatedPending
    });
  };

  const handleTableExport = async () => {
    if (filteredOrders.length === 0) return;
    setIsExportingTable(true);
    setTableExportSuccess(false);
    try {
        const savedConfig = await loadExportColumnsConfig();
        const selectedKeys = savedConfig && savedConfig.length > 0
            ? savedConfig
            : DEFAULT_SELECTED_COLUMNS;
        
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const prefix = "Exportacao_" + sector.name;
        
        const dateStr = `${day}-${month}-${year}`;
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

        const fileName = `${prefix} ${dateStr} ${timeStr}.xlsx`;

        exportCustomColumns(filteredOrders, selectedKeys, fileName);
        setTableExportSuccess(true);
        setTimeout(() => setTableExportSuccess(false), 3000);
    } catch (error) {
        console.error(error);
        alert("Erro ao exportar Tabela.");
    } finally {
        setIsExportingTable(false);
    }
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
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                  {sector?.icon && React.createElement(sector.icon, { size: 24 })}
              </div>
              <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">Sector: {sector?.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Listagem de encomendas</p>
              </div>
          </div>
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
          {searchTerm && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              showMobileFilters ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
            }`}>
              1
            </span>
          )}
        </button>
      </div>

      <div className={`transition-all duration-300 ease-in-out xl:max-h-none xl:opacity-100 xl:overflow-visible xl:pointer-events-auto ${
        showMobileFilters 
          ? 'max-h-[800px] opacity-100' 
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
                  className="bg-transparent outline-none text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[80px] w-full md:w-auto"
                  value={filterArchived}
                  onChange={(e) => setFilterArchived(e.target.value as any)}
                >
                  <option value="active" className="dark:bg-slate-900">Ativas</option>
                  <option value="archived" className="dark:bg-slate-900">Arquivadas</option>
                  <option value="all" className="dark:bg-slate-900">Todas</option>
                </select>
              </div>
            </div>
          </div>

          {/* Collapse button at the bottom of the filters inside mobile/tablet */}
          {showMobileFilters && (
            <div className="xl:hidden flex justify-center mt-3">
              <button
                onClick={() => setShowMobileFilters(false)}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold rounded-lg text-[11px] transition-colors shadow-xs"
              >
                <ChevronLeft size={12} className="rotate-90 text-slate-400" />
                <span>▲ Ocultar Pesquisa</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto w-full relative" onScroll={handleListScroll}>
        <div className="compact-desktop-only overflow-x-auto h-full min-h-[300px]">
          <table className="min-w-full w-max text-left border-collapse table-fixed">
            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-20 shadow-sm">
            <tr>
              <ResizableHeader colId="doc" title="Doc. Nr." width={columnWidths['doc'] || 100} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="client" title="Cliente" width={columnWidths['client'] || 150} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="ref" title="Ref / Cor" width={columnWidths['ref'] || 120} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="size" title="Medida / Família" width={columnWidths['size'] || 140} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="qty" title="Qtd. Ped / Prod" width={columnWidths['qty'] || 120} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="cap" title="Cap. / Dias Est." width={columnWidths['cap'] || 120} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="exitDate" title="Data Saída" width={columnWidths['exitDate'] || 100} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="predDate" title="Data Prevista" width={columnWidths['predDate'] || 120} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="class" title="Classificação" width={columnWidths['class'] || 180} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="obs" title="Observações" width={columnWidths['obs'] || 200} onResize={handleColResize} />
              <th className="px-2 py-3 w-[50px] text-center sticky right-0 bg-slate-100 dark:bg-slate-900 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowMobileFilters(!showMobileFilters);
                  }}
                  className="xl:hidden p-1 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-lg shadow-xs transition-transform active:scale-90 flex items-center justify-center mx-auto"
                  title="Mostrar Filtros"
                >
                  <Filter size={11} className={showMobileFilters ? "fill-blue-500 text-blue-500" : "text-slate-400"} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {paginatedOrders.map((order, index) => {
              const isEditing = editingId === order.id;
              const producedQty = getSectorProducedQty(order);
              const exitDate = getSectorDate(order);
              const predictedDate = order.sectorPredictedDates?.[sector.id];
              const obs = order.sectorObservations?.[sector.id];
              const capInfo = capacities.length > 0 ? calcOrderCapacityInfo(order, sector.id, capacities) : null;

              return (
                <tr 
                  key={order.id} 
                  id={`sector-order-row-${order.id}`}
                  onClick={() => {
                    if (!isEditing) {
                      if (focusedRowIndex === index) {
                        onViewDetails(order);
                      } else {
                        setFocusedRowIndex(index);
                      }
                    }
                  }}
                  className={`hover:bg-blue-50 dark:hover:bg-slate-900 transition-colors group scroll-mt-16 ${isEditing ? 'bg-blue-50 dark:bg-slate-900' : 'cursor-pointer'} ${focusedRowIndex === index ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}
                >
                  <td className="px-4 py-3 align-top font-bold text-sm text-slate-800 dark:text-slate-200 truncate max-w-0">{order.docNr ? <HighlightText text={order.docNr} highlight={highlights} /> : ''}</td>
                  <td className="px-4 py-3 align-top text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-0" title={order.clientName}>{order.clientName ? <HighlightText text={order.clientName} highlight={highlights} /> : ''}</td>
                  <td className="px-4 py-3 align-top overflow-hidden max-w-0">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{order.reference ? <HighlightText text={order.reference} highlight={highlights} /> : ''}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{order.colorDesc ? <HighlightText text={order.colorDesc} highlight={highlights} /> : ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top overflow-hidden max-w-0">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{order.sizeDesc ? <HighlightText text={order.sizeDesc} highlight={highlights} /> : ''}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{order.family ? <HighlightText text={order.family} highlight={highlights} /> : ''}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-center">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                        {order.qtyRequested.toLocaleString('pt-PT')} / <span className="font-black text-slate-900 dark:text-white">{producedQty.toLocaleString('pt-PT')}</span>
                    </span>
                  </td>
                  {/* Capacity & Estimated Days */}
                  <td className="px-4 py-3 align-top text-center">
                    {capInfo ? (
                      capInfo.remainingQty === 0 ? (
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">✓ Concluído</span>
                      ) : capInfo.capacity ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-1">
                            <Zap size={9} className="text-blue-500" />
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              {capInfo.capacity.piecesPerHour.toLocaleString('pt-PT')} pcs/h
                            </span>
                          </div>
                          <span className={`text-[10px] font-black ${capInfo.estimatedDays > 10 ? 'text-rose-600 dark:text-rose-400' : capInfo.estimatedDays > 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {capInfo.estimatedDays}d est.
                          </span>
                          {capInfo.isAtRisk && (
                            <span className="flex items-center gap-0.5 text-[9px] font-black text-rose-600 dark:text-rose-400">
                              <AlertTriangle size={8} /> +{capInfo.daysLate}d risco
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">Sem cap.</span>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-center text-xs font-medium text-slate-600 dark:text-slate-400">
                    {formatDate(exitDate)}
                  </td>
                  
                  {/* Editable Predicted Date */}
                  <td className="px-4 py-3 align-top text-center" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                className="w-full text-xs p-1 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                            />
                            <button
                                onClick={() => setEditDate('')}
                                className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                                title="Limpar data"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1">
                            <span className={`text-xs font-bold ${order.sectorPredictedDatesPending?.[sector.id] ? 'text-orange-500 animate-pulse' : (predictedDate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')}`}>
                                {predictedDate ? formatDate(predictedDate) : '-'}
                            </span>
                            {order.sectorPredictedDatesPending?.[sector.id] && (
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-[8px] font-black text-orange-500 uppercase flex items-center gap-0.5">
                                        <AlertCircle size={8} /> Pendente
                                    </span>
                                    {canEdit && (
                                        <button
                                            onClick={(e) => handleQuickValidate(order, e)}
                                            className="bg-emerald-500 hover:bg-emerald-600 text-white p-0.5 rounded-full shadow-sm transition-all active:scale-90"
                                            title="Validar Data"
                                        >
                                            <Check size={10} strokeWidth={4} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                  </td>

                  {/* Stop Reason Classification */}
                  <td className="px-4 py-3 align-top text-center" onClick={e => e.stopPropagation()}>
                    <StopReasonSelector 
                        currentReason={order.sectorStopReasons?.[sector.id]} 
                        onSelect={(reason) => onUpdateOrder({ 
                          ...order, 
                          sectorStopReasons: { ...(order.sectorStopReasons || {}), [sector.id]: reason } 
                        })}
                        hierarchy={stopReasonsHierarchy}
                        disabled={!canEdit}
                    />
                  </td>

                  {/* Editable Observations */}
                  <td className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                        <textarea
                            value={editObs}
                            onChange={(e) => setEditObs(e.target.value)}
                            className="w-full text-xs p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                            rows={2}
                            placeholder="Adicionar observação..."
                        />
                    ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-2" title={obs}>
                            {obs || '-'}
                        </p>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-3 align-middle text-center" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                        <div className="flex flex-col gap-1">
                            <button onClick={(e) => handleSaveClick(order, e)} className="p-1 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200 transition-colors">
                                <Check size={14} />
                            </button>
                            <button onClick={handleCancelClick} className="p-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        canEdit && (
                        <button 
                            onClick={(e) => handleEditClick(order, e)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar"
                        >
                            <Edit2 size={14} />
                        </button>
                        )
                    )}
                  </td>
                </tr>
              );
            })}
            {paginatedOrders.length === 0 && (
                <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                        Nenhum resultado encontrado.
                    </td>
                </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* Mobile Grid - Versão smartphone afinada para o setor (Vertical e Landscape sem scroll lateral):
            - Tipografia e espaçamentos reduzidos para maximizar painel de leitura
            - Colapsa todos os itens da mesma encomenda (docNr) numa só linha
            - Duplo clique no número do documento (docNr) expande todos os itens */}
        <div className="compact-mobile-only grid grid-cols-1 gap-1.5 p-1.5 sm:p-2 w-full max-w-full overflow-x-hidden">
          {mobilePaginatedGroups.map((group, index) => {
            const isExpanded = expandedDocNrs.has(group.docNr);

            return (
              <div 
                key={group.docNr}
                id={`sector-order-card-${group.docNr}`}
                className={`p-2.5 rounded-xl border transition-all ${
                  isExpanded 
                    ? 'border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-blue-500/20' 
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Linha 1: DocNr (Duplo clique para expandir) + Cliente */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        toggleExpandDocNr(group.docNr);
                      }}
                      onTouchEnd={(e) => handleDocNrTouchEnd(group.docNr, e)}
                      className="cursor-pointer select-none flex items-center gap-1 min-w-0 group/doc"
                      title="Duplo clique no docNr para colapsar/expandir itens"
                    >
                      <h3 className="font-black text-slate-800 dark:text-white text-xs leading-none tracking-tight group-hover/doc:text-blue-600 transition-colors">
                        {group.docNr ? <HighlightText text={group.docNr} highlight={highlights} /> : '-'}
                      </h3>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandDocNr(group.docNr);
                        }}
                        className={`text-[9px] font-black px-1.5 py-0.2 rounded-md border flex items-center gap-0.5 transition-colors ${
                          isExpanded 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                        }`}
                        title="Duplo clique no docNr para expandir/colapsar"
                      >
                        <span>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</span>
                        <ChevronDown size={10} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Previsão / Datas */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold flex items-center justify-end gap-1">
                      <Calendar size={10} className="text-slate-400" />
                      {group.predictedDate ? formatDate(group.predictedDate) : group.exitDate ? formatDate(group.exitDate) : '-'}
                    </span>
                  </div>
                </div>

                {/* Linha 2: Cliente + Qtd / Produzido Total */}
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
                    {group.clientName ? <HighlightText text={group.clientName} highlight={highlights} /> : 'Sem Cliente'}
                  </p>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Qtd: <span className="font-medium text-slate-700 dark:text-slate-300">{group.totalQtyRequested.toLocaleString('pt-PT')}</span> / Prod: <span className="font-black text-slate-900 dark:text-white">{group.totalProducedQty.toLocaleString('pt-PT')}</span>
                    </span>
                  </div>
                </div>

                {/* Resumo quando Colapsado */}
                {!isExpanded && (
                  <div 
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleExpandDocNr(group.docNr);
                    }}
                    onTouchEnd={(e) => handleDocNrTouchEnd(group.docNr, e)}
                    className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 cursor-pointer"
                  >
                    {group.items.length === 1 ? (
                      <div className="truncate flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                        <span className="font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                          {group.items[0].reference ? <HighlightText text={group.items[0].reference} highlight={highlights} /> : '-'}
                        </span>
                        <span className="truncate text-slate-500">{group.items[0].colorDesc || ''}</span>
                        {group.items[0].sizeDesc && <span className="text-slate-400 shrink-0">• {group.items[0].sizeDesc}</span>}
                      </div>
                    ) : (
                      <span className="truncate italic flex items-center gap-1 flex-1 min-w-0 pr-2 text-slate-500">
                        <Layers size={11} className="text-blue-500 shrink-0" />
                        {group.items.length} itens no setor (duplo clique no docNr para abrir)
                      </span>
                    )}

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (group.items.length === 1) {
                          onViewDetails(group.items[0]);
                        } else {
                          toggleExpandDocNr(group.docNr);
                        }
                      }}
                      className="text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:underline shrink-0"
                    >
                      {group.items.length === 1 ? 'Ver Detalhe →' : 'Ver Itens ▼'}
                    </button>
                  </div>
                )}

                {/* ITENS EXPANDIDOS (Aparecem após Duplo Clique no docNr) */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-blue-100 dark:border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Itens do Setor ({group.items.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExpandDocNr(group.docNr)}
                        className="text-[9px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        ▲ Colapsar
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {group.items.map((order, itemIdx) => {
                        const isEditing = editingId === order.id;
                        const itemProdQty = getSectorProducedQty(order);
                        const itemPredictedDate = order.sectorPredictedDates?.[sector.id];
                        const itemObs = order.sectorObservations?.[sector.id];
                        const capInfo = capacities.length > 0 ? calcOrderCapacityInfo(order, sector.id, capacities) : null;

                        return (
                          <div 
                            key={order.id}
                            className="p-2 bg-slate-50 dark:bg-slate-850/60 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[9px] font-black text-slate-400 bg-white dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                                  #{order.itemNr || itemIdx + 1}
                                </span>
                                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {order.reference ? <HighlightText text={order.reference} highlight={highlights} /> : '-'}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                  {order.colorDesc ? <HighlightText text={order.colorDesc} highlight={highlights} /> : ''}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                {isEditing ? (
                                  <div className="flex gap-1">
                                    <button onClick={(e) => handleSaveClick(order, e)} className="p-1 bg-emerald-100 text-emerald-600 rounded">
                                      <Check size={12} />
                                    </button>
                                    <button onClick={handleCancelClick} className="p-1 bg-slate-100 text-slate-600 rounded">
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  canEdit && (
                                    <button onClick={(e) => handleEditClick(order, e)} className="p-1 text-slate-400 hover:text-blue-600">
                                      <Edit2 size={12} />
                                    </button>
                                  )
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                              <span className="truncate">
                                {order.sizeDesc || order.size || '-'} {order.family ? `• ${order.family}` : ''}
                              </span>
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                {order.qtyRequested.toLocaleString('pt-PT')} / <strong className="text-slate-900 dark:text-white">{itemProdQty.toLocaleString('pt-PT')}</strong>
                              </span>
                            </div>

                            {/* Classificação & Previsão */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800 text-[10px]" onClick={e => e.stopPropagation()}>
                              <div>
                                <span className="text-[8px] font-black uppercase text-slate-400 block">Previsão</span>
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="w-full text-[10px] p-1 border border-blue-300 rounded outline-none bg-white dark:bg-slate-800 dark:text-white"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {itemPredictedDate ? formatDate(itemPredictedDate) : '-'}
                                  </span>
                                )}
                              </div>

                              <div>
                                <span className="text-[8px] font-black uppercase text-slate-400 block">Classificação</span>
                                <StopReasonSelector 
                                  currentReason={order.sectorStopReasons?.[sector.id]} 
                                  onSelect={(reason) => onUpdateOrder({ 
                                    ...order, 
                                    sectorStopReasons: { ...(order.sectorStopReasons || {}), [sector.id]: reason } 
                                  })}
                                  hierarchy={stopReasonsHierarchy}
                                  disabled={!canEdit}
                                />
                              </div>
                            </div>

                            {/* Observação / Detalhe link */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800 text-[10px]" onClick={e => e.stopPropagation()}>
                              <div className="truncate flex-1 min-w-0 pr-2">
                                {isEditing ? (
                                  <textarea
                                    value={editObs}
                                    onChange={(e) => setEditObs(e.target.value)}
                                    className="w-full text-[10px] p-1 border border-blue-300 rounded outline-none bg-white dark:bg-slate-800 dark:text-white"
                                    rows={1}
                                    placeholder="Obs..."
                                  />
                                ) : (
                                  <span className="text-slate-500 italic truncate block">
                                    {itemObs ? `Obs: ${itemObs}` : 'Sem observações'}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => onViewDetails(order)}
                                className="text-[9px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                              >
                                Detalhes →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {mobilePaginatedGroups.length === 0 && (
             <div className="p-8 text-center text-slate-400 font-medium text-xs">Nenhum resultado encontrado.</div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {(mobileTotalPages > 1 || totalPages > 1) && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2.5 flex items-center justify-between shrink-0 safe-bottom transition-colors">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium pl-2">
                Página <strong>{currentPage}</strong> de <strong>{typeof window !== 'undefined' && window.innerWidth < 768 ? mobileTotalPages : totalPages}</strong>
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
                    onClick={() => setCurrentPage(p => Math.min(typeof window !== 'undefined' && window.innerWidth < 768 ? mobileTotalPages : totalPages, p + 1))}
                    disabled={currentPage >= (typeof window !== 'undefined' && window.innerWidth < 768 ? mobileTotalPages : totalPages)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-transparent text-slate-600 dark:text-slate-400"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default SectorOrderTable;
