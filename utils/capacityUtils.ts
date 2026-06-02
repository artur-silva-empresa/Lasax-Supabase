import { Order, ProductionCapacity } from '../types';

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

  let bestMatch: ProductionCapacity | null = null;
  let bestScore = -1;

  for (const cap of sectorCaps) {
    let score = 0;
    let isMatch = true;

    if (cap.articleCode?.trim()) {
      if (order.articleCode === cap.articleCode) score += 16;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (cap.reference?.trim()) {
      if (order.reference === cap.reference) score += 8;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (cap.family?.trim()) {
      if (order.family === cap.family) score += 4;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (cap.colorCode?.trim()) {
      if (order.colorCode === cap.colorCode) score += 2;
      else { isMatch = false; }
    }
    if (!isMatch) continue;

    if (cap.size?.trim()) {
      if (order.size === cap.size) score += 1;
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
  estimatedDays: number;
  estimatedCompletionDate: Date | null;
  isAtRisk: boolean;
  daysLate: number;
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
  let estimatedDays = 0;
  let estimatedCompletionDate: Date | null = null;

  if (remainingQty === 0) {
    estimatedCompletionDate = new Date();
  } else if (cap && cap.piecesPerHour > 0) {
    dailyCapacity = cap.piecesPerHour * cap.hoursPerDay;
    estimatedDays = Math.ceil(remainingQty / dailyCapacity);
    estimatedCompletionDate = addWorkingDays(new Date(), estimatedDays);
  }

  let isAtRisk = false;
  let daysLate = 0;

  if (estimatedCompletionDate && order.requestedDate && remainingQty > 0) {
    const diffTime = estimatedCompletionDate.getTime() - order.requestedDate.getTime();
    daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isAtRisk = daysLate > 0;
  }

  return { order, capacity: cap, remainingQty, dailyCapacity, estimatedDays, estimatedCompletionDate, isAtRisk, daysLate };
};
