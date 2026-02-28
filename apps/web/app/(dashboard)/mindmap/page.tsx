'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  addMindmap as addMindmapDB,
  updateMindmap as updateMindmapDB,
  deleteMindmap as deleteMindmapDB,
} from '@/lib/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { MAX_ATTACHMENT_SIZE } from '@/lib/attachment-store';
import { useDataStore } from '@/lib/data-store';
import NoahAIPageActions from '@/components/ai/NoahAIPageActions';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import type { MindMapNode, MindMapEdge, MindMapData } from '@/lib/firestore';

// ============================================================================
// Types
// ============================================================================

interface MindMap {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  viewportX: number;
  viewportY: number;
  zoom: number;
  starred: boolean;
  createdAt: string;
}

interface HistorySnapshot {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

const NODE_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];
const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 70;
const MAX_HISTORY = 50;

// ============================================================================
// Component
// ============================================================================

function MindmapContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { mindmaps: storeMindmaps, loading: storeLoading } = useDataStore();
  const initializedRef = useRef(false);

  const [mindmaps, setMindmaps] = useState<MindMap[]>([]);
  const [activeMapId, setActiveMapId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Viewport — stored in ref for real-time access in event handlers
  const vpRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [, forceRender] = useState(0);
  const kick = () => forceRender((n) => n + 1);

  // Interaction — all in ref to avoid stale closures
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'node';
    startX: number; startY: number;
    offsetX: number; offsetY: number;
    nodeId: string | null;
    moved: boolean;
  }>({ mode: 'none', startX: 0, startY: 0, offsetX: 0, offsetY: 0, nodeId: null, moved: false });

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [edgeStyle, setEdgeStyle] = useState<'curved' | 'straight'>('curved');

  // Connection drawing
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; side: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingNodeId, setUploadingNodeId] = useState<string | null>(null);

  // Touch state
  const touchRef = useRef<{
    lastDist: number;
    longPressTimer: NodeJS.Timeout | null;
    startX: number;
    startY: number;
  }>({ lastDist: 0, longPressTimer: null, startX: 0, startY: 0 });

  // Undo/Redo
  const historyRef = useRef<Map<string, { past: HistorySnapshot[]; future: HistorySnapshot[] }>>(new Map());
  const skipHistoryRef = useRef(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mindmapsRef = useRef(mindmaps);
  mindmapsRef.current = mindmaps;

  // Helper: first selected node id
  const selectedNodeId = selectedNodeIds.size === 1 ? [...selectedNodeIds][0] : null;
  const activeMap = mindmaps.find((m) => m.id === activeMapId);
  const activeMapRef = useRef(activeMap);
  activeMapRef.current = activeMap;
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  const activeMapIdRef = useRef(activeMapId);
  activeMapIdRef.current = activeMapId;

  // Viewport helpers
  const vp = vpRef.current;

  // ========== History Helpers ==========
  const getHistory = (mapId: string) => {
    if (!historyRef.current.has(mapId)) {
      historyRef.current.set(mapId, { past: [], future: [] });
    }
    return historyRef.current.get(mapId)!;
  };

  const pushHistory = (mapId: string, snapshot: HistorySnapshot) => {
    if (skipHistoryRef.current) return;
    const h = getHistory(mapId);
    h.past.push(snapshot);
    if (h.past.length > MAX_HISTORY) h.past.shift();
    h.future = [];
  };

  const canUndo = activeMapId ? (getHistory(activeMapId).past.length > 0) : false;
  const canRedo = activeMapId ? (getHistory(activeMapId).future.length > 0) : false;

  const undo = () => {
    if (!activeMap || !canUndo) return;
    const h = getHistory(activeMapId);
    const prev = h.past.pop()!;
    h.future.push({ nodes: [...activeMap.nodes], edges: [...activeMap.edges] });
    skipHistoryRef.current = true;
    updateMapDirect((m) => ({ ...m, nodes: prev.nodes, edges: prev.edges }));
    skipHistoryRef.current = false;
  };

  const redo = () => {
    if (!activeMap || !canRedo) return;
    const h = getHistory(activeMapId);
    const next = h.future.pop()!;
    h.past.push({ nodes: [...activeMap.nodes], edges: [...activeMap.edges] });
    skipHistoryRef.current = true;
    updateMapDirect((m) => ({ ...m, nodes: next.nodes, edges: next.edges }));
    skipHistoryRef.current = false;
  };

  // ========== Init ==========
  useEffect(() => {
    if (storeLoading || initializedRef.current) return;
    initializedRef.current = true;

    const mapped: MindMap[] = storeMindmaps.map((m) => ({
      id: m.id!,
      title: m.title,
      nodes: m.nodes || [],
      edges: m.edges || [],
      viewportX: m.viewportX ?? 0,
      viewportY: m.viewportY ?? 0,
      zoom: m.zoom ?? 1,
      starred: m.starred ?? false,
      createdAt: m.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    }));
    setMindmaps(mapped);
    if (mapped.length > 0) setActiveMapId(mapped[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading]);

  // Sync viewport from activeMap
  useEffect(() => {
    if (activeMap) {
      vpRef.current = { x: activeMap.viewportX, y: activeMap.viewportY, zoom: activeMap.zoom || 1 };
      kick();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId]);

  // ========== Save ==========
  const saveToFirestore = useCallback(async (map: MindMap) => {
    if (!user) return;
    try {
      await updateMindmapDB(user.uid, map.id, {
        title: map.title,
        nodes: map.nodes,
        edges: map.edges,
        viewportX: map.viewportX,
        viewportY: map.viewportY,
        zoom: map.zoom,
      });
    } catch (err) {
      console.error('Failed to save mindmap:', err);
    }
  }, [user]);

  const debouncedSave = useCallback((map: MindMap) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToFirestore(map), 500);
  }, [saveToFirestore]);

  // ========== Noah AI: apply mindmap from AI ==========
  useEffect(() => {
    const handleAIApplyMindmap = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !user) return;
      const aiNodes: MindMapNode[] = (detail.nodes || []).map((n: any) => ({
        id: n.id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        text: n.text || '',
        x: n.x ?? 400,
        y: n.y ?? 300,
        width: n.width || DEFAULT_NODE_WIDTH,
        height: n.height || DEFAULT_NODE_HEIGHT,
        color: n.color || NODE_COLORS[0],
      }));
      const aiEdges: MindMapEdge[] = (detail.edges || []).map((e: any) => ({
        id: e.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        from: e.from,
        to: e.to,
        style: e.style || 'curved',
      }));
      if (aiNodes.length === 0) return;

      const tempId = Date.now().toString();
      const newMap: MindMap = {
        id: tempId,
        title: detail.title || 'AI 마인드맵',
        nodes: aiNodes,
        edges: aiEdges,
        viewportX: 0,
        viewportY: 0,
        zoom: 1,
        starred: false,
        createdAt: new Date().toISOString(),
      };
      setMindmaps((prev) => [newMap, ...prev]);
      setActiveMapId(tempId);
      try {
        const realId = await addMindmapDB(user.uid, {
          title: newMap.title, nodes: newMap.nodes, edges: newMap.edges,
          viewportX: 0, viewportY: 0, zoom: 1,
        });
        setMindmaps((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
        setActiveMapId(realId);
      } catch (err) {
        console.error('Failed to create AI mindmap:', err);
      }
    };

    window.addEventListener('noah-ai-apply-mindmap', handleAIApplyMindmap);
    return () => window.removeEventListener('noah-ai-apply-mindmap', handleAIApplyMindmap);
  }, [user]);

  // updateMapDirect: update + save, used for undo/redo & non-history ops
  const updateMapDirect = (updater: (m: MindMap) => MindMap) => {
    setMindmaps((prev) => {
      const updated = prev.map((m) => (m.id === activeMapIdRef.current ? updater(m) : m));
      const map = updated.find((m) => m.id === activeMapIdRef.current);
      if (map) debouncedSave(map);
      return updated;
    });
  };

  // updateMap: push history then update
  const updateMap = (updater: (m: MindMap) => MindMap) => {
    const map = mindmapsRef.current.find((m) => m.id === activeMapIdRef.current);
    if (map) pushHistory(activeMapIdRef.current, { nodes: [...map.nodes], edges: [...map.edges] });
    updateMapDirect(updater);
  };

  // ========== CRUD ==========
  const createMindmap = async () => {
    const tempId = Date.now().toString();
    const newMap: MindMap = {
      id: tempId,
      title: '새 마인드맵',
      nodes: [{
        id: 'root',
        text: '중심 아이디어',
        x: 400,
        y: 300,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        color: NODE_COLORS[0],
      }],
      edges: [],
      viewportX: 0,
      viewportY: 0,
      zoom: 1,
      starred: false,
      createdAt: new Date().toISOString(),
    };
    setMindmaps((prev) => [newMap, ...prev]);
    setActiveMapId(tempId);

    if (user) {
      try {
        const realId = await addMindmapDB(user.uid, {
          title: newMap.title,
          nodes: newMap.nodes,
          edges: newMap.edges,
          viewportX: 0,
          viewportY: 0,
          zoom: 1,
        });
        setMindmaps((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
        setActiveMapId(realId);
      } catch (err) {
        console.error('Failed to create mindmap:', err);
      }
    }
  };

  const deleteMindmap = async (id: string) => {
    if (!confirm('이 마인드맵을 삭제하시겠습니까?')) return;
    const map = mindmaps.find((m) => m.id === id);
    if (map) {
      for (const node of map.nodes) {
        if (node.imagePath) {
          try { await deleteObject(ref(storage, node.imagePath)); } catch { /* ignore */ }
        }
      }
    }
    setMindmaps((prev) => prev.filter((m) => m.id !== id));
    if (activeMapId === id) {
      const remaining = mindmaps.filter((m) => m.id !== id);
      setActiveMapId(remaining[0]?.id || '');
    }
    if (user) {
      try { await deleteMindmapDB(user.uid, id); } catch (err) { console.error(err); }
    }
  };

  const toggleStar = async (id: string) => {
    setMindmaps((prev) => prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)));
    if (user) {
      const map = mindmaps.find((m) => m.id === id);
      if (map) {
        try { await updateMindmapDB(user.uid, id, { starred: !map.starred }); } catch { /* ignore */ }
      }
    }
  };

  const updateTitle = (title: string) => {
    updateMapDirect((m) => ({ ...m, title }));
  };

  // ========== Node Operations ==========
  const addNode = () => {
    if (!activeMap) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const centerX = canvasRect ? (canvasRect.width / 2 - vp.x) / vp.zoom : 400;
    const centerY = canvasRect ? (canvasRect.height / 2 - vp.y) / vp.zoom : 300;
    const newNode: MindMapNode = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      text: '',
      x: centerX - DEFAULT_NODE_WIDTH / 2 + (Math.random() - 0.5) * 100,
      y: centerY - DEFAULT_NODE_HEIGHT / 2 + (Math.random() - 0.5) * 100,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      color: NODE_COLORS[activeMap.nodes.length % NODE_COLORS.length],
    };
    updateMap((m) => ({ ...m, nodes: [...m.nodes, newNode] }));
    setSelectedNodeIds(new Set([newNode.id]));
    setEditingNodeId(newNode.id);
  };

  const deleteNode = async (nodeId: string) => {
    if (!activeMapRef.current) return;
    const node = activeMapRef.current.nodes.find((n) => n.id === nodeId);
    if (node?.imagePath) {
      try { await deleteObject(ref(storage, node.imagePath)); } catch { /* ignore */ }
    }
    updateMap((m) => ({
      ...m,
      nodes: m.nodes.filter((n) => n.id !== nodeId),
      edges: m.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    setSelectedNodeIds((prev) => { const next = new Set(prev); next.delete(nodeId); return next; });
  };

  const deleteSelectedNodes = async () => {
    const map = activeMapRef.current;
    const ids = selectedNodeIdsRef.current;
    if (!map || ids.size === 0) return;
    for (const nid of ids) {
      const node = map.nodes.find((n) => n.id === nid);
      if (node?.imagePath) {
        try { await deleteObject(ref(storage, node.imagePath)); } catch { /* ignore */ }
      }
    }
    updateMap((m) => ({
      ...m,
      nodes: m.nodes.filter((n) => !ids.has(n.id)),
      edges: m.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
    }));
    setSelectedNodeIds(new Set());
  };

  const connectSelectedNodes = () => {
    const map = activeMapRef.current;
    const ids = [...selectedNodeIdsRef.current];
    if (!map || ids.length < 2) return;
    const currentMap = map;
    // Push single history for the batch
    pushHistory(activeMapIdRef.current, { nodes: [...currentMap.nodes], edges: [...currentMap.edges] });
    skipHistoryRef.current = true;
    let newEdges = [...currentMap.edges];
    for (let i = 0; i < ids.length - 1; i++) {
      const from = ids[i];
      const to = ids[i + 1];
      if (!newEdges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) {
        newEdges.push({ id: `e-${Date.now()}-${i}`, from, to, style: edgeStyle, color: '#888' });
      }
    }
    updateMapDirect((m) => ({ ...m, edges: newEdges }));
    skipHistoryRef.current = false;
  };

  const updateNodeText = (nodeId: string, text: string) => {
    // Text changes: don't push history on every keystroke, debounce
    updateMapDirect((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)),
    }));
  };

  const updateNodeColor = (nodeId: string, color: string) => {
    updateMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === nodeId ? { ...n, color } : n)),
    }));
  };

  // ========== Image Upload ==========
  const handleImageUpload = async (nodeId: string, file: File) => {
    if (!user || !activeMapRef.current) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('이미지는 10MB 이하만 가능합니다.');
      return;
    }
    setUploadingNodeId(nodeId);
    try {
      const mapId = activeMapIdRef.current;
      const path = `users/${user.uid}/mindmaps/${mapId}/${nodeId}/${file.name}`;
      const storageRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          updateMap((m) => ({
            ...m,
            nodes: m.nodes.map((n) =>
              n.id === nodeId ? { ...n, imageURL: downloadURL, imagePath: path, imageSize: file.size } : n
            ),
          }));
          resolve();
        });
      });
    } catch (err) {
      console.error('Image upload failed:', err);
    }
    setUploadingNodeId(null);
  };

  const removeNodeImage = async (nodeId: string) => {
    if (!activeMapRef.current) return;
    const node = activeMapRef.current.nodes.find((n) => n.id === nodeId);
    if (node?.imagePath) {
      try { await deleteObject(ref(storage, node.imagePath)); } catch { /* ignore */ }
    }
    updateMap((m) => ({
      ...m,
      nodes: m.nodes.map((n) =>
        n.id === nodeId ? { ...n, imageURL: undefined, imagePath: undefined, imageSize: undefined } : n
      ),
    }));
  };

  // ========== Edge Operations ==========
  const addEdge = (from: string, to: string) => {
    const map = activeMapRef.current;
    if (!map) return;
    if (map.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return;
    const newEdge: MindMapEdge = { id: `e-${Date.now()}`, from, to, style: edgeStyle, color: '#888' };
    updateMap((m) => ({ ...m, edges: [...m.edges, newEdge] }));
  };

  const deleteEdge = (edgeId: string) => {
    updateMap((m) => ({ ...m, edges: m.edges.filter((e) => e.id !== edgeId) }));
    setSelectedEdgeId(null);
  };

  // ========== Connection helpers ==========
  const getConnectionPoint = (node: MindMapNode, side: string) => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    switch (side) {
      case 'top': return { x: cx, y: node.y };
      case 'right': return { x: node.x + node.width, y: cy };
      case 'bottom': return { x: cx, y: node.y + node.height };
      case 'left': return { x: node.x, y: cy };
      default: return { x: cx, y: cy };
    }
  };

  const getClosestSide = (node: MindMapNode, px: number, py: number): string => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const dx = px - cx;
    const dy = py - cy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'bottom' : 'top';
  };

  const calcEdgePath = (fromNode: MindMapNode, toNode: MindMapNode, style: 'straight' | 'curved') => {
    const fromSide = getClosestSide(fromNode, toNode.x + toNode.width / 2, toNode.y + toNode.height / 2);
    const toSide = getClosestSide(toNode, fromNode.x + fromNode.width / 2, fromNode.y + fromNode.height / 2);
    const from = getConnectionPoint(fromNode, fromSide);
    const to = getConnectionPoint(toNode, toSide);

    if (style === 'straight') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ctrl = Math.min(dist * 0.4, 120);
    const dirFrom = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[fromSide] || [0, 0];
    const dirTo = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[toSide] || [0, 0];
    return `M ${from.x} ${from.y} C ${from.x + dirFrom[0] * ctrl} ${from.y + dirFrom[1] * ctrl}, ${to.x + dirTo[0] * ctrl} ${to.y + dirTo[1] * ctrl}, ${to.x} ${to.y}`;
  };

  // ========== Pointer Interaction (unified mouse/touch) ==========
  // Use document-level listeners for move/up to guarantee release

  const startPan = (clientX: number, clientY: number) => {
    const d = dragRef.current;
    d.mode = 'pan';
    d.startX = clientX - vp.x;
    d.startY = clientY - vp.y;
    d.moved = false;
  };

  const startNodeDrag = (clientX: number, clientY: number, nodeId: string) => {
    const d = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    const node = activeMapRef.current?.nodes.find((n) => n.id === nodeId);
    if (!node || !rect) return;
    d.mode = 'node';
    d.nodeId = nodeId;
    d.offsetX = (clientX - rect.left - vp.x) / vp.zoom - node.x;
    d.offsetY = (clientY - rect.top - vp.y) / vp.zoom - node.y;
    d.moved = false;
    // Save snapshot before drag for undo
    const map = activeMapRef.current;
    if (map) pushHistory(activeMapIdRef.current, { nodes: [...map.nodes], edges: [...map.edges] });
  };

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (d.mode === 'pan') {
      vpRef.current.x = clientX - d.startX;
      vpRef.current.y = clientY - d.startY;
      d.moved = true;
      kick();
      return;
    }
    if (d.mode === 'node' && d.nodeId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newX = (clientX - rect.left - vpRef.current.x) / vpRef.current.zoom - d.offsetX;
      const newY = (clientY - rect.top - vpRef.current.y) / vpRef.current.zoom - d.offsetY;
      d.moved = true;
      setMindmaps((prev) =>
        prev.map((m) =>
          m.id === activeMapIdRef.current
            ? { ...m, nodes: m.nodes.map((n) => (n.id === d.nodeId ? { ...n, x: newX, y: newY } : n)) }
            : m
        )
      );
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    if (d.mode === 'pan') {
      // Save viewport
      const { x, y } = vpRef.current;
      updateMapDirect((m) => ({ ...m, viewportX: x, viewportY: y }));
    }
    if (d.mode === 'node' && d.nodeId) {
      if (d.moved) {
        // Node was dragged — save (history already pushed in startNodeDrag)
        const map = mindmapsRef.current.find((m) => m.id === activeMapIdRef.current);
        if (map) debouncedSave(map);
      } else {
        // No movement — undo the history push from startNodeDrag
        const h = getHistory(activeMapIdRef.current);
        if (h.past.length > 0) h.past.pop();
      }
    }
    d.mode = 'none';
    d.nodeId = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSave]);

  // Document-level mouse listeners
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current.mode !== 'none') {
        handlePointerMove(e.clientX, e.clientY);
      }
      // Update mousePos for connection drawing
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({
          x: (e.clientX - rect.left - vpRef.current.x) / vpRef.current.zoom,
          y: (e.clientY - rect.top - vpRef.current.y) / vpRef.current.zoom,
        });
      }
    };
    const onMouseUp = () => {
      if (dragRef.current.mode !== 'none') {
        handlePointerUp();
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Canvas mouse down — starts pan
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only start pan if clicking on canvas bg (not on nodes)
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]')) return;
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    startPan(e.clientX, e.clientY);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const nz = Math.max(0.25, Math.min(2.5, vpRef.current.zoom * delta));
    vpRef.current.zoom = nz;
    updateMapDirect((m) => ({ ...m, zoom: nz }));
    kick();
  };

  // Node mouse down — starts node drag
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom) return;

    // Multi-select with Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      return;
    }

    if (!selectedNodeIdsRef.current.has(nodeId)) {
      setSelectedNodeIds(new Set([nodeId]));
    }
    setSelectedEdgeId(null);
    startNodeDrag(e.clientX, e.clientY, nodeId);
  };

  const handleNodeMouseUp = (nodeId: string) => {
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      addEdge(connectingFrom.nodeId, nodeId);
      setConnectingFrom(null);
    }
  };

  const handleConnectorMouseDown = (e: React.MouseEvent, nodeId: string, side: string) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectingFrom({ nodeId, side });
  };

  // ========== Touch Handlers ==========
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = touchRef.current;
    if (t.longPressTimer) { clearTimeout(t.longPressTimer); t.longPressTimer = null; }

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      t.lastDist = Math.sqrt(dx * dx + dy * dy);
      dragRef.current.mode = 'none';
      return;
    }

    const touch = e.touches[0];
    t.startX = touch.clientX;
    t.startY = touch.clientY;
    const target = e.target as HTMLElement;
    const nodeEl = target.closest('[data-node-id]') as HTMLElement | null;

    if (nodeEl) {
      e.preventDefault(); // 브라우저 기본 long-press(텍스트 복사) 방지
      const nodeId = nodeEl.getAttribute('data-node-id')!;
      if (!selectedNodeIdsRef.current.has(nodeId)) {
        setSelectedNodeIds(new Set([nodeId]));
      }
      setSelectedEdgeId(null);
      startNodeDrag(touch.clientX, touch.clientY, nodeId);

      // Long press = multi-select toggle (500ms)
      t.longPressTimer = setTimeout(() => {
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId) && next.size > 1) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
        dragRef.current.mode = 'none';
      }, 500);
      return;
    }

    // Pan canvas
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    startPan(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = touchRef.current;
    // long-press 타이머: 10px 이상 이동 시에만 취소 (미세 떨림으로 취소 방지)
    if (t.longPressTimer) {
      const touch = e.touches[0];
      const dx = touch.clientX - t.startX;
      const dy = touch.clientY - t.startY;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearTimeout(t.longPressTimer);
        t.longPressTimer = null;
      }
    }

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (t.lastDist > 0) {
        const scale = dist / t.lastDist;
        const nz = Math.max(0.25, Math.min(2.5, vpRef.current.zoom * scale));
        vpRef.current.zoom = nz;
        updateMapDirect((m) => ({ ...m, zoom: nz }));
        kick();
      }
      t.lastDist = dist;
      return;
    }

    if (dragRef.current.mode !== 'none') {
      e.preventDefault();
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    const t = touchRef.current;
    if (t.longPressTimer) { clearTimeout(t.longPressTimer); t.longPressTimer = null; }
    t.lastDist = 0;

    if (dragRef.current.mode !== 'none') {
      handlePointerUp();
    }
  };

  // Reset view
  const resetView = () => {
    vpRef.current = { x: 0, y: 0, zoom: 1 };
    updateMapDirect((m) => ({ ...m, viewportX: 0, viewportY: 0, zoom: 1 }));
    kick();
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingNodeId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) deleteEdge(selectedEdgeId);
        else if (selectedNodeIdsRef.current.size > 0) deleteSelectedNodes();
      }
      if (e.key === 'Escape') {
        setSelectedNodeIds(new Set());
        setSelectedEdgeId(null);
        setEditingNodeId(null);
        setConnectingFrom(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ========== Render ==========
  const searchFiltered = !searchQuery
    ? mindmaps
    : mindmaps.filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()));

  if (storeLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Panel — Mindmap List */}
      <div className={`${activeMap ? 'hidden md:flex' : 'flex'} w-full md:w-72 flex-col border-r border-border bg-background`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary">🧠 {t('nav.mindmap')}</h2>
            <button
              onClick={createMindmap}
              className="px-3 py-1.5 bg-gradient-to-r from-[#e94560] to-[#533483] text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
            >
              + 새로 만들기
            </button>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="마인드맵 검색..."
            className="w-full px-3 py-2 bg-background-card border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {searchFiltered.map((m) => (
            <div
              key={m.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                m.id === activeMapId
                  ? 'bg-[#e94560]/10 text-[#e94560]'
                  : 'text-text-secondary hover:bg-background-card hover:text-text-primary'
              }`}
              onClick={() => setActiveMapId(m.id)}
            >
              <span className="text-base flex-shrink-0">🧠</span>
              <span className="flex-1 text-sm font-medium truncate">{m.title || '제목 없음'}</span>
              <span className="text-[10px] text-text-muted flex-shrink-0">{m.nodes.length}</span>
              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleStar(m.id); }}
                  className={`text-[10px] transition-all ${m.starred ? 'text-amber-400 !opacity-100' : 'text-text-muted hover:text-amber-400'}`}
                >{m.starred ? '★' : '☆'}</button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMindmap(m.id); }}
                  className="text-text-inactive hover:text-[#e94560] transition-all text-sm"
                >×</button>
              </div>
            </div>
          ))}
          {searchFiltered.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <p className="text-4xl mb-3">🧠</p>
              <p className="text-sm">마인드맵이 없습니다</p>
              <p className="text-[11px] text-text-inactive mt-1">새로 만들기 버튼을 눌러 시작하세요</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel — Canvas */}
      {activeMap ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border bg-background/80 flex-shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setActiveMapId('')}
                className="md:hidden flex items-center text-text-secondary hover:text-text-primary mr-1 flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <input
                value={activeMap.title}
                onChange={(e) => updateTitle(e.target.value)}
                className="bg-transparent text-sm font-bold text-text-primary outline-none w-28 md:w-40 min-w-0"
                placeholder="마인드맵 제목..."
              />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Undo / Redo */}
              <button onClick={undo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)" className="w-7 h-7 flex items-center justify-center text-text-inactive hover:text-text-primary hover:bg-border rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              </button>
              <button onClick={redo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)" className="w-7 h-7 flex items-center justify-center text-text-inactive hover:text-text-primary hover:bg-border rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
              </button>

              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Add node */}
              <button
                onClick={addNode}
                title="노드 추가"
                className="h-7 px-2 md:px-2.5 flex items-center gap-1 bg-[#e94560]/10 text-[#e94560] rounded-lg text-[11px] font-semibold hover:bg-[#e94560]/20 transition-colors"
              >
                <span className="md:hidden">+</span>
                <span className="hidden md:inline">+ 노드</span>
              </button>

              {/* AI Actions */}
              <NoahAIPageActions
                actions={[
                  { id: 'generate', label: '마인드맵 생성', icon: '🧠', action: 'generate_mindmap' as NoahAIAction, description: '텍스트로 마인드맵 자동 생성' },
                  { id: 'youtube', label: 'YouTube → 마인드맵', icon: '🎬', action: 'youtube_to_mindmap' as NoahAIAction, description: '영상 내용을 마인드맵으로' },
                ]}
                getContext={() => ({})}
                onResult={async (action, result) => {
                  if (!result?.nodes || !user) return;
                  const aiNodes: MindMapNode[] = result.nodes.map((n: any) => ({
                    id: n.id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    text: n.text || '',
                    x: n.x ?? 400, y: n.y ?? 300,
                    width: n.width || DEFAULT_NODE_WIDTH, height: n.height || DEFAULT_NODE_HEIGHT,
                    color: n.color || NODE_COLORS[0],
                  }));
                  const aiEdges: MindMapEdge[] = (result.edges || []).map((e: any) => ({
                    id: e.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    from: e.from, to: e.to, style: e.style || 'curved',
                  }));
                  // Create new mindmap with AI content
                  const tempId = Date.now().toString();
                  const newMap: MindMap = {
                    id: tempId, title: result.title || 'AI 마인드맵',
                    nodes: aiNodes, edges: aiEdges,
                    viewportX: 0, viewportY: 0, zoom: 1,
                    starred: false, createdAt: new Date().toISOString(),
                  };
                  setMindmaps((prev) => [newMap, ...prev]);
                  setActiveMapId(tempId);
                  try {
                    const realId = await addMindmapDB(user.uid, {
                      title: newMap.title, nodes: newMap.nodes, edges: newMap.edges,
                      viewportX: 0, viewportY: 0, zoom: 1,
                    });
                    setMindmaps((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)));
                    setActiveMapId(realId);
                  } catch (err) { console.error('Failed to create AI mindmap:', err); }
                }}
              />

              <div className="w-px h-4 bg-border mx-0.5 hidden md:block" />

              {/* Line style — hidden on mobile */}
              <button
                onClick={() => setEdgeStyle(edgeStyle === 'curved' ? 'straight' : 'curved')}
                title={edgeStyle === 'curved' ? '직선으로 전환' : '곡선으로 전환'}
                className="hidden md:flex h-7 px-2 items-center gap-1 text-text-muted hover:text-text-primary rounded-lg text-[11px] hover:bg-border transition-colors"
              >
                {edgeStyle === 'curved' ? '〰️ 곡선' : '📏 직선'}
              </button>

              <div className="w-px h-4 bg-border mx-0.5 hidden md:block" />

              {/* Zoom */}
              <button
                onClick={() => { vpRef.current.zoom = Math.min(2.5, vp.zoom * 1.2); updateMapDirect((m) => ({ ...m, zoom: vpRef.current.zoom })); kick(); }}
                className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border rounded transition-colors text-xs"
                title="확대"
              >+</button>
              <span className="text-[10px] text-text-muted w-8 md:w-10 text-center">{Math.round(vp.zoom * 100)}%</span>
              <button
                onClick={() => { vpRef.current.zoom = Math.max(0.25, vp.zoom * 0.8); updateMapDirect((m) => ({ ...m, zoom: vpRef.current.zoom })); kick(); }}
                className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border rounded transition-colors text-xs"
                title="축소"
              >−</button>
              <button
                onClick={resetView}
                className="hidden md:flex h-7 px-2 text-[10px] text-text-muted hover:text-text-primary hover:bg-border rounded transition-colors items-center"
                title="뷰 초기화"
              >초기화</button>

              {/* Multi-select actions */}
              {selectedNodeIds.size >= 2 && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <button onClick={connectSelectedNodes} className="h-7 px-2 md:px-2.5 flex items-center gap-1 bg-[#8b5cf6]/10 text-[#8b5cf6] rounded-lg text-[11px] font-semibold hover:bg-[#8b5cf6]/20 transition-colors" title="선택된 노드 연결">
                    <span className="hidden md:inline">🔗 연결</span><span className="md:hidden">🔗</span>
                  </button>
                  <button onClick={deleteSelectedNodes} className="h-7 px-2 md:px-2.5 flex items-center gap-1 text-[#e94560] hover:bg-[#e94560]/10 rounded-lg text-[11px] font-semibold transition-colors" title="선택된 노드 삭제">
                    <span className="hidden md:inline">🗑 삭제</span><span className="md:hidden">🗑</span>
                  </button>
                </>
              )}

              {/* Single select delete */}
              {selectedNodeIds.size === 1 && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <button onClick={() => { if (selectedNodeId) deleteNode(selectedNodeId); }} className="h-7 px-2 md:px-2.5 flex items-center gap-1 text-[#e94560] hover:bg-[#e94560]/10 rounded-lg text-[11px] font-semibold transition-colors">
                    <span className="hidden md:inline">🗑 삭제</span><span className="md:hidden">🗑</span>
                  </button>
                </>
              )}

              {/* Edge delete */}
              {selectedEdgeId && (
                <>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  <button onClick={() => deleteEdge(selectedEdgeId)} className="h-7 px-2 md:px-2.5 flex items-center gap-1 text-[#e94560] hover:bg-[#e94560]/10 rounded-lg text-[11px] font-semibold transition-colors">🗑</button>
                </>
              )}
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
            onMouseDown={handleCanvasMouseDown}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
          >
            {/* Grid background */}
            <div
              className="canvas-bg absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle, var(--color-border) 1px, transparent 1px)`,
                backgroundSize: `${24 * vp.zoom}px ${24 * vp.zoom}px`,
                backgroundPosition: `${vp.x}px ${vp.y}px`,
              }}
            />

            {/* Viewport transform wrapper */}
            <div
              style={{
                transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
              }}
            >
              {/* SVG layer for edges */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px', pointerEvents: 'none', overflow: 'visible' }}>
                {activeMap.edges.map((edge) => {
                  const fromNode = activeMap.nodes.find((n) => n.id === edge.from);
                  const toNode = activeMap.nodes.find((n) => n.id === edge.to);
                  if (!fromNode || !toNode) return null;
                  const path = calcEdgePath(fromNode, toNode, edge.style);
                  return (
                    <g key={edge.id}>
                      <path d={path} fill="none" stroke="transparent" strokeWidth="16" style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeIds(new Set()); }} />
                      <path d={path} fill="none" stroke={selectedEdgeId === edge.id ? '#e94560' : (edge.color || '#888')} strokeWidth={selectedEdgeId === edge.id ? 3 : 2} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                      {(() => {
                        const toSide = getClosestSide(toNode, fromNode.x + fromNode.width / 2, fromNode.y + fromNode.height / 2);
                        const pt = getConnectionPoint(toNode, toSide);
                        const angle = { top: 90, right: 180, bottom: 270, left: 0 }[toSide] || 0;
                        return <polygon points="-6,-4 0,0 -6,4" fill={selectedEdgeId === edge.id ? '#e94560' : (edge.color || '#888')} transform={`translate(${pt.x},${pt.y}) rotate(${angle})`} style={{ pointerEvents: 'none' }} />;
                      })()}
                    </g>
                  );
                })}
                {connectingFrom && (() => {
                  const fromNode = activeMap.nodes.find((n) => n.id === connectingFrom.nodeId);
                  if (!fromNode) return null;
                  const from = getConnectionPoint(fromNode, connectingFrom.side);
                  return <path d={`M ${from.x} ${from.y} L ${mousePos.x} ${mousePos.y}`} fill="none" stroke="#e94560" strokeWidth="2" strokeDasharray="6 4" style={{ pointerEvents: 'none' }} />;
                })()}
              </svg>

              {/* Node layer */}
              {activeMap.nodes.map((node) => {
                const isSelected = selectedNodeIds.has(node.id);
                const isEditing = editingNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    data-node-id={node.id}
                    style={{
                      position: 'absolute',
                      left: `${node.x}px`,
                      top: `${node.y}px`,
                      width: `${node.width}px`,
                      minHeight: `${node.height}px`,
                      zIndex: isSelected ? 100 : 10,
                      WebkitTouchCallout: 'none',
                      userSelect: 'none',
                    }}
                    className={`rounded-xl shadow-lg transition-shadow ${isSelected ? 'ring-2 ring-[#e94560] shadow-xl' : 'hover:shadow-xl'}`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onMouseUp={() => handleNodeMouseUp(node.id)}
                    onDoubleClick={() => { setEditingNodeId(node.id); setSelectedNodeIds(new Set([node.id])); }}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div className="w-full h-full rounded-xl p-3 relative" style={{ backgroundColor: node.color, minHeight: `${node.height}px` }}>
                      {/* Connector dots */}
                      {(isSelected || connectingFrom) && ['top', 'right', 'bottom', 'left'].map((side) => {
                        const pos = {
                          top: { left: '50%', top: '-5px', transform: 'translateX(-50%)' },
                          right: { right: '-5px', top: '50%', transform: 'translateY(-50%)' },
                          bottom: { left: '50%', bottom: '-5px', transform: 'translateX(-50%)' },
                          left: { left: '-5px', top: '50%', transform: 'translateY(-50%)' },
                        }[side] as React.CSSProperties;
                        return (
                          <div key={side} className="absolute w-[10px] h-[10px] bg-white border-2 border-[#888] rounded-full cursor-crosshair hover:border-[#e94560] hover:scale-125 transition-all z-50" style={pos} onMouseDown={(e) => handleConnectorMouseDown(e, node.id, side)} />
                        );
                      })}

                      {/* Action buttons — single select only */}
                      {isSelected && selectedNodeIds.size === 1 && !isEditing && (
                        <div className="absolute -top-8 left-0 flex gap-1 z-50">
                          {NODE_COLORS.map((c) => (
                            <button key={c} onClick={(e) => { e.stopPropagation(); updateNodeColor(node.id, c); }} className="w-5 h-5 rounded-full border-2 border-white/50 hover:scale-110 transition-transform shadow-sm" style={{ backgroundColor: c }} />
                          ))}
                          <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.setAttribute('data-node-id', node.id); fileInputRef.current?.click(); }} className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-[10px] hover:scale-110 transition-transform shadow-sm" title="이미지 추가">📷</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }} className="w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-[10px] hover:scale-110 transition-transform shadow-sm text-[#e94560]" title="삭제">×</button>
                        </div>
                      )}

                      {/* Image */}
                      {node.imageURL && (
                        <div className="mb-2 relative group/img">
                          <img src={node.imageURL} alt="" className="w-full rounded-lg object-cover max-h-32" draggable={false} />
                          {isSelected && <button onClick={(e) => { e.stopPropagation(); removeNodeImage(node.id); }} className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/70">×</button>}
                        </div>
                      )}
                      {uploadingNodeId === node.id && (
                        <div className="mb-2 flex items-center gap-2 text-white/80 text-xs">
                          <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                          업로드 중...
                        </div>
                      )}

                      {/* Text */}
                      {isEditing ? (
                        <textarea
                          value={node.text}
                          onChange={(e) => updateNodeText(node.id, e.target.value)}
                          onBlur={() => setEditingNodeId(null)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onKeyDown={(e) => { if (e.key === 'Escape') setEditingNodeId(null); }}
                          autoFocus
                          className="w-full bg-transparent text-white outline-none resize-none text-sm placeholder-white/50"
                          placeholder="아이디어를 입력하세요..."
                          rows={Math.max(2, node.text.split('\n').length)}
                          style={{ cursor: 'text' }}
                        />
                      ) : (
                        <div className="text-white text-sm whitespace-pre-wrap break-words select-none" style={{ minHeight: '24px', cursor: 'move' }}>
                          {node.text || <span className="opacity-50">더블클릭하여 편집</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Multi-select indicator */}
            {selectedNodeIds.size >= 2 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#8b5cf6] text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg z-50">
                {selectedNodeIds.size}개 선택됨
              </div>
            )}

            {/* Connection guide */}
            {connectingFrom && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background-card border border-border px-4 py-2 rounded-full text-xs text-text-muted shadow-lg z-50">
                다른 노드에 드롭하여 연결 · <span className="text-text-inactive">Esc로 취소</span>
              </div>
            )}

            {/* Mobile help */}
            <div className="absolute bottom-3 right-3 md:hidden text-[9px] text-text-inactive bg-background/80 px-2 py-1 rounded-full">
              길게 눌러 다중선택
            </div>

            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              const nodeId = fileInputRef.current?.getAttribute('data-node-id');
              if (file && nodeId) handleImageUpload(nodeId, file);
              e.target.value = '';
            }} />
          </div>
        </div>
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center">
          <div className="text-center text-text-muted">
            <p className="text-6xl mb-4">🧠</p>
            <p className="text-lg font-bold mb-2">마인드맵</p>
            <p className="text-sm text-text-inactive mb-6">아이디어를 시각적으로 정리하고 연결하세요</p>
            <button onClick={createMindmap} className="px-6 py-2.5 bg-gradient-to-r from-[#e94560] to-[#533483] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-opacity">
              + 새 마인드맵 만들기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MindmapPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MindmapContent />
    </Suspense>
  );
}
