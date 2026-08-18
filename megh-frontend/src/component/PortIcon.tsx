interface PortIconProps {
  status: "up" | "down";
}

const PortIcon = ({ status }: PortIconProps) => {
  const isUp = status === "up";
  const fill = isUp ? "#22c55e" : "#ffffff";
  const stroke = isUp ? "#16a34a" : "#9ca3af";

  return (
    <svg width="32" height="32" viewBox="0 0 32 32">
      <path
        d="M8 10 H13 V6 H19 V10 H24 V28 H8 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default PortIcon;
