interface FireworksErrorBannerProps {
  error: string;
  onDismiss: () => void;
}

export default function FireworksErrorBanner({ error, onDismiss }: FireworksErrorBannerProps) {
  return (
    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 dark:bg-red-900 dark:text-red-100">
      <p>{error}</p>
      <button
          className="underline text-sm mt-1"
          onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
