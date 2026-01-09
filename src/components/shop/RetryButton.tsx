'use client';

export default function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="mt-4 px-6 py-2 bg-[#1976D2] text-white rounded-lg hover:bg-[#1565C0] transition-colors"
    >
      Retry
    </button>
  );
}
