import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    let isComponentMounted = true;

    const startScanner = (cameraConfig: any) => {
      html5QrCode.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
              onScan(decodedText);
            }).catch(() => {
              onScan(decodedText);
            });
          } else {
            onScan(decodedText);
          }
        },
        (errorMessage) => {
          // ignore continuous scanning errors
        }
      ).catch((err) => {
        if (isComponentMounted) {
          // If environment camera fails, fallback to standard deviceId
          if (cameraConfig.facingMode === "environment") {
            Html5Qrcode.getCameras().then((devices) => {
              if (devices && devices.length) {
                let cameraId = devices[0].id;
                const backCamera = devices.find(d => 
                  d.label.toLowerCase().includes('back') || 
                  d.label.toLowerCase().includes('rear') ||
                  d.label.toLowerCase().includes('belakang')
                );
                if (backCamera) {
                  cameraId = backCamera.id;
                }
                startScanner(cameraId);
              } else {
                setError("Tidak ada kamera yang ditemukan.");
              }
            }).catch(() => {
              setError("Izin kamera ditolak atau tidak ada kamera.");
            });
          } else {
            setError("Gagal memulai kamera. Pastikan izin diberikan.");
            console.error(err);
          }
        }
      });
    };

    // Use environment facing mode without advanced focus constraints
    // This allows mobile browsers to natively handle continuous autofocus
    // without throwing OverconstrainedError
    startScanner({ facingMode: "environment" });

    return () => {
      isComponentMounted = false;
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Failed to stop scanner", err));
      }
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
        {error ? (
          <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
            {error}
          </div>
        ) : (
          <div id="reader" className="w-full overflow-hidden rounded-lg bg-black"></div>
        )}
      </div>
    </div>
  );
}
