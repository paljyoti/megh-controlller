// import { ResponsiveContainer, AreaChart, Area } from "recharts";  

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "red" | "amber" | "purple";
  sparkData?: { v: number }[];
}

const colorMap = {
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconText: "text-blue-600 dark:text-blue-400",
    stroke: "#3b82f6",
    fill: "#3b82f6",
  },
  green: {
    iconBg: "bg-green-100 dark:bg-green-900/30",
    iconText: "text-green-600 dark:text-green-400",
    stroke: "#22c55e",
    fill: "#22c55e",
  },
  red: {
    iconBg: "bg-red-100 dark:bg-red-900/30",
    iconText: "text-red-600 dark:text-red-400",
    stroke: "#ef4444",
    fill: "#ef4444",
  },
  amber: {
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconText: "text-amber-600 dark:text-amber-400",
    stroke: "#f59e0b",
    fill: "#f59e0b",
  },
  purple: {
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    iconText: "text-purple-600 dark:text-purple-400",
    stroke: "#8b5cf6",
    fill: "#8b5cf6",
  },
};

const StatCard = ({ title, value, subtitle, icon, color }: StatCardProps) => {
  const c = colorMap[color];
  // const gradientId = `spark-${color}`;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col justify-between transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg ${c.iconBg} ${c.iconText}`}>
          {icon}
        </div>
      </div>
      {/* {sparkData && sparkData.length > 0 && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.fill} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={c.fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={c.stroke}
                fill={`url(#${gradientId})`}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )} */}
    </div>
  );
};

export default StatCard;
