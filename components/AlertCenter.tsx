import React, { useMemo, useState } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Calendar, 
  ShieldAlert, 
  ArrowUpRight, 
  Search, 
  AlertCircle, 
  CalendarClock, 
  CheckCircle2, 
  Filter, 
  ChevronRight,
  Flame,
  Layers,
  ExternalLink
} from 'lucide-react';
import { Order, SectorAlertTolerances } from '../types';
import { getISOWeek, getSectorAlertTolerances } from '../services/dataService';
import { formatDate } from '../utils/formatters';
import { SECTORS } from '../constants';
import { ActiveFilterType } from './OrderTable';

export type AlertType = 'all' | 'late' | 'prediction_change' | 'priority_stop';

export interface AlertItem {
  id: string;
  order: Order;
  types: ('late' | 'prediction_change' | 'priority_stop')[];
  docNr: string;
  docSeries: string;
  clientName: string;
  comercial: string;
  reference: string;
  colorDesc: string;
  qtyOpen: number;
  deliveryDate: Date | null;
  deliveryWeek: number | null;
  daysLate?: number;
  affectedSectors: {
    sectorId: string;
    sectorName: string;
    stopReason?: string;
    predictedDate?: Date | null;
    isPending?: boolean;
    changedBy?: string;
  }[];
  latestChangeDate?: Date | null;
}

interface AlertCenterProps {
  orders: Order[];
  onViewDetails?: (order: Order) => void;
  onNavigateToOrders?: (filter: ActiveFilterType) => void;
  tolerances?: SectorAlertTolerances;
}

export const AlertCenter: React.FC<AlertCenterProps> = ({
  orders,
  onViewDetails,
  onNavigateToOrders,
  tolerances: propTolerances,
}) => {
  const [internalTolerances, setInternalTolerances] = useState<SectorAlertTolerances>(() => getSectorAlertTolerances());

  React.useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setInternalTolerances(e.detail);
      else setInternalTolerances(getSectorAlertTolerances());
    };
    window.addEventListener('sector_alert_tolerances_updated', handleUpdate);
    return () => window.removeEventListener('sector_alert_tolerances_updated', handleUpdate);
  }, []);

  const activeTolerances = propTolerances || internalTolerances;
  const [activeTab, setActiveTab] = useState<AlertType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  // Aggregate and detect alerts across all orders
  const { alertItems, counts } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group items by docNr to avoid flooding with thousands of rows if multi-line
    const docMap = new Map<string, {
      primaryOrder: Order;
      lines: Order[];
      types: Set<'late' | 'prediction_change' | 'priority_stop'>;
      maxDaysLate: number;
      affectedSectors: Map<string, {
        sectorId: string;
        sectorName: string;
        stopReason?: string;
        predictedDate?: Date | null;
        isPending?: boolean;
        changedBy?: string;
      }>;
      latestChangeDate?: Date | null;
    }>();

    orders.forEach(order => {
      if (order.isArchived) return;

      const isOpen = order.qtyOpen > 0;
      const typesForOrder: ('late' | 'prediction_change' | 'priority_stop')[] = [];

      // 1. Data de entrega ultrapassada (encomenda ativa com data de entrega inferior a hoje + tolerância)
      let daysLate = 0;
      const genTolerance = activeTolerances.generalDelivery ?? 0;
      if (isOpen && order.requestedDate) {
        const reqDate = new Date(order.requestedDate);
        reqDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > genTolerance) {
          typesForOrder.push('late');
          daysLate = Math.max(1, diffDays - genTolerance);
        }
      }

      // 2. Alterações recentes na previsão de setores (datas previstas preenchidas, histórico ou pendências)
      const hasPredictedDates = order.sectorPredictedDates && Object.values(order.sectorPredictedDates).some(d => d !== null);
      const hasPendingDates = order.sectorPredictedDatesPending && Object.values(order.sectorPredictedDatesPending).some(Boolean);
      const hasAuditHistory = order.predictedDatesHistory && order.predictedDatesHistory.length > 0;
      
      if (isOpen && (hasPredictedDates || hasPendingDates || hasAuditHistory)) {
        typesForOrder.push('prediction_change');
      }

      // 3. Alta prioridade com paragens reportadas (priority === 1 com stopReasons activos)
      const activeStops = order.sectorStopReasons
        ? Object.entries(order.sectorStopReasons).filter(([_, r]) => typeof r === 'string' && r.trim().length > 0)
        : [];
      
      if (isOpen && order.priority === 1 && activeStops.length > 0) {
        typesForOrder.push('priority_stop');
      }

      if (typesForOrder.length === 0) return;

      const docKey = order.docNr || order.id;
      let existing = docMap.get(docKey);
      if (!existing) {
        existing = {
          primaryOrder: order,
          lines: [order],
          types: new Set(typesForOrder),
          maxDaysLate: daysLate,
          affectedSectors: new Map(),
          latestChangeDate: null,
        };
        docMap.set(docKey, existing);
      } else {
        existing.lines.push(order);
        typesForOrder.forEach(t => existing!.types.add(t));
        if (daysLate > existing.maxDaysLate) existing.maxDaysLate = daysLate;
      }

      // Collect affected sectors
      SECTORS.forEach(sec => {
        const stopReason = order.sectorStopReasons?.[sec.id];
        const predictedDate = order.sectorPredictedDates?.[sec.id];
        const isPending = !!order.sectorPredictedDatesPending?.[sec.id];
        
        let changedBy: string | undefined;
        if (order.predictedDatesHistory && order.predictedDatesHistory.length > 0) {
          const latestHistory = [...order.predictedDatesHistory]
            .reverse()
            .find(h => h.sectorId === sec.id);
          if (latestHistory) {
            changedBy = latestHistory.changedBy;
            const hDate = new Date(latestHistory.changedAt);
            if (!existing!.latestChangeDate || hDate > existing!.latestChangeDate) {
              existing!.latestChangeDate = hDate;
            }
          }
        }

        if (stopReason || predictedDate || isPending) {
          if (!existing!.affectedSectors.has(sec.id)) {
            existing!.affectedSectors.set(sec.id, {
              sectorId: sec.id,
              sectorName: sec.name,
              stopReason,
              predictedDate,
              isPending,
              changedBy,
            });
          }
        }
      });
    });

    const items: AlertItem[] = Array.from(docMap.values()).map(({ primaryOrder, lines, types, maxDaysLate, affectedSectors, latestChangeDate }) => {
      const totalQtyOpen = lines.reduce((acc, l) => acc + (l.qtyOpen || 0), 0);
      const deliveryWeek = getISOWeek(primaryOrder.requestedDate) ?? primaryOrder.deliveryWeek ?? null;

      return {
        id: primaryOrder.id,
        order: primaryOrder,
        types: Array.from(types),
        docNr: primaryOrder.docNr,
        docSeries: primaryOrder.docSeries || '',
        clientName: primaryOrder.clientName,
        comercial: primaryOrder.comercial,
        reference: lines.length > 1 ? `${primaryOrder.reference} (+${lines.length - 1} ref.)` : primaryOrder.reference,
        colorDesc: primaryOrder.colorDesc,
        qtyOpen: totalQtyOpen,
        deliveryDate: primaryOrder.requestedDate,
        deliveryWeek,
        daysLate: maxDaysLate > 0 ? maxDaysLate : undefined,
        affectedSectors: Array.from(affectedSectors.values()),
        latestChangeDate,
      };
    });

    // Sort: High Priority Stops first, then longest late days, then date changes
    items.sort((a, b) => {
      const aHasStop = a.types.includes('priority_stop') ? 1 : 0;
      const bHasStop = b.types.includes('priority_stop') ? 1 : 0;
      if (bHasStop !== aHasStop) return bHasStop - aHasStop;

      const aDays = a.daysLate || 0;
      const bDays = b.daysLate || 0;
      if (bDays !== aDays) return bDays - aDays;

      return (b.deliveryDate?.getTime() || 0) - (a.deliveryDate?.getTime() || 0);
    });

    const c = {
      all: items.length,
      late: items.filter(i => i.types.includes('late')).length,
      prediction_change: items.filter(i => i.types.includes('prediction_change')).length,
      priority_stop: items.filter(i => i.types.includes('priority_stop')).length,
    };

    return { alertItems: items, counts: c };
  }, [orders, activeTolerances]);

  // Filter based on active tab and search term
  const filteredItems = useMemo(() => {
    return alertItems.filter(item => {
      if (activeTab !== 'all' && !item.types.includes(activeTab)) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesDoc = item.docNr.toLowerCase().includes(q) || item.docSeries.toLowerCase().includes(q);
        const matchesClient = item.clientName.toLowerCase().includes(q);
        const matchesRef = item.reference.toLowerCase().includes(q);
        const matchesComercial = item.comercial.toLowerCase().includes(q);
        const matchesSector = item.affectedSectors.some(
          s => s.sectorName.toLowerCase().includes(q) || (s.stopReason && s.stopReason.toLowerCase().includes(q))
        );
        return matchesDoc || matchesClient || matchesRef || matchesComercial || matchesSector;
      }
      return true;
    });
  }, [alertItems, activeTab, searchTerm]);

  // Reset page when tab or search changes
  React.useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const paginatedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6 transition-colors">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
            <ShieldAlert size={20} className="shrink-0" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                Centro de Alertas de Produção
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                {counts.all} {counts.all === 1 ? 'alerta ativo' : 'alertas ativos'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Monitorização em tempo real de encomendas em atraso, paragens prioritárias e desvios nas datas previstas.
            </p>
          </div>
        </div>

        {/* Quick Search */}
        <div className="relative w-full md:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por doc, cliente ou motivo..."
            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 py-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span>Todos</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'all' ? 'bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
          }`}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('late')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'late'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40 hover:bg-rose-100'
          }`}
        >
          <Clock size={12} />
          <span>Prazos Ultrapassados</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'late' ? 'bg-rose-700 text-white' : 'bg-rose-200/80 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300'
          }`}>
            {counts.late}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('priority_stop')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'priority_stop'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100'
          }`}
        >
          <Flame size={12} />
          <span>Alta Prioridade c/ Paragem</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'priority_stop' ? 'bg-amber-700 text-white' : 'bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
          }`}>
            {counts.priority_stop}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('prediction_change')}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'prediction_change'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-900/40 hover:bg-indigo-100'
          }`}
        >
          <CalendarClock size={12} />
          <span>Alterações de Previsão</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
            activeTab === 'prediction_change' ? 'bg-indigo-700 text-white' : 'bg-indigo-200/80 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300'
          }`}>
            {counts.prediction_change}
          </span>
        </button>
      </div>

      {/* Alert Items List */}
      <div className="space-y-2 mt-2">
        {paginatedItems.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Nenhum alerta encontrado
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mt-0.5">
              {searchTerm 
                ? 'Nenhum registo corresponde ao critério de pesquisa informado.' 
                : 'Não existem encomendas com prazos ultrapassados, alterações pendentes ou paragens no filtro selecionado.'}
            </p>
          </div>
        ) : (
          paginatedItems.map(item => {
            const isLate = item.types.includes('late');
            const hasStop = item.types.includes('priority_stop');
            const hasChange = item.types.includes('prediction_change');
            const isExpanded = expandedDoc === item.docNr;

            return (
              <div
                key={item.docNr}
                className={`group rounded-xl border transition-all p-3 hover:shadow-sm ${
                  hasStop
                    ? 'border-amber-300/80 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10'
                    : isLate
                    ? 'border-rose-200/80 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Left: Document, Client & Tags */}
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                    {/* Severity / Category Badge */}
                    <div className="mt-0.5 sm:mt-0 shrink-0">
                      {hasStop ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white shadow-xs">
                          <Flame size={10} />
                          ALTA PRIORIDADE COM PARAGEM
                        </span>
                      ) : isLate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-600 text-white shadow-xs">
                          <AlertTriangle size={10} />
                          {item.daysLate ? `ATRASO: ${item.daysLate} ${item.daysLate === 1 ? 'DIA' : 'DIAS'}` : 'DATA EXPIRADA'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-indigo-600 text-white shadow-xs">
                          <CalendarClock size={10} />
                          PREVISÃO ATUALIZADA
                        </span>
                      )}
                    </div>

                    {/* Doc and series */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                        {item.docSeries ? `${item.docSeries}/${item.docNr}` : item.docNr}
                      </span>
                    </div>

                    {/* Client & Reference */}
                    <div className="min-w-0 truncate">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        {item.clientName}
                      </span>
                      {item.reference && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5 truncate">
                          ({item.reference})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Quantities, Delivery Week & Action buttons */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    {/* Delivery Date & ISO Week */}
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <Calendar size={11} className="text-slate-400" />
                        <span>{item.deliveryDate ? formatDate(item.deliveryDate) : 'Sem data'}</span>
                      </div>
                      {item.deliveryWeek && (
                        <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 leading-none mt-0.5">
                          Semana {item.deliveryWeek}
                        </div>
                      )}
                    </div>

                    {/* Open Qty badge */}
                    <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-right shrink-0">
                      <div className="text-[9px] uppercase font-bold text-slate-400 leading-none">Em Aberto</div>
                      <div className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                        {item.qtyOpen.toLocaleString('pt-PT')} <span className="text-[9px] font-normal text-slate-400">UN</span>
                      </div>
                    </div>

                    {/* Action: Open details */}
                    {onViewDetails && (
                      <button
                        onClick={() => onViewDetails(item.order)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 shadow-xs"
                        title="Ver linhas e detalhes da encomenda"
                      >
                        <span>Ver Linhas</span>
                        <ArrowUpRight size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Affected sectors detail pill row */}
                {item.affectedSectors.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] uppercase font-bold text-slate-400 mr-1">Setores:</span>
                    {item.affectedSectors.map(sec => {
                      const hasSecStop = !!sec.stopReason;
                      const hasSecPrev = !!sec.predictedDate;
                      return (
                        <div
                          key={sec.sectorId}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] border ${
                            hasSecStop
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 font-semibold'
                              : hasSecPrev
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60 font-semibold'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span className="font-bold">{sec.sectorName}:</span>
                          {sec.stopReason ? (
                            <span className="truncate max-w-[180px]">{sec.stopReason}</span>
                          ) : sec.predictedDate ? (
                            <span>Prev. {formatDate(sec.predictedDate)}{sec.isPending ? ' (Pendente)' : ''}</span>
                          ) : (
                            <span>Em curso</span>
                          )}
                          {sec.changedBy && (
                            <span className="text-[9px] opacity-70">({sec.changedBy})</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination & Footer controls */}
      {filteredItems.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
          <div className="text-slate-400 dark:text-slate-500">
            A mostrar {(page - 1) * ITEMS_PER_PAGE + 1} a {Math.min(page * ITEMS_PER_PAGE, filteredItems.length)} de {filteredItems.length} alertas
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Anterior
            </button>
            <span className="px-2 font-bold text-slate-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              Seguinte
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
