"use client";

import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";

const DATA = [
  { day: "1", spend: 410 }, { day: "3", spend: 455 }, { day: "5", spend: 440 }, { day: "7", spend: 520 },
  { day: "9", spend: 490 }, { day: "11", spend: 560 }, { day: "13", spend: 575 }, { day: "15", spend: 540 },
  { day: "17", spend: 610 }, { day: "19", spend: 585 }, { day: "21", spend: 530 }, { day: "23", spend: 600 },
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
