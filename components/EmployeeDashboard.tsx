import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SaleRecord, Product, DailyStat } from '../types';
import { ShoppingBag, AlertTriangle, Clock, IndianRupee, PackageCheck } from 'lucide-react';

interface EmployeeDashboardProps {
  sales: SaleRecord[];
  products: Product[];
  dailyStats: DailyStat[];
  locationLabel?: string;
}

const isToday = (date: Date) => {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

const StatCard = ({ title, value, sub, icon: Icon, colorClass, bgClass }: any) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {sub && <p className={`text-xs mt-2 font-medium ${colorClass}`}>{sub}</p>}
      </div>
      <div className={`p-3 rounded-xl ${bgClass}`}>
        <Icon className={colorClass} size={22} />
      </div>
    </div>
  </div>
);

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ sales, products, dailyStats, locationLabel }) => {
  const todaySales = sales.filter(sale => isToday(sale.timestamp));
  const todayCount = todaySales.length;
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const getItemProfit = (item: SaleRecord['items'][number]) => {
    const price = Number(item?.price ?? 0);
    const cost = Number(item?.cost ?? 0);
    const quantity = Number(item?.quantity ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(cost) || !Number.isFinite(quantity)) return 0;
    return (price - cost) * quantity;
  };
  const getItemRevenue = (item: SaleRecord['items'][number]) => {
    const price = Number(item?.price ?? 0);
    const quantity = Number(item?.quantity ?? 0);
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) return 0;
    return price * quantity;
  };

  const totalProfit = sales.reduce((sum, sale) => {
    return sum + sale.items.reduce((profitSum, item) => profitSum + getItemProfit(item), 0);
  }, 0);
  const safeTotalProfit = Number.isFinite(totalProfit) ? totalProfit : 0;

  const profitMap = new Map<string, { profit: number; quantity: number; revenue: number }>();
  sales.forEach((sale) => {
    sale.items.forEach((item) => {
      const existing = profitMap.get(item.name) || { profit: 0, quantity: 0, revenue: 0 };
      existing.profit += getItemProfit(item);
      existing.quantity += Number(item.quantity ?? 0);
      existing.revenue += getItemRevenue(item);
      profitMap.set(item.name, existing);
    });
  });

  const topProfitProducts = Array.from(profitMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 6);

  const recentSales = [...sales]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 6);

  return (
    <div className="space-y-8 animate-fade-in">
      {locationLabel && (
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Your branch</p>
          <h2 className="text-lg font-semibold text-slate-800">{locationLabel}</h2>
        </div>
      )}
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Today's Transactions"
          value={todayCount}
          sub="Completed sales you've recorded today"
          icon={ShoppingBag}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatCard
          title="Today's Revenue"
          value={`₹${todayRevenue.toFixed(2)}`}
          sub="Revenue generated today"
          icon={IndianRupee}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard
          title="Total Profit"
          value={`₹${safeTotalProfit.toFixed(2)}`}
          sub="Profit since launch"
          icon={IndianRupee}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-96">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold text-slate-800">Sales Trend</h3>
              <p className="text-sm text-slate-500">Store sales performance over the past week.</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span> Last 7 days
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(value) => `₹${value / 1000}k`} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value: number) => [`₹${value}`, 'Sales']} />
                <Area type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={3} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit Watchlist */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-96">
          <div className="mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
              <IndianRupee className="text-emerald-500" size={18} />
              Profit Watchlist
            </h3>
            <p className="text-sm text-slate-500 mt-2">Your highest earning products.</p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {topProfitProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                <PackageCheck className="text-emerald-400" size={28} />
                <span className="text-sm">No profit items available.</span>
              </div>
            ) : (
              topProfitProducts.map(product => (
                <div key={product.name} className="rounded-2xl bg-slate-50 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.quantity} sold</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">₹{product.profit.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">₹{product.revenue.toFixed(2)} revenue</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Recent Transactions</h3>
          <p className="text-sm text-slate-500 mt-1">Latest sales recorded by the team.</p>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentSales.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">No sales recorded yet.</td></tr>
              ) : (
                recentSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-slate-600 text-sm">
                        <Clock size={14} className="text-slate-400" />
                        {sale.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-800 font-medium">{sale.items.length} items</div>
                      <div className="text-xs text-slate-400 truncate max-w-[200px]">
                        {sale.items.map(i => i.name).join(', ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {sale.customerId ? 'Registered Customer' : 'Walk-in Customer'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-800">
                      ₹{sale.total.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
