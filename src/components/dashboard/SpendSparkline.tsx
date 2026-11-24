"use client";

import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";

const DATA = [
  { day: "1", spend: 1120 }, { day: "3", spend: 1340 }, { day: "5", spend: 1290 },
  { day: "7", spend: 1610 }, { day: "9", spend: 1480 }, { day: "11", spend: 1820 },
  { day: "13", spend: 2010 }, { day: "15", spend: 1940 }, { day: "17", spend: 2260 },
  { day: "19", spend: 2380 }, { day: "21", spend: 2190 }, { day: "23", spend: 2540 },
];

export function SpendSparkline() {
  return (
    <div className="h-28 -mx-1 mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={DATA} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#02F5A1" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#02F5A1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" hide />
          <Tooltip
            cursor={{ stroke: "#C9D2D4", strokeWidth: 1 }}
            contentStyle={{
              background: "#07191E",
              border: "none",
              borderRadius: 8,
              fontSize: 12,
              color: "#F2F7F6",
              padding: "6px 10px",
            }}
            labelFormatter={(d) => `Day ${d}`}
            formatter={(value: number) => [`$${value.toLocaleString()}`, "Spend"]}
          />
          <Area type="monotone" dataKey="spend" stroke="#00B876" strokeWidth={2} fill="url(#spendFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
