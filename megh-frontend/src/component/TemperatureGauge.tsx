interface TemperatureGaugeProps {
  value: number;
  min?: number;
  max?: number;
}

const cx = 100;
const cy = 100;
const r = 78;

const polarToCartesian = (radius: number, angleDeg: number) => {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy - radius * Math.sin(angleRad),
  };
};

const describeArc = (radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(radius, startAngle);
  const end = polarToCartesian(radius, endAngle);
  const largeArcFlag = startAngle - endAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

const valueToAngle = (value: number, min: number, max: number) =>
  180 - ((value - min) / (max - min)) * 180;

const TemperatureGauge = ({ value, min = 0, max = 125 }: TemperatureGaugeProps) => {
  const clamped = Math.min(Math.max(value, min), max);
  const needleAngle = valueToAngle(clamped, min, max);
  const needleEnd = polarToCartesian(r - 14, needleAngle);

  const greenEnd = min + (max - min) * 0.2;
  const yellowEnd = min + (max - min) * 0.8;

  const ticks = [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max];

  return (
    <div className="h-40 w-40 relative">
      <svg viewBox="0 0 200 115" className="w-full h-full overflow-visible">
        <path
          d={describeArc(r, 180, valueToAngle(greenEnd, min, max))}
          stroke="#22c55e"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"      
        />   
        <path
          d={describeArc(r, valueToAngle(greenEnd, min, max), valueToAngle(yellowEnd, min, max))}
          stroke="#eab308"
          strokeWidth="12"
          fill="none"        />
        <path
          d={describeArc(r, valueToAngle(yellowEnd, min, max), 0)}
          stroke="#ef4444"
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
        />

        {ticks.map((t) => {
          const p = polarToCartesian(r + 14, valueToAngle(t, min, max));
          return (
            <text
              key={t}
              x={p.x}
              y={p.y}
              fontSize="9"
              fill="#6b7280"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {Math.round(t)}
            </text>        
          );
        })}

        <line
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4" fill="#2563eb" />
      </svg>
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <span className="text-blue-600 font-semibold text-lg">
          {clamped.toFixed(1)} °C
        </span>
      </div>                          
    </div>
  );
};

export default TemperatureGauge;





