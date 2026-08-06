import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Typography, Button, Flex } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useIsMobile } from '../hooks/useIsMobile';

const { Title } = Typography;

const DEFAULT_MIN_WIDTH = 420;

// Generic centered floating card modal shared by the task-details panel and the manage-user
// panel: portal straight to <body> (escapes the app header/dock's stacking context), width
// resizable by dragging the right edge (dx*2 keeps the card centered), and an N-way pill tab
// bar whose panels are all mounted at once on a sliding track so switching tabs is one
// continuous motion instead of a fade in/out. Each tab entry is `{ key, label, content,
// scrollable, padding }` — `scrollable: false` opts a panel out of the default padded/
// auto-scrolling wrapper for panels (like Activity & Updates) that manage their own internal
// scroll region instead.
export function SlidingCardModal({
  open,
  onClose,
  title,
  extra,
  tabs,
  resetKey,
  defaultWidth = 760,
  minWidth = DEFAULT_MIN_WIDTH,
}) {
  const isMobile = useIsMobile();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, width: defaultWidth });

  useEffect(() => {
    if (open) setActiveKey(tabs[0]?.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Lock background scroll while open — belt-and-suspenders alongside the portal/backdrop,
  // since Page Down / arrow keys can still scroll the document even without a hover target.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const maxWidth = window.innerWidth - 80;
      setWidth(Math.min(Math.max(dragStartRef.current.width + dx * 2, minWidth), maxWidth));
    };
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minWidth]);

  const startResize = (e) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, width };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const n = tabs.length;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeKey));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sliding-card-modal-backdrop"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(24, 24, 27, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            style={{
              position: 'relative',
              width,
              maxWidth: '100%',
              height: '85vh',
              backgroundColor: '#F7F5F2',
              backgroundImage: 'radial-gradient(#18181B22 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              borderRadius: 24,
              border: '1px solid rgba(24, 24, 27, 0.08)',
              boxShadow: '0 24px 64px -20px rgba(24, 24, 27, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header — on mobile, `extra` (e.g. a range picker + action button) always
                drops to its own row below the title so the close button stays pinned
                top-right no matter how wide `extra` is, instead of wrapping onto a third
                row alongside it. Desktop keeps title/extra/close on one wrapping row. */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(24, 24, 27, 0.08)' }}>
              <Flex justify="space-between" align="center" wrap={isMobile ? 'nowrap' : 'wrap'} gap={8}>
                <Title level={4} style={{ margin: 0, letterSpacing: '-0.01em' }}>
                  {title}
                </Title>
                <Flex align="center" gap={8} wrap="wrap" style={{ flexShrink: 0 }}>
                  {!isMobile && extra}
                  <Button
                    type="text"
                    shape="circle"
                    icon={<CloseOutlined />}
                    onClick={onClose}
                    style={{ color: 'rgba(24, 24, 27, 0.55)', flexShrink: 0 }}
                  />
                </Flex>
              </Flex>
              {isMobile && extra && (
                <div style={{ marginTop: 12 }}>
                  {extra}
                </div>
              )}
            </div>

            {/* Tab toggle — floating glass-bubble treatment, same as the app header. Skipped
                entirely for a single-tab modal, where a lone always-active pill would just be
                visual noise. */}
            {n > 1 && (
              <div style={{ padding: '12px 24px 0', textAlign: isMobile ? 'center' : 'left' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    gap: 4,
                    padding: 4,
                    borderRadius: 999,
                    background: 'rgba(255, 255, 255, 0.22)',
                    backdropFilter: 'blur(2px)',
                    WebkitBackdropFilter: 'blur(2px)',
                    border: '1px solid rgba(24, 24, 27, 0.12)',
                  }}
                >
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveKey(tab.key)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 999,
                        border: 'none',
                        background: activeKey === tab.key ? '#B3455C' : 'transparent',
                        color: activeKey === tab.key ? '#FFFFFF' : 'rgba(24, 24, 27, 0.55)',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease, color 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              {/* Sliding track: every panel is always mounted, side by side, translated as one
                  continuous motion — so tabs visibly cross paths instead of one fading out
                  before the other fades in. */}
              <motion.div
                animate={{ x: `${activeIndex * -(100 / n)}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                style={{ display: 'flex', width: `${n * 100}%`, height: '100%' }}
              >
                {tabs.map(tab => (
                  <div
                    key={tab.key}
                    className={tab.scrollable === false ? undefined : 'task-scrollbar'}
                    style={{
                      width: `${100 / n}%`,
                      flexShrink: 0,
                      ...(tab.scrollable === false
                        ? { display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: tab.padding ?? '20px 24px 20px' }
                        : { overflowY: 'auto', overflowX: 'hidden', padding: tab.padding ?? '20px 24px' }),
                    }}
                  >
                    {tab.content}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Resize handle — dragging changes total width by 2x the delta so the card stays centered */}
            <div
              onMouseDown={startResize}
              title="Drag to resize"
              style={{
                position: 'absolute', top: 0, right: -8, width: 16, height: '100%',
                cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
              }}
            >
              <div style={{ width: 6, height: 64, borderRadius: 6, background: '#B3455C' }} />
            </div>

            <style>{`
              .task-scrollbar { scrollbar-color: #B3455C transparent; scrollbar-width: thin; }
              .task-scrollbar::-webkit-scrollbar { width: 8px; }
              .task-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .task-scrollbar::-webkit-scrollbar-thumb { background: #B3455C; border-radius: 8px; }
            `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
