import React, { useMemo, useState, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShoppingBag, AlertTriangle, IndianRupee, Clock, Download, Calendar } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { SaleRecord, Product, DailyStat } from '../types';

interface BranchSummary {
  id: string;
  name: string;
  cityName: string;
  sales: number;
  orders: number;
}

interface DashboardProps {
  sales: SaleRecord[];
  products: Product[];
  dailyStats: DailyStat[];
  locationLabel?: string;
  branchSummaries?: BranchSummary[];
  selectedBranchId?: string | null;
  onSelectBranch?: (branchId: string | null) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ sales, products, dailyStats, locationLabel, branchSummaries = [], selectedBranchId = null, onSelectBranch }) => {
  const [reportRange, setReportRange] = useState<'DATE' | 'WEEK' | 'MONTH' | 'YEAR'>('WEEK');
  const [reportText, setReportText] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [rangeSelection, setRangeSelection] = useState<{ from?: Date; to?: Date }>({});
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const totalOrders = sales.length;
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

  const getWeeklySalesData = () => {
    const today = new Date();
    const last7Days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const label = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayTotal = sales
        .filter((sale) => {
          const saleDate = new Date(sale.timestamp);
          return (
            saleDate.getFullYear() === date.getFullYear() &&
            saleDate.getMonth() === date.getMonth() &&
            saleDate.getDate() === date.getDate()
          );
        })
        .reduce((sum, sale) => sum + sale.total, 0);
      return { date: label, sales: dayTotal };
    });
    return last7Days;
  };

  const weeklySalesData = getWeeklySalesData();

  const weeklyTotal = weeklySalesData.reduce((s, d) => s + d.sales, 0);
  const last3Sum = weeklySalesData.slice(4).reduce((s, d) => s + d.sales, 0);
  const prev3Sum = weeklySalesData.slice(1, 4).reduce((s, d) => s + d.sales, 0);
  const percentChange = prev3Sum ? ((last3Sum - prev3Sum) / prev3Sum) * 100 : 0;

  const reportSales = useMemo(() => {
    const today = new Date();
    // if user selected a range via calendar, prefer that explicit range
    if (rangeSelection.from) {
      const from = new Date(rangeSelection.from);
      const to = rangeSelection.to ? new Date(rangeSelection.to) : new Date(rangeSelection.from);
      to.setHours(23,59,59,999);
      return sales.filter((sale) => {
        const saleDate = new Date(sale.timestamp);
        return saleDate >= from && saleDate <= to;
      });
    }
    
    if (reportRange === 'DATE') {
      if (!selectedDate) return [] as SaleRecord[];
      const from = new Date(selectedDate);
      const to = new Date(selectedDate);
      to.setHours(23,59,59,999);
      return sales.filter((sale) => {
        const saleDate = new Date(sale.timestamp);
        return saleDate >= from && saleDate <= to;
      });
    }

    if (reportRange === 'WEEK') {
      const from = new Date();
      from.setDate(today.getDate() - 6);
      return sales.filter((sale) => {
        const saleDate = new Date(sale.timestamp);
        return saleDate >= from && saleDate <= today;
      });
    }

    if (reportRange === 'MONTH') {
      let from: Date;
      let to: Date = today;
      if (selectedMonth) {
        const [y, m] = selectedMonth.split('-').map(Number);
        from = new Date(y, m - 1, 1);
        to = new Date(y, m - 1, new Date(y, m, 0).getDate());
        to.setHours(23,59,59,999);
      } else {
        from = new Date(today.getFullYear(), today.getMonth(), 1);
      }
      return sales.filter((sale) => {
        const saleDate = new Date(sale.timestamp);
        return saleDate >= from && saleDate <= to;
      });
    }

    // YEAR
    let from = new Date(today.getFullYear(), 0, 1);
    let to = today;
    if (selectedYear) {
      from = new Date(Number(selectedYear), 0, 1);
      to = new Date(Number(selectedYear), 11, 31, 23, 59, 59, 999);
    }
    return sales.filter((sale) => {
      const saleDate = new Date(sale.timestamp);
      return saleDate >= from && saleDate <= to;
    });
  }, [reportRange, sales, selectedDate]);

  const reportRevenue = reportSales.reduce((sum, sale) => sum + sale.total, 0);
  const reportOrders = reportSales.length;
  const reportAverage = reportOrders ? reportRevenue / reportOrders : 0;
  const reportCustomers = useMemo(() => new Set(reportSales.map((sale) => sale.customerId ?? 'Walk-in')).size, [reportSales]);
  const reportTopProducts = useMemo(() => {
    const countMap = new Map<string, { quantity: number; revenue: number }>();
    reportSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const existing = countMap.get(item.name) ?? { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.quantity * item.price;
        countMap.set(item.name, existing);
      });
    });
    return Array.from(countMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3);
  }, [reportSales]);

  const reportRecommendations = useMemo(() => {
    const recs: string[] = [];
    if (reportSales.length === 0) return recs;

    // daily totals
    const dayMap = new Map<string, number>();
    reportSales.forEach(sale => {
      const key = new Date(sale.timestamp).toISOString().slice(0,10);
      dayMap.set(key, (dayMap.get(key) || 0) + sale.total);
    });
    const days = Array.from(dayMap.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    const totals = days.map(d => d[1]);
    const avgPerDay = totals.length ? totals.reduce((s,n) => s+n, 0) / totals.length : 0;
    const best = days.reduce((bestSoFar, d) => d[1] > (bestSoFar?.[1]||0) ? d : bestSoFar, days[0]);
    const worst = days.reduce((worstSoFar, d) => d[1] < (worstSoFar?.[1]||Infinity) ? d : worstSoFar, days[0]);

    // growth: compare first half vs second half
    const half = Math.floor(totals.length / 2) || 1;
    const first = totals.slice(0, half).reduce((s,n)=>s+n,0);
    const second = totals.slice(half).reduce((s,n)=>s+n,0);
    const growth = first ? ((second - first) / first) * 100 : 0;

    if (growth >= 10) recs.push(`Sales up ${growth.toFixed(0)}% vs earlier period — consider scaling production.`);
    if (growth <= -10) recs.push(`Sales down ${Math.abs(growth).toFixed(0)}% vs earlier period — consider promotions.`);
    if (avgPerDay > 0) recs.push(`Average per active day: ₹${avgPerDay.toFixed(2)}; best day: ${new Date(best[0]).toLocaleDateString()} (₹${best[1].toFixed(2)}).`);

    // low stock for top products
    if (recs.length === 0) recs.push('No strong recommendations — performance is stable.');
    return recs;
  }, [reportSales, reportTopProducts, products]);

  const reportRangeLabel = reportRange === 'DATE' ? (selectedDate || 'Date') : reportRange === 'WEEK' ? 'Last 7 days' : reportRange === 'MONTH' ? 'Month to date' : 'Year to date';

  const generateReport = () => {
    const rangeLabel = reportRangeLabel;
    const summaryLines = [
      `Sales Report — ${rangeLabel}`,
      `Total orders: ${reportOrders}`,
      `Total revenue: ₹${reportRevenue.toFixed(2)}`,
      `Average order value: ₹${reportAverage.toFixed(2)}`,
      `Unique customers: ${reportCustomers}`,
      `Top products:`,
    ];

    reportTopProducts.forEach((item, index) => {
      summaryLines.push(`${index + 1}. ${item.name} — ${item.quantity} sold (₹${item.revenue.toFixed(2)})`);
    });

    setReportText(summaryLines.join('\n'));
  };

  const downloadReport = () => {
    if (!reportText) return;
    const filename = `sales-report-${reportRange === 'WEEK' ? '7d' : reportRange === 'MONTH' ? 'month' : reportRange === 'YEAR' ? 'year' : 'date'}.txt`;
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadReportCSV = () => {
    if (reportSales.length === 0) return;
    const filename = `sales-report-${reportRange === 'WEEK' ? '7d' : reportRange === 'MONTH' ? 'month' : reportRange === 'YEAR' ? 'year' : 'date'}.csv`;
    const header = ['timestamp','orderId','total','customerId','items'];
    const rows = reportSales.map(sale => {
      const items = sale.items.map(it => `${it.name} x${it.quantity}`).join(' | ');
      const ts = new Date(sale.timestamp).toISOString();
      return [`"${ts}"`, sale.id ?? '', sale.total.toFixed(2), sale.customerId ?? 'Walk-in', `"${items}"`].join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  return (
    <div className="space-y-8 animate-fade-in">
      {locationLabel && (
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
          <h2 className="text-lg font-semibold text-slate-800">{locationLabel}</h2>
        </div>
      )}

      {branchSummaries.length > 0 && (
        <div className="space-y-3">
          {onSelectBranch && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSelectBranch(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                  !selectedBranchId
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                All branches
              </button>
              {branchSummaries.map((branch) => (
                <button
                  key={`${branch.id}-chip`}
                  type="button"
                  onClick={() => onSelectBranch(branch.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    selectedBranchId === branch.id
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {branch.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {branchSummaries.map((branch) => {
              const isActive = selectedBranchId === branch.id;
              const cardClass = `bg-white border rounded-2xl p-5 text-left ${
                isActive ? 'border-slate-800 ring-2 ring-slate-800/10' : 'border-slate-100'
              } ${onSelectBranch ? 'hover:border-slate-300' : ''}`;
              return onSelectBranch ? (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => onSelectBranch(isActive ? null : branch.id)}
                  className={cardClass}
                >
                  <p className="text-xs uppercase tracking-wide text-slate-500">{branch.cityName}</p>
                  <h3 className="text-lg font-semibold text-slate-800 mt-1">{branch.name}</h3>
                  <p className="text-2xl font-bold text-slate-800 mt-3">₹{branch.sales.toFixed(2)}</p>
                  <p className="text-sm text-slate-500 mt-1">{branch.orders} orders</p>
                </button>
              ) : (
                <div key={branch.id} className={cardClass}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{branch.cityName}</p>
                  <h3 className="text-lg font-semibold text-slate-800 mt-1">{branch.name}</h3>
                  <p className="text-2xl font-bold text-slate-800 mt-3">₹{branch.sales.toFixed(2)}</p>
                  <p className="text-sm text-slate-500 mt-1">{branch.orders} orders</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Revenue"
          value={`₹${totalRevenue.toFixed(2)}`}
          sub="+12% from yesterday"
          icon={IndianRupee}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard
          title="Orders Today"
          value={totalOrders}
          sub="3 Pending"
          icon={ShoppingBag}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
        <StatCard
          title="Total Profit"
          value={`₹${totalProfit.toFixed(2)}`}
          sub="Profit after cost"
          icon={IndianRupee}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="xl:col-span-2 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col min-h-[240px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-800">Weekly Sales Trend</h3>
              <p className="text-sm text-slate-500 mt-1">Sales performance across the most recent week.</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              <span>Sales (₹)</span>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 flex items-center gap-4">
              <div>
                <p className="text-xs text-slate-500">This week</p>
                <div className="text-2xl font-bold text-slate-800">₹{weeklyTotal.toFixed(2)}</div>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${percentChange >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(0)}% vs prev
              </div>
            </div>
            <div className="hidden sm:flex items-center justify-end text-sm text-slate-500">
              <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span> Sales (₹)
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={weeklySalesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => `₹${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 12px 30px -15px rgba(15, 23, 42, 0.25)' }}
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Sales']}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSales)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales Report Panel */}
        <div className="bg-amber-50 p-6 rounded-[32px] border border-amber-200 shadow-lg flex flex-col min-h-[240px]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-amber-700 font-semibold">Sales Intelligence</p>
              <h3 className="text-2xl font-semibold text-amber-900">Custom Sales Report</h3>
              <p className="text-sm text-amber-700/80 mt-2">Choose a range and generate a clean report summary.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={generateReport}
                className="rounded-2xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 transition-colors"
              >
                Generate
              </button>
              <button
                onClick={downloadReport}
                disabled={!reportText}
                className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-amber-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Download report"
              >
                <Download size={16} />
              </button>
              <button
                onClick={downloadReportCSV}
                disabled={reportSales.length === 0}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export CSV
              </button>
              
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="grid grid-cols-4 gap-2">
            {(['DATE','WEEK','MONTH','YEAR'] as const).map((r) => {
              const label = r === 'DATE' ? 'Date' : r === 'WEEK' ? 'Week' : r === 'MONTH' ? 'Month' : 'Year';
              return (
                <button
                  key={r}
                  onClick={() => setReportRange(r)}
                  className={`rounded-full border px-3 py-2 text-sm font-medium transition ${reportRange === r ? 'border-amber-700 bg-amber-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-200 hover:bg-amber-50'}`}
                >
                  {label}
                </button>
              );
            })}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowCalendar(v => !v)}
                className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-amber-700 hover:bg-slate-100 transition"
                aria-label="Open calendar"
              >
                <Calendar size={16} />
              </button>

              {showCalendar && (
                <div ref={calendarRef} className="absolute right-0 mt-2 z-50 bg-white rounded-lg p-2 shadow-lg">
                  <DayPicker
                    mode="range"
                    selected={rangeSelection}
                    onSelect={(sel: DateRange | undefined) => {
                      if (!sel) return;
                      const from = sel.from;
                      const to = sel.to;
                      setRangeSelection({ from, to });
                      // if a single day selected, update selectedDate
                      if (from && !to) {
                        setSelectedDate(`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-${String(from.getDate()).padStart(2,'0')}`);
                      }
                    }}
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                    <button onClick={() => setRangeSelection({})} className="px-3 py-1 text-sm">Clear</button>
                    <button onClick={() => setShowCalendar(false)} className="px-3 py-1 bg-amber-700 text-white rounded">Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {reportRange === 'DATE' && (
            <div className="flex gap-2 mb-4">
              <label className="flex flex-col text-sm text-slate-600">
                Date
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="mt-1 rounded-md border border-slate-200 p-2 text-sm" />
              </label>
            </div>
          )}

          {reportRange === 'MONTH' && (
            <div className="flex gap-2 mb-4">
              <label className="flex flex-col text-sm text-slate-600">
                Month
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 rounded-md border border-slate-200 p-2 text-sm" />
              </label>
            </div>
          )}

          {reportRange === 'YEAR' && (
            <div className="flex gap-2 mb-4">
              <label className="flex flex-col text-sm text-slate-600">
                Year
                <input type="number" min={2000} max={2100} value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="mt-1 rounded-md border border-slate-200 p-2 text-sm" />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 flex-1 overflow-hidden mb-4">
            <div className="rounded-3xl bg-white/95 p-4 shadow-sm border border-white/70">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Selected range</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{reportRangeLabel}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/95 p-4 shadow-sm border border-white/70">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Orders</div>
                <div className="mt-2 text-2xl font-bold text-amber-900">{reportOrders}</div>
              </div>
              <div className="rounded-3xl bg-white/95 p-4 shadow-sm border border-white/70">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Revenue</div>
                <div className="mt-2 text-2xl font-bold text-amber-900">₹{reportRevenue.toFixed(2)}</div>
              </div>
              <div className="rounded-3xl bg-white/95 p-4 shadow-sm border border-white/70">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Avg order</div>
                <div className="mt-2 text-2xl font-bold text-amber-900">₹{reportAverage.toFixed(2)}</div>
              </div>
              <div className="rounded-3xl bg-white/95 p-4 shadow-sm border border-white/70">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500 font-semibold">Customers</div>
                <div className="mt-2 text-2xl font-bold text-amber-900">{reportCustomers}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 border border-amber-100 h-full overflow-auto">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Report Summary</p>
                <span className="text-xs uppercase tracking-[0.18em] text-amber-600 font-semibold">{reportRangeLabel}</span>
              </div>
              <ul className="mt-3 text-sm text-slate-700 space-y-2">
                <li><strong>Total orders:</strong> {reportOrders}</li>
                <li><strong>Total revenue:</strong> ₹{reportRevenue.toFixed(2)}</li>
                <li><strong>Average order value:</strong> ₹{reportAverage.toFixed(2)}</li>
                <li><strong>Unique customers:</strong> {reportCustomers}</li>
              </ul>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Top products</p>
              <div className="space-y-2">
                {reportTopProducts.length === 0 ? (
                  <div className="text-sm text-slate-500">No products in range.</div>
                ) : (
                  reportTopProducts.map((p, idx) => (
                    <div key={p.name} className="flex items-center justify-between bg-amber-50/60 p-2 rounded-xl">
                      <div className="text-sm font-medium text-slate-800">{idx + 1}. {p.name}</div>
                      <div className="text-sm text-slate-700">{p.quantity} sold • ₹{p.revenue.toFixed(2)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Recommendations</p>
                <div className="space-y-2">
                  {reportRecommendations.map((r, i) => (
                    <div key={i} className="text-sm text-slate-700 p-3 rounded border-l-4 border-amber-300 bg-amber-50/60 shadow-sm">{r}</div>
                  ))}
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* Daily Sales Transaction List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Recent Transactions</h3>
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
              {sales.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">No sales recorded today yet.</td></tr>
              ) : (
                sales.slice(0, 10).map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-slate-600 text-sm">
                        <Clock size={14} className="text-slate-400" />
                        {sale.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-800 font-medium">
                        {sale.items.length} items
                      </div>
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

export default Dashboard;