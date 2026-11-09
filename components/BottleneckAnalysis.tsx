import React from 'react';
import {
  AlertTriangle, Clock, TrendingUp, CheckCircle2, ChevronDown,
  Target, Activity, Package, Calendar
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from './SafeResponsiveContainer';
import { Order, ProductionCapacity } from '../types';
import { SECTORS } from '../constants';
import { calcOrderCapacityInfo, getSectorProducedQty, OrderCapacityInfo } from '../utils/capacityUtils';
import { formatDate } from '../utils/formatters';

interface BottleneckAnalysisProps {
  orders: Order[];
  capacities: ProductionCapacity[];
}

type TabId = 'overview' | 'queue' | 'risk';

const SECTOR_COLORS: Record<string, string> = {
  tecelagem: '#3b82f6',
  felpo_cru: '#6366f1',
  tinturaria: '#8b5cf6',
  confeccao: '#d946ef',
  embalagem: '#ec4899',
  expedicao: '#14b8a6',
};

const BottleneckAnalysis: React.FC<BottleneckAnalysisProps> = ({ orders, capacities }) => {
  const [activeTab, setActiveTab] = React.useState<TabId>('overview');
  const [selectedSector, setSelectedSector] = React.useState(SECTORS[0].id);

  // Only active (non-archived, open) orders
  const activeOrders = React.useMemo(() =>
    orders.filter(o => !o.isArchived && o.qtyOpen > 0),
  [orders]);

  // Per-sector analysis
  const sectorAnalysis = React.useMemo(() => {
    return SECTORS.map(sector => {
      const sectorOrders = activeOrders.filter(o =>
        getSectorProducedQty(o, sector.id) < (o.qtyRequested || 0)
      );

      const infos = sectorOrders.map(o => calcOrderCapacityInfo(o, sector.id, capacities));

      const totalRemaining = infos.reduce((s, i) => s + i.remainingQty, 0);
      const atRisk = infos.filter(i => i.isAtRisk);
      const noCapacity = infos.filter(i => i.capacity === null && i.remainingQty > 0);

      // Estimate days to clear queue (sequential - conservative)
      const totalDays = infos.reduce((s, i) => s + i.estimatedDays, 0);
      const totalDailyCapacity = infos.reduce((s, i) => s + i.dailyCapacity, 0);
      // More realistic: totalRemaining / average daily capacity
      const avgDailyCapacity = infos.filter(i => i.dailyCapacity > 0).length > 0
        ? infos.filter(i => i.dailyCapacity > 0).reduce((s, i) => s + i.dailyCapacity, 0) / infos.filter(i => i.dailyCapacity > 0).length
        : 0;
      const daysToComplete = avgDailyCapacity > 0 ? Math.ceil(totalRemaining / avgDailyCapacity) : null;

      return {
        sector,
        infos: infos.sort((a, b) => {
          // Sort by risk first, then by days late
          if (a.isAtRisk !== b.isAtRisk) return b.isAtRisk ? 1 : -1;
          return b.daysLate - a.daysLate;
        }),
        totalOrders: sectorOrders.length,
        totalRemaining,
        atRiskCount: atRisk.length,
        noCapacityCount: noCapacity.length,
        daysToComplete,
        totalDailyCapacity,
      };
    });
  }, [activeOrders, capacities]);

  // All at-risk orders across all sectors
  const allAtRisk = React.useMemo(() => {
    const riskMap = new Map<string, { order: Order, sectors: Array<{ sectorName: string, daysLate: number, estimatedDays: number }> }>();

    SECTORS.forEach(sector => {
      const infos = activeOrders
        .filter(o => getSectorProducedQty(o, sector.id) < (o.qtyRequested || 0))
        .map(o => calcOrderCapacityInfo(o, sector.id, capacities))
        .filter(i => i.isAtRisk);

      infos.forEach(info => {
        const key = info.order.id;
        if (!riskMap.has(key)) {
          riskMap.set(key, { order: info.order, sectors: [] });
        }
        riskMap.get(key)!.sectors.push({
          sectorName: sector.name,
          daysLate: info.daysLate,
          estimatedDays: info.estimatedDays,
        });
      });
    });

    return Array.from(riskMap.values()).sort((a, b) => {
      const maxA = Math.max(...a.sectors.map(s => s.daysLate));
      const maxB = Math.max(...b.sectors.map(s => s.daysLate));
      return maxB - maxA;
    });
  }, [activeOrders, capacities]);

  const chartData = sectorAnalysis.map(sa => ({
    name: sa.sector.name.length > 10 ? sa.sector.name.slice(0, 10) + '…' : sa.sector.name,
    fullName: sa.sector.name,
    dias: sa.daysToComplete ?? 0,
    risco: sa.atRiskCount,
    color: SECTOR_COLORS[sa.sector.id] || '#64748b',
  }));

  const tabs = [
    { id: 'overview' as TabId, label: 'Visão Geral', icon: Activity },
    { id: 'queue' as TabId, label: 'Fila por Sector', icon: Package },
    { id: 'risk' as TabId, label: `Encomendas em Risco (${allAtRisk.length})`, icon: AlertTriangle },
  ];

  const currentSectorAnalysis = sectorAnalysis.find(sa => sa.sector.id === selectedSector)!;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Target size={20} className="text-rose-500" />
              Análise de Gargalos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Capacidade real vs carga por sector · {activeOrders.length} encomendas ativas
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{allAtRisk.length}</div>
              <div className="text-slate-500 font-medium">Em Risco</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-slate-800 dark:text-white">{activeOrders.length}</div>
              <div className="text-slate-500 font-medium">Ativas</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6">

        {/* ============ VISÃO GERAL ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectorAnalysis.map(sa => {
                const SectorIcon = sa.sector.icon;
                const urgent = sa.daysToComplete !== null && sa.daysToComplete > 10;
                const warning = sa.daysToComplete !== null && sa.daysToComplete > 5 && !urgent;
                const good = sa.daysToComplete !== null && sa.daysToComplete <= 5;
                const statusColor = urgent ? 'border-rose-200 dark:border-rose-900/50' : warning ? 'border-amber-200 dark:border-amber-900/50' : 'border-slate-200 dark:border-slate-800';
                const badgeColor = urgent ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : warning ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';

                return (
                  <div
                    key={sa.sector.id}
                    onClick={() => { setSelectedSector(sa.sector.id); setActiveTab('queue'); }}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border-2 ${statusColor} p-5 shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: SECTOR_COLORS[sa.sector.id] + '20' }}>
                          <SectorIcon size={16} style={{ color: SECTOR_COLORS[sa.sector.id] }} />
                        </div>
                        <span className="font-black text-sm text-slate-800 dark:text-white">{sa.sector.name}</span>
                      </div>
                      {sa.daysToComplete !== null ? (
                        <span className={`text-xs font-black px-2 py-1 rounded-lg ${badgeColor}`}>
                          {sa.daysToComplete}d
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">—</span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-black text-slate-800 dark:text-white">{sa.totalOrders}</div>
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Enc.</div>
                      </div>
                      <div>
                        <div className="text-lg font-black text-slate-800 dark:text-white">{sa.totalRemaining.toLocaleString('pt-PT')}</div>
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Em Falta</div>
                      </div>
                      <div>
                        <div className={`text-lg font-black ${sa.atRiskCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{sa.atRiskCount}</div>
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Risco</div>
                      </div>
                    </div>

                    {sa.noCapacityCount > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                        <AlertTriangle size={10} />
                        {sa.noCapacityCount} enc. sem capacidade definida
                      </div>
                    )}

                    {sa.daysToComplete !== null && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>Carga estimada</span>
                          <span>{sa.daysToComplete} dias úteis</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${urgent ? 'bg-rose-500' : warning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, (sa.daysToComplete / 20) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-500 mb-1">Dias Estimados para Limpar Fila por Sector</h3>
              <p className="text-[10px] text-slate-400 mb-4">Estimativa baseada nas capacidades definidas e encomendas ativas.</p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f1f5f9' }}
                      formatter={(value: number, name: string) => [value, name === 'dias' ? 'Dias estimados' : 'Em risco']}
                      labelFormatter={(label) => chartData.find(d => d.name === label)?.fullName || label}
                    />
                    <Bar dataKey="dias" name="dias" radius={[6, 6, 0, 0]} barSize={36}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ============ FILA POR SECTOR ============ */}
        {activeTab === 'queue' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Sector selector */}
            <div className="flex flex-wrap gap-2">
              {SECTORS.map(s => {
                const SectorIcon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSector(s.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      selectedSector === s.id
                        ? 'text-white shadow-md'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300'
                    }`}
                    style={selectedSector === s.id ? { backgroundColor: SECTOR_COLORS[s.id] } : {}}
                  >
                    <SectorIcon size={13} />
                    {s.name}
                  </button>
                );
              })}
            </div>

            {/* Sector Summary */}
            {currentSectorAnalysis && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Encomendas', value: currentSectorAnalysis.totalOrders, color: 'text-slate-800 dark:text-white' },
                  { label: 'Peças em Falta', value: currentSectorAnalysis.totalRemaining.toLocaleString('pt-PT'), color: 'text-slate-800 dark:text-white' },
                  { label: 'Em Risco', value: currentSectorAnalysis.atRiskCount, color: currentSectorAnalysis.atRiskCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Dias Est. Conclusão', value: currentSectorAnalysis.daysToComplete !== null ? `${currentSectorAnalysis.daysToComplete}d` : 'S/Cap.', color: 'text-blue-600 dark:text-blue-400' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className={`text-xl font-black ${kpi.color}`}>{kpi.value}</div>
                    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{kpi.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Queue Table Desktop */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="compact-desktop-only overflow-x-hidden">
                <table className="w-full text-xs table-fixed">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                      {[
                        { label: '#', width: '3%' },
                        { label: 'Documento', width: '11%' },
                        { label: 'Cliente', width: '15%' },
                        { label: 'Artigo / Ref.', width: '15%' },
                        { label: 'Qtd.Ped', width: '8%', align: 'text-right' },
                        { label: 'Prod.', width: '8%', align: 'text-right' },
                        { label: 'Falta', width: '8%', align: 'text-right' },
                        { label: 'Pcs/h', width: '7%', align: 'text-right' },
                        { label: 'Dias', width: '6%', align: 'text-right' },
                        { label: 'Conclusão', width: '9%' },
                        { label: 'Data Cli.', width: '9%' },
                        { label: 'Estado', width: '11%' },
                      ].map(col => (
                        <th 
                          key={col.label} 
                          style={{ width: col.width }}
                          className={`${col.align || 'text-left'} px-2 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider truncate`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentSectorAnalysis?.infos.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs">
                          <CheckCircle2 size={18} className="mx-auto mb-1 text-emerald-500" />
                          Sector sem encomendas pendentes
                        </td>
                      </tr>
                    ) : (
                      currentSectorAnalysis?.infos.map((info, idx) => (
                        <QueueRow key={info.order.id} info={info} rank={idx + 1} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Queue Cards Mobile / Landscape (Zero lateral scroll) */}
              <div className="compact-mobile-only divide-y divide-slate-100 dark:divide-slate-800/80 p-2 space-y-1.5 w-full max-w-full overflow-x-hidden">
                {currentSectorAnalysis?.infos.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <CheckCircle2 size={18} className="mx-auto mb-1.5 text-emerald-500" />
                    Sector sem encomendas pendentes
                  </div>
                ) : (
                  currentSectorAnalysis?.infos.map((info, idx) => {
                    const { order, remainingQty, estimatedDays, isAtRisk, daysLate } = info;
                    const producedQty = (order.qtyRequested || 0) - remainingQty;
                    return (
                      <div 
                        key={order.id}
                        className={`p-2 rounded-xl border transition-all ${isAtRisk ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded">#{idx + 1}</span>
                            <span className="font-black text-[11px] text-slate-800 dark:text-white truncate">{order.docNr}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">• {order.clientName}</span>
                          </div>
                          {isAtRisk ? (
                            <span className="text-[9px] font-black text-rose-600 bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                              <AlertTriangle size={9} /> +{daysLate}d
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full shrink-0">
                              {estimatedDays}d est.
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                          <span className="truncate">{order.reference} ({order.colorDesc})</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">
                            Ped: {order.qtyRequested?.toLocaleString('pt-PT')} / Falta: <strong className="text-rose-600 dark:text-rose-400">{remainingQty.toLocaleString('pt-PT')}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ ENCOMENDAS EM RISCO ============ */}
        {activeTab === 'risk' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {allAtRisk.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
                <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-4" />
                <p className="font-black text-slate-800 dark:text-white mb-1">Sem encomendas em risco!</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Todas as encomendas estão dentro das datas previstas.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50 dark:bg-rose-900/10 flex items-center gap-3">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                    {allAtRisk.length} encomenda{allAtRisk.length !== 1 ? 's' : ''} com risco de atraso na data de entrega ao cliente
                  </p>
                </div>
                {/* Desktop Table View */}
                <div className="compact-desktop-only overflow-x-hidden">
                  <table className="w-full text-xs table-fixed">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Documento</th>
                        <th className="text-left px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[18%]">Cliente</th>
                        <th className="text-left px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[22%]">Artigo / Cor</th>
                        <th className="text-right px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[10%]">Qtd.Pedida</th>
                        <th className="text-center px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[10%]">Data Cliente</th>
                        <th className="text-left px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[16%]">Sectores em Risco</th>
                        <th className="text-center px-2.5 py-1.5 text-[8.5px] font-bold text-slate-500 uppercase tracking-wider w-[12%]">Atraso Máx.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {allAtRisk.map(({ order, sectors }) => {
                        const maxDelay = Math.max(...sectors.map(s => s.daysLate));
                        return (
                          <tr key={order.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-900/10 transition-colors">
                            <td className="px-2.5 py-1.5">
                              <div className="font-semibold text-slate-900 dark:text-white text-[11px] truncate">{order.docNr}</div>
                              <div className="text-[9.5px] text-slate-400">Item {order.itemNr}</div>
                            </td>
                            <td className="px-2.5 py-1.5">
                              <div className="font-semibold text-slate-800 dark:text-white text-[11px] truncate">{order.clientName}</div>
                              <div className="text-[9.5px] text-slate-400 truncate">{order.po || '—'}</div>
                            </td>
                            <td className="px-2.5 py-1.5">
                              <div className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate">{order.reference}</div>
                              <div className="text-[9.5px] text-slate-400 truncate">{order.colorDesc} · {order.size}</div>
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-mono tabular-nums font-semibold text-slate-800 dark:text-white text-xs">
                              {(order.qtyRequested || 0).toLocaleString('pt-PT')}
                            </td>
                            <td className="px-2.5 py-1.5 text-center font-mono tabular-nums text-[9.5px] text-slate-600 dark:text-slate-400">
                              {order.requestedDate ? formatDate(order.requestedDate) : '—'}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <div className="flex flex-wrap gap-1">
                                {sectors.map(s => (
                                  <div key={s.sectorName} className="flex items-center gap-0.5 text-[8.5px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 px-1.5 py-0.2 rounded font-medium">
                                    <Clock size={8} />
                                    <span>{s.sectorName} (+{s.daysLate}d)</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 text-center">
                              <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-semibold px-1.5 py-0.5 rounded ${maxDelay > 14 ? 'bg-rose-600 text-white' : maxDelay > 7 ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                                <AlertTriangle size={8} />
                                +{maxDelay}d
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile / Landscape Cards View (Zero horizontal scroll) */}
                <div className="compact-mobile-only divide-y divide-slate-100 dark:divide-slate-800/80 p-2 space-y-1.5 w-full max-w-full overflow-x-hidden">
                  {allAtRisk.map(({ order, sectors }) => {
                    const maxDelay = Math.max(...sectors.map(s => s.daysLate));
                    return (
                      <div key={order.id} className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-900/10 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-black text-[11px] text-slate-800 dark:text-white truncate">{order.docNr}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">• {order.clientName}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md ${maxDelay > 14 ? 'bg-rose-600 text-white' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}`}>
                            <AlertTriangle size={9} />
                            +{maxDelay}d
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="truncate">{order.reference} ({order.colorDesc})</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">
                            Qtd: {order.qtyRequested?.toLocaleString('pt-PT')} • {order.requestedDate ? formatDate(order.requestedDate) : '-'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 pt-1 border-t border-rose-100 dark:border-rose-900/30">
                          {sectors.map(s => (
                            <span key={s.sectorName} className="text-[9px] font-bold bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-300 px-1.5 py-0.2 rounded">
                              {s.sectorName} (+{s.daysLate}d)
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

const QueueRow: React.FC<{ info: OrderCapacityInfo; rank: number }> = ({ info, rank }) => {
  const { order, capacity, remainingQty, estimatedDays, estimatedCompletionDate, isAtRisk, daysLate } = info;
  const producedQty = (order.qtyRequested || 0) - remainingQty;

  return (
    <tr className={`transition-colors ${isAtRisk ? 'bg-rose-50/40 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
      <td className="px-2 py-1.5 text-slate-400 dark:text-slate-500 text-[10px] font-bold">{rank}</td>
      <td className="px-2 py-1.5">
        <div className="font-semibold text-[11px] text-slate-800 dark:text-white truncate">{order.docNr}</div>
        <div className="text-[9px] text-slate-400">Item {order.itemNr}</div>
      </td>
      <td className="px-2 py-1.5">
        <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 truncate">{order.clientName}</div>
      </td>
      <td className="px-2 py-1.5">
        <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{order.reference}</div>
        <div className="text-[9px] text-slate-400 truncate">{order.colorDesc}</div>
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums font-semibold text-[11px] text-slate-700 dark:text-slate-300">{(order.qtyRequested || 0).toLocaleString('pt-PT')}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        <span className={`text-[11px] font-semibold ${producedQty >= (order.qtyRequested || 0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
          {producedQty.toLocaleString('pt-PT')}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        <span className={`text-[11px] font-semibold ${remainingQty > 0 ? 'text-slate-800 dark:text-white' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {remainingQty.toLocaleString('pt-PT')}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {capacity ? (
          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">{capacity.piecesPerHour.toLocaleString('pt-PT')}</span>
        ) : (
          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">S/def.</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
        {estimatedDays > 0 ? (
          <span className={`text-[11px] font-semibold ${estimatedDays > 10 ? 'text-rose-600 dark:text-rose-400' : estimatedDays > 5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {estimatedDays}d
          </span>
        ) : remainingQty === 0 ? (
          <CheckCircle2 size={13} className="text-emerald-500 ml-auto" />
        ) : '—'}
      </td>
      <td className="px-2 py-1.5 text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {estimatedCompletionDate && remainingQty > 0 ? formatDate(estimatedCompletionDate) : '—'}
      </td>
      <td className="px-2 py-1.5 text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {order.requestedDate ? formatDate(order.requestedDate) : '—'}
      </td>
      <td className="px-2 py-1.5">
        {remainingQty === 0 ? (
          <span className="text-[8.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
            <CheckCircle2 size={8} /> Concluído
          </span>
        ) : isAtRisk ? (
          <span className="text-[8.5px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
            <AlertTriangle size={8} /> +{daysLate}d
          </span>
        ) : !capacity ? (
          <span className="text-[8.5px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60 px-1.5 py-0.5 rounded w-fit">
            Sem cap.
          </span>
        ) : (
          <span className="text-[8.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
            <CheckCircle2 size={8} /> OK
          </span>
        )}
      </td>
    </tr>
  );
};

export default BottleneckAnalysis;
