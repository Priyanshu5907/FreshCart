export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="bg-gray-200 dark:bg-gray-700 rounded-lg h-40 mb-3" />
      <div className="bg-gray-200 dark:bg-gray-700 rounded h-4 mb-2 w-3/4" />
      <div className="bg-gray-200 dark:bg-gray-700 rounded h-4 w-1/2" />
    </div>
  );
}

export function SkeletonBanner() {
  return <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-64 w-full" />;
}

export function SkeletonText({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />;
}
