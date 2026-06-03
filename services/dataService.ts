
import * as XLSX from 'xlsx';
import initSqlJs from 'sql.js';
import { supabase } from '../src/services/supabase';
import { Order, OrderState, SectorState, DashboardKPIs, User, UserRole, PermissionLevel } from '../types';
import { parseExcelDate, formatDate } from '../utils/formatters';
import { SECTORS } from '../constants';

// --- PERSISTÊNCIA (IndexedDB) ---
const DB_NAME = 'ProdLasaData';
const DB_VERSION = 6;
const STORE_HANDLES = 'handles';
const STORE_ORDERS = 'orders';
const STORE_HEADERS = 'headers';
const STORE_STOP_REASONS = 'stop_reasons';
const STORE_USERS = 'users';
const STORE_EXPORT_COLUMNS = 'export_columns';
const STORE_CAPACITIES = 'production_capacities';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS);
      }
      if (!db.objectStoreNames.contains(STORE_HEADERS)) {
        db.createObjectStore(STORE_HEADERS);
      }
      if (!db.objectStoreNames.contains(STORE_STOP_REASONS)) {
        db.createObjectStore(STORE_STOP_REASONS);
      }
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_EXPORT_COLUMNS)) {
        db.createObjectStore(STORE_EXPORT_COLUMNS);
      }
      if (!db.objectStoreNames.contains(STORE_CAPACITIES)) {
        db.createObjectStore(STORE_CAPACITIES, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
};

// --- DATA PERSISTENCE HELPERS ---

export const hashPassword = async (password: string): Promise<string> => {
    // Fallback para contextos não-HTTPS onde crypto.subtle não está disponível.
    if (!window.crypto || !window.crypto.subtle) {
        console.warn("Crypto Subtle não disponível. A usar fallback com salt (apenas para desenvolvimento/HTTP).");
        // BUG 9 CORRIGIDO: fallback anterior era trivialmente reversível (soma de charCodes).
        // Este fallback adiciona um salt fixo e faz múltiplas iterações para dificultar
        // ataques de dicionário. NÃO É SEGURO para produção — usar sempre HTTPS.
        const SALT = 'ProdLasa_2024_@#$';
        const salted = SALT + password + SALT;
        let hash = 0;
        for (let i = 0; i < salted.length; i++) {
            const chr = salted.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Converter para inteiro 32-bit
        }
        // Múltiplas iterações para aumentar custo computacional
        let result = Math.abs(hash).toString(16).padStart(8, '0');
        for (let iter = 0; iter < 1000; iter++) {
            let h = 0;
            const s = result + salted;
            for (let i = 0; i < s.length; i++) {
                h = ((h << 5) - h) + s.charCodeAt(i);
                h |= 0;
            }
            result = Math.abs(h).toString(16).padStart(8, '0');
        }
        return result;
    }
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
};

export const saveUserToDB = async (user: User) => {
    const { error } = await supabase.from('users').upsert({
        id: user.id,
        username: user.username,
        password_hash: user.passwordHash,
        role: user.role,
        name: user.name,
        permissions: user.permissions
    });
    if (error) console.error("Error saving user", error);
};

export const deleteUserFromDB = async (userId: string) => {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) console.error("Error deleting user", error);
};

export const loadUsersFromDB = async (): Promise<User[]> => {
    const { data: users, error } = await supabase.from('users').select('*');
    if (error) {
        console.error("Error loading users", error);
        return [];
    }
    return (users || []).map((u: any) => ({
        id: u.id,
        username: u.username,
        passwordHash: u.password_hash,
        role: u.role,
        name: u.name,
        permissions: u.permissions
    }));
};

export const initializeDefaultUsers = async () => {
    // Migrate local uses to Supabase first
    try {
        const db = await initDB();
        const localUsers: User[] = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_USERS, 'readonly');
            const req = tx.objectStore(STORE_USERS).getAll();
            tx.oncomplete = () => resolve(req.result || []);
            tx.onerror = () => reject(tx.error);
        });

        if (localUsers.length > 0) {
            console.log(`Migrating ${localUsers.length} local users to Supabase...`);
            for (const user of localUsers) {
                await saveUserToDB(user);
            }
            // Clear local users to prevent re-migration
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORE_USERS, 'readwrite');
                tx.objectStore(STORE_USERS).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            console.log("Migration complete.");
        }
    } catch (e) {
        console.warn("Could not migrate local users", e);
    }

    const users = await loadUsersFromDB();
    if (users.length === 0) {
        const adminPerms: any = {
            dashboard: 'write',
            orders: 'write',
            timeline: 'write',
            config: 'write',
            stopReasons: 'write',
            sectors: {}
        };
        SECTORS.forEach(s => adminPerms.sectors[s.id] = 'write');

        const viewerPerms: any = {
            dashboard: 'none',
            orders: 'read',
            timeline: 'read',
            config: 'none',
            stopReasons: 'none',
            sectors: {}
        };
        SECTORS.forEach(s => viewerPerms.sectors[s.id] = 'read');

        const planUser: User = {
            id: '1',
            username: 'Plan',
            name: 'Planeamento',
            passwordHash: await hashPassword('Lasa'),
            role: 'admin',
            permissions: adminPerms
        };

        const lasaUser: User = {
            id: '2',
            username: 'Lasa',
            name: 'Utilizador Lasa',
            // Password vazia intencional para o utilizador de leitura Lasa.
            passwordHash: await hashPassword(''),
            role: 'viewer',
            permissions: viewerPerms
        };

        await saveUserToDB(planUser);
        await saveUserToDB(lasaUser);
        return [planUser, lasaUser];
    }
    return users;
};

export const saveStopReasonsToDB = async (hierarchy: any[]) => {
    const { error } = await supabase.from('app_state').upsert({
        key: 'main_hierarchy',
        value: hierarchy
    });
    if(error) console.error("Error saving stop reasons", error);
};

export const loadStopReasonsFromDB = async (): Promise<any[] | null> => {
    const { data, error } = await supabase.from('app_state').select('value').eq('key', 'main_hierarchy').single();
    if (error || !data) return null;
    return data.value;
};

export const saveOrdersToDB = async (orders: Order[], headers: Record<string, string>) => {
    // save headers
    await supabase.from('app_state').upsert({ key: 'main_headers', value: headers });
    
    // filter incomplete fields that could cause problems
    const toInsert = orders.map(o => ({
        id: o.id,
        doc_series: o.docSeries || '',
        doc_nr: o.docNr,
        client_code: o.clientCode || '',
        client_name: o.clientName || '',
        comercial: o.comercial || '',
        issue_date: o.issueDate,
        requested_date: o.requestedDate,
        item_nr: o.itemNr,
        po: o.po || '',
        article_code: o.articleCode || '',
        reference: o.reference || '',
        color_code: o.colorCode || '',
        color_desc: o.colorDesc || '',
        size: o.size || '',
        family: o.family || '',
        size_desc: o.sizeDesc || '',
        ean: o.ean || '',
        qty_requested: o.qtyRequested || 0,
        data_tec: o.dataTec,
        felpo_cru_qty: o.felpoCruQty || 0,
        felpo_cru_date: o.felpoCruDate,
        tinturaria_qty: o.tinturariaQty || 0,
        tinturaria_date: o.tinturariaDate,
        conf_roupoes_qty: o.confRoupoesQty || 0,
        conf_felpos_qty: o.confFelposQty || 0,
        conf_date: o.confDate,
        emb_acab_qty: o.embAcabQty || 0,
        arm_exp_date: o.armExpDate,
        stock_cx_qty: o.stockCxQty || 0,
        data_ent: o.dataEnt,
        data_especial: o.dataEspecial,
        data_printer: o.dataPrinter,
        data_debuxo: o.dataDebuxo,
        data_amostras: o.dataAmostras,
        data_bordados: o.dataBordados,
        qty_billed: o.qtyBilled || 0,
        qty_open: o.qtyOpen || 0,
        priority: o.priority || 0,
        is_manual: o.isManual || false,
        is_archived: o.isArchived || false,
        archived_at: o.archivedAt instanceof Date ? o.archivedAt.toISOString() : (o.archivedAt || null),
        archived_by: o.archivedBy,
        sector_stop_reasons: o.sectorStopReasons || {},
        sector_observations: o.sectorObservations || {},
        sector_predicted_dates: o.sectorPredictedDates || {},
        sector_predicted_dates_pending: o.sectorPredictedDatesPending || {}
    }));

    // upsert in batches of 250
    for (let i = 0; i < toInsert.length; i += 250) {
        const batch = toInsert.slice(i, i + 250);
        const { error } = await supabase.from('orders').upsert(batch);
        if (error) console.error("Error saving orders batch", error);
    }
};

export const saveOrderToDB = async (order: Order) => {
    const o = order;
    const toInsert = {
        id: o.id,
        doc_series: o.docSeries || '',
        doc_nr: o.docNr,
        client_code: o.clientCode || '',
        client_name: o.clientName || '',
        comercial: o.comercial || '',
        issue_date: o.issueDate,
        requested_date: o.requestedDate,
        item_nr: o.itemNr,
        po: o.po || '',
        article_code: o.articleCode || '',
        reference: o.reference || '',
        color_code: o.colorCode || '',
        color_desc: o.colorDesc || '',
        size: o.size || '',
        family: o.family || '',
        size_desc: o.sizeDesc || '',
        ean: o.ean || '',
        qty_requested: o.qtyRequested || 0,
        data_tec: o.dataTec,
        felpo_cru_qty: o.felpoCruQty || 0,
        felpo_cru_date: o.felpoCruDate,
        tinturaria_qty: o.tinturariaQty || 0,
        tinturaria_date: o.tinturariaDate,
        conf_roupoes_qty: o.confRoupoesQty || 0,
        conf_felpos_qty: o.confFelposQty || 0,
        conf_date: o.confDate,
        emb_acab_qty: o.embAcabQty || 0,
        arm_exp_date: o.armExpDate,
        stock_cx_qty: o.stockCxQty || 0,
        data_ent: o.dataEnt,
        data_especial: o.dataEspecial,
        data_printer: o.dataPrinter,
        data_debuxo: o.dataDebuxo,
        data_amostras: o.dataAmostras,
        data_bordados: o.dataBordados,
        qty_billed: o.qtyBilled || 0,
        qty_open: o.qtyOpen || 0,
        priority: o.priority || 0,
        is_manual: o.isManual || false,
        is_archived: o.isArchived || false,
        archived_at: o.archivedAt instanceof Date ? o.archivedAt.toISOString() : (o.archivedAt || null),
        archived_by: o.archivedBy,
        sector_stop_reasons: o.sectorStopReasons || {},
        sector_observations: o.sectorObservations || {},
        sector_predicted_dates: o.sectorPredictedDates || {},
        sector_predicted_dates_pending: o.sectorPredictedDatesPending || {}
    };

    const { error } = await supabase.from('orders').upsert(toInsert);
    if (error) console.error("Error saving single order", error);
};

export const loadOrdersFromDB = async (): Promise<{orders: Order[], headers: Record<string, string>} | null> => {
    let allOrdersData: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    let ordersError = null;
    
    // Pagination for orders
    while(hasMore) {
        const { data, error } = await supabase.from('orders').select('*').range(from, from + limit - 1);
        if(error) {
            ordersError = error;
            break;
        }
        if(data && data.length > 0) {
            allOrdersData = allOrdersData.concat(data);
            from += limit;
        } else {
            hasMore = false;
        }
        if(data && data.length < limit) hasMore = false;
    }
    
    const { data: headersData } = await supabase.from('app_state').select('value').eq('key', 'main_headers').single();
    if (ordersError) console.error("Error loading orders", ordersError);
    
    const headers = headersData ? headersData.value : {};
    
    // Return null completely if there is really no data and it's initialized clean, though empty array is better
    if (allOrdersData.length === 0) return { orders: [], headers };

    const hydratedOrders = allOrdersData.map(hydrateOrder);

    return { orders: hydratedOrders, headers };
};

export const hydrateOrder = (o: any): Order => ({
    id: o.id,
    docSeries: o.doc_series,
    docNr: o.doc_nr,
    clientCode: o.client_code,
    clientName: o.client_name,
    comercial: o.comercial,
    issueDate: o.issue_date ? new Date(o.issue_date) : null,
    requestedDate: o.requested_date ? new Date(o.requested_date) : null,
    itemNr: o.item_nr,
    po: o.po,
    articleCode: o.article_code,
    reference: o.reference,
    colorCode: o.color_code,
    colorDesc: o.color_desc,
    size: o.size,
    family: o.family,
    sizeDesc: o.size_desc,
    ean: o.ean,
    qtyRequested: parseFloat(o.qty_requested) || 0,
    dataTec: o.data_tec ? new Date(o.data_tec) : null,
    felpoCruQty: parseFloat(o.felpo_cru_qty) || 0,
    felpoCruDate: o.felpo_cru_date ? new Date(o.felpo_cru_date) : null,
    tinturariaQty: parseFloat(o.tinturaria_qty) || 0,
    tinturariaDate: o.tinturaria_date ? new Date(o.tinturaria_date) : null,
    confRoupoesQty: parseFloat(o.conf_roupoes_qty) || 0,
    confFelposQty: parseFloat(o.conf_felpos_qty) || 0,
    confDate: o.conf_date ? new Date(o.conf_date) : null,
    embAcabQty: parseFloat(o.emb_acab_qty) || 0,
    armExpDate: o.arm_exp_date ? new Date(o.arm_exp_date) : null,
    stockCxQty: parseFloat(o.stock_cx_qty) || 0,
    dataEnt: o.data_ent ? new Date(o.data_ent) : null,
    dataEspecial: o.data_especial ? new Date(o.data_especial) : null,
    dataPrinter: o.data_printer ? new Date(o.data_printer) : null,
    dataDebuxo: o.data_debuxo ? new Date(o.data_debuxo) : null,
    dataAmostras: o.data_amostras ? new Date(o.data_amostras) : null,
    dataBordados: o.data_bordados ? new Date(o.data_bordados) : null,
    qtyBilled: parseFloat(o.qty_billed) || 0,
    qtyOpen: parseFloat(o.qty_open) || 0,
    priority: o.priority,
    isManual: o.is_manual,
    isArchived: o.is_archived,
    archivedAt: o.archived_at ? new Date(o.archived_at) : null,
    archivedBy: o.archived_by,
    sectorStopReasons: o.sector_stop_reasons || {},
    sectorObservations: o.sector_observations || {},
    sectorPredictedDates: (() => {
        const raw = o.sector_predicted_dates || {};
        const result: Record<string, Date | null> = {};
        Object.entries(raw).forEach(([k, v]) => { result[k] = v ? new Date(v as string) : null; });
        return result;
    })(),
    sectorPredictedDatesPending: o.sector_predicted_dates_pending || {},
});

export const clearOrdersFromDB = async () => {
    // Note: Due to safe deletes in PostgREST typically requiring a condition, we match non-null IDs.
    await supabase.from('orders').delete().not('id', 'is', null);
    await supabase.from('app_state').delete().eq('key', 'main_headers');
};

// --- FILE HANDLES ---

export const saveDirectoryHandle = async (key: 'import' | 'export', handle: any) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readwrite');
    const store = tx.objectStore(STORE_HANDLES);
    const req = store.put(handle, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
};

export const getDirectoryHandle = async (key: 'import' | 'export'): Promise<any> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HANDLES, 'readonly');
    const store = tx.objectStore(STORE_HANDLES);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const verifyPermission = async (handle: any, readWrite: boolean = false) => {
  if (!handle) return false;
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
  } catch (e) {
    console.error("Erro ao verificar permissões:", e);
    return false;
  }
  return false;
};

// --- CONFIGURAÇÃO SQL.JS ---
// O ficheiro sql-wasm.wasm é copiado de node_modules para public/ pelo script prebuild.
// Usamos import.meta.env.BASE_URL para que o path funcione automaticamente
// com qualquer valor de base configurado no vite.config.ts (ex: '/lasax/' ou '/').
const getSql = async () => {
  try {
    const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || '/';
    const wasmPath = `${base}sql-wasm.wasm`;
    return await initSqlJs({
      locateFile: () => wasmPath
    });
  } catch (error) {
    console.error("Falha ao inicializar SQL.js:", error);
    throw new Error("Não foi possível carregar o motor de base de dados.");
  }
};

const parseNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  
  const str = String(val).trim();
  if (!str) return 0;

  // Formato: 1.234,56 (PT/EU)
  if (str.includes(',') && str.includes('.')) {
    const normalized = str.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }
  
  // Formato: 1,234 (PT/EU decimal simples) ou 1,234.56 (US - handled above if both exist, but here only comma)
  // Assumindo que num ficheiro PT, virgula é decimal.
  if (str.includes(',')) {
    const normalized = str.replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }

  // Formato: 1.234 (PT milhar) ou 1.234 (US decimal)
  // No contexto industrial PT, 1.234 costuma ser 1234.
  // Vamos remover o ponto se houver, assumindo que é milhar, exceto se parecer muito pequeno?
  // Risco: 1.5Kg vs 1500 Unidades.
  // Heurística: Se tiver 3 digitos após ponto, é milhar.
  if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
       // Provavel milhar: 1.500 -> 1500
       const normalized = str.replace(/\./g, '');
       const num = parseFloat(normalized);
       return isNaN(num) ? 0 : num;
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const getOrderState = (order: Order): OrderState => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const isCompleted = order.qtyOpen === 0 || (order.stockCxQty >= order.qtyRequested && order.qtyRequested > 0);
  if (isCompleted) return OrderState.COMPLETED;
  
  if (order.dataTec && order.dataTec < now && order.felpoCruQty < order.qtyRequested) return OrderState.LATE;
  if (order.felpoCruDate && order.felpoCruDate < now && order.felpoCruQty < order.qtyRequested) return OrderState.LATE;
  
  const confTotal = order.confRoupoesQty + order.confFelposQty;
  if (order.tinturariaDate && order.tinturariaDate < now && confTotal < order.qtyRequested) return OrderState.LATE;
  if (order.confDate && order.confDate < now && order.embAcabQty < order.qtyRequested) return OrderState.LATE;

  if (order.requestedDate && order.requestedDate < now && order.qtyOpen > 0) return OrderState.LATE;
  
  const hasStarted = order.felpoCruQty > 0 || order.tinturariaQty > 0 || confTotal > 0 || order.embAcabQty > 0;
  if (hasStarted) return OrderState.IN_PRODUCTION;
  
  return OrderState.OPEN;
};

export const getSectorState = (order: Order, sectorId: string): SectorState => {
  let qty = 0;
  switch (sectorId) {
    // Tecelagem e Felpo Cru partilham o mesmo campo de quantidade (felpoCruQty).
    case 'tecelagem': qty = order.felpoCruQty; break;
    case 'felpo_cru': qty = order.felpoCruQty; break;
    case 'tinturaria': qty = order.tinturariaQty; break;
    case 'confeccao': qty = order.confRoupoesQty + order.confFelposQty; break;
    case 'embalagem': qty = order.embAcabQty; break;
    case 'expedicao': qty = order.stockCxQty; break;
  }

  if (order.qtyRequested > 0 && qty >= order.qtyRequested) return SectorState.COMPLETED;
  if (qty > 0) return SectorState.IN_PROGRESS;
  return SectorState.NOT_STARTED;
};

// Helper para obter o início e fim da semana
export const getWeekRange = (date: Date) => {
    const current = new Date(date);
    // Ajustar para o início do dia para evitar problemas de hora
    current.setHours(0, 0, 0, 0);
    
    // Obter o dia da semana (0 = Domingo, 1 = Segunda, ...)
    const day = current.getDay();
    
    // Calcular a diferença para chegar a Segunda-feira (considerando Domingo como dia 0, queremos que a semana comece na Segunda anterior)
    // Se for Domingo (0), diff é -6. Se for Segunda (1), diff é 0.
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    
    const startOfWeek = new Date(current.setDate(diff));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { start: startOfWeek, end: endOfWeek };
};

export const calculateKPIs = (orders: Order[]): DashboardKPIs => {
  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  // 1. Encomendas Ativas (Contagem por Documento Único)
  // Considera ativas as que não estão totalmente concluídas/faturadas (qtyOpen > 0)
  const activeOrders = orders.filter(o => o.qtyOpen > 0);
  const uniqueActiveDocs = new Set(activeOrders.map(o => o.docNr));

  // 2. Atrasadas (Qualquer sector)
  const late = orders.filter(o => getOrderState(o) === OrderState.LATE);

  // 3. Entregas da Semana (Baseado na Data de Pedido/Expedição)
  // Considera orders com data pedida dentro da semana corrente
  const ordersThisWeek = orders.filter(o => {
    // Usa requestedDate como data principal de entrega, fallback para armExpDate
    const dateToCheck = o.requestedDate || o.armExpDate; 
    return dateToCheck && dateToCheck >= weekStart && dateToCheck <= weekEnd;
  });
  
  const deliveriesThisWeek = ordersThisWeek.length;

  // 4. Taxa de Conclusão Semanal
  // (Encomendas desta semana que estão Concluídas) / (Total de encomendas desta semana)
  const completedThisWeek = ordersThisWeek.filter(o => {
      const state = getOrderState(o);
      // Se estado for COMPLETED ou se já estiverem em Expedição (último setor antes de faturar)
      return state === OrderState.COMPLETED || getSectorState(o, 'expedicao') === SectorState.COMPLETED || getSectorState(o, 'expedicao') === SectorState.IN_PROGRESS;
  }).length;

  const fulfillmentRateWeek = deliveriesThisWeek > 0 ? (completedThisWeek / deliveriesThisWeek) * 100 : 0;

  return {
    totalActiveDocs: uniqueActiveDocs.size,
    totalLate: late.length,
    deliveriesThisWeek: deliveriesThisWeek,
    fulfillmentRateWeek: fulfillmentRateWeek,
    totalInProduction: activeOrders.length,
    billedVsOpen: { 
      billed: orders.reduce((acc, o) => acc + o.qtyBilled, 0), 
      open: orders.reduce((acc, o) => acc + o.qtyOpen, 0) 
    }
  };
};

// --- IMPORTAÇÃO DE EXCEL (.xlsx) ---
//
// Suporta dois formatos de forma automática:
//
// FORMATO ERP (cabeçalhos em português, ex: "Nr.Documento", "Data Pedida"):
//   Leitura por LETRA DE COLUNA DIRECTA — sem depender de ordenação de Object.keys().
//   O ficheiro ERP tem 35 colunas (A a AI):
//
//   A=clientCode(Série)  B=docNr        C=clientName    D=issueDate      E=requestedDate
//   F=itemNr             G=po           H=articleCode   I=reference      J=colorCode
//   K=colorDesc          L=comercial    M=family        N=sizeDesc       O=ean
//   P=qtyRequested       Q=dataTec      R=felpoCruQty   S=felpoCruDate   T=tinturariaQty
//   U=tinturariaDate     V=confRoupoesQty W=confFelposQty X=confDate     Y=embAcabQty
//   Z=armExpDate         AA=stockCxQty  AB=dataEnt      AC=dataEspecial  AD=dataPrinter
//   AE=dataDebuxo        AF=dataAmostras AG=dataBordados AH=qtyBilled    AI=qtyOpen
//
// FORMATO APP (cabeçalhos = nomes internos, ex: "docNr", "qtyRequested"):
//   Detetado pela presença de "docNr" E/OU "qtyBilled" como valores de cabeçalho.
//   Leitura por NOME DE CAMPO via mapa invertido cabeçalho→letra.
//
export const parseExcelFile = async (file: File): Promise<{ orders: Order[], headers: Record<string, string> }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        // Preferir folha 'Dados_BD' se existir (exportação app), senão usar a primeira
        const sheetName = workbook.SheetNames.includes('Dados_BD')
            ? 'Dados_BD'
            : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 'A' });
        if (jsonData.length === 0) return resolve({ orders: [], headers: {} });

        // Linha 1 = cabeçalhos
        const headerRow = jsonData.shift() as Record<string, any>;
        const extractedHeaders: Record<string, string> = {};
        Object.entries(headerRow).forEach(([k, v]) => {
            extractedHeaders[k] = String(v ?? '');
        });

        // Deteção de formato: o export da app usa nomes internos como cabeçalhos.
        // "docNr" e "qtyBilled" nunca aparecem como cabeçalhos ERP.
        const headerValues = Object.values(extractedHeaders).map(v => v.trim());
        const isAppExport = headerValues.includes('docNr') || headerValues.includes('qtyBilled');

        // Para formato app: construir mapa fieldName → colLetter a partir dos cabeçalhos
        const fieldToCol: Record<string, string> = {};
        if (isAppExport) {
            Object.entries(extractedHeaders).forEach(([letter, name]) => {
                const trimmed = name.trim();
                if (trimmed) fieldToCol[trimmed] = letter;
            });
        }

        // get() para formato app: lookup por nome
        // get() para formato ERP: acesso directo à letra de coluna
        const getApp = (row: any, fieldName: string): any => {
            const col = fieldToCol[fieldName];
            return col !== undefined ? row[col] : undefined;
        };

        const parseJsonField = (val: any, fallback: any = {}) => {
            if (!val) return fallback;
            if (typeof val === 'object' && !Array.isArray(val)) return val;
            try { return JSON.parse(String(val)); } catch { return fallback; }
        };

        const parseBool = (val: any): boolean =>
            val === 1 || val === true || val === '1' || String(val).toLowerCase() === 'true';

        const mappedOrders: Order[] = [];

        for (let i = 0; i < jsonData.length; i++) {
            const row: any = jsonData[i];

            // Obter docNr consoante o formato
            const rawDocNr = isAppExport ? getApp(row, 'docNr') : row['B'];
            if (!rawDocNr || String(rawDocNr).toLowerCase().includes('nr.doc') || String(rawDocNr).trim() === '') continue;

            const docNr  = String(rawDocNr).trim();

            let order: Order;

            if (isAppExport) {
                // --- FORMATO APP: leitura por nome de campo ---
                const itemNr = parseNumber(getApp(row, 'itemNr'));
                order = {
                    _raw: row,
                    id:            String(getApp(row, 'id') || '').trim() || `${docNr}-${itemNr}`,
                    docSeries:     String(getApp(row, 'docSeries')     ?? '').trim(),
                    docNr,
                    clientCode:    String(getApp(row, 'clientCode')    ?? '').trim(),
                    clientName:    String(getApp(row, 'clientName')    ?? '').trim(),
                    comercial:     String(getApp(row, 'comercial')     ?? '').trim(),
                    issueDate:     parseExcelDate(getApp(row, 'issueDate')),
                    requestedDate: parseExcelDate(getApp(row, 'requestedDate')),
                    itemNr,
                    po:            String(getApp(row, 'po')            ?? '').trim(),
                    articleCode:   String(getApp(row, 'articleCode')   ?? '').trim(),
                    reference:     String(getApp(row, 'reference')     ?? '').trim(),
                    colorCode:     String(getApp(row, 'colorCode')     ?? '').trim(),
                    colorDesc:     String(getApp(row, 'colorDesc')     ?? '').trim(),
                    size:          '',
                    family:        String(getApp(row, 'family')        ?? '').trim(),
                    sizeDesc:      String(getApp(row, 'sizeDesc')      ?? '').trim(),
                    ean:           String(getApp(row, 'ean')           ?? '').trim(),
                    qtyRequested:  parseNumber(getApp(row, 'qtyRequested')),
                    dataTec:       parseExcelDate(getApp(row, 'dataTec')),
                    felpoCruQty:   parseNumber(getApp(row, 'felpoCruQty')),
                    felpoCruDate:  parseExcelDate(getApp(row, 'felpoCruDate')),
                    tinturariaQty: parseNumber(getApp(row, 'tinturariaQty')),
                    tinturariaDate:parseExcelDate(getApp(row, 'tinturariaDate')),
                    confRoupoesQty:parseNumber(getApp(row, 'confRoupoesQty')),
                    confFelposQty: parseNumber(getApp(row, 'confFelposQty')),
                    confDate:      parseExcelDate(getApp(row, 'confDate')),
                    embAcabQty:    parseNumber(getApp(row, 'embAcabQty')),
                    armExpDate:    parseExcelDate(getApp(row, 'armExpDate')),
                    stockCxQty:    parseNumber(getApp(row, 'stockCxQty')),
                    dataEnt:       parseExcelDate(getApp(row, 'dataEnt')),
                    qtyBilled:     parseNumber(getApp(row, 'qtyBilled')),
                    qtyOpen:       parseNumber(getApp(row, 'qtyOpen')),
                    dataEspecial:  parseExcelDate(getApp(row, 'dataEspecial')),
                    dataPrinter:   parseExcelDate(getApp(row, 'dataPrinter')),
                    dataDebuxo:    parseExcelDate(getApp(row, 'dataDebuxo')),
                    dataAmostras:  parseExcelDate(getApp(row, 'dataAmostras')),
                    dataBordados:  parseExcelDate(getApp(row, 'dataBordados')),
                    priority:      parseNumber(getApp(row, 'priority')) || 0,
                    isManual:      parseBool(getApp(row, 'isManual')),
                    sectorObservations:  parseJsonField(getApp(row, 'sectorObservations'), {}),
                    sectorPredictedDates: (() => {
                        const raw = parseJsonField(getApp(row, 'sectorPredictedDates'), {});
                        const result: Record<string, Date | null> = {};
                        Object.entries(raw).forEach(([k, v]) => { result[k] = v ? new Date(v as string) : null; });
                        return result;
                    })(),
                    sectorPredictedDatesPending: (() => {
                        const raw = parseJsonField(getApp(row, 'sectorPredictedDatesPending'), {});
                        const result: Record<string, boolean> = {};
                        Object.entries(raw).forEach(([k, v]) => { result[k] = Boolean(v); });
                        return result;
                    })(),
                    sectorStopReasons:  parseJsonField(getApp(row, 'sectorStopReasons'), {}),
                    isArchived:  parseBool(getApp(row, 'isArchived')),
                    archivedAt:  parseExcelDate(getApp(row, 'archivedAt')),
                    archivedBy:  String(getApp(row, 'archivedBy') ?? '').trim() || undefined,
                };
            } else {
                // --- FORMATO ERP: acesso DIRECTO por letra de coluna ---
                // Cada campo usa explicitamente a letra da coluna real do ficheiro ERP.
                // Sem arrays, sem índices calculados — impossível ter off-by-one.
                const itemNr = parseNumber(row['F']);
                order = {
                    _raw: row,
                    id:            `${docNr}-${itemNr}`,
                    docSeries:     String(row['A']  ?? '').trim(),  // A  Série do documento
                    docNr,
                    clientCode:    '',                               // Não existe no ERP
                    clientName:    String(row['C']  ?? '').trim(),  // C  Cliente
                    comercial:     String(row['L']  ?? '').trim(),  // Comercial
                    issueDate:     parseExcelDate(row['D']),         // Data Emissão
                    requestedDate: parseExcelDate(row['E']),         // Data Pedida
                    itemNr,                                           // F  Item
                    po:            String(row['G']  ?? '').trim(),  // PO
                    articleCode:   String(row['H']  ?? '').trim(),  // Cod.Artigo
                    reference:     String(row['I']  ?? '').trim(),  // Referencia
                    colorCode:     String(row['J']  ?? '').trim(),  // Cor
                    colorDesc:     String(row['K']  ?? '').trim(),  // Descricao (cor)
                    size:          '',
                    family:        String(row['M']  ?? '').trim(),  // Familia
                    sizeDesc:      String(row['N']  ?? '').trim(),  // Descricao (tamanho)
                    ean:           String(row['O']  ?? '').trim(),  // EAN
                    qtyRequested:  parseNumber(row['P']),            // Qtd Pedida
                    dataTec:       parseExcelDate(row['Q']),         // Data Tec.
                    felpoCruQty:   parseNumber(row['R']),            // Felpo Cru
                    felpoCruDate:  parseExcelDate(row['S']),         // Data F.Cru
                    tinturariaQty: parseNumber(row['T']),            // Tinturaria
                    tinturariaDate:parseExcelDate(row['U']),         // Data Tint.
                    confRoupoesQty:parseNumber(row['V']),            // Confeccao Roupoes
                    confFelposQty: parseNumber(row['W']),            // Confeccao Felpos
                    confDate:      parseExcelDate(row['X']),         // Data Conf.
                    embAcabQty:    parseNumber(row['Y']),            // Emb./Acab.
                    armExpDate:    parseExcelDate(row['Z']),         // Data Arm. Exp.
                    stockCxQty:    parseNumber(row['AA']),           // Stock Cx.
                    dataEnt:       parseExcelDate(row['AB']),        // Data Ent.
                    dataEspecial:  parseExcelDate(row['AC']),        // Data Especial.
                    dataPrinter:   parseExcelDate(row['AD']),        // Data Printer.
                    dataDebuxo:    parseExcelDate(row['AE']),        // Data Debuxo.
                    dataAmostras:  parseExcelDate(row['AF']),        // Data Amostras.
                    dataBordados:  parseExcelDate(row['AG']),        // Data Bordados.
                    qtyBilled:     parseNumber(row['AH']),           // Facturada
                    qtyOpen:       parseNumber(row['AI']),           // Em Aberto
                    // Campos exclusivos da app — inexistentes no ERP, inicializar com padrões
                    priority:               0,
                    isManual:               false,
                    sectorObservations:     {},
                    sectorPredictedDates:   {},
                    sectorPredictedDatesPending: {},
                    sectorStopReasons:      {},
                    isArchived:             false,
                    archivedAt:             null,
                    archivedBy:             undefined,
                };
            }

            mappedOrders.push(order);
        }
        resolve({ orders: mappedOrders, headers: extractedHeaders });
      } catch (err) {
          console.error("Erro no processamento Excel:", err);
          reject(new Error("Erro ao processar ficheiro Excel."));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler ficheiro."));
    reader.readAsArrayBuffer(file);
  });
};

// --- IMPORTAÇÃO DE SQLITE ---
export const parseSQLiteFile = async (file: File): Promise<{ orders: Order[], headers: Record<string, string> }> => {
  const SQL = await getSql();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const Uints = new Uint8Array(e.target?.result as ArrayBuffer);
        const db = new SQL.Database(Uints);
        
        let headers: Record<string, string> = {};
        try {
            const headerStmt = db.prepare("SELECT key, value FROM headers");
            while(headerStmt.step()) {
                const row = headerStmt.getAsObject();
                headers[row.key as string] = row.value as string;
            }
            headerStmt.free();
        } catch (e) { console.warn("Tabela headers não encontrada."); }

        const result = db.exec("SELECT * FROM orders");
        if (result.length === 0) {
            resolve({ orders: [], headers });
            return;
        }

        const columns = result[0].columns;
        const values = result[0].values;
        
        const orders: Order[] = values.map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col, i) => obj[col] = row[i]);

            // Hidratar todos os campos de data (timestamps INTEGER → Date)
            const DATE_FIELDS = [
                'issueDate', 'requestedDate', 'dataTec', 'felpoCruDate', 'tinturariaDate',
                'confDate', 'armExpDate', 'dataEnt', 'dataEspecial', 'dataPrinter',
                'dataDebuxo', 'dataAmostras', 'dataBordados', 'archivedAt',
            ];
            DATE_FIELDS.forEach(field => {
                if (obj[field]) obj[field] = new Date(obj[field]);
                else obj[field] = null;
            });

            // Hidratar campos JSON
            ['sectorObservations', 'sectorStopReasons'].forEach(field => {
                if (obj[field]) {
                    try { obj[field] = JSON.parse(obj[field]); } catch { obj[field] = {}; }
                } else { obj[field] = {}; }
            });
            if (obj.sectorPredictedDates) {
                try {
                    const parsed = JSON.parse(obj.sectorPredictedDates);
                    Object.keys(parsed).forEach(k => {
                        if (parsed[k]) parsed[k] = new Date(parsed[k]);
                    });
                    obj.sectorPredictedDates = parsed;
                } catch { obj.sectorPredictedDates = {}; }
            } else { obj.sectorPredictedDates = {}; }

            if (obj.sectorPredictedDatesPending) {
                try { obj.sectorPredictedDatesPending = JSON.parse(obj.sectorPredictedDatesPending); }
                catch { obj.sectorPredictedDatesPending = {}; }
            } else { obj.sectorPredictedDatesPending = {}; }

            // Normalizar campos boolean
            obj.isManual   = obj.isManual  === 1 || obj.isManual  === true || obj.isManual  === '1';
            obj.isArchived = obj.isArchived === 1 || obj.isArchived === true || obj.isArchived === '1';

            // Valores por omissão para campos que possam estar ausentes em ficheiros antigos
            if (!obj.priority)   obj.priority  = 0;
            if (!obj.comercial)  obj.comercial  = '';
            if (obj.size === undefined)      obj.size      = '';
            if (obj.docSeries === undefined) obj.docSeries = '';
            if (obj.clientCode === undefined) obj.clientCode = '';

            return obj as Order;
        });
        
        db.close();
        resolve({ orders, headers });
      } catch (err) { reject(err); }
    };
    reader.readAsArrayBuffer(file);
  });
};

// --- EXPORTAÇÃO PARA SQLITE ---
export const exportOrdersToSQLite = async (orders: Order[], headers: Record<string, string>, directoryHandle?: any, customFileName?: string) => {
  const SQL = await getSql();
  const db = new SQL.Database();

  db.run("CREATE TABLE headers (key TEXT, value TEXT)");
  Object.entries(headers).forEach(([k, v]) => db.run("INSERT INTO headers VALUES (?, ?)", [k, v]));

  // Schema idêntico à estrutura da app (nomes internos = nomes das colunas SQLite)
  db.run(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      docSeries TEXT,
      clientCode TEXT, docNr TEXT, clientName TEXT, issueDate INTEGER,
      requestedDate INTEGER, itemNr INTEGER, po TEXT,
      articleCode TEXT, reference TEXT, colorCode TEXT, colorDesc TEXT,
      comercial TEXT, family TEXT, sizeDesc TEXT, ean TEXT,
      qtyRequested REAL, dataTec INTEGER,
      felpoCruQty REAL, felpoCruDate INTEGER,
      tinturariaQty REAL, tinturariaDate INTEGER,
      confRoupoesQty REAL, confFelposQty REAL, confDate INTEGER,
      embAcabQty REAL, armExpDate INTEGER, stockCxQty REAL,
      dataEnt INTEGER, dataEspecial INTEGER, dataPrinter INTEGER,
      dataDebuxo INTEGER, dataAmostras INTEGER, dataBordados INTEGER,
      qtyBilled REAL, qtyOpen REAL,
      priority INTEGER, isManual INTEGER,
      sectorObservations TEXT, sectorPredictedDates TEXT, sectorStopReasons TEXT,
      isArchived INTEGER, archivedAt INTEGER, archivedBy TEXT,
      size TEXT
    )
  `);

  db.run("BEGIN TRANSACTION");
  const stmt = db.prepare(`
    INSERT INTO orders VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
  `);

  orders.forEach(o => {
      const ts = (d: Date | null | undefined) => (d && !isNaN(d.getTime())) ? d.getTime() : null;
      stmt.run([
        o.id,
        o.docSeries || '',
        o.clientCode, o.docNr, o.clientName,
        ts(o.issueDate), ts(o.requestedDate),
        o.itemNr, o.po,
        o.articleCode, o.reference, o.colorCode, o.colorDesc,
        o.comercial, o.family, o.sizeDesc, o.ean,
        o.qtyRequested, ts(o.dataTec),
        o.felpoCruQty, ts(o.felpoCruDate),
        o.tinturariaQty, ts(o.tinturariaDate),
        o.confRoupoesQty, o.confFelposQty, ts(o.confDate),
        o.embAcabQty, ts(o.armExpDate), o.stockCxQty,
        ts(o.dataEnt), ts(o.dataEspecial), ts(o.dataPrinter),
        ts(o.dataDebuxo), ts(o.dataAmostras), ts(o.dataBordados),
        o.qtyBilled, o.qtyOpen,
        o.priority || 0,
        o.isManual ? 1 : 0,
        JSON.stringify(o.sectorObservations  || {}),
        JSON.stringify(o.sectorPredictedDates || {}),
        JSON.stringify(o.sectorStopReasons   || {}),
        o.isArchived ? 1 : 0,
        ts(o.archivedAt),
        o.archivedBy || null,
        o.size || '',
      ]);
  });

  stmt.free();
  db.run("COMMIT");

  const data = db.export();
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const fileName = customFileName || `Prod_Lasa_DB_${dateStr}.sqlite`;

  if (directoryHandle) {
    try {
      const hasPermission = await verifyPermission(directoryHandle, true);
      if (hasPermission) {
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return;
      }
    } catch (e) {
      console.error("Erro ao gravar na pasta configurada, usando fallback.", e);
    }
  }

  const blob = new Blob([data], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- EXPORTAÇÃO PARA EXCEL ---
//
// Ficheiro único com UMA só folha ("Dados_BD"), completamente reimportável pela app.
//
// Estrutura das colunas (igual ao ERP + campos exclusivos da app a seguir):
//   A=clientCode   B=docNr        C=clientName    D=issueDate      E=requestedDate
//   F=itemNr       G=po           H=articleCode   I=reference      J=colorCode
//   K=colorDesc    L=comercial    M=family        N=sizeDesc       O=ean
//   P=qtyRequested Q=dataTec      R=felpoCruQty   S=felpoCruDate   T=tinturariaQty
//   U=tinturariaDate V=confRoupoesQty W=confFelposQty X=confDate   Y=embAcabQty
//   Z=armExpDate   AA=stockCxQty  AB=dataEnt      AC=dataEspecial  AD=dataPrinter
//   AE=dataDebuxo  AF=dataAmostras AG=dataBordados AH=qtyBilled   AI=qtyOpen
//   -- campos app --
//   AJ=id  AK=docSeries  AL=priority  AM=isManual  AN=sectorObservations  AO=sectorPredictedDates
//   AP=sectorPredictedDatesPending  AQ=sectorStopReasons
//   AR=isArchived  AS=archivedAt  AT=archivedBy
//
// A 1ª linha contém os nomes internos dos campos (ex: "docNr", "qtyBilled").
// Na reimportação, a presença de "docNr" como valor de cabeçalho identifica
// este formato e activa a leitura por nome em vez de leitura posicional (ERP).
//
export const exportOrdersToExcel = (orders: Order[], headers: Record<string, string> = {}, customFileName?: string) => {
    if (orders.length === 0) return;

    // Converte Date → string DD/MM/AAAA; null/inválido → '' (parseExcelDate trata '' como null)
    const ts = (d: Date | null | undefined): string => {
        if (!d || isNaN(d.getTime())) return '';
        return formatDate(d);
    };

    // Serializa JSON de forma segura; null/undefined → '{}'
    const j = (v: any): string => JSON.stringify(v || {});

    const buildRow = (o: Order) => ({
        // === Campos ERP (A–AI) — mesma ordem do ficheiro ERP ===
        'clientCode':                   o.clientCode,           // A  Série
        'docNr':                        o.docNr,                // B  Nr.Documento
        'clientName':                   o.clientName,           // C  Cliente
        'issueDate':                    ts(o.issueDate),        // D  Data Emissão
        'requestedDate':                ts(o.requestedDate),    // E  Data Pedida
        'itemNr':                       o.itemNr,               // F  Item
        'po':                           o.po,                   // G  PO
        'articleCode':                  o.articleCode,          // H  Cod.Artigo
        'reference':                    o.reference,            // I  Referencia
        'colorCode':                    o.colorCode,            // J  Cor
        'colorDesc':                    o.colorDesc,            // K  Descricao (cor)
        'comercial':                    o.comercial,            // L  Comercial
        'family':                       o.family,               // M  Familia
        'sizeDesc':                     o.sizeDesc,             // N  Descricao (tamanho)
        'ean':                          o.ean,                  // O  EAN
        'qtyRequested':                 o.qtyRequested,         // P  Qtd Pedida
        'dataTec':                      ts(o.dataTec),          // Q  Data Tec.
        'felpoCruQty':                  o.felpoCruQty,          // R  Felpo Cru
        'felpoCruDate':                 ts(o.felpoCruDate),     // S  Data F.Cru
        'tinturariaQty':                o.tinturariaQty,        // T  Tinturaria
        'tinturariaDate':               ts(o.tinturariaDate),   // U  Data Tint.
        'confRoupoesQty':               o.confRoupoesQty,       // V  Confeccao Roupoes
        'confFelposQty':                o.confFelposQty,        // W  Confeccao Felpos
        'confDate':                     ts(o.confDate),         // X  Data Conf.
        'embAcabQty':                   o.embAcabQty,           // Y  Emb./Acab.
        'armExpDate':                   ts(o.armExpDate),       // Z  Data Arm. Exp.
        'stockCxQty':                   o.stockCxQty,           // AA Stock Cx.
        'dataEnt':                      ts(o.dataEnt),          // AB Data Ent.
        'dataEspecial':                 ts(o.dataEspecial),     // AC Data Especial.
        'dataPrinter':                  ts(o.dataPrinter),      // AD Data Printer.
        'dataDebuxo':                   ts(o.dataDebuxo),       // AE Data Debuxo.
        'dataAmostras':                 ts(o.dataAmostras),     // AF Data Amostras.
        'dataBordados':                 ts(o.dataBordados),     // AG Data Bordados.
        'qtyBilled':                    o.qtyBilled,            // AH Facturada
        'qtyOpen':                      o.qtyOpen,              // AI Em Aberto
        // === Campos exclusivos da app (AJ–AT) ===
        'id':                           o.id,                                   // AJ
        'docSeries':                    o.docSeries || '',                      // AK  Série do documento
        'priority':                     o.priority || 0,                        // AK
        'isManual':                     o.isManual ? 1 : 0,                     // AL
        'sectorObservations':           j(o.sectorObservations),                // AM
        'sectorPredictedDates':         j(o.sectorPredictedDates),              // AN
        'sectorPredictedDatesPending':  j(o.sectorPredictedDatesPending),       // AO
        'sectorStopReasons':            j(o.sectorStopReasons),                 // AP
        'isArchived':                   o.isArchived ? 1 : 0,                   // AQ
        'archivedAt':                   ts(o.archivedAt),                       // AR
        'archivedBy':                   o.archivedBy || '',                     // AS
    });

    const sheetData = orders.map(buildRow);

    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    // Largura automática: datas=12, JSON=30, resto=18
    const colWidths = Object.keys(sheetData[0]).map(k => {
        if (k.startsWith('sector') || k === 'reference' || k === 'clientName') return { wch: 30 };
        if (k.includes('Date') || k.includes('date') || k.includes('Date') || k === 'issueDate' || k === 'requestedDate' || k === 'dataEnt' || k === 'archivedAt') return { wch: 14 };
        return { wch: 18 };
    });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(workbook, ws, 'Dados_BD');

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
    const fileName = customFileName || `Prod_Lasa_Export_${dateStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

// --- DEFINIÇÃO GLOBAL DE TODAS AS COLUNAS DISPONÍVEIS PARA EXPORTAÇÃO ---
export interface ExportColumnDef {
  key: string;        // chave interna
  label: string;      // nome legível para o utilizador
  group: string;      // grupo para organização visual
}

export const ALL_EXPORT_COLUMNS: ExportColumnDef[] = [
  // Identificação
  { key: 'docSeries',      label: 'Série',               group: 'Identificação' },
  { key: 'docNr',          label: 'Nr. Documento',       group: 'Identificação' },
  { key: 'itemNr',         label: 'Item',                group: 'Identificação' },
  { key: 'id',             label: 'ID Interno',          group: 'Identificação' },
  // Cliente
  { key: 'clientName',    label: 'Cliente',              group: 'Cliente' },
  { key: 'clientCode',    label: 'Cód. Cliente',         group: 'Cliente' },
  { key: 'comercial',     label: 'Comercial',            group: 'Cliente' },
  { key: 'po',            label: 'PO',                   group: 'Cliente' },
  // Artigo
  { key: 'articleCode',   label: 'Artigo',               group: 'Artigo' },
  { key: 'reference',     label: 'Referência',           group: 'Artigo' },
  { key: 'colorCode',     label: 'Cód. Cor',             group: 'Artigo' },
  { key: 'colorDesc',     label: 'Cor',                  group: 'Artigo' },
  { key: 'size',          label: 'Tamanho',              group: 'Artigo' },
  { key: 'sizeDesc',      label: 'Desc. Tamanho',        group: 'Artigo' },
  { key: 'family',        label: 'Família',              group: 'Artigo' },
  { key: 'ean',           label: 'EAN',                  group: 'Artigo' },
  // Quantidades
  { key: 'qtyRequested',  label: 'Qtd. Pedida',          group: 'Quantidades' },
  { key: 'qtyBilled',     label: 'Qtd. Faturada',        group: 'Quantidades' },
  { key: 'qtyOpen',       label: 'Qtd. Em Aberto',       group: 'Quantidades' },
  { key: 'felpoCruQty',   label: 'Qtd. Felpo Cru',       group: 'Quantidades' },
  { key: 'tinturariaQty', label: 'Qtd. Tinturaria',      group: 'Quantidades' },
  { key: 'confRoupoesQty',label: 'Qtd. Conf. Roupões',   group: 'Quantidades' },
  { key: 'confFelposQty', label: 'Qtd. Conf. Felpos',    group: 'Quantidades' },
  { key: 'embAcabQty',    label: 'Qtd. Embalagem',       group: 'Quantidades' },
  { key: 'stockCxQty',    label: 'Qtd. Stock Caixa',     group: 'Quantidades' },
  // Datas
  { key: 'issueDate',     label: 'Data Emissão',         group: 'Datas' },
  { key: 'requestedDate', label: 'Data Entrega Pedida',  group: 'Datas' },
  { key: 'dataEnt',       label: 'Data Entrada',         group: 'Datas' },
  { key: 'dataTec',       label: 'Data Tecelagem',       group: 'Datas' },
  { key: 'felpoCruDate',  label: 'Data Felpo Cru',       group: 'Datas' },
  { key: 'tinturariaDate',label: 'Data Tinturaria',      group: 'Datas' },
  { key: 'confDate',      label: 'Data Confecção',       group: 'Datas' },
  { key: 'armExpDate',    label: 'Data Prev. Armazém',   group: 'Datas' },
  // Datas Especiais
  { key: 'dataEspecial',  label: 'Data Especial',        group: 'Datas Especiais' },
  { key: 'dataPrinter',   label: 'Data Printer',         group: 'Datas Especiais' },
  { key: 'dataDebuxo',    label: 'Data Debuxo',          group: 'Datas Especiais' },
  { key: 'dataAmostras',  label: 'Data Amostras',        group: 'Datas Especiais' },
  { key: 'dataBordados',  label: 'Data Bordados',        group: 'Datas Especiais' },
  // Estado / Aplicação
  { key: 'estado',        label: 'Estado',               group: 'Estado / App' },
  { key: 'priority',      label: 'Prioridade',           group: 'Estado / App' },
  { key: 'isManual',      label: 'Conf. Manual',         group: 'Estado / App' },
  { key: 'isArchived',    label: 'Arquivado',            group: 'Estado / App' },
  { key: 'archivedAt',    label: 'Arquivado Em',         group: 'Estado / App' },
  { key: 'archivedBy',    label: 'Arquivado Por',        group: 'Estado / App' },
  // Observações por Sector
  { key: 'obs_tecelagem', label: 'Obs. Tecelagem',       group: 'Observações' },
  { key: 'obs_felpo_cru', label: 'Obs. Felpo Cru',       group: 'Observações' },
  { key: 'obs_tinturaria',label: 'Obs. Tinturaria',      group: 'Observações' },
  { key: 'obs_confeccao', label: 'Obs. Confecção',       group: 'Observações' },
  { key: 'obs_embalagem', label: 'Obs. Embalagem',       group: 'Observações' },
  { key: 'obs_expedicao', label: 'Obs. Expedição',       group: 'Observações' },
  // Datas Previstas por Sector
  { key: 'prev_tecelagem',label: 'Prev. Tecelagem',      group: 'Datas Previstas' },
  { key: 'prev_felpo_cru',label: 'Prev. Felpo Cru',      group: 'Datas Previstas' },
  { key: 'prev_tinturaria',label:'Prev. Tinturaria',     group: 'Datas Previstas' },
  { key: 'prev_confeccao',label: 'Prev. Confecção',      group: 'Datas Previstas' },
  { key: 'prev_embalagem',label: 'Prev. Embalagem',      group: 'Datas Previstas' },
  { key: 'prev_expedicao',label: 'Prev. Expedição',      group: 'Datas Previstas' },
  // Motivos de Paragem por Sector
  { key: 'stop_tecelagem',label: 'Motivo Tecelagem',     group: 'Motivos de Paragem' },
  { key: 'stop_felpo_cru',label: 'Motivo Felpo Cru',     group: 'Motivos de Paragem' },
  { key: 'stop_tinturaria',label:'Motivo Tinturaria',    group: 'Motivos de Paragem' },
  { key: 'stop_confeccao',label: 'Motivo Confecção',     group: 'Motivos de Paragem' },
  { key: 'stop_embalagem',label: 'Motivo Embalagem',     group: 'Motivos de Paragem' },
  { key: 'stop_expedicao',label: 'Motivo Expedição',     group: 'Motivos de Paragem' },
];

export const DEFAULT_SELECTED_COLUMNS: string[] = [
  'docNr', 'itemNr', 'clientName', 'comercial', 'po',
  'reference', 'colorDesc', 'sizeDesc', 'family',
  'qtyRequested', 'qtyOpen', 'requestedDate', 'estado', 'priority',
];

// --- PERSISTÊNCIA DE CONFIGURAÇÃO DE COLUNAS ---
export const saveExportColumnsConfig = async (selectedKeys: string[]) => {
  const { error } = await supabase.from('app_state').upsert({
    key: 'export_columns_config',
    value: selectedKeys
  });
  if (error) console.error("Error saving export columns config", error);
};

export const loadExportColumnsConfig = async (): Promise<string[] | null> => {
  const { data, error } = await supabase.from('app_state').select('value').eq('key', 'export_columns_config').single();
  if (error || !data) return null;
  return data.value;
};

// Helper para obter o valor de uma coluna a partir de uma Order
const getColumnValue = (order: Order, key: string): any => {
  const dateFields = ['issueDate','requestedDate','dataEnt','dataTec','felpoCruDate',
    'tinturariaDate','confDate','armExpDate','dataEspecial','dataPrinter',
    'dataDebuxo','dataAmostras','dataBordados','archivedAt'];

  if (key === 'estado') return getOrderState(order);
  if (key === 'priority') return order.priority === 1 ? 'Alta' : order.priority === 2 ? 'Média' : order.priority === 3 ? 'Baixa' : '';
  if (key === 'isManual') return order.isManual ? 'Sim' : 'Não';
  if (key === 'isArchived') return order.isArchived ? 'Sim' : 'Não';

  if (key.startsWith('obs_')) {
    const sectorId = key.replace('obs_', '');
    return order.sectorObservations?.[sectorId] || '';
  }
  if (key.startsWith('prev_')) {
    const sectorId = key.replace('prev_', '');
    return formatDate(order.sectorPredictedDates?.[sectorId]);
  }
  if (key.startsWith('stop_')) {
    const sectorId = key.replace('stop_', '');
    return order.sectorStopReasons?.[sectorId] || '';
  }

  const val = (order as any)[key];
  if (dateFields.includes(key) && val) return formatDate(val);
  return val ?? '';
};

// --- EXPORTAÇÃO PERSONALIZADA (com colunas e ordem configuradas) ---
export const exportCustomColumns = (
  orders: Order[],
  selectedColumnKeys: string[],
  customFileName?: string
) => {
  if (orders.length === 0 || selectedColumnKeys.length === 0) return;

  const colDefs = selectedColumnKeys
    .map(k => ALL_EXPORT_COLUMNS.find(c => c.key === k))
    .filter(Boolean) as ExportColumnDef[];

  const sheetData = orders.map(order => {
    const row: Record<string, any> = {};
    colDefs.forEach(col => {
      row[col.label] = getColumnValue(order, col.key);
    });
    return row;
  });

  const workbook = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws['!cols'] = Array(colDefs.length).fill({ wch: 22 });
  XLSX.utils.book_append_sheet(workbook, ws, 'Exportação');

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${day}-${month}-${year}`;
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const fileName = customFileName || `Prod_Lasa_Personalizado_${dateStr}_${timeStr}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const saveCapacitiesToDB = async (capacities: any[]) => {
  // Clear existing
  await supabase.from('production_capacities').delete().not('id', 'is', null);
  
  // Insert new
  if (capacities.length > 0) {
      const toInsert = capacities.map(c => ({
          id: c.id,
          sector_id: c.sectorId,
          label: c.label,
          article_code: c.articleCode,
          family: c.family,
          reference: c.reference,
          color_code: c.colorCode,
          size: c.size,
          pieces_per_hour: c.piecesPerHour,
          hours_per_day: c.hoursPerDay
      }));
      await supabase.from('production_capacities').insert(toInsert);
  }
};

export const loadCapacitiesFromDB = async (): Promise<any[]> => {
  const { data: caps, error } = await supabase.from('production_capacities').select('*');
  if (error || !caps) return [];
  
  return caps.map((c: any) => ({
      id: c.id,
      sectorId: c.sector_id,
      label: c.label,
      articleCode: c.article_code,
      family: c.family,
      reference: c.reference,
      colorCode: c.color_code,
      size: c.size,
      piecesPerHour: parseFloat(c.pieces_per_hour || 0),
      hoursPerDay: parseFloat(c.hours_per_day || 0)
  }));
};

export const generateMockOrders = (count: number = 20): Order[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `order-${i}`,
    docSeries: '525',
    docNr: `ENC-2024-${1000 + i}`,
    clientCode: `C${100 + i}`,
    clientName: "CLIENTE EXEMPLO " + i,
    comercial: "COMERCIAL " + (i % 3 + 1),
    issueDate: new Date(),
    requestedDate: new Date(Date.now() + 86400000 * 10),
    itemNr: 1,
    po: `PO-${5000 + i}`,
    articleCode: `ART-${200 + i}`,
    reference: `REF-${300 + i}`,
    colorCode: "COR-01",
    colorDesc: "AZUL",
    size: "L",
    family: "BANHO",
    sizeDesc: "100x150",
    ean: "5601234567890",
    qtyRequested: 100,
    dataTec: new Date(),
    felpoCruQty: 0, felpoCruDate: null,
    tinturariaQty: 0, tinturariaDate: null,
    confRoupoesQty: 0, confFelposQty: 0, confDate: null,
    embAcabQty: 0, armExpDate: null,
    stockCxQty: 0,
    dataEnt: new Date(Date.now() + 86400000 * 10),
    dataEspecial: null, dataPrinter: null, dataDebuxo: null, dataAmostras: null, dataBordados: null,
    qtyBilled: 0, qtyOpen: 100,
    sectorObservations: {},
    priority: 0,
    isManual: false
  }));
};

export const parseDataFile = async (file: File): Promise<{ orders: Order[], headers: Record<string, string> }> => {
    if (file.name.endsWith('.sqlite') || file.name.endsWith('.db')) {
        return parseSQLiteFile(file);
    }
    return parseExcelFile(file);
};
