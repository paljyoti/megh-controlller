import { Construction } from "lucide-react";

const PlaceholderPage = ({ title }: { title: string }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500 dark:text-gray-400">
      <Construction size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h1>
      <p className="mt-2">Coming Soon</p>
    </div>
  );
};

export default PlaceholderPage;
