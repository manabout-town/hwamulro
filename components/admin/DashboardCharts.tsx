"use client"

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"

interface OrderTrend {
  date: string
  count: number
  revenue: number
}

interface StatusDist {
  name: string
  value: number
  color: string
}

interface RoleDist {
  name: string
  value: number
  color: string
}

interface Props {
  orderTrend: OrderTrend[]
  statusDist: StatusDist[]
  roleDist: RoleDist[]
}

const formatKRW = (v: number) =>
  v >= 10000 ? `${Math.floor(v / 10000)}만` : v.toLocaleString()

export function DashboardCharts({ orderTrend, statusDist, roleDist }: Props) {
  const hasOrders = orderTrend.some(d => d.count > 0)
  const hasStatus = statusDist.some(d => d.value > 0)
  const hasRoles = roleDist.some(d => d.value > 0)

  return (
    <div className="space-y-5">
      {/* 주문 추이 + 수수료 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-5">최근 14일 주문 추이</h2>
        {!hasOrders ? (
          <EmptyState label="아직 주문 데이터가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={orderTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatKRW} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #f0f0f0", fontSize: 12 }}
                formatter={(v, name) =>
                  name === "수수료" ? [`${formatKRW(Number(v))}원`, name as string] : [`${v}건`, name as string]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="count" name="주문수" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              <Line yAxisId="right" type="monotone" dataKey="revenue" name="수수료" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 5 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 주문 상태 분포 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">주문 상태 분포</h2>
          {!hasStatus ? (
            <EmptyState label="주문 없음" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie data={statusDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => [`${v}건`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {statusDist.filter(d => d.value > 0).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{d.value}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 회원 구성 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">회원 구성</h2>
          {!hasRoles ? (
            <EmptyState label="회원 없음" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie data={roleDist} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="value">
                    {roleDist.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => [`${v}명`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {roleDist.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{d.value}명</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-[180px] flex flex-col items-center justify-center text-gray-300 gap-2">
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  )
}
