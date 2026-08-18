import React from "react";

type CardProps = {
  title: string;
  value: string;
};

const Card: React.FC<CardProps> = ({
  title,
  value,
}) => {
  return (
    <div className="bg-white p-5 rounded-2xl shadow">

      <h4 className="text-gray-500 text-sm">
        {title}
      </h4>

      <p className="text-2xl font-bold mt-2">
        {value}
      </p>

    </div>
  );
};

export default Card;