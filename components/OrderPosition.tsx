import React, { useState, useMemo, useDeferredValue } from 'react';
import { 
  Boxes, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  RotateCcw, 
  CheckSquare, 
  Square, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  Eye, 
  Tag, 
  Users, 
  FileText, 
  Layers,
  Calendar,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Order, OrderState, User } from '../types';
import { SECTORS } from '../constants';
import { formatDate } from '../utils/formatters';
import { getISOWeek, getOrderState, getWeekRange } from '../services/dataService';
import HighlightText from './HighlightText';

interface OrderPositionProps {
  orders: Order[];
  onViewDetails: (order: Order) => void;
  globalSearchTerm?: string;
  user?: User | null;
}

// Helper para determinar a posição atual de produção das peças de uma encomenda
export const getOrderPositionStage = (order: Order): {
  stageId: string;
  stageName: string;
  piecesAtStage: number;
  percentage: number;
  colorClass: string;
} => {
  const requested = order.qtyRequested || 0;
  const billed = order.qtyBilled || 0;
  const stock = order.stockCxQty || 0;
  const emb = order.embAcabQty || 0;
  const conf = (order.confRoupoesQty || 0) + (order.confFelposQty || 0);
  const tint = order.tinturariaQty || 0;
  const felpo = order.felpoCruQty || 0;

  if (billed >= requested && requested > 0) {
    return {
      stageId: 'billed',
      stageName: 'Faturada',
      piecesAtStage: billed,
      percentage: 100,
      colorClass: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
    };
  }

  if (stock > 0) {
    return {
      stageId: 'expedicao',
      stageName: 'Stock/Expedição',
      piecesAtStage: stock,
      percentage: requested > 0 ? Math.min(100, Math.round((stock / requested) * 100)) : 0,
      colorClass: 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800'
    };
  }

  if (emb > 0) {
    return {
      stageId: 'embalagem',
      stageName: 'Embalagem/Acabamento',
      piecesAtStage: emb,
      percentage: requested > 0 ? Math.min(100, Math.round((emb / requested) * 100)) : 0,
      colorClass: 'text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800'
    };
  }

  if (conf > 0) {
    return {
      stageId: 'confeccao',
      stageName: 'Confecção',
      piecesAtStage: conf,
      percentage: requested > 0 ? Math.min(100, Math.round((conf / requested) * 100)) : 0,
      colorClass: 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800'
    };
  }

  if (tint > 0) {
    return {
      stageId: 'tinturaria',
      stageName: 'Tinturaria',
      piecesAtStage: tint,
      percentage: requested > 0 ? Math.min(100, Math.round((tint / requested) * 100)) : 0,
      colorClass: 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
    };
  }

  if (felpo > 0) {
    return {
      stageId: 'felpo_cru',
      stageName: 'Felpo Cru / Tecelagem',
      piecesAtStage: felpo,
      percentage: requested > 0 ? Math.min(100, Math.round((felpo / requested) * 100)) : 0,
      colorClass: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
    };
  }

  return {
    stageId: 'open',
    stageName: 'Por Iniciar',
    piecesAtStage: order.qtyOpen || requested,
    percentage: 0,
    colorClass: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
  };
};

export const OrderPosition: React.FC<OrderPositionProps> = ({
  orders,
  onViewDetails,
  globalSearchTerm = '',
  user
}) => {
  // Filtros
  const [searchTerm, setSearchTerm] = useState(globalSearchTerm);
  const deferredSearch = useDeferredValue(searchTerm);

  const [filterDocSeries, setFilterDocSeries] = useState('All');
  const [filterClient, setFilterClient] = useState('All');
  const [filterComercial, setFilterComercial] = useState('All');
  const [filterReference, setFilterReference] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterSector, setFilterSector] = useState('All'); // Filtro pelo setor onde há peças
  const [filterArchived, setFilterArchived] = useState<'active' | 'archived' | 'all'>('active');
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterWeekMode, setFilterWeekMode] = useState<'exact' | 'cumulative'>('exact');

  // Modo de visualização: 'document' (agrupado por doc) ou 'item' (por linha de artigo)
  const [viewMode, setViewMode] = useState<'document' | 'item'>('document');
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  // Seleção de encomendas (conjunto de order.id)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Ordenação
  const [sortField, setSortField] = useState<'date' | 'docNr' | 'client' | 'qtyRequested' | 'qtyOpen'>('date');
  const [sortAsc, setSortAsc] = useState(true);

  // Funções de Navegação de Semana
  const handlePrevWeek = () => {
    if (filterDate) {
      const newDate = new Date(filterDate);
      newDate.setDate(newDate.getDate() - 7);
      setFilterDate(newDate);
      setCurrentPage(1);
    }
  };

  const handleNextWeek = () => {
    if (filterDate) {
      const newDate = new Date(filterDate);
      newDate.setDate(newDate.getDate() + 7);
      setFilterDate(newDate);
      setCurrentPage(1);
    }
  };

  // Sincronizar com pesquisa global se mudar
  React.useEffect(() => {
    if (globalSearchTerm) {
      setSearchTerm(globalSearchTerm);
    }
  }, [globalSearchTerm]);

  // Opções de séries, clientes, comerciais e referências
  const { seriesOptions, clientOptions, comercialOptions, referenceOptions } = useMemo(() => {
    const sSet = new Set<string>();
    const cSet = new Set<string>();
    const comSet = new Set<string>();
    const rSet = new Set<string>();

    orders.forEach(o => {
      if (o.docSeries) sSet.add(o.docSeries);
      if (o.clientName) cSet.add(o.clientName);
      if (o.comercial) comSet.add(o.comercial);
      if (o.reference) rSet.add(o.reference);
    });

    return {
      seriesOptions: Array.from(sSet).sort(),
      clientOptions: Array.from(cSet).sort(),
      comercialOptions: Array.from(comSet).sort(),
      referenceOptions: Array.from(rSet).sort(),
    };
  }, [orders]);

  // Filtragem
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Filtro de arquivados
    if (filterArchived === 'active') {
      result = result.filter(o => !o.isArchived);
    } else if (filterArchived === 'archived') {
      result = result.filter(o => o.isArchived);
    }

    // Filtro Série
    if (filterDocSeries !== 'All') {
      result = result.filter(o => o.docSeries === filterDocSeries);
    }

    // Filtro Cliente
    if (filterClient !== 'All') {
      result = result.filter(o => o.clientName === filterClient);
    }

    // Filtro Comercial
    if (filterComercial !== 'All') {
      result = result.filter(o => o.comercial === filterComercial);
    }

    // Filtro Referência
    if (filterReference !== 'All') {
      result = result.filter(o => o.reference === filterReference);
    }

    // Filtro Estado
    if (filterStatus !== 'All') {
      result = result.filter(o => getOrderState(o) === filterStatus);
    }

    // Filtro de Semana (Dinâmico: só da semana ou todas as anteriores e até à semana selecionada)
    if (filterDate) {
      const { start: weekStart, end: weekEnd } = getWeekRange(filterDate);
      result = result.filter(o => {
        const dateToCheck = o.requestedDate || o.armExpDate;
        if (!dateToCheck) return false;
        if (filterWeekMode === 'cumulative') {
          return dateToCheck <= weekEnd;
        } else {
          return dateToCheck >= weekStart && dateToCheck <= weekEnd;
        }
      });
    }

    // Filtro Setor de Produção com peças
    if (filterSector !== 'All') {
      result = result.filter(o => {
        switch (filterSector) {
          case 'tecelagem': return (o.felpoCruQty || 0) > 0 || !!o.dataTec;
          case 'felpo_cru': return (o.felpoCruQty || 0) > 0;
          case 'tinturaria': return (o.tinturariaQty || 0) > 0;
          case 'confeccao': return ((o.confRoupoesQty || 0) + (o.confFelposQty || 0)) > 0;
          case 'embalagem': return (o.embAcabQty || 0) > 0;
          case 'expedicao': return (o.stockCxQty || 0) > 0;
          case 'open': return (o.qtyOpen || 0) > 0 && !(o.felpoCruQty || o.tinturariaQty || o.confRoupoesQty || o.confFelposQty || o.embAcabQty || o.stockCxQty);
          default: return true;
        }
      });
    }

    // Pesquisa textual
    if (deferredSearch.trim() !== '') {
      const q = deferredSearch.toLowerCase().trim();
      result = result.filter(o => 
        (o.docNr && o.docNr.toLowerCase().includes(q)) ||
        (o.clientName && o.clientName.toLowerCase().includes(q)) ||
        (o.articleCode && o.articleCode.toLowerCase().includes(q)) ||
        (o.reference && o.reference.toLowerCase().includes(q)) ||
        (o.po && o.po.toLowerCase().includes(q)) ||
        (o.colorDesc && o.colorDesc.toLowerCase().includes(q)) ||
        (o.comercial && o.comercial.toLowerCase().includes(q))
      );
    }

    return result;
  }, [orders, filterArchived, filterDocSeries, filterClient, filterComercial, filterReference, filterStatus, filterSector, filterDate, filterWeekMode, deferredSearch]);

  // Documentos agrupados para visão por documento
  interface PositionDocGroup {
    docNr: string;
    docSeries: string;
    clientName: string;
    comercial: string;
    po: string;
    requestedDate: Date | null;
    generalPredictedDate: Date | null;
    originalRequestedDate: Date | null;
    priority: number;
    items: Order[];
    totalQtyRequested: number;
    totalQtyOpen: number;
    totalQtyBilled: number;
    totalTecelagem: number;
    totalFelpoCru: number;
    totalTinturaria: number;
    totalConfeccao: number;
    totalEmbalagem: number;
    totalStockExpedicao: number;
    status: OrderState;
    mainStage: string;
  }

  const documentGroups = useMemo<PositionDocGroup[]>(() => {
    const map = new Map<string, PositionDocGroup>();

    filteredOrders.forEach(order => {
      const key = order.docNr || `item-${order.id}`;
      const existing = map.get(key);

      const confQty = (order.confRoupoesQty || 0) + (order.confFelposQty || 0);

      if (!existing) {
        map.set(key, {
          docNr: order.docNr || '-',
          docSeries: order.docSeries || '',
          clientName: order.clientName || '',
          comercial: order.comercial || '',
          po: order.po || '',
          requestedDate: order.generalPredictedDate || order.requestedDate,
          generalPredictedDate: order.generalPredictedDate || null,
          originalRequestedDate: order.originalRequestedDate || order.requestedDate,
          priority: order.priority || 0,
          items: [order],
          totalQtyRequested: order.qtyRequested || 0,
          totalQtyOpen: order.qtyOpen !== undefined ? order.qtyOpen : (order.qtyRequested || 0),
          totalQtyBilled: order.qtyBilled || 0,
          totalTecelagem: order.felpoCruQty || 0,
          totalFelpoCru: order.felpoCruQty || 0,
          totalTinturaria: order.tinturariaQty || 0,
          totalConfeccao: confQty,
          totalEmbalagem: order.embAcabQty || 0,
          totalStockExpedicao: order.stockCxQty || 0,
          status: getOrderState(order),
          mainStage: getOrderPositionStage(order).stageName
        });
      } else {
        existing.items.push(order);
        existing.totalQtyRequested += (order.qtyRequested || 0);
        existing.totalQtyOpen += (order.qtyOpen !== undefined ? order.qtyOpen : (order.qtyRequested || 0));
        existing.totalQtyBilled += (order.qtyBilled || 0);
        existing.totalTecelagem += (order.felpoCruQty || 0);
        existing.totalFelpoCru += (order.felpoCruQty || 0);
        existing.totalTinturaria += (order.tinturariaQty || 0);
        existing.totalConfeccao += confQty;
        existing.totalEmbalagem += (order.embAcabQty || 0);
        existing.totalStockExpedicao += (order.stockCxQty || 0);
        if ((order.priority || 0) > existing.priority) {
          existing.priority = order.priority || 0;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (sortField === 'date') {
        const tA = a.requestedDate ? a.requestedDate.getTime() : (sortAsc ? Infinity : -Infinity);
        const tB = b.requestedDate ? b.requestedDate.getTime() : (sortAsc ? Infinity : -Infinity);
        return sortAsc ? tA - tB : tB - tA;
      }
      if (sortField === 'docNr') {
        return sortAsc ? a.docNr.localeCompare(b.docNr) : b.docNr.localeCompare(a.docNr);
      }
      if (sortField === 'client') {
        return sortAsc ? a.clientName.localeCompare(b.clientName) : b.clientName.localeCompare(a.clientName);
      }
      if (sortField === 'qtyRequested') {
        return sortAsc ? a.totalQtyRequested - b.totalQtyRequested : b.totalQtyRequested - a.totalQtyRequested;
      }
      if (sortField === 'qtyOpen') {
        return sortAsc ? a.totalQtyOpen - b.totalQtyOpen : b.totalQtyOpen - a.totalQtyOpen;
      }
      return 0;
    });
  }, [filteredOrders, sortField, sortAsc]);

  // REQUISITO 1: No modo "Por Linha / Artigo", apenas as encomendas selecionadas são apresentadas (as não selecionadas são ocultadas).
  const visibleItemOrders = useMemo(() => {
    if (viewMode === 'item') {
      return filteredOrders.filter(o => selectedOrderIds.has(o.id));
    }
    return filteredOrders;
  }, [viewMode, filteredOrders, selectedOrderIds]);

  // Itens ordenados para a visão detalhada por linha
  const sortedOrders = useMemo(() => {
    return [...visibleItemOrders].sort((a, b) => {
      if (sortField === 'date') {
        const tA = a.requestedDate ? new Date(a.requestedDate).getTime() : (sortAsc ? Infinity : -Infinity);
        const tB = b.requestedDate ? new Date(b.requestedDate).getTime() : (sortAsc ? Infinity : -Infinity);
        return sortAsc ? tA - tB : tB - tA;
      }
      if (sortField === 'docNr') {
        return sortAsc ? a.docNr.localeCompare(b.docNr) : b.docNr.localeCompare(a.docNr);
      }
      if (sortField === 'client') {
        return sortAsc ? a.clientName.localeCompare(b.clientName) : b.clientName.localeCompare(a.clientName);
      }
      if (sortField === 'qtyRequested') {
        return sortAsc ? (a.qtyRequested || 0) - (b.qtyRequested || 0) : (b.qtyRequested || 0) - (a.qtyRequested || 0);
      }
      if (sortField === 'qtyOpen') {
        return sortAsc ? (a.qtyOpen || 0) - (b.qtyOpen || 0) : (b.qtyOpen || 0) - (a.qtyOpen || 0);
      }
      return 0;
    });
  }, [visibleItemOrders, sortField, sortAsc]);

  // Encomendas ativas para o cálculo de métricas e exportação:
  // Se houver seleção manual pelo utilizador, foca nessas encomendas; caso contrário, utiliza todas as encomendas filtradas.
  const activeFocusOrders = useMemo(() => {
    if (selectedOrderIds.size > 0) {
      return orders.filter(o => selectedOrderIds.has(o.id));
    }
    return filteredOrders;
  }, [orders, selectedOrderIds, filteredOrders]);

  // Resumo do pipeline de setores para as encomendas em foco
  const pipelineMetrics = useMemo(() => {
    let totalRequested = 0;
    let totalBilled = 0;
    let totalOpen = 0;
    let tecelagemQty = 0;
    let felpoCruQty = 0;
    let tinturariaQty = 0;
    let confeccaoQty = 0;
    let embalagemQty = 0;
    let expedicaoQty = 0;

    const sectorOrderCounts = {
      tecelagem: 0,
      felpo_cru: 0,
      tinturaria: 0,
      confeccao: 0,
      embalagem: 0,
      expedicao: 0,
    };

    activeFocusOrders.forEach(o => {
      totalRequested += (o.qtyRequested || 0);
      totalBilled += (o.qtyBilled || 0);
      totalOpen += (o.qtyOpen || 0);

      const fQty = o.felpoCruQty || 0;
      const tQty = o.tinturariaQty || 0;
      const cQty = (o.confRoupoesQty || 0) + (o.confFelposQty || 0);
      const eQty = o.embAcabQty || 0;
      const sQty = o.stockCxQty || 0;

      tecelagemQty += fQty;
      felpoCruQty += fQty;
      tinturariaQty += tQty;
      confeccaoQty += cQty;
      embalagemQty += eQty;
      expedicaoQty += sQty;

      if (fQty > 0 || o.dataTec) sectorOrderCounts.tecelagem++;
      if (fQty > 0) sectorOrderCounts.felpo_cru++;
      if (tQty > 0) sectorOrderCounts.tinturaria++;
      if (cQty > 0) sectorOrderCounts.confeccao++;
      if (eQty > 0) sectorOrderCounts.embalagem++;
      if (sQty > 0) sectorOrderCounts.expedicao++;
    });

    return {
      totalRequested,
      totalBilled,
      totalOpen,
      tecelagem: { qty: tecelagemQty, orders: sectorOrderCounts.tecelagem },
      felpo_cru: { qty: felpoCruQty, orders: sectorOrderCounts.felpo_cru },
      tinturaria: { qty: tinturariaQty, orders: sectorOrderCounts.tinturaria },
      confeccao: { qty: confeccaoQty, orders: sectorOrderCounts.confeccao },
      embalagem: { qty: embalagemQty, orders: sectorOrderCounts.embalagem },
      expedicao: { qty: expedicaoQty, orders: sectorOrderCounts.expedicao },
    };
  }, [activeFocusOrders]);

  // Gestão de Seleção
  const isAllFilteredSelected = useMemo(() => {
    if (viewMode === 'item') {
      return sortedOrders.length > 0 && sortedOrders.every(o => selectedOrderIds.has(o.id));
    }
    if (filteredOrders.length === 0) return false;
    return filteredOrders.every(o => selectedOrderIds.has(o.id));
  }, [viewMode, sortedOrders, filteredOrders, selectedOrderIds]);

  const toggleSelectAllFiltered = () => {
    if (viewMode === 'item') {
      if (isAllFilteredSelected) {
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          sortedOrders.forEach(o => next.delete(o.id));
          return next;
        });
      } else {
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          filteredOrders.forEach(o => next.add(o.id));
          return next;
        });
      }
    } else {
      if (isAllFilteredSelected) {
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          filteredOrders.forEach(o => next.delete(o.id));
          return next;
        });
      } else {
        setSelectedOrderIds(prev => {
          const next = new Set(prev);
          filteredOrders.forEach(o => next.add(o.id));
          return next;
        });
      }
    }
  };

  const handleSelectDocGroup = (group: PositionDocGroup) => {
    const allSelected = group.items.every(it => selectedOrderIds.has(it.id));
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        group.items.forEach(it => next.delete(it.id));
      } else {
        group.items.forEach(it => next.add(it.id));
      }
      return next;
    });
  };

  const handleToggleOrderItem = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const selectAllFilteredOrders = () => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      filteredOrders.forEach(o => next.add(o.id));
      return next;
    });
  };

  const toggleExpandDoc = (docNr: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docNr)) next.delete(docNr);
      else next.add(docNr);
      return next;
    });
  };

  const handleViewModeChange = (mode: 'document' | 'item') => {
    setViewMode(mode);
    setCurrentPage(1);
  };

  // Reset de Filtros
  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterDocSeries('All');
    setFilterClient('All');
    setFilterComercial('All');
    setFilterReference('All');
    setFilterStatus('All');
    setFilterSector('All');
    setFilterArchived('active');
    setFilterDate(null);
    setFilterWeekMode('exact');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm !== '' ||
    filterDocSeries !== 'All' ||
    filterClient !== 'All' ||
    filterComercial !== 'All' ||
    filterReference !== 'All' ||
    filterStatus !== 'All' ||
    filterSector !== 'All' ||
    filterArchived !== 'active' ||
    filterDate !== null ||
    filterWeekMode !== 'exact';

  // Exportação para Excel
  const handleExportToExcel = () => {
    const ordersToExport = activeFocusOrders;
    if (ordersToExport.length === 0) return;

    const ts = (d: Date | null | undefined): string => {
      if (!d || isNaN(new Date(d).getTime())) return '';
      return formatDate(d);
    };

    // 1. Folha principal de Posição de Encomendas
    const rows = ordersToExport.map(o => {
      const pos = getOrderPositionStage(o);
      const confQty = (o.confRoupoesQty || 0) + (o.confFelposQty || 0);
      const reqQty = o.qtyRequested || 0;
      const pctComplete = reqQty > 0 ? Math.round(((o.stockCxQty || o.embAcabQty || confQty || o.tinturariaQty || o.felpoCruQty || 0) / reqQty) * 100) : 0;

      return {
        'Série': o.docSeries || '',
        'Nr. Documento': o.docNr || '',
        'Item': o.itemNr || 1,
        'Cliente': o.clientName || '',
        'Comercial': o.comercial || '',
        'PO': o.po || '',
        'Cod. Artigo': o.articleCode || '',
        'Referência': o.reference || '',
        'Cor': o.colorDesc || o.colorCode || '',
        'Tamanho / Medida': o.sizeDesc || o.size || '',
        'Família': o.family || '',
        'Qtd. Pedida': reqQty,
        'Qtd. Facturada': o.qtyBilled || 0,
        'Qtd. Em Aberto': o.qtyOpen !== undefined ? o.qtyOpen : reqQty,
        'Posição Atual': pos.stageName,
        '% Concluído': `${pctComplete}%`,
        'Tecelagem - Qtd': o.felpoCruQty || 0,
        'Tecelagem - Data Tec': ts(o.dataTec),
        'Felpo Cru - Qtd': o.felpoCruQty || 0,
        'Felpo Cru - Data F.Cru': ts(o.felpoCruDate),
        'Tinturaria - Qtd': o.tinturariaQty || 0,
        'Tinturaria - Data Tint': ts(o.tinturariaDate),
        'Confecção - Qtd': confQty,
        'Confecção - Data Conf': ts(o.confDate),
        'Embalagem - Qtd': o.embAcabQty || 0,
        'Embalagem - Data Prev': ts(o.armExpDate),
        'Stock/Expedição - Qtd': o.stockCxQty || 0,
        'Stock/Expedição - Data Ent': ts(o.dataEnt),
        'Data Entrega Pedida': ts(o.originalRequestedDate || o.requestedDate),
        'Data Prevista Geral': ts(o.generalPredictedDate),
        'Semana Entrega': o.deliveryWeek ?? (o.requestedDate ? getISOWeek(o.requestedDate) : ''),
        'Classificação Geral': o.generalClassification || o.sectorStopReasons?.['planeamento'] || '',
        'Observação Geral': o.generalObservation || o.sectorObservations?.['planeamento'] || '',
        'Estado': getOrderState(o),
        'Prioridade': o.priority === 1 ? 'Alta' : (o.priority === 2 ? 'Média' : (o.priority === 3 ? 'Baixa' : 'Normal'))
      };
    });

    // Linha de totalizadores
    const totalRequested = rows.reduce((s, r) => s + (r['Qtd. Pedida'] || 0), 0);
    const totalBilled = rows.reduce((s, r) => s + (r['Qtd. Facturada'] || 0), 0);
    const totalOpen = rows.reduce((s, r) => s + (r['Qtd. Em Aberto'] || 0), 0);
    const totalTec = rows.reduce((s, r) => s + (r['Tecelagem - Qtd'] || 0), 0);
    const totalCru = rows.reduce((s, r) => s + (r['Felpo Cru - Qtd'] || 0), 0);
    const totalTint = rows.reduce((s, r) => s + (r['Tinturaria - Qtd'] || 0), 0);
    const totalConf = rows.reduce((s, r) => s + (r['Confecção - Qtd'] || 0), 0);
    const totalEmb = rows.reduce((s, r) => s + (r['Embalagem - Qtd'] || 0), 0);
    const totalStock = rows.reduce((s, r) => s + (r['Stock/Expedição - Qtd'] || 0), 0);

    const summaryRow: any = {
      'Série': '',
      'Nr. Documento': 'TOTAIS',
      'Item': '',
      'Cliente': `${ordersToExport.length} encomendas`,
      'Comercial': '',
      'PO': '',
      'Cod. Artigo': '',
      'Referência': '',
      'Cor': '',
      'Tamanho / Medida': '',
      'Família': '',
      'Qtd. Pedida': totalRequested,
      'Qtd. Facturada': totalBilled,
      'Qtd. Em Aberto': totalOpen,
      'Posição Atual': '',
      '% Concluído': '',
      'Tecelagem - Qtd': totalTec,
      'Tecelagem - Data Tec': '',
      'Felpo Cru - Qtd': totalCru,
      'Felpo Cru - Data F.Cru': '',
      'Tinturaria - Qtd': totalTint,
      'Tinturaria - Data Tint': '',
      'Confecção - Qtd': totalConf,
      'Confecção - Data Conf': '',
      'Embalagem - Qtd': totalEmb,
      'Embalagem - Data Prev': '',
      'Stock/Expedição - Qtd': totalStock,
      'Stock/Expedição - Data Ent': '',
      'Data Entrega Pedida': '',
      'Data Prevista Geral': '',
      'Semana Entrega': '',
      'Classificação Geral': '',
      'Observação Geral': '',
      'Estado': '',
      'Prioridade': ''
    };

    rows.push(summaryRow);

    const workbook = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(rows);

    // Ajustar larguras
    ws1['!cols'] = [
      { wch: 8 },  // Série
      { wch: 16 }, // Doc
      { wch: 6 },  // Item
      { wch: 26 }, // Cliente
      { wch: 16 }, // Comercial
      { wch: 14 }, // PO
      { wch: 14 }, // Artigo
      { wch: 20 }, // Ref
      { wch: 18 }, // Cor
      { wch: 14 }, // Tamanho
      { wch: 12 }, // Família
      { wch: 12 }, // Qtd Pedida
      { wch: 12 }, // Facturada
      { wch: 12 }, // Aberto
      { wch: 22 }, // Posição Atual
      { wch: 12 }, // % Concluído
      { wch: 14 }, // Tec Qtd
      { wch: 12 }, // Tec Data
      { wch: 14 }, // Cru Qtd
      { wch: 12 }, // Cru Data
      { wch: 14 }, // Tint Qtd
      { wch: 12 }, // Tint Data
      { wch: 14 }, // Conf Qtd
      { wch: 12 }, // Conf Data
      { wch: 14 }, // Emb Qtd
      { wch: 12 }, // Emb Data
      { wch: 16 }, // Stock Qtd
      { wch: 12 }, // Stock Data
      { wch: 14 }, // Entrega
      { wch: 14 }, // Prevista
      { wch: 14 }, // Semana
      { wch: 24 }, // Classificação
      { wch: 28 }, // Observações
      { wch: 14 }, // Estado
      { wch: 10 }, // Prioridade
    ];

    XLSX.utils.book_append_sheet(workbook, ws1, 'Posição Peças');

    // 2. Folha de Resumo por Setor
    const sectorSummary = [
      {
        'Sector': '1. Tecelagem',
        'Peças no Sector': pipelineMetrics.tecelagem.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.tecelagem.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.tecelagem.orders,
      },
      {
        'Sector': '2. Felpo Cru',
        'Peças no Sector': pipelineMetrics.felpo_cru.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.felpo_cru.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.felpo_cru.orders,
      },
      {
        'Sector': '3. Tinturaria',
        'Peças no Sector': pipelineMetrics.tinturaria.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.tinturaria.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.tinturaria.orders,
      },
      {
        'Sector': '4. Confecção',
        'Peças no Sector': pipelineMetrics.confeccao.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.confeccao.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.confeccao.orders,
      },
      {
        'Sector': '5. Embalagem/Acabamento',
        'Peças no Sector': pipelineMetrics.embalagem.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.embalagem.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.embalagem.orders,
      },
      {
        'Sector': '6. Stock/Expedição',
        'Peças no Sector': pipelineMetrics.expedicao.qty,
        '% sobre Encomendado': totalRequested > 0 ? `${((pipelineMetrics.expedicao.qty / totalRequested) * 100).toFixed(1)}%` : '0%',
        'Nr. Encomendas': pipelineMetrics.expedicao.orders,
      },
    ];

    const ws2 = XLSX.utils.json_to_sheet(sectorSummary);
    ws2['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, ws2, 'Resumo Sectores');

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    const filename = `Posicao_Encomendas_${dateStr}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  // Itens paginados
  const totalItemsCount = viewMode === 'document' ? documentGroups.length : sortedOrders.length;
  const totalPages = Math.ceil(totalItemsCount / itemsPerPage) || 1;
  const paginatedDocGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return documentGroups.slice(start, start + itemsPerPage);
  }, [documentGroups, currentPage, itemsPerPage]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedOrders.slice(start, start + itemsPerPage);
  }, [sortedOrders, currentPage, itemsPerPage]);

  // Lista de destaques para HighlightText
  const highlights = useMemo(() => {
    return deferredSearch.trim() ? [deferredSearch.trim()] : [];
  }, [deferredSearch]);

  const getPriorityBadge = (p?: number) => {
    switch (p) {
      case 1:
        return <span className="inline-block w-2 h-2 rounded-full bg-red-600 shrink-0" title="Prioridade Alta" />;
      case 2:
        return <span className="inline-block w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Prioridade Média" />;
      case 3:
        return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" title="Prioridade Baixa" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-800 dark:text-slate-100 transition-colors">
      {/* 1. Header Superior & Controlos Rápidos */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 md:px-6 py-2.5 shrink-0 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200/60 dark:border-blue-800/60">
              <Boxes size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-bold text-slate-900 dark:text-white leading-none">
                  Posição de Encomendas
                </h1>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {viewMode === 'document' ? `${documentGroups.length} documentos (${filteredOrders.length} linhas)` : `${sortedOrders.length} linhas selecionadas`}
                </span>
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-none">
                Controlo em tempo real da posição das peças em produção por sector
              </p>
            </div>
          </div>

          {/* Barra de Ações Rápidas */}
          <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
            {/* Seletor de Modo de Visualização */}
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-950 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => handleViewModeChange('document')}
                className={`px-2.5 py-1 rounded transition-colors ${viewMode === 'document' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              >
                Por Documento
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('item')}
                className={`px-2.5 py-1 rounded transition-colors ${viewMode === 'item' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                title="Apresenta apenas as linhas das encomendas selecionadas (oculta não selecionadas)"
              >
                Por Linha / Artigo {selectedOrderIds.size > 0 ? `(${selectedOrderIds.size})` : ''}
              </button>
            </div>

            {/* Ações de Seleção */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors"
                title="Selecionar ou desselecionar todos os itens visíveis"
              >
                {isAllFilteredSelected ? <CheckSquare size={12} className="text-blue-600" /> : <Square size={12} className="text-slate-400" />}
                <span>{isAllFilteredSelected ? 'Desmarcar' : 'Selecionar Visíveis'}</span>
              </button>

              {selectedOrderIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2 py-1 rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 font-medium transition-colors"
                >
                  Limpar ({selectedOrderIds.size})
                </button>
              )}
            </div>

            {/* Botão de Exportação para Excel */}
            <button
              type="button"
              onClick={handleExportToExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs transition-all cursor-pointer"
              title="Exportar listagem completa com posição de peças e setores para Excel"
            >
              <FileSpreadsheet size={14} />
              <span>
                Exportar Excel {selectedOrderIds.size > 0 ? `(${selectedOrderIds.size})` : `(${filteredOrders.length})`}
              </span>
            </button>
          </div>
        </div>

        {/* 2. Visualizador do Pipeline de Sectores (Controlo de Peças em Produção) */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>Posição das Peças no Fluxo Produtivo</span>
              {selectedOrderIds.size > 0 ? (
                <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.2 rounded border border-blue-200/80">
                  {selectedOrderIds.size} encomendas selecionadas
                </span>
              ) : (
                <span className="text-[9px] font-normal text-slate-400">
                  (Baseado em todas as {filteredOrders.length} encomendas filtradas)
                </span>
              )}
            </span>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <span>Total Pedido: <strong className="font-mono text-slate-900 dark:text-slate-100">{pipelineMetrics.totalRequested.toLocaleString('pt-PT')} UN</strong></span>
              <span>•</span>
              <span>Em Aberto: <strong className="font-mono text-amber-600 dark:text-amber-400">{pipelineMetrics.totalOpen.toLocaleString('pt-PT')} UN</strong></span>
            </div>
          </div>

          {/* Cards dos Sectores em Pipeline */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
            {SECTORS.map(sec => {
              const SectorIcon = sec.icon;
              const metric = (pipelineMetrics as any)[sec.id] || { qty: 0, orders: 0 };
              const pct = pipelineMetrics.totalRequested > 0 
                ? Math.round((metric.qty / pipelineMetrics.totalRequested) * 100) 
                : 0;
              const isFiltered = filterSector === sec.id;

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setFilterSector(isFiltered ? 'All' : sec.id)}
                  className={`flex flex-col p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    isFiltered 
                      ? 'bg-blue-50/90 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/50' 
                      : 'bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 border-slate-200/80 dark:border-slate-800'
                  }`}
                  title={`Filtrar encomendas com peças no sector ${sec.name}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate">
                      <SectorIcon size={12} className="text-blue-500 shrink-0" />
                      <span className="truncate">{sec.name}</span>
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 font-semibold">
                      {metric.orders} enc.
                    </span>
                  </div>

                  <div className="mt-1 flex items-baseline justify-between gap-1 font-mono">
                    <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
                      {metric.qty.toLocaleString('pt-PT')}
                      <span className="text-[8px] font-normal text-slate-400 ml-0.5">UN</span>
                    </span>
                    <span className="text-[9px] text-slate-500 font-semibold">
                      {pct}%
                    </span>
                  </div>

                  {/* Barra de progresso do sector */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-300" 
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Barra de Filtros e Pesquisa */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800 px-3 md:px-6 py-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Caixa de Pesquisa */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar Doc, Cliente, Ref, PO..."
              className="w-full pl-7 pr-2.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:border-blue-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
            />
          </div>

          {/* Seletor de Semana com modo Só Semana vs Até à Semana */}
          {!filterDate ? (
            <button 
              type="button"
              onClick={() => { setFilterDate(new Date()); setCurrentPage(1); }}
              className="flex items-center gap-1.5 border rounded-md px-2.5 py-1 shadow-2xs transition-colors bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-[10.5px] font-semibold"
              title="Filtrar por Semana"
            >
              <Calendar size={12} className="text-slate-400" />
              <span>Filtrar Semana</span>
            </button>
          ) : (
            <div className="flex flex-wrap sm:flex-nowrap items-center bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-md shadow-2xs overflow-hidden">
              <button 
                type="button"
                onClick={handlePrevWeek} 
                className="px-1.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" 
                title="Semana anterior"
              >
                <ChevronLeft size={13} />
              </button>
              <div className="px-1.5 flex flex-col items-center justify-center min-w-[80px]">
                <span className="text-[9px] font-black uppercase text-blue-500 dark:text-blue-400 leading-none">
                  Semana {getISOWeek(filterDate)}
                </span>
                <span className="text-[8.5px] font-medium text-blue-700 dark:text-blue-200 leading-none mt-0.5">
                  {(() => {
                    const {start, end} = getWeekRange(filterDate);
                    return `${start.getDate()} ${start.toLocaleString('pt-PT', {month: 'short'})} - ${end.getDate()} ${end.toLocaleString('pt-PT', {month: 'short'})}`;
                  })()}
                </span>
              </div>
              <button 
                type="button"
                onClick={handleNextWeek} 
                className="px-1.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-colors" 
                title="Semana seguinte"
              >
                <ChevronRight size={13} />
              </button>
              
              {/* Seletor de Modo: Só Semana vs Até à Semana */}
              <div className="flex items-center border-l border-blue-200 dark:border-blue-800 px-1 py-0.5 gap-0.5 bg-white/60 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => { setFilterWeekMode('exact'); setCurrentPage(1); }}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition-all ${
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
                  onClick={() => { setFilterWeekMode('cumulative'); setCurrentPage(1); }}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition-all ${
                    filterWeekMode === 'cumulative'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                  }`}
                  title="Todas as encomendas anteriores e até à semana selecionada"
                >
                  ≤ Até à Semana
                </button>
              </div>

              <div className="w-px h-4 bg-blue-200 dark:bg-blue-800 mx-0.5"></div>
              <button 
                type="button"
                onClick={() => { setFilterDate(null); setCurrentPage(1); }} 
                className="px-1.5 py-1 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-blue-400 dark:text-blue-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors" 
                title="Remover filtro de semana"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Filtro Série */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <FileText size={12} className="text-slate-400" />
            <select
              value={filterDocSeries}
              onChange={(e) => { setFilterDocSeries(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="All">Todas Séries</option>
              {seriesOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Filtro Cliente */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <Users size={12} className="text-slate-400" />
            <select
              value={filterClient}
              onChange={(e) => { setFilterClient(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="All">Todos Clientes</option>
              {clientOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Filtro Comercial */}
          {comercialOptions.length > 0 && (
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
              <select
                value={filterComercial}
                onChange={(e) => { setFilterComercial(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer max-w-[130px] truncate"
              >
                <option value="All">Todos Comerciais</option>
                {comercialOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Filtro Referência */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <Tag size={12} className="text-slate-400" />
            <select
              value={filterReference}
              onChange={(e) => { setFilterReference(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer max-w-[130px] truncate"
            >
              <option value="All">Todas Referências</option>
              {referenceOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <Filter size={12} className="text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="All">Todos Estados</option>
              <option value={OrderState.IN_PRODUCTION}>Em Produção</option>
              <option value={OrderState.LATE}>Atrasada</option>
              <option value={OrderState.COMPLETED}>Concluída</option>
              <option value={OrderState.OPEN}>Em Aberto</option>
              <option value={OrderState.BILLED}>Facturada</option>
            </select>
          </div>

          {/* Filtro Setor */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <Layers size={12} className="text-slate-400" />
            <select
              value={filterSector}
              onChange={(e) => { setFilterSector(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="All">Todos os Sectores</option>
              <option value="tecelagem">Peças em Tecelagem</option>
              <option value="felpo_cru">Peças em Felpo Cru</option>
              <option value="tinturaria">Peças em Tinturaria</option>
              <option value="confeccao">Peças em Confecção</option>
              <option value="embalagem">Peças em Embalagem</option>
              <option value="expedicao">Peças em Expedição/Stock</option>
              <option value="open">Ainda Sem Peças</option>
            </select>
          </div>

          {/* Filtro Arquivadas */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1">
            <select
              value={filterArchived}
              onChange={(e) => { setFilterArchived(e.target.value as any); setCurrentPage(1); }}
              className="bg-transparent text-[10.5px] font-medium text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="active">Apenas Ativas</option>
              <option value="archived">Apenas Arquivadas</option>
              <option value="all">Todas (Incl. Arquivadas)</option>
            </select>
          </div>

          {/* Botão Reset Filtros */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded-md border border-rose-200 dark:border-rose-900 transition-colors"
              title="Limpar todos os filtros ativos"
            >
              <RotateCcw size={11} />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Tabela de Listagem / Posição de Encomendas (com Cabeçalho SEMPRE VISÍVEL) */}
      <div className="flex-1 min-h-0 flex flex-col p-2 md:p-4 overflow-hidden">
        {/* Banner informativo quando em modo "Por Linha / Artigo" */}
        {viewMode === 'item' && (
          <div className="mb-2 shrink-0 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckSquare size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[11px] text-blue-950 dark:text-blue-200">
                A mostrar apenas <strong>{sortedOrders.length} linhas de encomendas selecionadas</strong> ({filteredOrders.length - sortedOrders.length} encomendas não selecionadas ocultadas).
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAllFilteredOrders}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
              >
                Selecionar Todas as Visíveis ({filteredOrders.length})
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('document')}
                className="px-2 py-0.5 rounded text-[10px] font-semibold border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
              >
                Voltar a "Por Documento"
              </button>
            </div>
          </div>
        )}

        {/* Contentor com overflow-auto dedicado para garantir que o <thead> com sticky top-0 fica sempre fixo no topo ao fazer scroll */}
        <div className="flex-1 min-h-0 border border-slate-200 dark:border-slate-800 rounded-lg overflow-auto shadow-2xs relative bg-white dark:bg-slate-900">
          {viewMode === 'document' ? (
            /* MODO POR DOCUMENTO */
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 text-[9.5px] uppercase font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 tracking-wider shadow-xs">
                <tr>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2.5 py-2 w-[34px] text-center border-b border-slate-200 dark:border-slate-800">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      className="rounded text-blue-600 cursor-pointer"
                      title="Selecionar todos os documentos visíveis"
                    />
                  </th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 w-[140px] border-b border-slate-200 dark:border-slate-800">Documento / Série</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 min-w-[130px] border-b border-slate-200 dark:border-slate-800">Cliente & Comercial</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-right w-[95px] border-b border-slate-200 dark:border-slate-800">Qtd. Pedida</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-right w-[90px] border-b border-slate-200 dark:border-slate-800">Em Aberto</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 min-w-[130px] border-b border-slate-200 dark:border-slate-800">Posição Atual</th>
                  {/* Sectores */}
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-blue-100/90 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border-b border-slate-200 dark:border-slate-800">Tecelagem</th>
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-indigo-100/90 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-300 border-b border-slate-200 dark:border-slate-800">Felpo Cru</th>
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-purple-100/90 dark:bg-purple-950 text-purple-900 dark:text-purple-300 border-b border-slate-200 dark:border-slate-800">Tinturaria</th>
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-fuchsia-100/90 dark:bg-fuchsia-950 text-fuchsia-900 dark:text-fuchsia-300 border-b border-slate-200 dark:border-slate-800">Confecção</th>
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-pink-100/90 dark:bg-pink-950 text-pink-900 dark:text-pink-300 border-b border-slate-200 dark:border-slate-800">Embalagem</th>
                  <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-teal-100/90 dark:bg-teal-950 text-teal-900 dark:text-teal-300 border-b border-slate-200 dark:border-slate-800">Expedição</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-center w-[95px] border-b border-slate-200 dark:border-slate-800">Entrega</th>
                  <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-center w-[60px] border-b border-slate-200 dark:border-slate-800">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-[10.5px]">
                {paginatedDocGroups.map(group => {
                  const isExpanded = expandedDocs.has(group.docNr);
                  const isGroupSelected = group.items.every(it => selectedOrderIds.has(it.id));
                  const isGroupPartiallySelected = !isGroupSelected && group.items.some(it => selectedOrderIds.has(it.id));

                  return (
                    <React.Fragment key={group.docNr}>
                      <tr className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/40 transition-colors ${isGroupSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
                        {/* Checkbox */}
                        <td className="px-2.5 py-1.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isGroupSelected}
                            ref={el => {
                              if (el) el.indeterminate = isGroupPartiallySelected;
                            }}
                            onChange={() => handleSelectDocGroup(group)}
                            className="rounded text-blue-600 cursor-pointer"
                          />
                        </td>

                        {/* Documento / Série */}
                        <td className="px-2 py-1.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            {getPriorityBadge(group.priority)}
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-[11px] block">
                                <HighlightText text={group.docNr} highlight={highlights} />
                              </span>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                {group.docSeries ? `Série ${group.docSeries} · ` : ''}{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Cliente & Comercial */}
                        <td className="px-2 py-1.5 align-middle">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                            <HighlightText text={group.clientName} highlight={highlights} />
                          </div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 truncate">
                            {group.comercial && <span>Comercial: {group.comercial}</span>}
                            {group.po && <span>PO: {group.po}</span>}
                          </div>
                        </td>

                        {/* Qtd. Pedida */}
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums align-middle">
                          {group.totalQtyRequested.toLocaleString('pt-PT')}
                          <span className="text-[8px] font-normal text-slate-400 ml-0.5">UN</span>
                        </td>

                        {/* Qtd. Em Aberto */}
                        <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums align-middle">
                          {group.totalQtyOpen.toLocaleString('pt-PT')}
                        </td>

                        {/* Posição Atual */}
                        <td className="px-2 py-1.5 align-middle">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[150px]">
                            {group.mainStage}
                          </span>
                        </td>

                        {/* Tecelagem */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-blue-50/20 dark:bg-blue-950/10">
                          <span className={`font-semibold ${group.totalTecelagem > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalTecelagem > 0 ? group.totalTecelagem.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Felpo Cru */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-indigo-50/20 dark:bg-indigo-950/10">
                          <span className={`font-semibold ${group.totalFelpoCru > 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalFelpoCru > 0 ? group.totalFelpoCru.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Tinturaria */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-purple-50/20 dark:bg-purple-950/10">
                          <span className={`font-semibold ${group.totalTinturaria > 0 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalTinturaria > 0 ? group.totalTinturaria.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Confecção */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-fuchsia-50/20 dark:bg-fuchsia-950/10">
                          <span className={`font-semibold ${group.totalConfeccao > 0 ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalConfeccao > 0 ? group.totalConfeccao.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Embalagem */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-pink-50/20 dark:bg-pink-950/10">
                          <span className={`font-semibold ${group.totalEmbalagem > 0 ? 'text-pink-700 dark:text-pink-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalEmbalagem > 0 ? group.totalEmbalagem.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Stock/Expedição */}
                        <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-teal-50/20 dark:bg-teal-950/10">
                          <span className={`font-semibold ${group.totalStockExpedicao > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-slate-300 dark:text-slate-600'}`}>
                            {group.totalStockExpedicao > 0 ? group.totalStockExpedicao.toLocaleString('pt-PT') : '-'}
                          </span>
                        </td>

                        {/* Entrega */}
                        <td className="px-2 py-1.5 text-center font-mono text-[10px] text-slate-600 dark:text-slate-400 align-middle">
                          <div className="flex flex-col items-center justify-center leading-tight">
                            <span>{formatDate(group.requestedDate)}</span>
                            {group.generalPredictedDate && (
                              <span className="text-[7.5px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1 rounded border border-blue-200 mt-0.5">
                                Prev. Geral
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Ações / Expandir */}
                        <td className="px-2 py-1.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleExpandDoc(group.docNr)}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title={isExpanded ? 'Recolher itens' : 'Expandir itens'}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                      </tr>

                      {/* Linhas de Itens Expandidos */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-900/60 border-y border-slate-200 dark:border-slate-800">
                          <td colSpan={14} className="p-2 pl-8">
                            <div className="border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 overflow-hidden shadow-2xs">
                              <table className="w-full text-left text-[9.5px]">
                                <thead className="bg-slate-100/90 dark:bg-slate-900/90 text-[8.5px] font-bold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                  <tr>
                                    <th className="px-2 py-1 w-[30px] text-center">Item</th>
                                    <th className="px-2 py-1">Referência & Descrição</th>
                                    <th className="px-2 py-1">Cor</th>
                                    <th className="px-2 py-1">Tamanho</th>
                                    <th className="px-2 py-1 text-right">Qtd. Pedida</th>
                                    <th className="px-2 py-1 text-right">Em Aberto</th>
                                    <th className="px-2 py-1">Posição do Item</th>
                                    <th className="px-2 py-1 text-center">Tecelagem</th>
                                    <th className="px-2 py-1 text-center">Felpo Cru</th>
                                    <th className="px-2 py-1 text-center">Tinturaria</th>
                                    <th className="px-2 py-1 text-center">Confecção</th>
                                    <th className="px-2 py-1 text-center">Embalagem</th>
                                    <th className="px-2 py-1 text-center">Stock</th>
                                    <th className="px-2 py-1 text-center w-[50px]">Detalhes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {group.items.map(item => {
                                    const itemPos = getOrderPositionStage(item);
                                    const itemConf = (item.confRoupoesQty || 0) + (item.confFelposQty || 0);
                                    const isItemSelected = selectedOrderIds.has(item.id);

                                    return (
                                      <tr 
                                        key={item.id} 
                                        className={`hover:bg-blue-50/40 dark:hover:bg-slate-900 cursor-pointer ${isItemSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}
                                        onClick={() => handleToggleOrderItem(item.id)}
                                      >
                                        <td className="px-2 py-1 text-center font-mono font-bold text-slate-400">
                                          #{item.itemNr || 1}
                                        </td>
                                        <td className="px-2 py-1 font-semibold text-slate-800 dark:text-slate-200">
                                          <HighlightText text={item.reference} highlight={highlights} />
                                        </td>
                                        <td className="px-2 py-1 text-slate-600 dark:text-slate-400">
                                          <HighlightText text={item.colorDesc || item.colorCode || '-'} highlight={highlights} />
                                        </td>
                                        <td className="px-2 py-1 text-slate-600 dark:text-slate-400">
                                          {item.sizeDesc || item.size || '-'}
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                          {item.qtyRequested?.toLocaleString('pt-PT')}
                                        </td>
                                        <td className="px-2 py-1 text-right font-mono font-semibold text-amber-600">
                                          {item.qtyOpen !== undefined ? item.qtyOpen.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1">
                                          <span className={`inline-flex px-1.5 py-0.2 rounded text-[8.5px] font-semibold border ${itemPos.colorClass}`}>
                                            {itemPos.stageName} ({itemPos.piecesAtStage.toLocaleString('pt-PT')} UN)
                                          </span>
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {item.felpoCruQty ? item.felpoCruQty.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {item.felpoCruQty ? item.felpoCruQty.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {item.tinturariaQty ? item.tinturariaQty.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {itemConf ? itemConf.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {item.embAcabQty ? item.embAcabQty.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center font-mono text-slate-700 dark:text-slate-300">
                                          {item.stockCxQty ? item.stockCxQty.toLocaleString('pt-PT') : '-'}
                                        </td>
                                        <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            onClick={() => onViewDetails(item)}
                                            className="text-[8.5px] text-blue-600 hover:underline font-semibold"
                                          >
                                            Ver
                                          </button>
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

                {paginatedDocGroups.length === 0 && (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">
                      Nenhuma encomenda corresponde aos filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* MODO POR ARTIGO / LINHA DETALHADA (Apenas Encomendas Selecionadas) */
            <>
              {sortedOrders.length === 0 ? (
                <div className="py-16 px-4 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <CheckSquare size={22} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                    Nenhuma encomenda selecionada
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
                    No modo "Por Linha / Artigo" apenas são apresentadas as encomendas selecionadas. Selecione as encomendas pretendidas no modo "Por Documento" ou selecione todas as encomendas visíveis abaixo.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllFilteredOrders}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <CheckSquare size={14} />
                      <span>Selecionar Todas as Encomendas ({filteredOrders.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewModeChange('document')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      <span>Voltar a "Por Documento"</span>
                    </button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 text-[9.5px] uppercase font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 tracking-wider shadow-xs">
                    <tr>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2.5 py-2 w-[34px] text-center border-b border-slate-200 dark:border-slate-800">
                        <input
                          type="checkbox"
                          checked={isAllFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          className="rounded text-blue-600 cursor-pointer"
                          title="Selecionar ou desselecionar todos os itens"
                        />
                      </th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 w-[120px] border-b border-slate-200 dark:border-slate-800">Doc / Item</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 min-w-[130px] border-b border-slate-200 dark:border-slate-800">Cliente</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 min-w-[130px] border-b border-slate-200 dark:border-slate-800">Referência & Cor</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-right w-[85px] border-b border-slate-200 dark:border-slate-800">Qtd. Pedida</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-right w-[80px] border-b border-slate-200 dark:border-slate-800">Em Aberto</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 min-w-[130px] border-b border-slate-200 dark:border-slate-800">Posição Atual</th>
                      {/* Sectores */}
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-blue-100/90 dark:bg-blue-950 text-blue-900 dark:text-blue-300 border-b border-slate-200 dark:border-slate-800">Tecelagem</th>
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-indigo-100/90 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-300 border-b border-slate-200 dark:border-slate-800">Felpo Cru</th>
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-purple-100/90 dark:bg-purple-950 text-purple-900 dark:text-purple-300 border-b border-slate-200 dark:border-slate-800">Tinturaria</th>
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-fuchsia-100/90 dark:bg-fuchsia-950 text-fuchsia-900 dark:text-fuchsia-300 border-b border-slate-200 dark:border-slate-800">Confecção</th>
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-pink-100/90 dark:bg-pink-950 text-pink-900 dark:text-pink-300 border-b border-slate-200 dark:border-slate-800">Embalagem</th>
                      <th className="sticky top-0 z-20 px-2 py-2 text-center w-[85px] bg-teal-100/90 dark:bg-teal-950 text-teal-900 dark:text-teal-300 border-b border-slate-200 dark:border-slate-800">Expedição</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-center w-[90px] border-b border-slate-200 dark:border-slate-800">Entrega</th>
                      <th className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950 px-2 py-2 text-center w-[50px] border-b border-slate-200 dark:border-slate-800">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-[10.5px]">
                    {paginatedOrders.map(order => {
                      const isSelected = selectedOrderIds.has(order.id);
                      const pos = getOrderPositionStage(order);
                      const confQty = (order.confRoupoesQty || 0) + (order.confFelposQty || 0);

                      return (
                        <tr 
                          key={order.id}
                          className={`hover:bg-blue-50/50 dark:hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}
                          onClick={() => handleToggleOrderItem(order.id)}
                        >
                          {/* Checkbox */}
                          <td className="px-2.5 py-1.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleOrderItem(order.id)}
                              className="rounded text-blue-600 cursor-pointer"
                            />
                          </td>

                          {/* Doc / Item */}
                          <td className="px-2 py-1.5 align-middle">
                            <div className="flex items-center gap-1.5">
                              {getPriorityBadge(order.priority)}
                              <div>
                                <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-[11px] block">
                                  <HighlightText text={order.docNr} highlight={highlights} />
                                </span>
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                                  Item #{order.itemNr || 1}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Cliente */}
                          <td className="px-2 py-1.5 align-middle font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                            <HighlightText text={order.clientName} highlight={highlights} />
                          </td>

                          {/* Referência & Cor */}
                          <td className="px-2 py-1.5 align-middle">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              <HighlightText text={order.reference} highlight={highlights} />
                            </div>
                            <div className="text-[9px] text-slate-400 dark:text-slate-500 truncate">
                              {order.colorDesc || order.colorCode || '-'} {order.sizeDesc ? `· ${order.sizeDesc}` : ''}
                            </div>
                          </td>

                          {/* Qtd. Pedida */}
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums align-middle">
                            {order.qtyRequested?.toLocaleString('pt-PT')}
                            <span className="text-[8px] font-normal text-slate-400 ml-0.5">UN</span>
                          </td>

                          {/* Qtd. Em Aberto */}
                          <td className="px-2 py-1.5 text-right font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums align-middle">
                            {order.qtyOpen !== undefined ? order.qtyOpen.toLocaleString('pt-PT') : '-'}
                          </td>

                          {/* Posição Atual */}
                          <td className="px-2 py-1.5 align-middle">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9.5px] font-medium border ${pos.colorClass} truncate max-w-[160px]`}>
                              {pos.stageName} ({pos.piecesAtStage.toLocaleString('pt-PT')} UN)
                            </span>
                          </td>

                          {/* Tecelagem */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-blue-50/20 dark:bg-blue-950/10">
                            <span className={`font-semibold ${(order.felpoCruQty || 0) > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {(order.felpoCruQty || 0) > 0 ? order.felpoCruQty?.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Felpo Cru */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-indigo-50/20 dark:bg-indigo-950/10">
                            <span className={`font-semibold ${(order.felpoCruQty || 0) > 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {(order.felpoCruQty || 0) > 0 ? order.felpoCruQty?.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Tinturaria */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-purple-50/20 dark:bg-purple-950/10">
                            <span className={`font-semibold ${(order.tinturariaQty || 0) > 0 ? 'text-purple-700 dark:text-purple-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {(order.tinturariaQty || 0) > 0 ? order.tinturariaQty?.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Confecção */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-fuchsia-50/20 dark:bg-fuchsia-950/10">
                            <span className={`font-semibold ${confQty > 0 ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {confQty > 0 ? confQty.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Embalagem */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-pink-50/20 dark:bg-pink-950/10">
                            <span className={`font-semibold ${(order.embAcabQty || 0) > 0 ? 'text-pink-700 dark:text-pink-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {(order.embAcabQty || 0) > 0 ? order.embAcabQty?.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Stock/Expedição */}
                          <td className="px-2 py-1.5 text-center font-mono tabular-nums align-middle bg-teal-50/20 dark:bg-teal-950/10">
                            <span className={`font-semibold ${(order.stockCxQty || 0) > 0 ? 'text-teal-700 dark:text-teal-300' : 'text-slate-300 dark:text-slate-600'}`}>
                              {(order.stockCxQty || 0) > 0 ? order.stockCxQty?.toLocaleString('pt-PT') : '-'}
                            </span>
                          </td>

                          {/* Entrega */}
                          <td className="px-2 py-1.5 text-center font-mono text-[10px] text-slate-600 dark:text-slate-400 align-middle">
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <span>{formatDate(order.generalPredictedDate || order.requestedDate)}</span>
                              {order.generalPredictedDate && (
                                <span className="text-[7.5px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1 rounded border border-blue-200 mt-0.5">
                                  Prev. Geral
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Ação */}
                          <td className="px-2 py-1.5 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => onViewDetails(order)}
                              className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Ver detalhes da encomenda"
                            >
                              <Eye size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* 5. Paginação (Fixa no fundo, nunca oculta ao fazer scroll na tabela) */}
        <div className="mt-2.5 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5 font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <span>por página</span>
            <span>•</span>
            <span>
              Total: <strong>{totalItemsCount}</strong> {viewMode === 'document' ? 'documentos' : 'linhas'}
            </span>
          </div>

          <div className="flex items-center gap-1 font-semibold">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Próxima página"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderPosition;
