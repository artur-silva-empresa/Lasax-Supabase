import React, { useMemo, useState, useEffect } from 'react';
import { 
  Waves, 
  Layers, 
  Droplets, 
  Scissors, 
  Package, 
  Truck, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ChevronRight,
  TrendingUp,
  Activity
} from 'lucide-react';
import { Order, SectorAlertTolerances } from '../types';
import { SECTORS } from '../constants';
import { getSectorAlertTolerances } from '../services/dataService';
import { ActiveFilterType } from './OrderTable';

interface SectorKPIsProps {
  orders: Order[];
  onNavigateToOrders?: (filter: ActiveFilterType) => void;
  tolerances?: SectorAlertTolerances;
}

interface SectorMetric {
  id: string;
  name: string;
  icon: any;
  color: string;
  totalOrders: number;
  onTimeOrders: number;
  delayedOrders: number;
  onTimePercentage: number;
  avgDelayDays: number;
  maxDelayDays: number;
  totalQuantity: number;
  toleranceDays: number;
}

export const SectorKPIs: React.FC<SectorKPIsProps> = ({
  orders,
  onNavigateToOrders,
  tolerances: propTolerances
}) => {
  const [internalTolerances, setInternalTolerances] = useState<SectorAlertTolerances>(() => getSectorAlertTolerances());

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) setInternalTolerances(e.detail);
      else setInternalTolerances(getSectorAlertTolerances());
    };
    window.addEventListener('sector_alert_tolerances_updated', handleUpdate);
    return () => window.removeEventListener('sector_alert_tolerances_updated', handleUpdate);
  }, []);

  const tolerances = propTolerances || internalTolerances;

  // Compute metrics for each sector
  const sectorMetrics = useMemo<SectorMetric[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const iconsMap: Record<string, any> = {
      tecelagem: Waves,
      felpo_cru: Layers,
      tinturaria: Droplets,
      confeccao: Scissors,
      embalagem: Package,
      expedicao: Truck,
    };

    const colorsMap: Record<string, string> = {
      tecelagem: 'blue',
      felpo_cru: 'indigo',
      tinturaria: 'purple',
      confeccao: 'fuchsia',
      embalagem: 'pink',
      expedicao: 'teal',
    };

    return SECTORS.map(sec => {
      const secId = sec.id;
      const tolDays = (tolerances as any)?.[secId] ?? 0;
      
      // Group by docNr to evaluate per order document
      const docDataMap = new Map<string, {
        isCompleted: boolean;
        targetDate: Date | null;
        completionDate: Date | null;
        qtyRequested: number;
      }>();

      orders.forEach(order => {
        if (order.isArchived) return;
        const qReq = order.qtyRequested || 0;
        if (qReq <= 0) return;

        // Check completion in this sector
        let isCompleted = false;
        let compDate: Date | null = null;
        let targetDate: Date | null = order.sectorPredictedDates?.[secId] || null;

        switch (secId) {
          case 'tecelagem':
            isCompleted = (order.felpoCruQty || 0) >= qReq;
            compDate = order.felpoCruDate || order.dataTec;
            if (!targetDate) targetDate = order.dataTec || order.requestedDate;
            break;
          case 'felpo_cru':
            isCompleted = (order.felpoCruQty || 0) >= qReq;
            compDate = order.felpoCruDate;
            if (!targetDate) targetDate = order.felpoCruDate || order.dataTec || order.requestedDate;
            break;
          case 'tinturaria':
            isCompleted = (order.tinturariaQty || 0) >= qReq;
            compDate = order.tinturariaDate;
            if (!targetDate) targetDate = order.tinturariaDate || order.requestedDate;
            break;
          case 'confeccao':
            isCompleted = ((order.confRoupoesQty || 0) + (order.confFelposQty || 0)) >= qReq;
            compDate = order.confDate;
            if (!targetDate) targetDate = order.confDate || order.requestedDate;
            break;
          case 'embalagem':
            isCompleted = (order.embAcabQty || 0) >= qReq;
            compDate = order.armExpDate;
            if (!targetDate) targetDate = order.armExpDate || order.requestedDate;
            break;
          case 'expedicao':
            isCompleted = (order.stockCxQty || 0) >= qReq || order.qtyOpen === 0;
            compDate = order.dataEnt || order.armExpDate;
            if (!targetDate) targetDate = order.dataEnt || order.armExpDate || order.requestedDate;
            break;
        }

        const docKey = order.docNr || order.id;
        const existing = docDataMap.get(docKey);
        if (!existing) {
          docDataMap.set(docKey, {
            isCompleted,
            targetDate,
            completionDate: compDate,
            qtyRequested: qReq
          });
        } else {
          // If any line is incomplete, consider the order incomplete for that sector
          if (!isCompleted) existing.isCompleted = false;
          existing.qtyRequested += qReq;
          if (targetDate && (!existing.targetDate || targetDate < existing.targetDate)) {
            existing.targetDate = targetDate;
          }
        }
      });

      let totalOrders = 0;
      let onTimeOrders = 0;
      let delayedOrders = 0;
      let totalDelayDays = 0;
      let maxDelayDays = 0;
      let totalQuantity = 0;

      docDataMap.forEach(doc => {
        totalOrders += 1;
        totalQuantity += doc.qtyRequested;

        if (!doc.targetDate) {
          // Without target date, count as on-time
          onTimeOrders += 1;
          return;
        }

        const tDate = new Date(doc.targetDate);
        tDate.setHours(0, 0, 0, 0);

        if (doc.isCompleted) {
          // Check completion date vs target date + tolerance
          if (doc.completionDate) {
            const cDate = new Date(doc.completionDate);
            cDate.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((cDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > tolDays) {
              delayedOrders += 1;
              const delay = diffDays - tolDays;
              totalDelayDays += delay;
              if (delay > maxDelayDays) maxDelayDays = delay;
            } else {
              onTimeOrders += 1;
            }
          } else {
            onTimeOrders += 1;
          }
        } else {
          // In progress or not started
          const diffDays = Math.floor((today.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > tolDays) {
            delayedOrders += 1;
            const delay = diffDays - tolDays;
            totalDelayDays += delay;
            if (delay > maxDelayDays) maxDelayDays = delay;
          } else {
            onTimeOrders += 1;
          }
        }
      });

      const onTimePercentage = totalOrders > 0 
        ? Math.round((onTimeOrders / totalOrders) * 100) 
        : 100;

      const avgDelayDays = delayedOrders > 0 
        ? parseFloat((totalDelayDays / delayedOrders).toFixed(1)) 
        : 0;

      return {
        id: secId,
        name: sec.name,
        icon: iconsMap[secId] || Activity,
        color: colorsMap[secId] || 'blue',
        totalOrders,
        onTimeOrders,
        delayedOrders,
        onTimePercentage,
        avgDelayDays,
        maxDelayDays,
        totalQuantity,
        toleranceDays: tolDays
      };
    });
  }, [orders, tolerances]);

  // Overall Global on-time average
  const globalOnTimeAvg = useMemo(() => {
    if (sectorMetrics.length === 0) return 100;
    const sum = sectorMetrics.reduce((acc, m) => acc + m.onTimePercentage, 0);
    return Math.round(sum / sectorMetrics.length);
  }, [sectorMetrics]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 md:p-6 transition-colors space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
              <TrendingUp size={18} className="shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-800 dark:text-slate-100 text-sm tracking-tight">
                  Desempenho de Prazos por Sector
                </h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  globalOnTimeAvg >= 85
                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : globalOnTimeAvg >= 70
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}>
                  Média Global: {globalOnTimeAvg}% Pontual
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Taxa de cumprimento de prazos e tempo médio de atraso apurado por sector fabril.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 self-start sm:self-auto">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> ≥85%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> 70-84%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> &lt;70%
          </span>
        </div>
      </div>

      {/* Grid of 6 Sector KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {sectorMetrics.map(sector => {
          const Icon = sector.icon;
          const isHigh = sector.onTimePercentage >= 85;
          const isMedium = sector.onTimePercentage >= 70 && sector.onTimePercentage < 85;
          const isLow = sector.onTimePercentage < 70;

          const progressColor = isHigh 
            ? 'bg-emerald-500' 
            : isMedium 
            ? 'bg-amber-500' 
            : 'bg-rose-500';

          const badgeBg = isHigh 
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
            : isMedium 
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';

          return (
            <div
              key={sector.id}
              className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between group shadow-xs"
            >
              {/* Sector Title & Icon */}
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 shadow-2xs shrink-0">
                      <Icon size={14} />
                    </div>
                    <span className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">
                      {sector.name}
                    </span>
                  </div>

                  {/* Tolerance Indicator */}
                  {sector.toleranceDays > 0 ? (
                    <span 
                      className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 shrink-0"
                      title={`Tolerância ativa: ${sector.toleranceDays} dias antes de disparar atraso`}
                    >
                      Tol: {sector.toleranceDays}d
                    </span>
                  ) : (
                    <span 
                      className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-slate-200/60 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 shrink-0"
                      title="Sem tolerância (alerta imediato)"
                    >
                      0d
                    </span>
                  )}
                </div>

                {/* Primary Metric: % On-Time */}
                <div className="mt-1">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      No Prazo
                    </span>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${badgeBg}`}>
                      {sector.onTimePercentage}%
                    </span>
                  </div>

                  {/* Percentage Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mb-2.5">
                    <div 
                      className={`h-full ${progressColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${Math.min(100, Math.max(0, sector.onTimePercentage))}%` }}
                    />
                  </div>
                </div>

                {/* Secondary Metric: Tempo Médio de Atraso */}
                <div className="bg-white dark:bg-slate-800/80 rounded-lg p-2 border border-slate-200/60 dark:border-slate-700/60 mb-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      Atraso Médio:
                    </span>
                    <span className={`font-black ${
                      sector.avgDelayDays > 0 
                        ? 'text-rose-600 dark:text-rose-400' 
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {sector.avgDelayDays > 0 ? `${sector.avgDelayDays} dias` : '0 dias (No prazo)'}
                    </span>
                  </div>

                  {sector.avgDelayDays > 0 && sector.maxDelayDays > sector.avgDelayDays && (
                    <div className="flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 pt-0.5 border-t border-slate-100 dark:border-slate-700/50">
                      <span>Atraso Máximo:</span>
                      <span className="font-semibold text-rose-500">{sector.maxDelayDays} dias</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer: Order count breakdown */}
              <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {sector.onTimeOrders} ok
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  {sector.delayedOrders} atr.
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {sector.totalOrders} tot.
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
