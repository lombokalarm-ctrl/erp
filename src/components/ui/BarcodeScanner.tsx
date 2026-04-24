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

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isComponentMounted) return;
        
        if (devices && devices.length) {
          // Default to the first camera, but try to find a back/rear camera
          let cameraId = devices[0].id;
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('belakang')
          );
          if (backCamera) {
            cameraId = backCamera.id;
          }

          html5QrCode.start(
            cameraId,
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
              setError("Gagal memulai kamera. Pastikan browser memiliki izin mengakses kamera.");
              console.error(err);
            }
          });
        } else {
          if (isComponentMounted) setError("Tidak ada kamera yang ditemukan pada perangkat ini.");
        }
      })
      .catch((err) => {
        if (isComponentMounted) {
          setError("Izin kamera ditolak. Harap izinkan akses kamera pada pengaturan browser Anda.");
          console.error(err);
        }
      });

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
