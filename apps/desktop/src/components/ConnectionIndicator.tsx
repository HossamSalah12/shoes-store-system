import { Wifi, WifiOff } from 'lucide-react';
import { useConnectionStore } from '../state/connectionStore';

export function ConnectionIndicator() {
  const isOnline = useConnectionStore((s) => s.isOnline);
  const isSocketConnected = useConnectionStore((s) => s.isSocketConnected);

  const connected = isOnline && isSocketConnected;

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
      title={connected ? 'متصل بالخادم' : 'غير متصل — لن يتم حفظ أي عملية بيع حتى يعود الاتصال'}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{connected ? 'متصل' : 'غير متصل بالإنترنت'}</span>
    </div>
  );
}
