import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOutlined } from '@ant-design/icons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// Persistent top banner (not a one-off toast) so the offline state stays
// visible for as long as it's true — a field user mid check-in shouldn't
// have to notice and remember a message.error() that already scrolled away.
export default function OfflineBanner() {
  const isOnline = useNetworkStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{ overflow: 'hidden', flexShrink: 0 }}
        >
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 16px',
              paddingTop: 'calc(8px + env(safe-area-inset-top))',
              background: '#18181B',
              color: '#F7F5F2',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <WifiOutlined />
            You're offline — actions won't be saved until you reconnect
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
