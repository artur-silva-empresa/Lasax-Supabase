import { Order, ProductionCapacity } from '../types';
import { SECTORS } from '../constants';

export const getSectorProducedQty = (order: Order, sectorId: string): number => {
  switch (sectorId) {
    // Tecelagem e Felpo Cru partilham o mesmo campo de quantidade (felpoCruQty).
    case 'tecelagem': return order.felpoCruQty || 0;
    case 'felpo_cru': return order.felpoCruQty || 0;
    case 'tinturaria': return order.tinturariaQty || 0;
    case 'confeccao': return (order.confRoupoesQty || 0) + (order.confFelposQty || 0);
    case 'embalagem': return order.embAcabQty || 0;
    case 'expedicao': return order.stockCxQty || 0;
    default: return 0;
  }
};

const norm = (val?: string | null): string => (val || '').trim().toLowerCase();

/**
 * Encontra a regra de capacidade mais específica que corresponde ao artigo/encomenda.
 * Sistema de pontuação: articleCode(16) > reference(8) > family(4) > colorCode(2) > size(1).
 * Uma regra com campos em branco serve de padrão geral para o sector.
 */
export const findCapacityForOrder = (
  capacities: ProductionCapacity[],
  sectorId: string,
  order: Order
): ProductionCapacity | null => {
  const sectorCaps = capacities.filter(c => c.sectorId === sectorId);
  if (sectorCaps.length === 0) return null;

  const orderArticle = norm(order.articleCode);
  const orderRef = norm(order.reference);
  const orderFamily = norm(order.family);
  const orderColor = norm(order.colorCode);
  const orderSize = norm(order.size) || norm(order.sizeDesc);

  let bestMatch: ProductionCapacity | null = null;
  let bestScore = -1;

  for (const cap of sectorCaps) {
    let score = 0;
    let isMatch = true;

    if (norm(cap.articleCode)) {
      if (orderArticle === norm(cap.articleCode)) score += 16;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (norm(cap.reference)) {
      if (orderRef === norm(cap.reference)) score += 8;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (norm(cap.family)) {
      if (orderFamily === norm(cap.family)) score += 4;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (norm(cap.colorCode)) {
      if (orderColor === norm(cap.colorCode)) score += 2;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (norm(cap.size)) {
      if (orderSize === norm(cap.size) || norm(order.sizeDesc) === norm(cap.size)) score += 1;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cap;
    }
  }

  return bestMatch;
};

/** Adiciona N dias úteis (Seg–Sex) a uma data */
export const addWorkingDays = (startDate: Date, days: number): Date => {
  if (days <= 0) return new Date(startDate);
  const result = new Date(startDate);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
};

export interface OrderCapacityInfo {
  order: Order;
  capacity: ProductionCapacity | null;
  remainingQty: number;
  dailyCapacity: number;
  requiredHours: number;
  exactDays: number;
  estimatedDays: number;
  estimatedCompletionDate: Date | null;
  isAtRisk: boolean;
  daysLate: number;
  // Dados de fila sequencial (calculados no contexto do sector)
  cumulativeDays?: number;
  cumulativeCompletionDate?: Date | null;
  queueIsAtRisk?: boolean;
  queueDaysLate?: number;
}

export const calcOrderCapacityInfo = (
  order: Order,
  sectorId: string,
  capacities: ProductionCapacity[]
): OrderCapacityInfo => {
  const cap = findCapacityForOrder(capacities, sectorId, order);
  const producedQty = getSectorProducedQty(order, sectorId);
  const remainingQty = Math.max(0, (order.qtyRequested || 0) - producedQty);

  let dailyCapacity = 0;
  let requiredHours = 0;
  let exactDays = 0;
  let estimatedDays = 0;
  let estimatedCompletionDate: Date | null = null;

  if (remainingQty === 0) {
    estimatedCompletionDate = new Date();
  } else if (cap && cap.piecesPerHour > 0) {
    const hoursPerDay = cap.hoursPerDay > 0 ? cap.hoursPerDay : 24;
    dailyCapacity = cap.piecesPerHour * hoursPerDay;
    requiredHours = remainingQty / cap.piecesPerHour;
    exactDays = dailyCapacity > 0 ? remainingQty / dailyCapacity : 0;
    estimatedDays = Math.ceil(exactDays);
    estimatedCompletionDate = addWorkingDays(new Date(), estimatedDays);
  }

  let isAtRisk = false;
  let daysLate = 0;

  if (estimatedCompletionDate && order.requestedDate && remainingQty > 0) {
    const reqDate = new Date(order.requestedDate);
    reqDate.setHours(23, 59, 59, 999);
    const diffTime = estimatedCompletionDate.getTime() - reqDate.getTime();
    daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isAtRisk = daysLate > 0;
  }

  return {
    order,
    capacity: cap,
    remainingQty,
    dailyCapacity,
    requiredHours,
    exactDays,
    estimatedDays,
    estimatedCompletionDate,
    isAtRisk,
    daysLate
  };
};

export interface SectorOccupancySummary {
  sector: typeof SECTORS[number];
  infos: OrderCapacityInfo[];
  totalOrders: number;
  totalRemaining: number;
  ordersWithCapacity: number;
  noCapacityCount: number;
  totalRequiredHours: number;
  totalRequiredDays: number;
  availableHoursInHorizon: number;
  effectiveHoursPerDay: number;
  occupancyPct: number | null;
  daysToComplete: number | null;
  totalDailyCapacity: number;
  atRiskCount: number;
  queueAtRiskCount: number;
  bottleneckLevel: 'critical' | 'warning' | 'normal' | 'unconfigured';
}

/**
 * Calcula a ocupação (%) e gargalos de produção para todos os sectores,
 * considerando as regras de capacidade e o horizonte em dias úteis.
 */
export const calculateSectorOccupancy = (
  activeOrders: Order[],
  capacities: ProductionCapacity[],
  horizonWorkingDays: number = 5
): SectorOccupancySummary[] => {
  const safeHorizon = Math.max(1, horizonWorkingDays);
  const now = new Date();

  return SECTORS.map(sector => {
    const sectorOrders = activeOrders.filter(o =>
      getSectorProducedQty(o, sector.id) < (o.qtyRequested || 0)
    );

    const rawInfos = sectorOrders.map(o => calcOrderCapacityInfo(o, sector.id, capacities));

    // Ordenar fila por prioridade (maior primeiro) e depois por data pedida (mais urgente primeiro)
    const queueSorted = [...rawInfos].sort((a, b) => {
      const pDiff = (b.order.priority || 0) - (a.order.priority || 0);
      if (pDiff !== 0) return pDiff;
      const dateA = a.order.requestedDate ? new Date(a.order.requestedDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.order.requestedDate ? new Date(b.order.requestedDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
    });

    // Acumular carga sequencial na fila do sector
    let runningDays = 0;
    const infosWithQueue: OrderCapacityInfo[] = queueSorted.map(info => {
      if (info.capacity && info.exactDays > 0) {
        runningDays += info.exactDays;
        const cumDaysCeil = Math.ceil(runningDays);
        const cumDate = addWorkingDays(now, cumDaysCeil);
        let qAtRisk = info.isAtRisk;
        let qDaysLate = info.daysLate;

        if (info.order.requestedDate) {
          const reqDate = new Date(info.order.requestedDate);
          reqDate.setHours(23, 59, 59, 999);
          const diff = cumDate.getTime() - reqDate.getTime();
          const dLate = Math.ceil(diff / (1000 * 60 * 60 * 24));
          if (dLate > 0) {
            qAtRisk = true;
            qDaysLate = Math.max(qDaysLate, dLate);
          }
        }

        return {
          ...info,
          cumulativeDays: runningDays,
          cumulativeCompletionDate: cumDate,
          queueIsAtRisk: qAtRisk,
          queueDaysLate: qDaysLate
        };
      }
      return {
        ...info,
        cumulativeDays: runningDays,
        cumulativeCompletionDate: null,
        queueIsAtRisk: info.isAtRisk,
        queueDaysLate: info.daysLate
      };
    });

    const totalRemaining = infosWithQueue.reduce((s, i) => s + i.remainingQty, 0);
    const withCap = infosWithQueue.filter(i => i.capacity !== null && i.capacity.piecesPerHour > 0 && i.remainingQty > 0);
    const noCapacity = infosWithQueue.filter(i => i.capacity === null && i.remainingQty > 0);

    const totalRequiredHours = withCap.reduce((s, i) => s + i.requiredHours, 0);
    const totalRequiredDays = withCap.reduce((s, i) => s + i.exactDays, 0);

    const sectorCaps = capacities.filter(c => c.sectorId === sector.id && c.piecesPerHour > 0);
    const effectiveHoursPerDay = withCap.length > 0
      ? withCap.reduce((s, i) => s + (i.capacity?.hoursPerDay || 24), 0) / withCap.length
      : sectorCaps.length > 0
        ? sectorCaps.reduce((s, c) => s + (c.hoursPerDay || 24), 0) / sectorCaps.length
        : 24;

    const availableHoursInHorizon = safeHorizon * effectiveHoursPerDay;
    const occupancyPct = withCap.length > 0
      ? (totalRequiredDays / safeHorizon) * 100
      : sectorCaps.length > 0 && totalRemaining === 0
        ? 0
        : null;

    const daysToComplete = withCap.length > 0
      ? Math.ceil(totalRequiredDays)
      : sectorCaps.length > 0 && totalRemaining === 0
        ? 0
        : null;

    const totalDailyCapacity = withCap.length > 0
      ? withCap.reduce((s, i) => s + i.dailyCapacity, 0) / withCap.length
      : 0;

    const atRisk = infosWithQueue.filter(i => i.isAtRisk);
    const queueAtRisk = infosWithQueue.filter(i => i.queueIsAtRisk);

    let bottleneckLevel: SectorOccupancySummary['bottleneckLevel'] = 'normal';
    if (occupancyPct === null) {
      bottleneckLevel = totalRemaining > 0 ? 'unconfigured' : 'normal';
    } else if (occupancyPct > 100 || (queueAtRisk.length > 0 && occupancyPct >= 85)) {
      bottleneckLevel = 'critical';
    } else if (occupancyPct >= 75 || queueAtRisk.length > 0) {
      bottleneckLevel = 'warning';
    } else {
      bottleneckLevel = 'normal';
    }

    // Ordenar tabela de fila: risco primeiro, depois atraso, depois prioridade
    const sortedForDisplay = [...infosWithQueue].sort((a, b) => {
      const aRisk = a.queueIsAtRisk || a.isAtRisk;
      const bRisk = b.queueIsAtRisk || b.isAtRisk;
      if (aRisk !== bRisk) return bRisk ? 1 : -1;
      const aLate = Math.max(a.daysLate, a.queueDaysLate || 0);
      const bLate = Math.max(b.daysLate, b.queueDaysLate || 0);
      if (bLate !== aLate) return bLate - aLate;
      return (b.order.priority || 0) - (a.order.priority || 0);
    });

    return {
      sector,
      infos: sortedForDisplay,
      totalOrders: sectorOrders.length,
      totalRemaining,
      ordersWithCapacity: withCap.length,
      noCapacityCount: noCapacity.length,
      totalRequiredHours,
      totalRequiredDays,
      availableHoursInHorizon,
      effectiveHoursPerDay,
      occupancyPct,
      daysToComplete,
      totalDailyCapacity,
      atRiskCount: atRisk.length,
      queueAtRiskCount: queueAtRisk.length,
      bottleneckLevel
    };
  });
};
