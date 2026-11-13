import React from 'react';
import {
  AlertTriangle, Clock, CheckCircle2,
  Target, Activity, Package, Zap, Gauge, ArrowRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from './SafeResponsiveContainer';
import { Order, ProductionCapacity } from '../types';
import { SECTORS } from '../constants';
import { calculateSectorOccupancy, OrderCapacityInfo } from '../utils/capacityUtils';
import { formatDate } from '../utils/formatters';

interface BottleneckAnalysisProps {
  orders: Order[];
  capacities: ProductionCapacity[];
  onNavigateToCapacities?: () => void;
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

const HORIZON_OPTIONS = [
  { days: 5, label: '5 dias (1 Sem.)' },
  { days: 10, label: '10 dias (2 Sem.)' },
  { days: 20, label: '20 dias (1 Mês)' },
];

const BottleneckAnalysis: React.FC<BottleneckAnalysisProps> = ({ orders, capacities, onNavigateToCapacities }) => {
  const [activeTab, setActiveTab] = React.useState<TabId>('overview');
  const [selectedSector, setSelectedSector] = React.useState(SECTORS[0].id);
  const [horizonDays, setHorizonDays] = React.useState<number>(5);
  const [chartMetric, setChartMetric] = React.useState<'occupancy' | 'days'>('occupancy');

  // Apenas encomendas ativas (não arquivadas e com quantidade em aberto)
  const activeOrders = React.useMemo(() =>
    orders.filter(o => !o.isArchived && o.qtyOpen > 0),
  [orders]);

  // Análise completa de ocupação e gargalos por sector
  const sectorAnalysis = React.useMemo(
    () => calculateSectorOccupancy(activeOrders, capacities, horizonDays),
    [activeOrders, capacities, horizonDays]
  );

  // Identificação do gargalo principal (sector com maior % de ocupação)
  const primaryBottleneck = React.useMemo(() => {
    const configured = sectorAnalysis.filter(sa => sa.occupancyPct !== null);
    if (configured.length === 0) return null;
    return [...configured].sort((a, b) => (b.occupancyPct || 0) - (a.occupancyPct || 0))[0];
  }, [sectorAnalysis]);

  const overloadedSectorsCount = React.useMemo(
    () => sectorAnalysis.filter(sa => sa.occupancyPct !== null && sa.occupancyPct > 100).length,
    [sectorAnalysis]
  );

  // Todas as encomendas em risco (considerando fila acumulada do sector)
  const allAtRisk = React.useMemo(() => {
    const riskMap = new Map<string, { order: Order, sectors: Array<{ sectorName: string, daysLate: number, estimatedDays: number }> }>();

    sectorAnalysis.forEach(sa => {
      sa.infos
        .filter(i => i.queueIsAtRisk || i.isAtRisk)
        .forEach(info => {
          const key = info.order.id;
          if (!riskMap.has(key)) {
            riskMap.set(key, { order: info.order, sectors: [] });
          }
          riskMap.get(key)!.sectors.push({
            sectorName: sa.sector.name,
            daysLate: Math.max(info.daysLate, info.queueDaysLate || 0),
            estimatedDays: info.estimatedDays,
          });
        });
    });

    return Array.from(riskMap.values()).sort((a, b) => {
      const maxA = Math.max(...a.sectors.map(s => s.daysLate));
      const maxB = Math.max(...b.sectors.map(s => s.daysLate));
      return maxB - maxA;
    });
  }, [sectorAnalysis]);

  const chartData = sectorAnalysis.map(sa => ({
    name: sa.sector.name.length > 12 ? sa.sector.name.slice(0, 11) + '…' : sa.sector.name,
    fullName: sa.sector.name,
    ocupacao: sa.occupancyPct !== null ? Math.round(sa.occupancyPct) : 0,
    dias: sa.daysToComplete ?? 0,
    horas: Math.round(sa.totalRequiredHours),
    risco: sa.queueAtRiskCount,
    hasRules: sa.occupancyPct !== null,
    color: sa.occupancyPct !== null && sa.occupancyPct > 100
      ? '#e11d48'
      : sa.occupancyPct !== null && sa.occupancyPct >= 75
        ? '#d97706'
        : SECTOR_COLORS[sa.sector.id] || '#64748b',
  }));

  const tabs = [
    { id: 'overview' as TabId, label: 'Visão Geral & Ocupação', icon: Activity },
    { id: 'queue' as TabId, label: 'Fila por Sector', icon: Package },
    { id: 'risk' as TabId, label: `Encomendas em Risco (${allAtRisk.length})`, icon: AlertTriangle },
  ];

  const currentSectorAnalysis = sectorAnalysis.find(sa => sa.sector.id === selectedSector)!;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Target size={20} className="text-rose-500" />
              Ocupação & Análise de Gargalos
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {capacities.length} regra{capacities.length !== 1 ? 's' : ''} de capacidade ativa{capacities.length !== 1 ? 's' : ''} · {activeOrders.length} encomendas abertas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Horizonte de Cálculo de Ocupação */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2 flex items-center gap-1">
                <Gauge size={12} /> Horizonte:
              </span>
              {HORIZON_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setHorizonDays(opt.days)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                    horizonDays === opt.days
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs pl-2 border-l border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <div className={`text-xl font-black ${overloadedSectorsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {overloadedSectorsCount}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">Sobrecargas (&gt;100%)</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-rose-600 dark:text-rose-400">{allAtRisk.length}</div>
                <div className="text-[10px] text-slate-500 font-medium">Enc. em Risco</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-slate-800 dark:text-white">{activeOrders.length}</div>
                <div className="text-[10px] text-slate-500 font-medium">Ativas</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex gap-1 overflow-x-auto">
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

          {onNavigateToCapacities && (
            <button
              type="button"
              onClick={onNavigateToCapacities}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-blue-400 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Zap size={13} className="text-blue-500" />
              Gerir Capacidades
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5">
        {/* Aviso caso não existam regras de capacidade */}
        {capacities.length === 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Nenhuma regra de Capacidade de Produção definida
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Configure pelo menos uma regra (peças/hora e horas/dia) por sector ou artigo em "Capacidades de Produção" para calcular a taxa de ocupação (%) e detetar gargalos automaticamente.
                </p>
              </div>
            </div>
            {onNavigateToCapacities && (
              <button
                type="button"
                onClick={onNavigateToCapacities}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shrink-0 transition-colors"
              >
                Definir Regras <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Destaque do Gargalo Principal */}
        {primaryBottleneck && activeTab === 'overview' && (
          <div className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            (primaryBottleneck.occupancyPct || 0) > 100
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
              : (primaryBottleneck.occupancyPct || 0) >= 75
                ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                (primaryBottleneck.occupancyPct || 0) > 100
                  ? 'bg-rose-600 text-white'
                  : (primaryBottleneck.occupancyPct || 0) >= 75
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
              }`}>
                <Gauge size={18} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {(primaryBottleneck.occupancyPct || 0) > 100 ? 'Gargalo Crítico Detetado' : 'Sector com Maior Ocupação'} (Horizonte {horizonDays}d úteis)
                </div>
                <div className="text-sm font-black text-slate-800 dark:text-white flex flex-wrap items-center gap-2 mt-0.5">
                  <span>{primaryBottleneck.sector.name}</span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-black ${
                    (primaryBottleneck.occupancyPct || 0) > 100
                      ? 'bg-rose-600 text-white'
                      : (primaryBottleneck.occupancyPct || 0) >= 75
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-600 text-white'
                  }`}>
                    {Math.round(primaryBottleneck.occupancyPct || 0)}% Ocupação
                  </span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    · {primaryBottleneck.totalRequiredHours.toFixed(1)}h necessárias / {Math.round(primaryBottleneck.availableHoursInHorizon)}h disponíveis ({primaryBottleneck.totalRequiredDays.toFixed(1)} dias úteis de carga)
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedSector(primaryBottleneck.sector.id); setActiveTab('queue'); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-blue-400 transition-colors shrink-0"
            >
              Ver Fila do Sector <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* ============ VISÃO GERAL & OCUPAÇÃO ============ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectorAnalysis.map(sa => {
                const SectorIcon = sa.sector.icon;
                const occ = sa.occupancyPct;
                const isCritical = sa.bottleneckLevel === 'critical';
                const isWarning = sa.bottleneckLevel === 'warning';
                const isUnconfigured = sa.bottleneckLevel === 'unconfigured';

                const statusColor = isCritical
                  ? 'border-rose-300 dark:border-rose-900/60'
                  : isWarning
                    ? 'border-amber-300 dark:border-amber-900/60'
                    : 'border-slate-200 dark:border-slate-800';

                const badgeColor = isCritical
                  ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                  : isWarning
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                    : isUnconfigured
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';

                return (
                  <div
                    key={sa.sector.id}
                    onClick={() => { setSelectedSector(sa.sector.id); setActiveTab('queue'); }}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border-2 ${statusColor} p-5 shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 rounded-xl shrink-0" style={{ backgroundColor: SECTOR_COLORS[sa.sector.id] + '20' }}>
                          <SectorIcon size={16} style={{ color: SECTOR_COLORS[sa.sector.id] }} />
                        </div>
                        <div className="min-w-0">
                          <span className="font-black text-sm text-slate-800 dark:text-white block truncate">{sa.sector.name}</span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {isCritical ? 'Gargalo / Sobrecarga' : isWarning ? 'Ocupação Elevada' : isUnconfigured ? 'Sem Regras Aplicáveis' : 'Capacidade Normal'}
                          </span>
                        </div>
                      </div>
                      {occ !== null ? (
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg shrink-0 ${badgeColor}`}>
                          {Math.round(occ)}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">S/Cap.</span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center py-2 border-y border-slate-100 dark:border-slate-800/80">
                      <div>
                        <div className="text-base font-black text-slate-800 dark:text-white tabular-nums">{sa.totalOrders}</div>
                        <div className="text-[9.5px] text-slate-500 font-medium uppercase tracking-wide">Enc.</div>
                      </div>
                      <div>
                        <div className="text-base font-black text-slate-800 dark:text-white tabular-nums">{sa.totalRemaining.toLocaleString('pt-PT')}</div>
                        <div className="text-[9.5px] text-slate-500 font-medium uppercase tracking-wide">Em Falta</div>
                      </div>
                      <div>
                        <div className={`text-base font-black tabular-nums ${sa.queueAtRiskCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {sa.queueAtRiskCount}
                        </div>
                        <div className="text-[9.5px] text-slate-500 font-medium uppercase tracking-wide">Risco Fila</div>
                      </div>
                    </div>

                    {sa.noCapacityCount > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-lg font-medium">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span>{sa.noCapacityCount} enc. sem regra de capacidade</span>
                      </div>
                    )}

                    {occ !== null && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 font-medium tabular-nums">
                          <span>{sa.totalRequiredHours.toFixed(0)}h / {Math.round(sa.availableHoursInHorizon)}h ({horizonDays}d)</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{sa.totalRequiredDays.toFixed(1)}d carga</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, Math.max(occ > 0 ? 3 : 0, occ))}%` }}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-black text-xs uppercase tracking-widest text-slate-500 mb-0.5">
                    {chartMetric === 'occupancy'
                      ? `Ocupação por Sector (%) — Horizonte de ${horizonDays} Dias Úteis`
                      : 'Dias Úteis de Carga em Fila por Sector'}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {chartMetric === 'occupancy'
                      ? 'Sectores acima da linha tracejada de 100% representam gargalos de capacidade.'
                      : 'Total acumulado de dias úteis necessários para produzir todas as encomendas em fila.'}
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start">
                  <button
                    type="button"
                    onClick={() => setChartMetric('occupancy')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                      chartMetric === 'occupancy'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Ocupação (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('days')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                      chartMetric === 'days'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Dias de Carga
                  </button>
                </div>
              </div>

              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      unit={chartMetric === 'occupancy' ? '%' : 'd'}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#f1f5f9' }}
                      formatter={(value: number) => [
                        chartMetric === 'occupancy' ? `${value}%` : `${value} dias úteis`,
                        chartMetric === 'occupancy' ? 'Ocupação' : 'Carga estimada'
                      ]}
                      labelFormatter={(label) => chartData.find(d => d.name === label)?.fullName || label}
                    />
                    {chartMetric === 'occupancy' && (
                      <ReferenceLine
                        y={100}
                        stroke="#e11d48"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{ value: '100% Gargalo', position: 'insideTopRight', fill: '#e11d48', fontSize: 10, fontWeight: 700 }}
                      />
                    )}
                    <Bar dataKey={chartMetric === 'occupancy' ? 'ocupacao' : 'dias'} radius={[6, 6, 0, 0]} barSize={38}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} opacity={entry.hasRules ? 0.9 : 0.25} />
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
                const sAnalysis = sectorAnalysis.find(sa => sa.sector.id === s.id);
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
                    <span>{s.name}</span>
                    {sAnalysis && sAnalysis.occupancyPct !== null && (
                      <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-black ${
                        selectedSector === s.id
                          ? 'bg-white/20 text-white'
                          : sAnalysis.occupancyPct > 100
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {Math.round(sAnalysis.occupancyPct)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sector Summary */}
            {currentSectorAnalysis && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  {
                    label: `Ocupação (${horizonDays}d)`,
                    value: currentSectorAnalysis.occupancyPct !== null ? `${Math.round(currentSectorAnalysis.occupancyPct)}%` : 'S/Cap.',
                    color: currentSectorAnalysis.occupancyPct !== null && currentSectorAnalysis.occupancyPct > 100
                      ? 'text-rose-600 dark:text-rose-400'
                      : currentSectorAnalysis.occupancyPct !== null && currentSectorAnalysis.occupancyPct >= 75
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  },
                  {
                    label: 'Carga (Horas)',
                    value: `${currentSectorAnalysis.totalRequiredHours.toFixed(1)}h`,
                    color: 'text-blue-600 dark:text-blue-400'
                  },
                  {
                    label: 'Encomendas',
                    value: currentSectorAnalysis.totalOrders,
                    color: 'text-slate-800 dark:text-white'
                  },
                  {
                    label: 'Peças em Falta',
                    value: currentSectorAnalysis.totalRemaining.toLocaleString('pt-PT'),
                    color: 'text-slate-800 dark:text-white'
                  },
                  {
                    label: 'Em Risco (Fila)',
                    value: currentSectorAnalysis.queueAtRiskCount,
                    color: currentSectorAnalysis.queueAtRiskCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className={`text-xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</div>
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
                        { label: 'Cliente', width: '14%' },
                        { label: 'Artigo / Ref.', width: '14%' },
                        { label: 'Qtd.Ped', width: '7%', align: 'text-right' },
                        { label: 'Prod.', width: '7%', align: 'text-right' },
                        { label: 'Falta', width: '7%', align: 'text-right' },
                        { label: 'Pcs/h', width: '6%', align: 'text-right' },
                        { label: 'Horas', width: '7%', align: 'text-right' },
                        { label: 'Conclusão', width: '8%' },
                        { label: 'Data Cli.', width: '8%' },
                        { label: 'Estado', width: '8%' },
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
                    const { order, remainingQty, estimatedDays, isAtRisk, queueIsAtRisk, daysLate, queueDaysLate } = info;
                    const rowAtRisk = queueIsAtRisk || isAtRisk;
                    const rowLate = Math.max(daysLate, queueDaysLate || 0);
                    return (
                      <div 
                        key={order.id}
                        className={`p-2 rounded-xl border transition-all ${rowAtRisk ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded">#{idx + 1}</span>
                            <span className="font-black text-[11px] text-slate-800 dark:text-white truncate">{order.docNr}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">• {order.clientName}</span>
                          </div>
                          {rowAtRisk ? (
                            <span className="text-[9px] font-black text-rose-600 bg-rose-100 dark:bg-rose-900/40 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                              <AlertTriangle size={9} /> +{rowLate}d
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
                    {allAtRisk.length} encomenda{allAtRisk.length !== 1 ? 's' : ''} com risco de atraso considerando a capacidade e fila do sector
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
                              <div className="text-[9.5px] text-slate-400 truncate">{order.colorDesc} · {order.sizeDesc || order.size}</div>
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
  const {
    order,
    capacity,
    remainingQty,
    requiredHours,
    estimatedDays,
    estimatedCompletionDate,
    cumulativeCompletionDate,
    isAtRisk,
    queueIsAtRisk,
    daysLate,
    queueDaysLate
  } = info;

  const producedQty = Math.max(0, (order.qtyRequested || 0) - remainingQty);
  const effectiveCompletionDate = cumulativeCompletionDate || estimatedCompletionDate;
  const rowAtRisk = Boolean(queueIsAtRisk || isAtRisk);
  const effectiveLate = Math.max(daysLate, queueDaysLate || 0);

  return (
    <tr className={`transition-colors ${rowAtRisk ? 'bg-rose-50/40 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
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
        {requiredHours > 0 ? (
          <span className={`text-[11px] font-semibold ${estimatedDays > 10 ? 'text-rose-600 dark:text-rose-400' : estimatedDays > 5 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {requiredHours.toFixed(1)}h
          </span>
        ) : remainingQty === 0 ? (
          <CheckCircle2 size={13} className="text-emerald-500 ml-auto" />
        ) : '—'}
      </td>
      <td className="px-2 py-1.5 text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {effectiveCompletionDate && remainingQty > 0 ? formatDate(effectiveCompletionDate) : '—'}
      </td>
      <td className="px-2 py-1.5 text-[9.5px] font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
        {order.requestedDate ? formatDate(order.requestedDate) : '—'}
      </td>
      <td className="px-2 py-1.5">
        {remainingQty === 0 ? (
          <span className="text-[8.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
            <CheckCircle2 size={8} /> Concluído
          </span>
        ) : rowAtRisk ? (
          <span className="text-[8.5px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5 w-fit">
            <AlertTriangle size={8} /> +{effectiveLate}d
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
