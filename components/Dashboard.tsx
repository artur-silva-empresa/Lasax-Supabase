
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, AlertCircle, Calendar, CheckCircle2 } from 'lucide-react';
import { Order, DashboardKPIs } from '../types';
import { calculateKPIs, getWeekRange } from '../services/dataService';
import { SECTORS } from '../constants';
import { ActiveFilterType } from './OrderTable';

interface DashboardProps {
  orders: Order[];
  onNavigateToOrders?: (filter: ActiveFilterType) => void;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ orders, onNavigateToOrders }) => {
  const kpis = calculateKPIs(orders);

  // Status Data precisa ser ajustado para refletir contagens totais, 
  // mas o KPI de ativas agora é por DOC, aqui mantemos por linha para o gráfico de pizza ser preciso na carga
  const statusData = [
    { name: 'Em Produção', value: kpis.totalInProduction - kpis.totalLate }, 
    { name: 'Atrasadas', value: kpis.totalLate },
    { name: 'Concluídas', value: orders.filter(o => o.qtyOpen === 0).length },
  ];

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

        {/* Charts Grid Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest mb-1">Carga por Sector (Em Falta)</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">Total de encomendas para execução em cada secção nas próximas 4 semanas (Documentos Únicos).</p>
            <div className="w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-max text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">Sector</th>
                    {weeklyLoadData.columns.map((col, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {weeklyLoadData.data.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 py-1 px-2 rounded-md font-medium text-xs">
                           {row.w0} Docs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 py-1 px-2 rounded-md font-medium text-xs">
                           {row.w1} Docs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <span className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 py-1 px-2 rounded-md font-medium text-xs">
                           {row.w2} Docs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <span className="bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 py-1 px-2 rounded-md font-medium text-xs">
                           {row.w3} Docs
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de Pizza de Estados */}
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
            <h3 className="font-black text-slate-700 dark:text-slate-200 text-xs uppercase tracking-widest mb-4">Distribuição por Estado</h3>
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

        {/* Charts Grid Row 2 */}
        <div className="grid grid-cols-1 gap-4 md:gap-6">
          {/* Gráfico de Progresso por Sector (Barras Verticais) */}
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
