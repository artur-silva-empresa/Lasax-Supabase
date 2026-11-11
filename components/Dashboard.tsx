
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from './SafeResponsiveContainer';
import { TrendingUp, AlertCircle, Calendar, CheckCircle2, BarChart3 } from 'lucide-react';
import { Order, DashboardKPIs } from '../types';
import { calculateKPIs, getWeekRange } from '../services/dataService';
import { SECTORS } from '../constants';
import { ActiveFilterType } from './OrderTable';
import { AlertCenter } from './AlertCenter';
import { SectorKPIs } from './SectorKPIs';

interface DashboardProps {
  orders: Order[];
  onNavigateToOrders?: (filter: ActiveFilterType) => void;
  onViewDetails?: (order: Order) => void;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ orders, onNavigateToOrders, onViewDetails }) => {
  const kpis = calculateKPIs(orders);

  // Status Data precisa ser ajustado para refletir contagens totais, 
  // mas o KPI de ativas agora é por DOC, aqui mantemos por linha para o gráfico de pizza ser preciso na carga
  const statusData = [
    { name: 'Em Produção', value: kpis.totalInProduction - kpis.totalLate }, 
    { name: 'Atrasadas', value: kpis.totalLate },
    { name: 'Concluídas', value: orders.filter(o => o.qtyOpen === 0).length },
  ];

  // Gráfico Donut/Pizza: On-Time Delivery vs Delay (Entregas no Prazo vs Atrasos)
  const onTimeVsDelayData = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const onTimeDocs = new Set<string>();
    const delayedDocs = new Set<string>();
    let onTimeQty = 0;
    let delayedQty = 0;

    orders.forEach(order => {
      if (order.isArchived) return;

      const isOpen = order.qtyOpen > 0;
      if (isOpen) {
        if (order.requestedDate) {
          const reqDate = new Date(order.requestedDate);
          reqDate.setHours(0, 0, 0, 0);
          if (reqDate < today) {
            delayedDocs.add(order.docNr);
            delayedQty += order.qtyOpen || 0;
          } else {
            onTimeDocs.add(order.docNr);
            onTimeQty += order.qtyOpen || 0;
          }
        } else {
          onTimeDocs.add(order.docNr);
          onTimeQty += order.qtyOpen || 0;
        }
      } else {
        const compDate = order.armExpDate || order.dataEnt || order.archivedAt;
        if (compDate && order.requestedDate) {
          const cDate = new Date(compDate);
          const rDate = new Date(order.requestedDate);
          if (cDate > rDate) {
            delayedDocs.add(order.docNr);
          } else {
            onTimeDocs.add(order.docNr);
          }
        } else {
          onTimeDocs.add(order.docNr);
        }
      }
    });

    const totalDocs = onTimeDocs.size + delayedDocs.size;
    const onTimePct = totalDocs > 0 ? Math.round((onTimeDocs.size / totalDocs) * 100) : 100;
    const delayedPct = totalDocs > 0 ? 100 - onTimePct : 0;

    return {
      chartData: [
        { name: 'No Prazo (On-Time)', value: onTimeDocs.size, pieces: onTimeQty, color: '#10b981' },
        { name: 'Em Atraso (Delay)', value: delayedDocs.size, pieces: delayedQty, color: '#ef4444' },
      ],
      onTimeCount: onTimeDocs.size,
      delayedCount: delayedDocs.size,
      totalDocs,
      onTimePct,
      delayedPct,
      onTimeQty,
      delayedQty,
    };
  }, [orders]);

  // Gráfico de Barras: Volume de Produção por Sector (Production Volume by Sector)
  const productionVolumeBySectorData = React.useMemo(() => {
    const sectorsDef = [
      { id: 'tecelagem', name: 'Tecelagem', getQty: (o: Order) => o.felpoCruQty || 0, color: '#3b82f6' },
      { id: 'felpo_cru', name: 'Felpo Cru', getQty: (o: Order) => o.felpoCruQty || 0, color: '#6366f1' },
      { id: 'tinturaria', name: 'Tinturaria', getQty: (o: Order) => o.tinturariaQty || 0, color: '#8b5cf6' },
      { id: 'confeccao', name: 'Confecção', getQty: (o: Order) => (o.confRoupoesQty || 0) + (o.confFelposQty || 0), color: '#d946ef' },
      { id: 'embalagem', name: 'Embalagem', getQty: (o: Order) => o.embAcabQty || 0, color: '#ec4899' },
      { id: 'expedicao', name: 'Expedição', getQty: (o: Order) => o.stockCxQty || 0, color: '#14b8a6' },
    ];

    return sectorsDef.map(sec => {
      let producedVolume = 0;
      let pendingVolume = 0;
      let totalVolume = 0;
      const docSet = new Set<string>();

      orders.forEach(order => {
        if (order.isArchived) return;
        const qReq = order.qtyRequested || 0;
        if (qReq <= 0) return;

        const produced = sec.getQty(order);
        const actualProduced = Math.min(qReq, produced);
        const pending = Math.max(0, qReq - actualProduced);

        producedVolume += actualProduced;
        pendingVolume += pending;
        totalVolume += qReq;

        if (order.qtyOpen > 0) {
          docSet.add(order.docNr);
        }
      });

      return {
        name: sec.name,
        produced: producedVolume,
        pending: pendingVolume,
        total: totalVolume,
        docs: docSet.size,
        color: sec.color,
      };
    });
  }, [orders]);

  const totalProducedAllSectors = React.useMemo(() => {
    return productionVolumeBySectorData.reduce((acc, curr) => acc + curr.produced, 0);
  }, [productionVolumeBySectorData]);

  const weeklyLoadData = React.useMemo(() => {
    const now = new Date();
    const weekRanges = [0, 1, 2, 3].map(wIndex => {
        const d = new Date(now);
        d.setDate(d.getDate() + wIndex * 7);
        const { start, end } = getWeekRange(d);
        
        // Calcular número da semana
        const dateForWeek = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
        const dayNum = dateForWeek.getUTCDay() || 7;
        dateForWeek.setUTCDate(dateForWeek.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(dateForWeek.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil((((dateForWeek.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        
        return { start, end, label: `Sem. ${weekNum}` };
    });

    const dataBySector = Object.fromEntries(
        SECTORS.map(s => [s.id, { w0: new Set<string>(), w1: new Set<string>(), w2: new Set<string>(), w3: new Set<string>() }])
    );

    orders.forEach(o => {
        if (o.qtyOpen <= 0) return; // Só verificar encomendas ativas/não fechadas

        const getSectorDate = (id: string) => {
            switch (id) {
              case 'tecelagem': return o.dataTec;
              case 'felpo_cru': return o.felpoCruDate;
              case 'tinturaria': return o.tinturariaDate;
              case 'confeccao': return o.confDate;
              case 'embalagem': return o.armExpDate;
              case 'expedicao': return o.armExpDate;
              default: return null;
            }
        };

        const isSectorCompleted = (id: string) => {
             let qty = 0;
             switch (id) {
                case 'tecelagem': qty = o.felpoCruQty || 0; break;
                case 'felpo_cru': qty = o.felpoCruQty || 0; break;
                case 'tinturaria': qty = o.tinturariaQty || 0; break;
                case 'confeccao': qty = (o.confRoupoesQty || 0) + (o.confFelposQty || 0); break;
                case 'embalagem': qty = o.embAcabQty || 0; break;
                case 'expedicao': qty = o.stockCxQty || 0; break;
             }
             return o.qtyRequested && o.qtyRequested > 0 && qty >= o.qtyRequested;
        };

        SECTORS.forEach(s => {
            const date = getSectorDate(s.id);
            if (!date) return;
            if (isSectorCompleted(s.id)) return; // Ignora se já estiver executado no setor

            weekRanges.forEach((range, idx) => {
                if (date >= range.start && date <= range.end) {
                    const key = `w${idx}` as keyof typeof dataBySector[string];
                    dataBySector[s.id][key].add(o.docNr);
                }
            });
        });
    });

    return {
        columns: weekRanges,
        data: SECTORS.map(s => ({
            name: s.name,
            w0: dataBySector[s.id].w0.size,
            w1: dataBySector[s.id].w1.size,
            w2: dataBySector[s.id].w2.size,
            w3: dataBySector[s.id].w3.size,
        }))
    };
  }, [orders]);

  const sectorCompletionData = React.useMemo(() => {
    const data = {
      tecelagem: { req: 0, comp: 0 },
      felpo_cru: { req: 0, comp: 0 },
      tinturaria: { req: 0, comp: 0 },
      confeccao: { req: 0, comp: 0 },
      embalagem: { req: 0, comp: 0 },
      expedicao: { req: 0, comp: 0 }
    };

    orders.forEach(order => {
      const qReq = order.qtyRequested || 0;
      if (qReq <= 0) return;

      const pTecelagem = order.felpoCruQty || 0;
      const pFelpoCru = order.felpoCruQty || 0; 
      const pTinturaria = order.tinturariaQty || 0;
      const pConfeccao = (order.confRoupoesQty || 0) + (order.confFelposQty || 0);
      const pEmbalagem = order.embAcabQty || 0;
      const pExpedicao = order.stockCxQty || 0;

      data.tecelagem.req += qReq;
      data.tecelagem.comp += Math.min(qReq, pTecelagem);

      data.felpo_cru.req += qReq;
      data.felpo_cru.comp += Math.min(qReq, pFelpoCru);

      data.tinturaria.req += qReq;
      data.tinturaria.comp += Math.min(qReq, pTinturaria);

      data.confeccao.req += qReq;
      data.confeccao.comp += Math.min(qReq, pConfeccao);

      data.embalagem.req += qReq;
      data.embalagem.comp += Math.min(qReq, pEmbalagem);

      data.expedicao.req += qReq;
      data.expedicao.comp += Math.min(qReq, pExpedicao);
    });

    const getPct = (comp: number, req: number) => req > 0 ? Math.round((comp / req) * 100) : 0;

    return [
      { name: 'Tecelagem', value: getPct(data.tecelagem.comp, data.tecelagem.req), color: '#3b82f6' },
      { name: 'Felpo Cru', value: getPct(data.felpo_cru.comp, data.felpo_cru.req), color: '#6366f1' },
      { name: 'Tinturaria', value: getPct(data.tinturaria.comp, data.tinturaria.req), color: '#8b5cf6' },
      { name: 'Confecção', value: getPct(data.confeccao.comp, data.confeccao.req), color: '#d946ef' },
      { name: 'Embalagem', value: getPct(data.embalagem.comp, data.embalagem.req), color: '#ec4899' },
      { name: 'Expedição', value: getPct(data.expedicao.comp, data.expedicao.req), color: '#14b8a6' },
    ];
  }, [orders]);

  // Gráfico de Barras: Encomendas concluídas por semana durante o último mês
  const completedOrdersWeeklyData = React.useMemo(() => {
    const now = new Date();
    // 4 semanas do último mês: 3 semanas anteriores (-3, -2, -1) e semana corrente (0)
    const offsets = [-3, -2, -1, 0];

    const weeks = offsets.map(offset => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset * 7);
      const { start, end } = getWeekRange(d);

      // Calcular número da semana ISO
      const dateForWeek = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
      const dayNum = dateForWeek.getUTCDay() || 7;
      dateForWeek.setUTCDate(dateForWeek.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(dateForWeek.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil((((dateForWeek.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

      const monthStart = start.toLocaleString('pt-PT', { month: 'short' });
      const monthEnd = end.toLocaleString('pt-PT', { month: 'short' });
      const dateRangeStr = monthStart === monthEnd
        ? `${start.getDate()} a ${end.getDate()} ${monthStart}`
        : `${start.getDate()} ${monthStart} a ${end.getDate()} ${monthEnd}`;

      return {
        offset,
        start,
        end,
        weekNum,
        label: `Sem. ${weekNum}`,
        fullLabel: `Semana ${weekNum} (${dateRangeStr})`,
        dateRange: dateRangeStr,
        isCurrentWeek: offset === 0
      };
    });

    return weeks.map(w => {
      const completedDocSet = new Set<string>();
      let completedPieces = 0;

      orders.forEach(order => {
        const isCompleted = order.qtyOpen === 0 || 
          (order.stockCxQty >= order.qtyRequested && order.qtyRequested > 0);

        if (!isCompleted) return;

        // Data de conclusão relevante
        const compDate = order.armExpDate || order.dataEnt || order.archivedAt || order.requestedDate || order.issueDate;
        if (!compDate) return;

        const date = new Date(compDate);
        if (date >= w.start && date <= w.end) {
          completedDocSet.add(order.docNr);
          completedPieces += (order.stockCxQty || order.qtyRequested || 0);
        }
      });

      return {
        label: w.label,
        semana: w.fullLabel,
        dateRange: w.dateRange,
        concluidas: completedDocSet.size,
        pecas: completedPieces,
        isCurrentWeek: w.isCurrentWeek
      };
    });
  }, [orders]);

  const totalCompletedLastMonth = React.useMemo(() => {
    return completedOrdersWeeklyData.reduce((acc, curr) => acc + curr.concluidas, 0);
  }, [completedOrdersWeeklyData]);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 scroll-smooth">
      <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-4">
        <div className="flex flex-col gap-1 px-1">
          <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white transition-colors">Resumo de Produção</h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">Indicadores de desempenho e carga fabril em tempo real.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <KPICard 
            title="Encomendas Ativas" 
            value={kpis.totalActiveDocs} 
            subtitle="Documentos em carteira"
            icon={<TrendingUp size={16} className="text-blue-600 dark:text-blue-400" />}
            color="blue"
            // Não clicável ou leva para todas (opcional, deixei sem clique pois não foi pedido especificamente para este)
          />
          <KPICard 
            title="Encomendas Atrasadas" 
            value={kpis.totalLateDocs} 
            subtitle="Qualquer sector"
            icon={<AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />}
            color="rose"
            onClick={() => onNavigateToOrders?.('LATE')}
            isClickable
          />
          <KPICard 
            title="Entregas Semana" 
            value={kpis.deliveriesThisWeek} 
            subtitle="Previstas para esta semana"
            icon={<Calendar size={16} className="text-amber-600 dark:text-amber-400" />}
            color="amber"
            onClick={() => onNavigateToOrders?.('WEEK_DELIVERIES')}
            isClickable
          />
          <KPICard 
            title="Conclusão Semana" 
            value={`${kpis.fulfillmentRateWeek.toFixed(0)}%`} 
            subtitle="Executadas esta semana"
            icon={<CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />}
            color="emerald"
            onClick={() => onNavigateToOrders?.('WEEK_COMPLETED')}
            isClickable
          />
        </div>

        {/* Centro de Alertas */}
        <AlertCenter 
          orders={orders} 
          onViewDetails={onViewDetails} 
          onNavigateToOrders={onNavigateToOrders} 
        />

        {/* KPIs de Pontualidade e Desempenho por Sector */}
        <SectorKPIs 
          orders={orders} 
          onNavigateToOrders={onNavigateToOrders} 
        />

        {/* Charts Grid Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest mb-1">Carga por Sector (Em Falta)</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">Total de encomendas para execução em cada secção nas próximas 4 semanas (Documentos Únicos).</p>
            <div className="w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-2.5 py-2 text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Sector</th>
                    {weeklyLoadData.columns.map((col, i) => (
                      <th key={i} className="px-2 py-2 text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-center">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {weeklyLoadData.data.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-2.5 py-2 text-[11px] sm:text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 py-0.5 px-1.5 rounded text-[10px] font-bold">
                           {row.w0}
                        </span>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-0.5 px-1.5 rounded text-[10px] font-bold">
                           {row.w1}
                        </span>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 py-0.5 px-1.5 rounded text-[10px] font-bold">
                           {row.w2}
                        </span>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <span className="bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 py-0.5 px-1.5 rounded text-[10px] font-bold">
                           {row.w3}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* On-Time Delivery vs Delay Pie Chart */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest">
                On-Time Delivery vs Delay
              </h3>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                onTimeVsDelayData.onTimePct >= 80
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : onTimeVsDelayData.onTimePct >= 60
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}>
                {onTimeVsDelayData.onTimePct}% No Prazo
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
              Rácio de pontualidade na entrega de encomendas com base nas datas pedidas.
            </p>

            <div className="h-[250px] w-full flex flex-col items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={onTimeVsDelayData.chartData} 
                    cx="50%" 
                    cy="45%" 
                    innerRadius={55} 
                    outerRadius={78} 
                    paddingAngle={4} 
                    dataKey="value"
                    stroke="none"
                  >
                    {onTimeVsDelayData.chartData.map((entry, index) => (
                      <Cell key={`cell-ontime-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f1f5f9' }} 
                    itemStyle={{ color: '#e2e8f0', fontSize: '11px' }}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString('pt-PT')} Documentos (${((value / (onTimeVsDelayData.totalDocs || 1)) * 100).toFixed(1)}%)`,
                      name
                    ]}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8} 
                    wrapperStyle={{fontSize: '11px', fontWeight: 'bold', color: '#94a3b8'}}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center stat inside donut hole */}
              <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <span className="text-xl font-black text-slate-800 dark:text-white leading-none block">
                  {onTimeVsDelayData.onTimePct}%
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Pontual
                </span>
              </div>
            </div>

            {/* Quick summary footer */}
            <div className="grid grid-cols-2 gap-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40">
                <span className="font-semibold text-[10px]">No Prazo:</span>
                <span className="font-black">{onTimeVsDelayData.onTimeCount} docs</span>
              </div>
              <div 
                onClick={() => onNavigateToOrders?.('LATE')}
                className={`flex items-center justify-between px-2 py-1 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 ${onNavigateToOrders ? 'cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40' : ''}`}
                title={onNavigateToOrders ? "Filtrar encomendas atrasadas" : undefined}
              >
                <span className="font-semibold text-[10px]">Em Atraso:</span>
                <span className="font-black">{onTimeVsDelayData.delayedCount} docs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid Row 2: Production Volume by Sector & Conclusão Semanal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Production Volume by Sector Bar Chart */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest">
                    Production Volume by Sector
                  </h3>
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                    Peças (UN)
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Volume de produção acumulado e pendente por sector fabril.
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-black">Total Produzido:</span>
                  <span className="text-blue-600 dark:text-blue-400 font-black text-xs">
                    {totalProducedAllSectors.toLocaleString('pt-PT')} UN
                  </span>
                </div>
              </div>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionVolumeBySectorData} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(val: number) => {
                      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return String(val);
                    }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const pct = data.total > 0 ? ((data.produced / data.total) * 100).toFixed(1) : '0';
                        return (
                          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 p-3 rounded-xl shadow-xl text-white text-xs">
                            <p className="font-bold text-slate-200 mb-1.5 flex items-center justify-between gap-3">
                              <span>{data.name}</span>
                              <span className="text-[9px] bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded font-black border border-blue-400/30">
                                {pct}% executado
                              </span>
                            </p>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-400">Volume Produzido:</span>
                                <span className="font-black text-blue-400 text-sm">
                                  {data.produced.toLocaleString('pt-PT')} UN
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-400">Volume Pendente:</span>
                                <span className="font-bold text-slate-300">
                                  {data.pending.toLocaleString('pt-PT')} UN
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-700/50">
                                <span className="text-slate-400">Volume Total:</span>
                                <span className="font-bold text-slate-200">
                                  {data.total.toLocaleString('pt-PT')} UN
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={30} 
                    iconType="circle" 
                    iconSize={8} 
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }} 
                  />
                  <Bar 
                    dataKey="produced" 
                    name="Volume Produzido" 
                    fill="#3b82f6" 
                    stackId="vol"
                    radius={[0, 0, 0, 0]} 
                    barSize={32}
                  >
                    {productionVolumeBySectorData.map((entry, index) => (
                      <Cell key={`cell-prod-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                  <Bar 
                    dataKey="pending" 
                    name="Volume Pendente" 
                    fill="#475569" 
                    stackId="vol"
                    radius={[4, 4, 0, 0]} 
                    barSize={32}
                    opacity={0.4}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Encomendas Concluídas por Semana (Último Mês) */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest">
                    Encomendas Concluídas por Semana
                  </h3>
                  <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Último Mês
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Fluxo de produção e expedição nas últimas 4 semanas de laboração (documentos concluídos).
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-black">Total Mês:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs">{totalCompletedLastMonth} Docs</span>
                </div>
              </div>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completedOrdersWeeklyData} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="completedWeekGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="completedCurrentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.75}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 p-3 rounded-xl shadow-xl text-white text-xs">
                            <p className="font-bold text-slate-200 mb-1.5 flex items-center justify-between gap-3">
                              <span>{data.semana}</span>
                              {data.isCurrentWeek && (
                                <span className="text-[9px] bg-blue-500/30 text-blue-300 px-1.5 py-0.2 rounded font-black border border-blue-400/30">
                                  Corrente
                                </span>
                              )}
                            </p>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-400">Encomendas:</span>
                                <span className="font-black text-emerald-400 text-sm">{data.concluidas} docs</span>
                              </div>
                              {data.pecas > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-400">Peças Fechadas:</span>
                                  <span className="font-bold text-slate-200">{data.pecas.toLocaleString('pt-PT')} UN</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="concluidas" 
                    radius={[6, 6, 0, 0]} 
                    barSize={38} 
                    name="Encomendas Concluídas"
                  >
                    {completedOrdersWeeklyData.map((entry, index) => (
                      <Cell 
                        key={`completed-cell-${index}`} 
                        fill={entry.isCurrentWeek ? "url(#completedCurrentGradient)" : "url(#completedWeekGradient)"} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Grid Row 3: Taxa de Conclusão por Sector & Distribuição por Estado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Taxa de Conclusão por Sector (Barras Verticais) */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest mb-1">Taxa de Conclusão por Sector</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">Percentagem de peças concluídas face ao total encomendado em cada secção.</p>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorCompletionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f1f5f9' }} 
                    itemStyle={{ color: '#e2e8f0' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: number) => [`${value}%`, 'Concluído']}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32} name="Concluído">
                    {sectorCompletionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição Geral por Estado */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest mb-1">Distribuição Geral por Estado</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">Proporção de linhas em produção, concluídas e em atraso.</p>
            <div className="h-[250px] w-full flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={statusData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={80} 
                    paddingAngle={5} 
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f1f5f9' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: '#94a3b8'}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KPICard = ({ title, value, subtitle, icon, color, onClick, isClickable }: any) => {
  const colors: any = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800'
  };

  return (
    <div 
      onClick={isClickable ? onClick : undefined}
      className={`p-4 md:p-6 rounded-2xl border ${colors[color]} shadow-sm transition-all hover:shadow-md ${isClickable ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : ''}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm shadow-sm">{icon}</div>
      </div>
      <div>
        <h2 className="text-2xl md:text-3xl font-black leading-none mb-1 dark:text-white">{typeof value === 'number' ? value.toLocaleString('pt-PT') : value}</h2>
        <p className="text-[10px] md:text-xs font-black uppercase tracking-widest opacity-90">{title}</p>
        {subtitle && <p className="text-[10px] opacity-70 mt-1 font-medium">{subtitle}</p>}
      </div>
    </div>
  );
};

export default Dashboard;
