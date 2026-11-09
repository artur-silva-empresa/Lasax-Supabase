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
  Loader2,
  Eye,
  Pencil
} from 'lucide-react';
import { Order, Sector, User, ProductionCapacity, OrderState } from '../types';
import { getOrderState, getWeekRange, exportCustomColumns, loadExportColumnsConfig, DEFAULT_SELECTED_COLUMNS } from '../services/dataService';
import { formatDate } from '../utils/formatters';
import StopReasonSelector from './StopReasonSelector';
import { calcOrderCapacityInfo } from '../utils/capacityUtils';
import { SECTORS } from '../constants';
import HighlightText from './HighlightText';
import OrderChangeModal from './OrderChangeModal';

interface SectorOrderTableProps {
  orders: Order[];
  allOrders?: Order[];
  sector: Sector;
  onViewDetails: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  onUpdateMultipleOrders?: (orders: Order[]) => void;
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
  width?: number | string, 
  onResize: (id: string, e: React.MouseEvent | React.TouchEvent) => void,
  className?: string 
}) => {
  return (
    <th 
      className={`relative px-2 py-1.5 text-[8.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider group ${className}`}
      style={width ? (typeof width === 'number' ? { width: `${width}px` } : { width }) : {}}
    >
      <div className="truncate w-full">{title}</div>
      <div 
        onMouseDown={(e) => onResize(colId, e)}
        onTouchStart={(e) => onResize(colId, e)}
        className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 z-10"
        style={{ transform: 'translateX(50%)' }}
      />
    </th>
  );
};

const SectorOrderTable: React.FC<SectorOrderTableProps> = ({ 
  orders, 
  allOrders,
  sector, 
  onViewDetails, 
  onUpdateOrder, 
  onUpdateMultipleOrders,
  stopReasonsHierarchy, 
  user, 
  capacities = [], 
  globalSearchTerm, 
  globalFilterDate, 
  onGlobalFilterDateChange 
}) => {
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
      case 'tecelagem': return order.dataTec || order.sectorPredictedDates?.['tecelagem'] || order.requestedDate || null;
      case 'felpo_cru': return order.felpoCruDate || order.sectorPredictedDates?.['felpo_cru'] || order.requestedDate || null;
      case 'tinturaria': return order.tinturariaDate || order.sectorPredictedDates?.['tinturaria'] || order.requestedDate || null;
      case 'confeccao': return order.confDate || order.sectorPredictedDates?.['confeccao'] || order.requestedDate || null;
      case 'embalagem': return order.armExpDate || order.sectorPredictedDates?.['embalagem'] || order.requestedDate || null;
      case 'expedicao': return order.armExpDate || order.sectorPredictedDates?.['expedicao'] || order.requestedDate || null;
      default: return order.requestedDate || null;
    }
  };

  // Filtros
  const [filterDocSeries, setFilterDocSeries] = React.useState('All');
  const [filterComercial, setFilterComercial] = React.useState('All');
  const [filterReference, setFilterReference] = React.useState('All');
  const [filterStatus, setFilterStatus] = React.useState('All');
  const [filterPriority, setFilterPriority] = React.useState('All'); 
  const [filterArchived, setFilterArchived] = React.useState<'all' | 'active' | 'archived'>('active');
  const [filterHasObservations, setFilterHasObservations] = React.useState(false);
  const [internalFilterDate, setInternalFilterDate] = React.useState<Date | null>(null);
  const [filterWeekMode, setFilterWeekMode] = React.useState<'exact' | 'cumulative'>('exact');

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
                           filterHasObservations ||
                           filterDate !== null || 
                           filterWeekMode !== 'exact' ||
                           filterArchived !== 'active' ||
                           !!searchTerm;

  const handleResetFilters = () => {
      setFilterDocSeries('All');
      setFilterComercial('All');
      setFilterReference('All');
      setFilterStatus('All');
      setFilterPriority('All');
      setFilterHasObservations(false);
      setFilterDate(null);
      setFilterWeekMode('exact');
      setFilterArchived('active');
      setSearchTerm('');
  };

  const hasSectorObservations = React.useCallback((o: Order) => {
    // 1. Observações explícitas
    const sectorObs = o.sectorObservations?.[sector.id];
    const hasSpecificObs = typeof sectorObs === 'string' && sectorObs.trim() !== '';
    const hasAnySectorObs = !!(o.sectorObservations && Object.values(o.sectorObservations).some(v => typeof v === 'string' && v.trim() !== ''));
    
    // 2. Classificações / Motivos de paragem (Considerados como "Observações")
    const sectorReason = o.sectorStopReasons?.[sector.id];
    const hasSpecificReason = typeof sectorReason === 'string' && sectorReason.trim() !== '';
    const hasAnyReason = !!(o.sectorStopReasons && Object.values(o.sectorStopReasons).some(v => typeof v === 'string' && v.trim() !== ''));

    // 3. Alterações de data de saída / previsões no setor
    const hasPredDate = !!(o.sectorPredictedDates?.[sector.id]);
    const hasPendingDate = !!(o.sectorPredictedDatesPending?.[sector.id]);
    const hasDateHistory = !!(o.predictedDatesHistory && o.predictedDatesHistory.some(h => h.sectorId === sector.id));

    // 4. Observações brutas do ficheiro
    const hasRawObs = !!(o._raw && Object.entries(o._raw).some(([k, v]) => 
      /obs|nota|coment/i.test(k) && typeof v === 'string' && v.trim() !== ''
    ));

    return hasSpecificObs || hasAnySectorObs || hasSpecificReason || hasAnyReason || hasPredDate || hasPendingDate || hasDateHistory || hasRawObs;
  }, [sector.id]);

  const docNrsWithSectorObservations = React.useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      if (hasSectorObservations(o) && o.docNr) {
        set.add(o.docNr.trim());
      }
    });
    return set;
  }, [orders, hasSectorObservations]);

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
         if (filterPriority === 'Any') {
            matchesPriority = p > 0;
         } else {
            matchesPriority = p.toString() === filterPriority;
         }
      }

      let matchesDate = true;
      if (filterDate && weekStart! && weekEnd!) {
        const sectorDate = getSectorDate(o);
        if (filterWeekMode === 'cumulative') {
          matchesDate = !!(sectorDate && sectorDate <= weekEnd);
        } else {
          matchesDate = !!(sectorDate && sectorDate >= weekStart && sectorDate <= weekEnd);
        }
      }

      let matchesArchived = true;
      if (filterArchived !== 'all') {
         if (filterArchived === 'active') matchesArchived = !o.isArchived;
         if (filterArchived === 'archived') matchesArchived = !!o.isArchived;
      }

      let matchesObservations = true;
      if (filterHasObservations) {
        matchesObservations = hasSectorObservations(o) || (!!o.docNr && docNrsWithSectorObservations.has(o.docNr.trim()));
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
             matchesObservations &&
             matchesSearch;
    });
  }, [orders, filterDocSeries, filterComercial, filterReference, filterStatus, filterPriority, filterDate, filterArchived, filterHasObservations, deferredSearch, globalSearchTerm, sector.id, hasSectorObservations, docNrsWithSectorObservations]);

  // Definição do grupo por Documento no setor
  interface SectorDocumentGroup {
    docNr: string;
    mainOrder: Order;
    clientName: string;
    comercial: string;
    po: string;
    priority: number;
    isManual: boolean;
    isArchived: boolean;
    totalQtyRequested: number;
    totalProducedQty: number;
    exitDate: Date | null;
    predictedDate: Date | null;
    hasPendingPredictedDate: boolean;
    sectorStopReason?: string;
    sectorObservation?: string;
    hasObservations: boolean;
    distinctReferencesCount: number;
    referenceSummary: string;
    items: Order[];
  }

  const getPriorityColor = (p: number) => {
    switch (p) {
      case 1: return "text-red-900 dark:text-red-400 fill-red-900 dark:fill-red-400";
      case 2: return "text-orange-500 dark:text-orange-400 fill-orange-500 dark:fill-orange-400";
      case 3: return "text-yellow-400 dark:text-yellow-400 fill-yellow-400 dark:fill-yellow-400";
      default: return "text-slate-200 dark:text-slate-700 fill-slate-200 dark:fill-slate-700";
    }
  };

  // Agrupamento de encomendas por Documento (1 cartão/linha compactada por docNr)
  const sectorDocumentGroups = React.useMemo<SectorDocumentGroup[]>(() => {
    const map = new Map<string, SectorDocumentGroup>();

    for (const order of filteredOrders) {
      const key = order.docNr && order.docNr.trim() !== '' ? order.docNr.trim() : `item-${order.id}`;
      const existing = map.get(key);
      const prodQty = getSectorProducedQty(order);
      const eDate = getSectorDate(order);
      const pDate = order.sectorPredictedDates?.[sector.id] || null;
      const isPending = !!order.sectorPredictedDatesPending?.[sector.id];
      const stopReason = order.sectorStopReasons?.[sector.id];
      const obs = order.sectorObservations?.[sector.id];
      const hasObs = hasSectorObservations(order);

      if (!existing) {
        map.set(key, {
          docNr: order.docNr || '-',
          mainOrder: order,
          clientName: order.clientName || 'Sem Cliente',
          comercial: order.comercial || '',
          po: order.po || '',
          priority: order.priority || 0,
          isManual: !!order.isManual,
          isArchived: !!order.isArchived,
          totalQtyRequested: order.qtyRequested || 0,
          totalProducedQty: prodQty,
          exitDate: eDate,
          predictedDate: pDate,
          hasPendingPredictedDate: isPending,
          sectorStopReason: stopReason,
          sectorObservation: obs,
          hasObservations: hasObs,
          distinctReferencesCount: 1,
          referenceSummary: '',
          items: [order],
        });
      } else {
        existing.items.push(order);
        existing.totalQtyRequested += (order.qtyRequested || 0);
        existing.totalProducedQty += prodQty;
        if (!existing.exitDate && eDate) existing.exitDate = eDate;
        if (!existing.predictedDate && pDate) existing.predictedDate = pDate;
        if (isPending) existing.hasPendingPredictedDate = true;
        if (!existing.sectorStopReason && stopReason) existing.sectorStopReason = stopReason;
        if (!existing.sectorObservation && obs) existing.sectorObservation = obs;
        if (hasObs) existing.hasObservations = true;
        if ((order.priority || 0) > existing.priority) existing.priority = order.priority || 0;
        if (order.isManual) existing.isManual = true;
        if (!existing.po && order.po) existing.po = order.po;
        if ((!existing.clientName || existing.clientName === 'Sem Cliente') && order.clientName) existing.clientName = order.clientName;
        if (!existing.comercial && order.comercial) existing.comercial = order.comercial;
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
  }, [filteredOrders, sector.id, hasSectorObservations]);

  const totalPages = Math.max(1, Math.ceil(sectorDocumentGroups.length / ITEMS_PER_PAGE));
  const paginatedGroups = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sectorDocumentGroups.slice(start, start + ITEMS_PER_PAGE);
  }, [sectorDocumentGroups, currentPage]);

  // Backward compatibility alias for mobile view
  const mobileOrderGroups = sectorDocumentGroups;
  const mobilePaginatedGroups = paginatedGroups;
  const mobileTotalPages = totalPages;

  // Estado dos docNrs expandidos (por padrão, colapsados)
  const [expandedDocNrs, setExpandedDocNrs] = React.useState<Set<string>>(new Set());
  const lastTapRef = React.useRef<{ [key: string]: number }>({});
  const lastToggleTimeRef = React.useRef<{ [key: string]: number }>({});

  const toggleExpandDocNr = React.useCallback((docNr: string) => {
    const now = Date.now();
    const lastToggle = lastToggleTimeRef.current[docNr] || 0;
    // Evitar que cliques duplos rápidos fechem imediatamente
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
          const tr = document.getElementById(`sector-order-row-${paginatedGroups[next].docNr}`);
          const card = document.getElementById(`sector-order-card-${paginatedGroups[next].docNr}`);
          if (window.innerWidth >= 1280 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        setFocusedRowIndex(prev => {
          if (paginatedGroups.length === 0 || prev <= 0) return prev;
          e.preventDefault();
          const next = Math.max(prev - 1, 0);
          const tr = document.getElementById(`sector-order-row-${paginatedGroups[next].docNr}`);
          const card = document.getElementById(`sector-order-card-${paginatedGroups[next].docNr}`);
          if (window.innerWidth >= 1280 && tr) tr.scrollIntoView({ block: 'nearest' });
          else if (card) card.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (focusedRowIndex >= 0 && focusedRowIndex < paginatedGroups.length) {
          e.preventDefault();
          onViewDetails(paginatedGroups[focusedRowIndex].mainOrder);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginatedGroups, focusedRowIndex, onViewDetails]);

  const canEdit = user?.permissions?.sectors?.[sector.id] === 'write';

  const handleEditClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setEditingId(order.id);
    setEditObs(order.sectorObservations?.[sector.id] || '');
    
    const predictedDate = order.sectorPredictedDates?.[sector.id];
    setEditDate(predictedDate ? new Date(predictedDate).toISOString().split('T')[0] : '');
  };

  const [pendingChange, setPendingChange] = React.useState<{
    docNr: string;
    items: Order[];
    clientName?: string;
    sectorName?: string;
    currentReason?: string;
    newReason?: string;
    currentDate?: Date | null;
    newDate?: Date | null;
    initialObservation?: string;
  } | null>(null);

  const handleOpenEditDocModal = (group: SectorDocumentGroup) => {
    if (!canEdit) return;
    const current = group.sectorStopReason || '';
    const predDate = group.predictedDate || null;
    setPendingChange({
      docNr: group.docNr,
      items: group.items,
      clientName: group.clientName,
      sectorName: sector.name,
      currentReason: current,
      newReason: current,
      currentDate: predDate,
      newDate: predDate,
      initialObservation: group.sectorObservation || ''
    });
  };

  const handleOpenSectorClassification = (order: Order, reason: string) => {
    const current = order.sectorStopReasons?.[sector.id] || '';
    if (reason === current) return;
    const pool = allOrders || orders;
    const docItems = pool.filter(o => o.docNr === order.docNr);
    const predDate = order.sectorPredictedDates?.[sector.id] || null;
    setPendingChange({
      docNr: order.docNr || '-',
      items: docItems.length > 0 ? docItems : [order],
      clientName: order.clientName,
      sectorName: sector.name,
      currentReason: current,
      newReason: reason,
      currentDate: predDate,
      newDate: predDate,
      initialObservation: order.sectorObservations?.[sector.id] || ''
    });
  };

  const handleConfirmSectorChange = (result: {
    observation: string;
    targetOrderIds: string[];
    applyToAll: boolean;
    predictedDate?: Date | null;
    isDateModified?: boolean;
    classification?: string;
    isClassificationModified?: boolean;
    clearAll?: boolean;
  }) => {
    if (!pendingChange) return;

    const targetSet = new Set(result.targetOrderIds);
    const pool = allOrders || orders;
    const itemsToUpdate = pool.filter(o => targetSet.has(o.id));

    // Determinar a nova data caso tenha sido alterada no modal ou já viesse em pendingChange
    const effectiveDate = result.clearAll
      ? null
      : (result.isDateModified 
          ? result.predictedDate 
          : (pendingChange.newDate !== undefined ? pendingChange.newDate : undefined));

    const effectiveReason = result.clearAll
      ? ''
      : (result.isClassificationModified ? result.classification : pendingChange.newReason);

    const isDateActuallyChanged = result.clearAll || effectiveDate !== undefined;

    const updatedOrdersList: Order[] = itemsToUpdate.map(target => {
      let updatedObservations = { ...(target.sectorObservations || {}) };
      if (result.clearAll) {
        delete updatedObservations[sector.id];
      } else if (result.observation) {
        updatedObservations[sector.id] = result.observation;
      }

      let updatedStopReasons = { ...(target.sectorStopReasons || {}) };
      if (effectiveReason !== undefined) {
        if (effectiveReason) {
          updatedStopReasons[sector.id] = effectiveReason;
        } else {
          delete updatedStopReasons[sector.id];
        }
      }

      let updatedPredictedDates = { ...(target.sectorPredictedDates || {}) };
      let updatedPending = { ...(target.sectorPredictedDatesPending || {}) };

      if (isDateActuallyChanged) {
        if (effectiveDate === null) {
          delete updatedPredictedDates[sector.id];
        } else {
          updatedPredictedDates[sector.id] = effectiveDate;
        }
        delete updatedPending[sector.id];

        // Propagar cascata para os setores subsequentes
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

      return {
        ...target,
        sectorObservations: updatedObservations,
        sectorStopReasons: updatedStopReasons,
        sectorPredictedDates: updatedPredictedDates,
        sectorPredictedDatesPending: updatedPending
      };
    });

    if (onUpdateMultipleOrders) {
      onUpdateMultipleOrders(updatedOrdersList);
    } else {
      updatedOrdersList.forEach(onUpdateOrder);
    }

    setPendingChange(null);
    setEditingId(null);
  };

  const handleSaveClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const currentPredictedDate = order.sectorPredictedDates?.[sector.id] 
        ? new Date(order.sectorPredictedDates[sector.id]!).toISOString().split('T')[0] 
        : '';
    const dateChanged = editDate !== currentPredictedDate;

    // Se a data de saída/previsão foi alterada, a observação é OBRIGATÓRIA e devemos perguntar se é para guardar em todos os itens ou marcar itens!
    if (dateChanged) {
      const pool = allOrders || orders;
      const docItems = pool.filter(o => o.docNr === order.docNr);
      setPendingChange({
        docNr: order.docNr || '-',
        items: docItems.length > 0 ? docItems : [order],
        clientName: order.clientName,
        sectorName: sector.name,
        currentDate: order.sectorPredictedDates?.[sector.id] || null,
        newDate: editDate ? new Date(editDate) : null,
        initialObservation: editObs
      });
      return;
    }

    // Se apenas as observações foram alteradas num documento com múltiplos itens
    const currentObs = order.sectorObservations?.[sector.id] || '';
    if (editObs !== currentObs) {
      const pool = allOrders || orders;
      const docItems = pool.filter(o => o.docNr === order.docNr);
      if (docItems.length > 1) {
        setPendingChange({
          docNr: order.docNr || '-',
          items: docItems,
          clientName: order.clientName,
          sectorName: sector.name,
          initialObservation: editObs
        });
        return;
      }
    }

    onUpdateOrder({
      ...order,
      sectorObservations: {
        ...(order.sectorObservations || {}),
        [sector.id]: editObs
      }
    });

    setEditingId(null);
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleQuickValidate = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    const pool = allOrders || orders;
    const docItems = pool.filter(o => o.docNr === order.docNr);
    setPendingChange({
      docNr: order.docNr || '-',
      items: docItems.length > 0 ? docItems : [order],
      clientName: order.clientName,
      sectorName: sector.name,
      currentDate: null,
      newDate: order.sectorPredictedDates?.[sector.id] || null,
      initialObservation: order.sectorObservations?.[sector.id] || ''
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
      <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="p-1 sm:p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md text-blue-600 dark:text-blue-400 shrink-0">
                  {sector?.icon && React.createElement(sector.icon, { size: 16 })}
              </div>
              <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white truncate">Sector: {sector?.name}</h2>
                    {filterHasObservations && (
                      <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 flex items-center gap-1 shadow-2xs">
                        <Eye size={9} />
                        <span>Com Observações</span>
                        <button
                          onClick={() => setFilterHasObservations(false)}
                          className="hover:text-blue-900 dark:hover:text-white ml-0.5"
                          title="Remover filtro de observações"
                        >
                          <X size={9} />
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">Listagem de encomendas</p>
              </div>
          </div>
          <button
            onClick={handleTableExport}
            disabled={isExportingTable}
            className={`px-2.5 py-1.5 text-white rounded-lg transition-all shadow-2xs active:scale-95 flex items-center gap-1.5 text-[11px] font-semibold shrink-0 ${
              tableExportSuccess ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
            }`}
            title="Exportar Tabela (Colunas Personalizadas)"
          >
             {isExportingTable ? (
                <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>A Gerar...</span>
                </>
             ) : tableExportSuccess ? (
                <>
                    <Check size={13} />
                    <span>Sucesso</span>
                </>
             ) : (
                <>
                    <Download size={13} />
                    <span>Exportar Tabela Editável</span>
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
          {hasActiveFilters && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              showMobileFilters ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
            }`}>
              {(searchTerm ? 1 : 0) + (filterPriority !== 'All' ? 1 : 0) + (filterDocSeries !== 'All' ? 1 : 0) + (filterComercial !== 'All' ? 1 : 0) + (filterReference !== 'All' ? 1 : 0) + (filterStatus !== 'All' ? 1 : 0) + (filterArchived !== 'active' ? 1 : 0) + (filterDate ? 1 : 0) + (filterHasObservations ? 1 : 0)}
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
        <div className="flex-shrink-0 p-3 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col xl:flex-row gap-2.5 items-stretch xl:items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input 
                type="text" 
                placeholder="Pesquisar texto..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-[11px] shadow-2xs transition-all h-full dark:text-white placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 items-center">
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg p-1.5 shadow-2xs transition-colors active:scale-95 flex items-center justify-center"
                  title="Limpar todos os filtros e pesquisa"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              
              {/* Seletor de Semana com modo Só Semana vs Até à Semana */}
              {!filterDate ? (
                <button 
                  onClick={() => setFilterDate(new Date())}
                  className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0 transition-colors bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-semibold"
                  title="Filtrar por Semana"
                >
                   <Calendar size={13} className="text-slate-400" />
                   <span>Filtrar Semana</span>
                </button>
              ) : (
                <div className="flex flex-wrap sm:flex-nowrap items-center bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg shadow-2xs overflow-hidden grow md:grow-0">
                  <button onClick={handlePrevWeek} className="px-1.5 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" title="Semana anterior">
                    <ChevronLeft size={14} />
                  </button>
                  <div className="px-1.5 flex flex-col items-center justify-center min-w-[85px]">
                    <span className="text-[9px] font-black uppercase text-blue-500 dark:text-blue-400 leading-none">Semana {getISOWeek(filterDate)}</span>
                    <span className="text-[9px] font-medium text-blue-700 dark:text-blue-200 leading-none mt-0.5">
                       {(() => {
                         const {start, end} = getWeekRange(filterDate);
                         return `${start.getDate()} ${start.toLocaleString('pt-PT', {month: 'short'})} - ${end.getDate()} ${end.toLocaleString('pt-PT', {month: 'short'})}`;
                       })()}
                    </span>
                  </div>
                  <button onClick={handleNextWeek} className="px-1.5 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" title="Semana seguinte">
                    <ChevronRight size={14} />
                  </button>
                  
                  {/* Seletor de Modo: Só Semana vs Até à Semana */}
                  <div className="flex items-center border-l border-blue-200 dark:border-blue-800 px-1 py-0.5 gap-0.5 bg-white/60 dark:bg-slate-900/60">
                    <button
                      type="button"
                      onClick={() => setFilterWeekMode('exact')}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                        filterWeekMode === 'exact'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                      }`}
                      title="Apenas encomendas com entrega no setor na semana selecionada"
                    >
                      Só Semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterWeekMode('cumulative')}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                        filterWeekMode === 'cumulative'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                      }`}
                      title="Todas as encomendas anteriores e até à semana selecionada"
                    >
                      ≤ Até à Semana
                    </button>
                  </div>

                  <div className="w-px h-5 bg-blue-200 dark:bg-blue-800 mx-0.5"></div>
                  <button onClick={() => setFilterDate(null)} className="px-1.5 py-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-blue-400 dark:text-blue-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors" title="Remover filtro de semana">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Botão de Filtro por Observações (Posicionado após Filtrar Semana) */}
              <button
                type="button"
                onClick={() => setFilterHasObservations(!filterHasObservations)}
                className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0 transition-all text-[11px] font-semibold active:scale-95 cursor-pointer select-none ${
                  filterHasObservations
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-400/30'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title={filterHasObservations ? "A mostrar apenas com observações (clique para limpar)" : "Filtrar apenas encomendas com observações"}
              >
                <Eye size={13} className={filterHasObservations ? "text-white" : "text-blue-500"} />
                <span>Com Observações</span>
                {filterHasObservations && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />
                )}
              </button>

              {/* Prioridades */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <Flag size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[105px] w-full md:w-auto"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                >
                  {priorityOptions.map(opt => <option key={opt.id} value={opt.id} className="dark:bg-slate-900">{opt.label}</option>)}
                </select>
              </div>

              {/* Séries */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <FileText size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[75px] w-full md:w-auto"
                  value={filterDocSeries}
                  onChange={(e) => setFilterDocSeries(e.target.value)}
                >
                  <option value="All" className="dark:bg-slate-900">Todas as Séries</option>
                  {seriesOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              {/* Comerciais */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <Users size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[110px] max-w-[180px] w-full md:w-auto truncate"
                  value={filterComercial}
                  onChange={(e) => setFilterComercial(e.target.value)}
                  disabled={comercialOptions.length === 0 && filterDocSeries === 'All'}
                >
                  <option value="All" className="dark:bg-slate-900">Todos os Comerciais</option>
                  {comercialOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              {/* Referências */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <Tag size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[110px] max-w-[180px] w-full md:w-auto truncate"
                  value={filterReference}
                  onChange={(e) => setFilterReference(e.target.value)}
                  disabled={referenceOptions.length === 0}
                >
                  <option value="All" className="dark:bg-slate-900">Todas as Referências</option>
                  {referenceOptions.map(opt => <option key={opt} value={opt} className="dark:bg-slate-900">{opt}</option>)}
                </select>
              </div>

              {/* Estados */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <ListFilter size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[100px] w-full md:w-auto"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  {statusOptions.map(opt => <option key={opt.id} value={opt.id} className="dark:bg-slate-900">{opt.label}</option>)}
                </select>
              </div>

              {/* Arquivadas */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shadow-2xs grow md:grow-0">
                <Archive size={13} className="text-slate-400 shrink-0" />
                <select 
                  className="bg-transparent outline-none text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-w-[75px] w-full md:w-auto"
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
        <div className="compact-desktop-only overflow-x-hidden h-full min-h-[300px]">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-20 shadow-sm">
            <tr>
              <ResizableHeader colId="doc" title="Documento / PO" width={columnWidths['doc'] ? `${columnWidths['doc']}px` : '12%'} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="client" title="Cliente (Comercial) / Ref" width={columnWidths['client'] ? `${columnWidths['client']}px` : '24%'} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="lines" title="Linhas" width={columnWidths['lines'] ? `${columnWidths['lines']}px` : '8%'} onResize={handleColResize} className="whitespace-nowrap" />
              <ResizableHeader colId="qty" title="Qtd. Ped / Prod" width={columnWidths['qty'] ? `${columnWidths['qty']}px` : '11%'} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="cap" title="Cap. / Dias Est." width={columnWidths['cap'] ? `${columnWidths['cap']}px` : '9%'} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="exitDate" title="Data Saída" width={columnWidths['exitDate'] ? `${columnWidths['exitDate']}px` : '8%'} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="predDate" title="Data Prevista" width={columnWidths['predDate'] ? `${columnWidths['predDate']}px` : '9%'} onResize={handleColResize} className="text-center" />
              <ResizableHeader colId="class" title="Classificação" width={columnWidths['class'] ? `${columnWidths['class']}px` : '10%'} onResize={handleColResize} className="text-center" />
              <ResizableHeader 
                colId="obs" 
                title={
                  <button
                    type="button"
                    onClick={() => setFilterHasObservations(!filterHasObservations)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer font-bold text-[8.5px] tracking-wider uppercase ${
                      filterHasObservations
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                    title={filterHasObservations ? "A filtrar com observações (clique para limpar)" : "Filtrar apenas com observações"}
                  >
                    <Eye size={10} className={filterHasObservations ? "text-white" : "text-blue-500"} />
                    <span>Obs.</span>
                    {filterHasObservations && <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5 animate-pulse" />}
                  </button>
                } 
                width={columnWidths['obs'] ? `${columnWidths['obs']}px` : '5%'} 
                onResize={handleColResize} 
              />
              <th className="px-1.5 py-1.5 w-[44px] text-center sticky right-0 bg-slate-100 dark:bg-slate-900 z-10 text-[8.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <span>Ações</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowMobileFilters(!showMobileFilters);
                    }}
                    className="xl:hidden p-1 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-lg shadow-xs transition-transform active:scale-90 flex items-center justify-center"
                    title="Mostrar Filtros"
                  >
                    <Filter size={11} className={showMobileFilters ? "fill-blue-500 text-blue-500" : "text-slate-400"} />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {paginatedGroups.map((group, index) => {
              const isExpanded = expandedDocNrs.has(group.docNr);
              const isFocused = focusedRowIndex === index;
              const capInfo = capacities.length > 0 ? calcOrderCapacityInfo(group.mainOrder, sector.id, capacities) : null;

              return (
                <React.Fragment key={group.docNr}>
                  <tr 
                    id={`sector-order-row-${group.docNr}`}
                    onClick={() => {
                      if (group.items.length === 1) {
                        onViewDetails(group.mainOrder);
                      } else {
                        toggleExpandDocNr(group.docNr);
                      }
                      setFocusedRowIndex(index);
                    }}
                    className={`hover:bg-blue-50/70 dark:hover:bg-slate-900 transition-colors group cursor-pointer scroll-mt-16 ${
                      group.isArchived ? 'opacity-50 bg-slate-50 dark:bg-slate-900/50' : ''
                    } ${isFocused ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/30' : ''} ${
                      isExpanded ? 'bg-blue-50/20 dark:bg-slate-900/40' : ''
                    }`}
                  >
                    {/* Documento / PO */}
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex items-start gap-1">
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
                          className="p-0.5 -ml-0.5 text-slate-400 hover:text-blue-600 transition-colors shrink-0 mt-0.5 cursor-pointer"
                          title={group.items.length === 1 ? "Ver detalhes" : isExpanded ? "Ocultar linhas" : "Ver linhas"}
                        >
                          <ChevronRight size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`} />
                        </button>

                        <div className="flex flex-col gap-0.5 shrink-0 pt-0.5 items-center">
                          <Flag size={12} className={getPriorityColor(group.priority || 0)} strokeWidth={2} />
                          {group.isManual && (
                            <span 
                              className="w-3.5 h-3.5 rounded text-[7.5px] font-bold flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                              title="Confeção Manual"
                            >
                              M
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="font-semibold text-[11px] text-slate-900 dark:text-slate-100 block truncate group-hover:text-blue-600 transition-colors">
                            {group.docNr ? <HighlightText text={group.docNr} highlight={highlights} /> : '-'}
                          </span>
                          <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-normal whitespace-nowrap block">
                            PO: {group.po ? <HighlightText text={group.po} highlight={highlights} /> : '-'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Cliente (Comercial) / Ref */}
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] font-semibold text-slate-900 dark:text-white leading-tight block truncate" title={group.clientName}>
                          {group.clientName ? <HighlightText text={group.clientName.toUpperCase()} highlight={highlights} /> : <span className="text-slate-300 italic">Sem Cliente</span>}
                          {group.comercial && (
                            <span className="ml-1 text-[9.5px] text-blue-600 dark:text-blue-400 font-medium">
                              ({<HighlightText text={group.comercial.toUpperCase()} highlight={highlights} />})
                            </span>
                          )}
                        </span>
                        <div className="text-[9.5px] text-slate-500 dark:text-slate-400 font-normal truncate">
                          <HighlightText text={group.referenceSummary} highlight={highlights} />
                        </div>
                      </div>
                    </td>

                    {/* Linhas */}
                    <td className="px-2 py-1.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10.5px] font-semibold text-slate-800 dark:text-slate-200 block">
                        {group.items.length} {group.items.length === 1 ? 'linha' : 'linhas'}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        {group.items.length === 1 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onViewDetails(group.mainOrder);
                            }}
                            className="text-[10px] text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer text-left flex items-center gap-0.5"
                            title="Ver detalhes da encomenda"
                          >
                            <span>Ver Detalhes</span>
                            <span className="text-[9px]">→</span>
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
                              className="text-[10px] text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer text-left"
                              title={isExpanded ? "Ocultar linhas" : "Ver todas as linhas"}
                            >
                              {isExpanded ? '▲ Ocultar linhas' : '▼ Ver linhas'}
                            </button>
                            <span className="text-slate-300 dark:text-slate-600 text-[9px]">•</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onViewDetails(group.mainOrder);
                              }}
                              className="text-[9.5px] text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium hover:underline cursor-pointer text-left"
                              title="Ver detalhes da encomenda"
                            >
                              Detalhes →
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Qtd. Ped / Prod */}
                    <td className="px-2 py-1.5 align-top text-center font-mono tabular-nums">
                      <span className="text-[10.5px] text-slate-600 dark:text-slate-400">
                        {group.totalQtyRequested.toLocaleString('pt-PT')} / <span className="font-semibold text-slate-900 dark:text-white">{group.totalProducedQty.toLocaleString('pt-PT')}</span>
                      </span>
                    </td>

                    {/* Cap. / Dias Est. */}
                    <td className="px-2 py-1.5 align-top text-center">
                      {capInfo ? (
                        capInfo.remainingQty === 0 ? (
                          <span className="text-[8.5px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Concluído</span>
                        ) : capInfo.capacity ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[8.5px] font-semibold ${capInfo.estimatedDays > 10 ? 'text-rose-600 dark:text-rose-400' : capInfo.estimatedDays > 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {capInfo.estimatedDays}d est.
                            </span>
                            {capInfo.isAtRisk && (
                              <span className="flex items-center gap-0.5 text-[7.5px] font-bold text-rose-600 dark:text-rose-400">
                                <AlertTriangle size={7} /> +{capInfo.daysLate}d
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[8.5px] text-amber-500 dark:text-amber-400 font-normal">Sem cap.</span>
                        )
                      ) : (
                        <span className="text-[8.5px] text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {/* Data Saída */}
                    <td className="px-2 py-1.5 align-top text-center text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatDate(group.exitDate)}
                    </td>

                    {/* Data Prevista */}
                    <td className="px-2 py-1.5 align-top text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col items-center gap-0.5 font-mono tabular-nums">
                        <span className={`text-[9.5px] font-semibold ${group.hasPendingPredictedDate ? 'text-orange-500 animate-pulse' : (group.predictedDate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')}`}>
                          {group.predictedDate ? formatDate(group.predictedDate) : '-'}
                        </span>
                        {group.hasPendingPredictedDate && (
                          <div className="flex items-center gap-1">
                            <span className="text-[7.5px] font-bold text-orange-500 uppercase flex items-center gap-0.5">
                              <AlertCircle size={7} /> Pendente
                            </span>
                            {canEdit && (
                              <button
                                onClick={(e) => handleQuickValidate(group.mainOrder, e)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white p-0.5 rounded-full shadow-xs transition-all active:scale-90"
                                title="Validar Data"
                              >
                                <Check size={7} strokeWidth={4} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Classificação */}
                    <td className="px-2 py-1.5 align-top text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        {group.sectorStopReason ? (
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60 max-w-full truncate"
                            title={group.sectorStopReason}
                          >
                            <Tag size={8} className="shrink-0 text-amber-500" />
                            <span className="truncate">{group.sectorStopReason}</span>
                          </span>
                        ) : (
                          <span className="text-[8.5px] text-slate-400 dark:text-slate-500 italic">
                            Sem classificação
                          </span>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDocModal(group);
                            }}
                            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                            title="Editar classificação, data prevista e observações"
                          >
                            <Pencil size={8} />
                            <span>Editar</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Observações */}
                    <td className="px-2 py-1.5 align-top text-center" onClick={e => e.stopPropagation()}>
                      {group.sectorObservation ? (
                        <p className="text-[9.5px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-2 text-left" title={group.sectorObservation}>
                          {group.sectorObservation}
                        </p>
                      ) : group.hasObservations ? (
                        <div title="Tem observações no documento">
                          <Eye size={12} className="text-blue-500 mx-auto" />
                        </div>
                      ) : (
                        <span className="text-[9.5px] text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-1.5 py-1.5 align-middle text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        {canEdit && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDocModal(group);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded transition-colors"
                            title="Editar alterações"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(group.mainOrder);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded transition-colors"
                          title="Ver detalhes"
                        >
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Subtabela de itens expandidos ao clicar em 'Ver linhas' */}
                  {isExpanded && (
                    <tr className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-blue-200 dark:border-blue-900/40">
                      <td colSpan={10} className="p-0">
                        <div className="p-2 pl-4 bg-gradient-to-r from-blue-50/40 via-slate-50/30 to-transparent dark:from-slate-900/50 dark:via-slate-900/30 dark:to-transparent border-l-4 border-l-blue-500 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Layers size={10} className="text-blue-500" />
                              Itens no Setor {sector.name} ({group.items.length} {group.items.length === 1 ? 'item' : 'itens'})
                            </span>
                            <span className="text-[9.5px] text-slate-400 dark:text-slate-500">
                              Clique numa linha para ver detalhes completos
                            </span>
                          </div>

                          <table className="w-full text-left text-[10px] bg-white dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 shadow-2xs table-fixed">
                            <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-[8.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="px-2 py-1 w-[40px] text-center">Item</th>
                                <th className="px-2.5 py-1 w-[22%]">Referência & Cor</th>
                                <th className="px-2 py-1 w-[16%]">Medida / Família</th>
                                <th className="px-2 py-1 text-center w-[12%]">Qtd. Ped / Prod</th>
                                <th className="px-2 py-1 text-center w-[9%]">Cap. / Dias</th>
                                <th className="px-2 py-1 text-center w-[8%]">Data Saída</th>
                                <th className="px-2 py-1 text-center w-[9%]">Data Prevista</th>
                                <th className="px-2 py-1 text-center w-[12%]">Classificação</th>
                                <th className="px-1.5 py-1 text-center w-[4%]">Obs.</th>
                                <th className="px-2 py-1 text-center w-[8%]">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                              {group.items.map((item, idx) => {
                                const itemProdQty = getSectorProducedQty(item);
                                const itemExitDate = getSectorDate(item);
                                const itemPredDate = item.sectorPredictedDates?.[sector.id];
                                const itemCapInfo = capacities.length > 0 ? calcOrderCapacityInfo(item, sector.id, capacities) : null;
                                const itemHasObs = hasSectorObservations(item);

                                return (
                                  <tr
                                    key={item.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onViewDetails(item);
                                    }}
                                    className="hover:bg-blue-50/70 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                                  >
                                    <td className="px-2 py-1 text-center font-bold text-slate-400 text-[9.5px]">
                                      #{item.itemNr || idx + 1}
                                    </td>
                                    <td className="px-2.5 py-1 font-semibold text-slate-900 dark:text-slate-100">
                                      <div className="flex flex-col min-w-0">
                                        <span className="truncate">{item.reference ? <HighlightText text={item.reference} highlight={highlights} /> : '-'}</span>
                                        <span className="text-[9px] font-normal text-slate-500 dark:text-slate-400 truncate">{item.colorDesc || ''}</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-1 text-slate-600 dark:text-slate-300">
                                      <div className="flex flex-col min-w-0">
                                        <span className="truncate font-medium">{item.sizeDesc || item.size || '-'}</span>
                                        <span className="text-[9px] text-slate-400 uppercase truncate">{item.family || ''}</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-1 text-center font-mono tabular-nums">
                                      <span className="text-[10px] text-slate-600 dark:text-slate-400">
                                        {item.qtyRequested?.toLocaleString('pt-PT')} / <span className="font-semibold text-slate-900 dark:text-white">{itemProdQty.toLocaleString('pt-PT')}</span>
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      {itemCapInfo ? (
                                        itemCapInfo.remainingQty === 0 ? (
                                          <span className="text-[8.5px] font-semibold text-emerald-600">✓ Concluído</span>
                                        ) : (
                                          <span className="text-[8.5px] font-semibold text-blue-600 dark:text-blue-400">
                                            {itemCapInfo.estimatedDays}d est.
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-[8.5px] text-slate-300 dark:text-slate-600">—</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-center text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                      {formatDate(itemExitDate)}
                                    </td>
                                    <td className="px-2 py-1 text-center text-[9.5px] font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                      {itemPredDate ? formatDate(itemPredDate) : '-'}
                                    </td>
                                    <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                      <StopReasonSelector
                                        currentReason={item.sectorStopReasons?.[sector.id]}
                                        onSelect={(reason) => handleOpenSectorClassification(item, reason)}
                                        hierarchy={stopReasonsHierarchy}
                                        disabled={!canEdit}
                                      />
                                    </td>
                                    <td className="px-1.5 py-1 text-center">
                                      {itemHasObs && (
                                        <Eye size={11} className="text-blue-500 mx-auto" title={item.sectorObservations?.[sector.id] || "Tem observações"} />
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1">
                                        {canEdit && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenEditDocModal(group);
                                            }}
                                            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800"
                                            title="Editar"
                                          >
                                            <Pencil size={8} />
                                            <span>Editar</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            onViewDetails(item);
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-[9px] font-semibold transition-colors cursor-pointer"
                                          title="Ver detalhes do item"
                                        >
                                          Detalhes
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
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
                <td colSpan={10} className="p-8 text-center text-slate-400 font-medium text-xs">
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
            const groupHasObs = group.items.some(o => hasSectorObservations(o));

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

                      {groupHasObs && (
                        <span 
                          className="text-[9px] font-bold px-1 py-0.2 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center gap-0.5 shrink-0" 
                          title="Contém observações"
                        >
                          <Eye size={10} />
                          <span>Obs</span>
                        </span>
                      )}
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
                      className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline shrink-0 cursor-pointer"
                    >
                      {group.items.length === 1 ? 'Ver Detalhes →' : 'Ver linhas ▼'}
                    </button>
                  </div>
                )}

                {/* ITENS EXPANDIDOS (Aparecem ao clicar em Ver linhas ou Duplo Clique no docNr) */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-blue-100 dark:border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                        Itens do Setor ({group.items.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExpandDocNr(group.docNr)}
                        className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                      >
                        ▲ Ocultar linhas
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
                                  onSelect={(reason) => handleOpenSectorClassification(order, reason)}
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
      {/* Modal de Validação Obrigatória de Observações e Seleção de Âmbito de Itens */}
      {pendingChange && (
        <OrderChangeModal
          isOpen={true}
          onClose={() => setPendingChange(null)}
          docNr={pendingChange.docNr}
          items={pendingChange.items}
          clientName={pendingChange.clientName}
          sectorName={pendingChange.sectorName}
          sectorId={sector.id}
          currentReason={pendingChange.currentReason}
          newReason={pendingChange.newReason}
          currentDate={pendingChange.currentDate}
          newDate={pendingChange.newDate}
          initialObservation={pendingChange.initialObservation}
          stopReasonsHierarchy={stopReasonsHierarchy}
          onConfirm={handleConfirmSectorChange}
        />
      )}
    </div>
  );
};

export default SectorOrderTable;
