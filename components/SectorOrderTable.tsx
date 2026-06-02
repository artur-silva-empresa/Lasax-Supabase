import React from 'react';
import { 
  Search, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  Save,
  Edit2,
  X,
  Check,
  AlertCircle,
  AlertTriangle,
  Zap,
  Filter
} from 'lucide-react';
import { Order, Sector, User, ProductionCapacity } from '../types';
import { formatDate } from '../utils/formatters';
import StopReasonSelector from './StopReasonSelector';
import { calcOrderCapacityInfo } from '../utils/capacityUtils';

interface SectorOrderTableProps {
  orders: Order[];
  sector: Sector;
  onViewDetails: (order: Order) => void;
  onUpdateOrder: (order: Order) => void;
  stopReasonsHierarchy: any[];
  user: User | null;
  capacities?: ProductionCapacity[];
  globalSearchTerm?: string;
}

const ITEMS_PER_PAGE = 50;

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

const SectorOrderTable: React.FC<SectorOrderTableProps> = ({ orders, sector, onViewDetails, onUpdateOrder, stopReasonsHierarchy, user, capacities = [], globalSearchTerm }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchTerm);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [showMobileFilters, setShowMobileFilters] = React.useState(true);
  const lastScrollTop = React.useRef(0);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (window.innerWidth >= 1280) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop > lastScrollTop.current && scrollTop > 50) {
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

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      const search = deferredSearch.toLowerCase().trim();
      const matchesSearch = !search || 
        (o.docNr || '').toLowerCase().includes(search) || 
        (o.clientName || '').toLowerCase().includes(search) ||
        (o.reference || '').toLowerCase().includes(search) ||
        (o.colorDesc || '').toLowerCase().includes(search);
        
      const globalSearch = (globalSearchTerm || '').toLowerCase().trim();
      const matchesGlobalSearch = !globalSearch || 
                                  (o.docNr || '').toLowerCase().includes(globalSearch) ||
                                  (o.itemNr !== undefined && o.itemNr.toString().includes(globalSearch));

      return matchesSearch && matchesGlobalSearch;
    });
  }, [orders, deferredSearch, globalSearchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

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

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-bottom-4 duration-500">
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
          {searchTerm && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              showMobileFilters ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
            }`}>
              1
            </span>
          )}
        </button>
      </div>

      <div className={`transition-all duration-300 ease-in-out xl:block ${
        showMobileFilters 
          ? 'max-h-[300px] opacity-100' 
          : 'max-h-0 opacity-0 overflow-hidden pointer-events-none'
      }`}>
        {/* Header / Toolbar */}
        <div className="flex-shrink-0 p-4 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
            <div className="relative flex-1 w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Pesquisar..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-sm transition-all dark:text-white"
              />
            </div>
            
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl p-2 shadow-sm transition-colors active:scale-95"
                title="Limpar pesquisa"
              >
                <RotateCcw size={16} />
              </button>
            )}
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
      <div className="flex-1 overflow-y-auto w-full overflow-x-auto relative" onScroll={handleListScroll}>
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
              <th className="px-2 py-3 w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
            {paginatedOrders.map((order) => {
              const isEditing = editingId === order.id;
              const producedQty = getSectorProducedQty(order);
              const exitDate = getSectorDate(order);
              const predictedDate = order.sectorPredictedDates?.[sector.id];
              const obs = order.sectorObservations?.[sector.id];
              const capInfo = capacities.length > 0 ? calcOrderCapacityInfo(order, sector.id, capacities) : null;

              return (
                <tr 
                  key={order.id} 
                  onClick={() => !isEditing && onViewDetails(order)}
                  className={`hover:bg-blue-50 dark:hover:bg-slate-900 transition-colors group ${isEditing ? 'bg-blue-50 dark:bg-slate-900' : 'cursor-pointer'}`}
                >
                  <td className="px-4 py-3 align-top font-bold text-sm text-slate-800 dark:text-slate-200 truncate max-w-0">{order.docNr}</td>
                  <td className="px-4 py-3 align-top text-xs font-medium text-slate-600 dark:text-slate-300 truncate max-w-0" title={order.clientName}>{order.clientName}</td>
                  <td className="px-4 py-3 align-top overflow-hidden max-w-0">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{order.reference}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{order.colorDesc}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top overflow-hidden max-w-0">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{order.sizeDesc}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{order.family}</span>
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
                        <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full text-xs p-1 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                        />
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

      {/* Pagination */}
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
    </div>
  );
};

export default SectorOrderTable;
