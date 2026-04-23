import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scannerRef.current) return;
    
    const html5QrcodeScanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      false
    );

    html5QrcodeScanner.render(
      (decodedText) => {
        html5QrcodeScanner.clear();
        onScan(decodedText);
      },
      (error) => {
        // ignore continuous scanning errors
      }
    );

    return () => {
      html5QrcodeScanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Scan Barcode (SKU)</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900">
            Tutup
          </button>
        </div>
        <div id="reader" ref={scannerRef} className="w-full"></div>
      </div>
    </div>
  );
}
